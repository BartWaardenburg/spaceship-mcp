import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const [phase, version, ...extra] = process.argv.slice(2);

const fail = (message) => { throw new Error(message); };
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(?:GIT_|GH_|GITHUB_|RELEASE_|NPM_|NODE_AUTH_TOKEN$|SSH_AUTH_SOCK$|npm_config_)/.test(key)));
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
const git = (args, env = childEnv) => run('git', args, env, true);
const requireClean = () => {
  if (git(['status', '--porcelain']) !== '') fail('Commit or remove local changes before releasing.');
};
const endpoint = (value) => {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) {
    fail('Release endpoints must use HTTPS without embedded credentials.');
  }
  return url;
};
const tagTarget = (tag, env) => {
  const refs = git(['ls-remote', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`], env).split('\n').filter(Boolean);
  return refs.find((line) => line.endsWith('^{}'))?.split('\t')[0] ?? refs[0]?.split('\t')[0] ?? null;
};
const requireMain = (sha, env) => {
  requireClean();
  if (git(['branch', '--show-current']) !== 'main' || git(['rev-parse', 'HEAD']) !== sha) fail('Publish requires unchanged main.');
  const remote = git(['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], env).split('\t')[0];
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
  requireClean();
  if (phase === 'prepare') {
    const branch = git(['branch', '--show-current']);
    if (!branch || branch === 'main') fail('Prepare the release on a feature branch.');
    isolateNpm(mkdtempSync(join(tmpdir(), 'package-release-')));
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
  const api = endpoint(config.github.apiUrl);
  const registry = endpoint(config.npm.registry);
  const origin = git(['remote', 'get-url', 'origin']);
  if (git(['remote', 'get-url', '--push', '--all', 'origin']) !== origin) fail('Origin must have one matching fetch and push destination.');
  if (!origin.startsWith('/') && !origin.startsWith('file://')) {
    const remote = endpoint(origin);
    if (remote.hostname !== 'github.com' || remote.pathname.replace(/^\//, '').replace(/\.git$/, '').toLowerCase() !== config.github.repository.toLowerCase()) {
      fail('Origin must identify the configured GitHub repository over HTTPS.');
    }
  }
  const author = [git(['config', '--get', 'user.name']), git(['config', '--get', 'user.email'])];
  const gitEnv = { ...childEnv, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
    GIT_COMMITTER_NAME: author[0], GIT_COMMITTER_EMAIL: author[1], GIT_CONFIG_COUNT: '6',
    GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: '', GIT_CONFIG_KEY_1: 'core.sshCommand', GIT_CONFIG_VALUE_1: 'false',
    GIT_CONFIG_KEY_2: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_2: `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
    GIT_CONFIG_KEY_3: 'push.followTags', GIT_CONFIG_VALUE_3: 'false', GIT_CONFIG_KEY_4: 'remote.origin.mirror', GIT_CONFIG_VALUE_4: 'false',
    GIT_CONFIG_KEY_5: 'core.hooksPath', GIT_CONFIG_VALUE_5: '/dev/null' };
  const sha = git(['rev-parse', 'HEAD']);
  requireMain(sha, gitEnv);
  const tag = `v${version}`;
  const remoteTag = tagTarget(tag, gitEnv);
  if (remoteTag && remoteTag !== sha) fail('Release tag already points to another commit.');
  const localTag = spawnSync('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], { env: childEnv, encoding: 'utf8' });
  if (localTag.status === 0 && localTag.stdout.trim() !== sha) fail('Local release tag points to another commit.');

  let tarball = null;
  let digest = null;
  const workspace = mkdtempSync(join(tmpdir(), 'package-release-'));
  isolateNpm(workspace);
  if (config.npm.publish) {
    run('npm', ['run', 'build', '--ignore-scripts']);
    const [packed] = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', workspace], childEnv, true));
    if (packed.name !== manifest.name || packed.version !== version || !/^[A-Za-z0-9_.-]+\.tgz$/.test(packed.filename)) fail('Package identity changed during packing.');
    if (packed.files.some(({ path }) => /(^|\/)(\.env(?:\.|$)|\.git(?:\/|$)|\.npmrc$|\.release[^/]*$|scripts\/)/.test(path))) fail('Release package contains private or release-control files.');
    tarball = resolve(workspace, packed.filename);
    digest = createHash('sha512').update(readFileSync(tarball)).digest('base64');
  }
  requireMain(sha, gitEnv);
  if (readJson('package.json').version !== version) fail('Package version changed during release preparation.');
  if (localTag.status !== 0) git(['tag', '--annotate', '--message', `Release ${tag}`, tag, sha], gitEnv);
  if (!remoteTag) run('git', ['push', 'origin', `refs/tags/${tag}:refs/tags/${tag}`], gitEnv);
  if (tagTarget(tag, gitEnv) !== sha) fail('Remote tag does not identify the merged release commit.');

  requireMain(sha, gitEnv);
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
  requireMain(sha, gitEnv);
  if (tagTarget(tag, gitEnv) !== sha) fail('Release tag moved before GitHub publication.');
  const release = existingRelease ?? await request(releaseUrl, token, 'POST', {
    tag_name: tag, target_commitish: sha, name: tag, body: readFileSync('CHANGELOG.md', 'utf8'), draft: false, prerelease: version.split('+')[0].includes('-') });
  if (release.tag_name !== tag || release.target_commitish !== sha || release.draft !== false) fail('GitHub response does not identify the requested release.');
  console.log(`Published ${manifest.name}@${version} from ${sha}.`);
};

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
