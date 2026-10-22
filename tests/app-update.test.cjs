'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { verifyAppManifest } = require('../desktop/security.cjs');
const { sign } = require('../scripts/pack-sign.cjs');
const { createAppRelease } = require('../scripts/app-release.cjs');
const { decodeAppManifest, downloadVerifiedArtifact, safeZipEntry, inspectZip, inspectTree, appBundleFromExecutable, healthFileFromArg, markUpdateHealthy, HELPER } = require('../desktop/app-update.cjs');

const pair = crypto.generateKeyPairSync('ed25519');
const keys = { 'release-test': pair.publicKey.export({ type: 'spki', format: 'pem' }) };
const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
function manifest(bytes, overrides = {}) {
  const version = overrides.version || '1.1.0';
  return { schema: 1, type: 'app-release', releaseEpoch: 2, version, platform: 'darwin', arch: 'arm64', bundleId: 'com.dogsquad.game',
    url: `https://github.com/qx04222/dog-squad/releases/download/v${version}/Dog-Squad-${version}-arm64.zip`, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), notes: '安全更新', ...overrides };
}
const envelope = data => Buffer.from(JSON.stringify(sign(data, 'release-test', privateKey)));

test('app manifest requires the fixed project, bundle, platform, exact asset name and signed payload', () => {
  const bytes = Buffer.alloc(2048, 7), valid = manifest(bytes);
  assert.equal(decodeAppManifest(envelope(valid), keys).version, '1.1.0');
  for (const patch of [
    { bundleId: 'com.attacker.game' },
    { platform: 'win32' },
    { url: 'https://evil.example/Dog-Squad-1.1.0-arm64.zip' },
    { url: 'https://github.com/qx04222/dog-squad/releases/download/v1.1.0/other.zip' },
    { size: 351 * 1024 * 1024 }
  ]) assert.throws(() => verifyAppManifest({ ...valid, ...patch }));
  const tampered = JSON.parse(envelope(valid)); tampered.payload = Buffer.from(JSON.stringify({ ...valid, releaseEpoch: 99 })).toString('base64');
  assert.throws(() => decodeAppManifest(tampered, keys), /校验失败/);
});

function redirectingRequest(bytes, location = 'https://release-assets.githubusercontent.com/github-production-release-asset/file?token=signed') {
  return (url, _options, callback) => {
    const request = new EventEmitter(); request.destroy = () => {}; request.setTimeout = () => {};
    queueMicrotask(() => {
      const response = new PassThrough(); response.headers = {};
      if (url.hostname === 'github.com') { response.statusCode = 302; response.headers.location = location; callback(response); return; }
      response.statusCode = 200; response.headers['content-length'] = String(bytes.length); callback(response); response.end(bytes);
    });
    return request;
  };
}
test('artifact download permits only the GitHub release asset redirect and verifies exact bytes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-app-download-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bytes = Buffer.alloc(4096, 11), entry = manifest(bytes), destination = path.join(root, 'update.zip');
  await downloadVerifiedArtifact(entry, destination, { request: redirectingRequest(bytes) });
  assert.deepEqual(await fs.readFile(destination), bytes);
  await assert.rejects(downloadVerifiedArtifact(entry, path.join(root, 'evil.zip'), { request: redirectingRequest(bytes, 'https://evil.example/update.zip') }), /重定向不受信任/);
  await assert.rejects(downloadVerifiedArtifact(entry, path.join(root, 'changed.zip'), { request: redirectingRequest(Buffer.alloc(4096, 12)) }), /校验失败/);
  assert.deepEqual((await fs.readdir(root)).sort(), ['update.zip']);
});

test('zip inventory rejects traversal, absolute paths, alternate roots and Windows separators', async () => {
  for (const name of ['Dog Squad.app/Contents/MacOS/Dog Squad', 'Dog Squad.app/Contents/Frameworks/A']) assert.equal(safeZipEntry(name), true);
  for (const name of ['../Dog Squad.app/a', '/Dog Squad.app/a', 'Other.app/a', 'Dog Squad.app/../escape', 'Dog Squad.app\\..\\escape']) assert.equal(safeZipEntry(name), false);
  const run = async (_command, args) => ({ stdout: args[0] === '-1' ? 'Dog Squad.app/Contents/a\n../escape\n' : '2 files, 10 bytes uncompressed, 5 bytes compressed: 50.0%\n' });
  await assert.rejects(inspectZip('/tmp/fake.zip', run), /路径不安全/);
  const bomb = async (_command, args) => ({ stdout: args[0] === '-1' ? 'Dog Squad.app/Contents/a\n' : '1 file, 9999999999 bytes uncompressed, 10 bytes compressed: 100.0%\n' });
  await assert.rejects(inspectZip('/tmp/bomb.zip', bomb), /解压清单超出限制/);
});

test('extracted app tree rejects symlinks that resolve outside the bundle', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-app-tree-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'Contents')); await fs.writeFile(path.join(root, 'Contents', 'safe'), 'ok');
  assert.equal((await inspectTree(root)).count, 2);
  await fs.symlink('/etc/passwd', path.join(root, 'Contents', 'escape'));
  await assert.rejects(inspectTree(root), /越界符号链接/);
});

test('update health handshake can only write a generated file inside app userData', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-health-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const updates = path.join(root, 'app-updates'); await fs.mkdir(updates);
  const valid = path.join(updates, 'health-0011223344556677.txt');
  assert.equal(healthFileFromArg([`--dog-squad-update-health=${valid}`], root), valid);
  assert.equal(healthFileFromArg(['--dog-squad-update-health=/tmp/health-0011223344556677.txt'], root), '');
  assert.equal(healthFileFromArg([`--dog-squad-update-health=${path.join(updates, 'other.txt')}`], root), '');
  assert.equal(await markUpdateHealthy([`--dog-squad-update-health=${valid}`], root), true);
  assert.equal(await markUpdateHealthy([`--dog-squad-update-health=${valid}`], root), true);
  assert.equal(await fs.readFile(valid, 'utf8'), 'healthy\n');
});

test('native app marks an update healthy only after the trusted renderer explicitly reports bootstrap', async () => {
  const main = await fs.readFile(path.resolve(__dirname, '../desktop/main.cjs'), 'utf8');
  const preload = await fs.readFile(path.resolve(__dirname, '../desktop/preload.cjs'), 'utf8');
  const game = await fs.readFile(path.resolve(__dirname, '../src/game.js'), 'utf8');
  assert.match(main, /handle\('update-health',[^\n]+markUpdateHealthy/);
  assert.doesNotMatch(main, /did-finish-load[^\n]+markUpdateHealthy/);
  assert.match(preload, /markUpdateHealthy:\s*\(\)\s*=>\s*call\('update-health'\)/);
  const frameStart = game.indexOf('function frame('), health = game.indexOf('markUpdateHealthy()', frameStart), nextFunction = game.indexOf('\n  function ', frameStart + 1);
  assert.ok(frameStart >= 0 && health > frameStart && health < nextFunction, 'health IPC must be inside the rendered frame path');
  const guard = game.slice(Math.max(frameStart, health - 240), health);
  for (const required of ['artLoaded', 'enemyReady', 'bossReady', 'updateHealthSent']) assert.ok(guard.includes(required), `health IPC must require ${required}`);
  assert.ok(game.lastIndexOf('draw(', health) > frameStart, 'health IPC must happen after a successful draw call');
});

test('detached helper waits for parent exit, validates generated paths and preserves backup on health timeout', () => {
  assert.match(HELPER, /kill -0/); assert.match(HELPER, /dog-squad-backup/); assert.match(HELPER, /codesign --verify --deep --strict/);
  assert.match(HELPER, /kill -TERM "\$new_pid"/); assert.match(HELPER, /mv -- "\$backup" "\$target"/); assert.match(HELPER, /failure_reason=health-timeout/); assert.match(HELPER, /failure_reason=post-health-exit/); assert.doesNotMatch(HELPER, /xattr/);
  assert.equal(appBundleFromExecutable('/Applications/Dog Squad.app/Contents/MacOS/Dog Squad'), '/Applications/Dog Squad.app');
  assert.throws(() => appBundleFromExecutable('/usr/local/bin/dog-squad'));
});

test('detached helper behaviorally restores the old app when the new app misses its health deadline', { skip: process.platform !== 'darwin' }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-helper-timeout-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = path.join(root, 'Dog Squad.app'), backup = path.join(root, '.dog-squad-backup-0011223344556677.app');
  const container = path.join(root, '.dog-squad-update-0011223344556677'), staged = path.join(container, 'Dog Squad.app');
  const makeApp = async (app, marker, sleep) => {
    await fs.mkdir(path.join(app, 'Contents', 'MacOS'), { recursive: true });
    await fs.writeFile(path.join(app, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.dogsquad.game</string><key>CFBundleExecutable</key><string>Dog Squad</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
    const binary = path.join(app, 'Contents', 'MacOS', 'Dog Squad'); await fs.writeFile(binary, `#!/bin/zsh\n/usr/bin/printf '${marker}' > '${path.join(root, 'launched.txt')}'\n/bin/sleep ${sleep}\n`, { mode: 0o755 });
    execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
  };
  await makeApp(target, 'old', 0); await makeApp(staged, 'new', 10);
  const helper = path.join(root, 'helper.zsh'), receipt = path.join(root, 'receipt.txt'), health = path.join(root, 'health.txt');
  await fs.writeFile(helper, HELPER.replace('i -lt 300', 'i -lt 2'), { mode: 0o700 });
  const child = spawn('/bin/zsh', [helper, '999999', target, staged, backup, receipt, health], { stdio: ['ignore', 'ignore', 'pipe'] }); let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  await new Promise((resolve, reject) => { child.once('exit', code => code === 0 ? resolve() : reject(new Error(`helper exit ${code}: ${stderr}`))); child.once('error', reject); });
  assert.equal((await fs.readFile(receipt, 'utf8')).trim(), 'health-timeout-rolled-back');
  assert.equal(await fs.readFile(path.join(target, 'Contents', 'MacOS', 'Dog Squad'), 'utf8').then(value => value.includes("'old'")), true);
  assert.equal(await fs.access(backup).then(() => true, () => false), false);
  let launched = ''; for (let index = 0; index < 40 && launched !== 'old'; index++) { await new Promise(resolve => setTimeout(resolve, 25)); launched = await fs.readFile(path.join(root, 'launched.txt'), 'utf8').catch(() => ''); }
  assert.equal(launched, 'old'); await new Promise(resolve => setTimeout(resolve, 100));
});

test('release manifest authoring derives exact size and hash without embedding private material', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-release-manifest-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const artifact = path.join(root, 'Dog-Squad-1.0.0-arm64.zip'), bytes = Buffer.alloc(2048, 31); await fs.writeFile(artifact, bytes);
  const release = createAppRelease({ artifact, version: '1.0.0', releaseEpoch: 1, notes: '首个公开版本' });
  assert.equal(release.size, bytes.length); assert.equal(release.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(JSON.stringify(release).includes('PRIVATE KEY'), false);
  assert.throws(() => createAppRelease({ artifact, version: '1.0.1', releaseEpoch: 1 }), /文件名/);
});
