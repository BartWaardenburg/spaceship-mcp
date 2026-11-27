// @ts-check
/**
 * Release helper. `main` is protected, so a release has two phases:
 *
 *   pnpm release prepare <patch|minor|major|x.y.z>
 *     Bumps package.json, CHANGELOG.md and server.json on a release branch and opens a PR.
 *   pnpm release publish
 *     Runs on `main` after the PR merge: npm, signed tag, GitHub release (starts the
 *     Docker image build), MCP registry, then waits for the Docker build.
 *
 * Add `--dry-run` to see the steps without a change. Each publish step checks its
 * state first, so a second run continues after a failed step.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REGISTRY_API = "https://registry.modelcontextprotocol.io/v0/servers";
const DOCKER_WORKFLOW = "docker.yml";
const RUN_LOOKUP_ATTEMPTS = 12;
const RUN_LOOKUP_DELAY_MS = 5_000;
const INCREMENTS = ["patch", "minor", "major"];
// Prereleases are not supported: npm needs a dist-tag for them, and docker.yml tags every image `latest`.
const SEMVER = /^\d+\.\d+\.\d+$/;
const EMPTY_NOTES = "No user-facing changes.";
const CHANGELOG_HEADING = /^#{1,2} \[?(\d[^\]\s]*)/;
const REGISTRY_AUTH_ERROR = /\b401\b|expired|not logged in|login/i;
const USAGE = "Usage: pnpm release prepare <patch|minor|major|x.y.z> [--dry-run] | pnpm release publish [--dry-run]. Prereleases are not supported.";

/**
 * @typedef {{ phase: "prepare", target: string, dryRun: boolean } | { phase: "publish", target: null, dryRun: boolean }} Command
 * @typedef {{ ok: true, data: Command } | { ok: false, error: string }} ParseResult
 */

/** @param {string[]} argv @returns {ParseResult} */
export const parseArgs = (argv) => {
  const dryRun = argv.includes("--dry-run");
  const [phase, target, ...extra] = argv.filter((arg) => arg !== "--dry-run");
  if (extra.length > 0) return { ok: false, error: USAGE };
  if (phase === "prepare" && target && (INCREMENTS.includes(target) || SEMVER.test(target))) {
    return { ok: true, data: { phase, target, dryRun } };
  }
  if (phase === "publish" && target === undefined) return { ok: true, data: { phase, target: null, dryRun } };
  return { ok: false, error: USAGE };
};

/**
 * Returns the body of the CHANGELOG section for `version`, without its heading.
 * @param {string} changelog @param {string} version @returns {string | null}
 */
export const changelogSection = (changelog, version) => {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => CHANGELOG_HEADING.exec(line)?.[1] === version);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => CHANGELOG_HEADING.test(line));
  return rest.slice(0, end === -1 ? undefined : end).join("\n").trim();
};

/**
 * Returns the GitHub release notes for `version`: the CHANGELOG section, or a fixed text when the section is empty.
 * @param {string} changelog @param {string} version @returns {string | null}
 */
export const releaseNotes = (changelog, version) => {
  const section = changelogSection(changelog, version);
  if (section === null) return null;
  return section === "" ? EMPTY_NOTES : section;
};

/**
 * Sets the server version and the version of the npm package entry for `name`.
 * @param {{ version?: string, packages?: Array<Record<string, unknown>> }} server
 * @param {string} name @param {string} version
 */
export const syncServerJson = (server, name, version) => ({
  ...server,
  version,
  packages: (server.packages ?? []).map((pkg) =>
    pkg.registryType === "npm" && pkg.identifier === name ? { ...pkg, version } : pkg,
  ),
});

/** @param {string} message @returns {never} */
const fail = (message) => {
  throw new Error(message);
};

/**
 * @param {string} command @param {string[]} args
 * @param {{ capture?: boolean, allowFail?: boolean }} [options]
 * @returns {{ ok: boolean, out: string, err: string }}
 */
const run = (command, args, { capture = false, allowFail = false } = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
  });
  const ok = !result.error && result.status === 0;
  if (!ok && !allowFail) fail(`${command} ${args.join(" ")} failed.${result.stderr ? `\n${result.stderr.trim()}` : ""}`);
  return { ok, out: (result.stdout ?? "").trim(), err: (result.stderr ?? "").trim() };
};

/** @param {string[]} args @returns {string} */
const git = (args) => run("git", args, { capture: true }).out;

/** @param {string} file @returns {any} */
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

/** @param {string} file @param {unknown} value */
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requireSyncedMain = () => {
  run("git", ["fetch", "--quiet", "--tags", "origin", "main"]);
  if (git(["branch", "--show-current"]) !== "main") fail("Switch to main first.");
  if (git(["status", "--porcelain"]) !== "") fail("Commit or remove local changes first.");
  if (git(["rev-parse", "HEAD"]) !== git(["rev-parse", "origin/main"])) fail("Local main differs from origin/main. Run git pull first.");
};

/**
 * @param {string} label @param {boolean} done @param {() => unknown} action @param {boolean} dryRun
 */
const step = async (label, done, action, dryRun) => {
  if (done) return console.log(`= ${label}: already done`);
  if (dryRun) return console.log(`- ${label}: will run`);
  console.log(`> ${label}`);
  await action();
};

/** @param {string} version */
const prBody = (version) => `## Summary

- Release commit for v${version}: \`CHANGELOG.md\`, \`package.json\` and \`server.json\`.
- After the merge, run \`pnpm release publish\` on \`main\` to publish this version.

Closes: N/A

## Test plan

- [x] \`pnpm test\` passes on this commit.
`;

/** @param {string} target @param {boolean} dryRun */
const prepare = (target, dryRun) => {
  requireSyncedMain();
  run("pnpm", ["test"]);
  if (dryRun) {
    run("pnpm", ["exec", "release-it", target, "--ci", "--dry-run"]);
    return;
  }
  run("pnpm", ["exec", "release-it", target, "--ci"]);
  const { name, version } = readJson("package.json");
  writeJson("server.json", syncServerJson(readJson("server.json"), name, version));
  const branch = `chore/release-v${version}`;
  const title = `chore(release): v${version}`;
  try {
    run("git", ["switch", "--quiet", "-c", branch]);
    run("git", ["add", "package.json", "CHANGELOG.md", "server.json"]);
    run("git", ["commit", "--quiet", "-S", "-m", title]);
    run("git", ["push", "--quiet", "-u", "origin", branch]);
    run("gh", ["pr", "create", "--base", "main", "--head", branch, "--title", title, "--body", prBody(version)]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    fail(`${reason}\nFinish by hand on branch ${branch}: commit the release files with "${title}", push the branch and open a PR. Or reset with: git switch main && git checkout -- . && git branch -D ${branch}`);
  }
  console.log(`Merge the PR, then run: git switch main && git pull && pnpm release publish`);
};

/** @param {string} tag @returns {string | null} */
const remoteTagCommit = (tag) => {
  const lines = git(["ls-remote", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`]).split("\n").filter(Boolean);
  const peeled = lines.find((line) => line.endsWith("^{}")) ?? lines[0];
  return peeled ? peeled.split("\t")[0] : null;
};

/** @param {string} name @param {string} version */
const npmHasVersion = (name, version) =>
  run("npm", ["view", `${name}@${version}`, "version"], { capture: true, allowFail: true }).out === version;

/** @param {string} name @param {string} version */
const registryHasVersion = async (name, version) => {
  const url = `${REGISTRY_API}/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  return response.ok;
};

/** @param {string} name @param {string} version */
const publishNpm = (name, version) => {
  if (!run("npm", ["whoami"], { capture: true, allowFail: true }).ok) run("npm", ["login", "--auth-type=web"]);
  const published = run("npm", ["publish", "--auth-type=web"], { allowFail: true }).ok;
  // npm view can lag behind a publish, so a re-run can try to publish an existing version.
  if (!published && !npmHasVersion(name, version)) fail("npm publish failed.");
};

/** @param {string} tag @param {string} head */
const pushTag = (tag, head) => {
  const local = run("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}^{commit}`], { capture: true, allowFail: true });
  if (local.ok && local.out !== head) fail(`Local tag ${tag} points to another commit. Delete it first.`);
  if (!local.ok) {
    const signed = run("git", ["config", "--get", "user.signingkey"], { capture: true, allowFail: true }).ok;
    run("git", ["tag", signed ? "-s" : "-a", tag, "-m", `Release ${tag}`, head]);
  }
  run("git", ["push", "--quiet", "origin", `refs/tags/${tag}`]);
};

/** @param {string} tag @param {string} version */
const createGithubRelease = (tag, version) => {
  const notes = releaseNotes(readFileSync("CHANGELOG.md", "utf8"), version) ?? fail(`CHANGELOG.md has no section for ${version}.`);
  const dir = mkdtempSync(join(tmpdir(), "release-notes-"));
  const file = join(dir, "notes.md");
  try {
    writeFileSync(file, `${notes}\n`);
    run("gh", ["release", "create", tag, "--verify-tag", "--title", tag, "--notes-file", file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const publishRegistry = () => {
  const first = run("mcp-publisher", ["publish"], { capture: true, allowFail: true });
  const output = [first.out, first.err].filter(Boolean).join("\n");
  console.log(output);
  if (first.ok) return;
  if (!REGISTRY_AUTH_ERROR.test(output)) fail("mcp-publisher publish failed.");
  run("mcp-publisher", ["login", "github"]);
  run("mcp-publisher", ["publish"]);
};

/**
 * @param {string} tag
 * @returns {{ id: string, status: string, conclusion: string } | null}
 */
const latestDockerRun = (tag) => {
  const out = run("gh", ["run", "list", "--workflow", DOCKER_WORKFLOW, "--event", "release", "--branch", tag, "--limit", "1", "--json", "databaseId,status,conclusion", "--jq", '.[0] // empty | "\\(.databaseId) \\(.status) \\(.conclusion)"'], { capture: true }).out;
  if (!out) return null;
  const [id, status, conclusion = ""] = out.split(" ");
  return { id, status, conclusion };
};

/** @param {string} tag */
const waitForDocker = async (tag) => {
  for (let attempt = 0; attempt < RUN_LOOKUP_ATTEMPTS; attempt++) {
    const latest = latestDockerRun(tag);
    if (latest?.status === "completed" && latest.conclusion !== "success") {
      fail(`Docker run ${latest.id} for ${tag} ended with "${latest.conclusion}". For a flaky failure, run: gh run rerun ${latest.id}. For a broken build, fix it and release a new patch version.`);
    }
    if (latest) {
      run("gh", ["run", "watch", latest.id, "--exit-status", "--interval", "10"]);
      return;
    }
    await sleep(RUN_LOOKUP_DELAY_MS);
  }
  fail(`No ${DOCKER_WORKFLOW} run found for ${tag}. Check the Actions tab.`);
};

/** @param {boolean} dryRun */
const publish = async (dryRun) => {
  requireSyncedMain();
  const { name, version } = readJson("package.json");
  const server = readJson("server.json");
  if (server.version !== version) fail(`server.json has version ${server.version}, package.json has ${version}. Run pnpm release prepare.`);
  const tag = `v${version}`;
  const head = git(["rev-parse", "HEAD"]);
  const previous = run("git", ["show", "HEAD^1:package.json"], { capture: true, allowFail: true });
  if (previous.ok && JSON.parse(previous.out).version === version) {
    fail(`HEAD is not the commit that sets version ${version}. Merge the release PR and publish before other merges.`);
  }
  const tagCommit = remoteTagCommit(tag);
  if (tagCommit && tagCommit !== head) fail(`Remote tag ${tag} points to ${tagCommit}, not to HEAD.`);

  run("pnpm", ["test"]);
  run("pnpm", ["build"]);
  await step(`npm ${name}@${version}`, npmHasVersion(name, version), () => publishNpm(name, version), dryRun);
  await step(`tag ${tag}`, tagCommit === head, () => pushTag(tag, head), dryRun);
  const hasRelease = run("gh", ["release", "view", tag, "--json", "tagName"], { capture: true, allowFail: true }).ok;
  await step(`GitHub release ${tag}`, hasRelease, () => createGithubRelease(tag, version), dryRun);
  await step(`MCP registry ${server.name}@${version}`, await registryHasVersion(server.name, version), publishRegistry, dryRun);
  await step(`Docker image ${tag}`, hasRelease && latestDockerRun(tag)?.conclusion === "success", () => waitForDocker(tag), dryRun);
  if (!dryRun) console.log(`Released ${name}@${version}.`);
};

const main = async () => {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) throw new Error(parsed.error);
  const { phase, target, dryRun } = parsed.data;
  if (phase === "prepare") prepare(target, dryRun);
  else await publish(dryRun);
};

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  main().catch((error) => {
    console.error(`release: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
