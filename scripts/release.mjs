import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const [phase, version, ...extra] = process.argv.slice(2);
let workspace = null;

const fail = (message) => { throw new Error(message); };
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(?:GIT_|GH_|GITHUB_|RELEASE_|NPM_|NODE_AUTH_TOKEN$|NODE_OPTIONS$|NODE_PATH$|SSH_AUTH_SOCK$|npm_config_)/.test(key)));
Object.assign(childEnv, { npm_config_userconfig: '/dev/null', npm_config_update_notifier: 'false' });

const isolateNpm = (workspace) => {
  const globalConfig = join(workspace, 'global-npmrc');
  const userConfig = join(workspace, 'user-npmrc');
  writeFileSync(globalConfig, '', { mode: 0o600 });
  writeFileSync(userConfig, '', { mode: 0o600 });
  Object.assign(childEnv, { npm_config_globalconfig: globalConfig, npm_config_userconfig: userConfig });
};

const run = (command, args, env = childEnv, capture = false, cwd = process.cwd()) => {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', maxBuffer: MAX_OUTPUT_BYTES });
  if (result.error || result.status !== 0) fail(`${command} failed. No automatic rollback was performed.`);
  return result.stdout?.trim() ?? '';
};
const git = (args) => run('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', ...args], childEnv, true);
const requireClean = () => {
  if (git(['status', '--porcelain']) !== '') fail('Commit or remove local changes before releasing.');
};
const endpoint = (value, hostname, token) => {
  const url = new URL(value);
  const fixtureToken = { 'api.github.com': 'fixture-github-token', 'registry.npmjs.org': 'fixture-npm-token' }[hostname];
  const official = url.protocol === 'https:' && url.hostname === hostname && !url.port &&
    (hostname === 'github.com' || url.pathname === '/');
  const fixture = fixtureToken && token === fixtureToken && url.protocol === 'http:' &&
    ['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/';
  if (url.username || url.password || url.search || url.hash || (!official && !fixture)) {
    fail('Release endpoint must use its official HTTPS host or a loopback fixture with synthetic credentials.');
  }
  return url;
};
const resetWorkspace = () => {
  if (workspace) rmSync(workspace, { recursive: true, force: true });
  workspace = mkdtempSync(join(tmpdir(), 'package-release-'));
  isolateNpm(workspace);
};
const publisherGit = (bundle, sha, author, origin, token) => {
  const directory = join(workspace, 'publisher.git');
  const templates = join(workspace, 'empty-templates');
  const archive = join(workspace, 'source.bundle');
  mkdirSync(templates);
  writeFileSync(archive, bundle);
  const settings = {
    'credential.helper': '', 'core.sshCommand': 'false', 'core.hooksPath': '/dev/null',
    'core.fsmonitor': 'false', 'core.untrackedCache': 'false', 'tag.gpgSign': 'false', 'commit.gpgSign': 'false',
    'protocol.allow': 'never', 'protocol.https.allow': 'always',
    'protocol.file.allow': origin.startsWith('https:') ? 'never' : 'always',
    'http.proxy': '', 'http.sslVerify': 'true', 'http.followRedirects': 'false',
    'push.followTags': 'false', 'transfer.fsckObjects': 'true', 'fetch.fsckObjects': 'true',
  };
  const environment = (authenticated) => {
    const entries = Object.entries(settings);
    if (authenticated && origin.startsWith('https:')) entries.push([
      'http.https://github.com/.extraheader', `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`]);
    return { ...childEnv, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
      GIT_COMMITTER_NAME: author[0], GIT_COMMITTER_EMAIL: author[1], GIT_CONFIG_COUNT: String(entries.length),
      ...Object.fromEntries(entries.flatMap(([key, value], index) => [[`GIT_CONFIG_KEY_${index}`, key], [`GIT_CONFIG_VALUE_${index}`, value]])) };
  };
  const local = (args) => run('git', ['--git-dir', directory, ...args], environment(false), true, workspace);
  local(['init', '--bare', '--initial-branch=main', `--template=${templates}`]);
  local(['bundle', 'unbundle', archive]);
  local(['update-ref', 'refs/heads/main', sha]);
  local(['read-tree', sha]);
  if (local(['rev-parse', 'refs/heads/main^{commit}']) !== sha) fail('Frozen Git archive does not identify the release commit.');
  return { local, remote: (args) => run('git', ['--git-dir', directory, ...args], environment(true), true, workspace) };
};
const tagTarget = (tag, publisher, origin) => {
  const refs = publisher.remote(['ls-remote', origin, `refs/tags/${tag}`, `refs/tags/${tag}^{}`]).split('\n').filter(Boolean);
  return refs.find((line) => line.endsWith('^{}'))?.split('\t')[0] ?? refs[0]?.split('\t')[0] ?? null;
};
const requireMain = (sha, publisher, origin) => {
  const source = process.cwd();
  if (publisher.local(['--work-tree', source, '-c', 'core.bare=false', 'status', '--porcelain']) !== '') {
    fail('Commit or remove local changes before releasing.');
  }
  if (git(['branch', '--show-current']) !== 'main' || git(['rev-parse', 'HEAD']) !== sha) fail('Publish requires unchanged main.');
  const remote = publisher.remote(['ls-remote', '--exit-code', origin, 'refs/heads/main']).split('\t')[0];
  if (remote !== sha) fail('Publish requires the exact remote main commit.');
};
const request = async (url, token, method, body, allowMissing = false, service = 'GitHub') => {
  const response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: service === 'GitHub' ? 'application/vnd.github+json' : 'application/json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) fail(`${service} release request failed (HTTP ${response.status}).`);
  return response.json();
};

const main = async () => {
  if (!['prepare', 'publish'].includes(phase) || !version || version.length > 256 || !VERSION_PATTERN.test(version) || extra.length) {
    fail('Usage: pnpm release:prepare VERSION or pnpm release:publish VERSION.');
  }
  if (version.includes('+')) fail('Use an npm version without build metadata (+suffix).');
  requireClean();
  if (phase === 'prepare') {
    const branch = git(['branch', '--show-current']);
    if (!branch || branch === 'main') fail('Prepare the release on a feature branch.');
    workspace = mkdtempSync(join(tmpdir(), 'package-release-'));
    isolateNpm(workspace);
    run(process.execPath, ['node_modules/release-it/bin/release-it.js', version, '--ci']);
    console.log('Release metadata prepared. Commit the changed files on this branch and open a release PR.');
    return;
  }

  const manifest = readJson('package.json');
  const config = readJson('.release-publish.json');
  if (typeof config.npm?.publish !== 'boolean') fail('Invalid npm publication policy.');
  if (manifest.version !== version) fail('Requested version must match the merged package version.');
  const token = process.env.RELEASE_GITHUB_TOKEN;
  const npmToken = process.env.RELEASE_NPM_TOKEN;
  const otp = process.env.RELEASE_NPM_OTP;
  if (!token || (config.npm.publish && !npmToken)) fail('Provide dedicated RELEASE_GITHUB_TOKEN and, when npm publication is enabled, RELEASE_NPM_TOKEN.');
  if (otp && !/^\d{6,10}$/.test(otp)) fail('RELEASE_NPM_OTP must be a numeric one-time code.');
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(config.github.repository)) fail('Invalid GitHub release repository.');
  const api = endpoint(config.github.apiUrl, 'api.github.com', token);
  const registry = endpoint(config.npm.registry, 'registry.npmjs.org', npmToken);
  const origin = git(['remote', 'get-url', 'origin']);
  if (git(['remote', 'get-url', '--push', '--all', 'origin']) !== origin) fail('Origin must have one matching fetch and push destination.');
  if (!origin.startsWith('/') && !origin.startsWith('file://')) {
    const remote = endpoint(origin, 'github.com');
    if (remote.hostname !== 'github.com' || remote.pathname.replace(/^\//, '').replace(/\.git$/, '').toLowerCase() !== config.github.repository.toLowerCase()) {
      fail('Origin must identify the configured GitHub repository over HTTPS.');
    }
  }
  if (!origin.startsWith('https:') && !['fixture-github-token', 'review-dummy-github'].includes(token)) {
    fail('Local Git transports require synthetic fixture credentials.');
  }
  const author = [git(['config', '--get', 'user.name']), git(['config', '--get', 'user.email'])];
  const sha = git(['rev-parse', 'HEAD']);
  if (git(['branch', '--show-current']) !== 'main') fail('Publish requires unchanged main.');
  const tag = `v${version}`;
  const localTag = spawnSync('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], { env: childEnv, encoding: 'utf8' });
  if (localTag.status === 0 && localTag.stdout.trim() !== sha) fail('Local release tag points to another commit.');
  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  resetWorkspace();
  const archive = join(workspace, 'source.bundle');
  git(['bundle', 'create', archive, 'HEAD']);
  const bundle = readFileSync(archive);
  let publisher = publisherGit(bundle, sha, author, origin, token);
  requireMain(sha, publisher, origin);
  const remoteTag = tagTarget(tag, publisher, origin);
  if (remoteTag && remoteTag !== sha) fail('Release tag already points to another commit.');

  let tarball = null;
  let digest = null;
  if (config.npm.publish) {
    run('npm', ['run', 'build', '--ignore-scripts']);
    const [packed] = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', workspace], childEnv, true));
    if (packed.name !== manifest.name || packed.version !== version || !/^[A-Za-z0-9_.-]+\.tgz$/.test(packed.filename)) fail('Package identity changed during packing.');
    if (packed.files.some(({ path }) => /(^|\/)(\.env(?:\.|$)|\.git(?:\/|$)|\.npmrc$|\.release[^/]*$|scripts\/)/.test(path))) fail('Release package contains private or release-control files.');
    tarball = resolve(workspace, packed.filename);
    digest = createHash('sha512').update(readFileSync(tarball)).digest('base64');
  }
  const packedBytes = tarball ? readFileSync(tarball) : null;
  const packedName = tarball ? basename(tarball) : null;
  resetWorkspace();
  publisher = publisherGit(bundle, sha, author, origin, token);
  if (packedBytes) {
    tarball = join(workspace, packedName);
    writeFileSync(tarball, packedBytes);
  }
  requireMain(sha, publisher, origin);
  if (readJson('package.json').version !== version) fail('Package version changed during release preparation.');
  const currentTag = tagTarget(tag, publisher, origin);
  if (currentTag && currentTag !== sha) fail('Release tag moved during the build.');
  publisher.local(['tag', '--no-sign', '--annotate', '--message', `Release ${tag}`, tag, sha]);
  if (!currentTag) publisher.remote(['push', origin, `refs/tags/${tag}:refs/tags/${tag}`]);
  if (tagTarget(tag, publisher, origin) !== sha) fail('Remote tag does not identify the merged release commit.');

  requireMain(sha, publisher, origin);
  const releaseUrl = new URL(`/repos/${config.github.repository}/releases`, api);
  const existingRelease = await request(new URL(`${releaseUrl.pathname}/tags/${encodeURIComponent(tag)}`, api), token, 'GET', null, true);
  if (existingRelease && (existingRelease.tag_name !== tag || existingRelease.target_commitish !== sha || existingRelease.draft !== false)) {
    fail('Existing GitHub release does not identify this merged commit.');
  }
  if (tarball) {
    if (createHash('sha512').update(readFileSync(tarball)).digest('base64') !== digest) fail('Packed release bytes changed.');
    const npmrc = join(workspace, 'npmrc');
    writeFileSync(npmrc, `registry=${registry.href}\n//${registry.host}${registry.pathname.replace(/\/?$/, '/')}:_authToken=\${RELEASE_NPM_TOKEN}\n`, { mode: 0o600 });
    const env = { ...childEnv, RELEASE_NPM_TOKEN: npmToken, npm_config_userconfig: npmrc, ...(otp ? { npm_config_otp: otp } : {}) };
    const existingPackage = await request(new URL(`${encodeURIComponent(manifest.name)}/${encodeURIComponent(version)}`, registry), npmToken, 'GET', null, true, 'npm');
    if (existingPackage) {
      if (existingPackage.name !== manifest.name || existingPackage.version !== version || existingPackage.dist?.integrity !== `sha512-${digest}`) {
        fail('Existing npm version has different package bytes.');
      }
    } else {
      const prerelease = version.split('+')[0].split('-').slice(1).join('-');
      let distributionTag = 'latest';
      if (prerelease) {
        const identifier = prerelease.split('.')[0];
        if (!/^\d+$/.test(identifier)) {
          distributionTag = identifier;
        } else {
          const metadata = await request(new URL(encodeURIComponent(manifest.name), registry), npmToken, 'GET', null, true, 'npm');
          distributionTag = Object.keys(metadata?.['dist-tags'] ?? {}).find((name) => name !== 'latest') ?? 'next';
        }
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(distributionTag)) fail('Unsupported npm distribution tag.');
      run('npm', ['publish', tarball, '--ignore-scripts', '--tag', distributionTag, '--registry', registry.href], env, false, workspace);
    }
  }
  requireMain(sha, publisher, origin);
  if (tagTarget(tag, publisher, origin) !== sha) fail('Release tag moved before GitHub publication.');
  const release = existingRelease ?? await request(releaseUrl, token, 'POST', {
    tag_name: tag, target_commitish: sha, name: tag, body: changelog, draft: false, prerelease: version.split('+')[0].includes('-') });
  if (release.tag_name !== tag || release.target_commitish !== sha || release.draft !== false) fail('GitHub response does not identify the requested release.');
  console.log(`Published ${manifest.name}@${version} from ${sha}.`);
};

main().finally(() => { if (workspace) rmSync(workspace, { recursive: true, force: true }); }).catch((error) => { console.error(error.message); process.exitCode = 1; });
