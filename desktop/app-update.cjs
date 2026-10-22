'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { promisify } = require('node:util');
const { execFile: execFileCallback, spawn } = require('node:child_process');
const { verifyEnvelope, verifyAppManifest } = require('./security.cjs');
const execFile = promisify(execFileCallback);
const MAX_ZIP_LIST_BYTES = 4 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 1200 * 1024 * 1024;
const MAX_EXTRACTED_FILES = 20000;
const HELPER = `#!/bin/zsh
set -u
parent_pid="$1"
target="$2"
staged="$3"
backup="$4"
receipt="$5"
health="$6"
write_status() { /usr/bin/printf '%s\\n' "$1" > "$receipt"; }
i=0
while /bin/kill -0 "$parent_pid" 2>/dev/null && (( i < 600 )); do /bin/sleep 0.1; i=$((i + 1)); done
if /bin/kill -0 "$parent_pid" 2>/dev/null; then write_status parent-timeout; exit 20; fi
if [[ "$backup" != */.dog-squad-backup-*.app || "$staged" != */.dog-squad-update-*/Dog\\ Squad.app ]]; then write_status unsafe-path; exit 21; fi
if ! /bin/mv -- "$target" "$backup"; then write_status backup-failed; exit 22; fi
if ! /bin/mv -- "$staged" "$target"; then /bin/mv -- "$backup" "$target" 2>/dev/null; write_status swap-rolled-back; exit 23; fi
if ! /usr/bin/codesign --verify --deep --strict "$target" >/dev/null 2>&1; then
  if ! /bin/mv -- "$target" "$staged"; then write_status verify-rollback-preserve-failed; exit 24; fi
  if ! /bin/mv -- "$backup" "$target"; then /bin/mv -- "$staged" "$target" 2>/dev/null; write_status verify-restore-failed-new-restored; exit 24; fi
  write_status verify-rolled-back
  exit 24
fi
"$target/Contents/MacOS/Dog Squad" "--dog-squad-update-health=$health" >/dev/null 2>&1 &
new_pid=$!
i=0
while [[ ! -f "$health" && i -lt 300 ]] && /bin/kill -0 "$new_pid" 2>/dev/null; do /bin/sleep 0.1; i=$((i + 1)); done
failure_reason=health-timeout
if [[ -f "$health" ]]; then
  i=0
  while /bin/kill -0 "$new_pid" 2>/dev/null && (( i < 30 )); do /bin/sleep 0.1; i=$((i + 1)); done
  if /bin/kill -0 "$new_pid" 2>/dev/null; then /bin/rm -rf -- "$backup"; write_status healthy; exit 0; fi
  failure_reason=post-health-exit
fi
  if /bin/kill -0 "$new_pid" 2>/dev/null; then
    /bin/kill -TERM "$new_pid" 2>/dev/null
    i=0
    while /bin/kill -0 "$new_pid" 2>/dev/null && (( i < 50 )); do /bin/sleep 0.1; i=$((i + 1)); done
    if /bin/kill -0 "$new_pid" 2>/dev/null; then /bin/kill -KILL "$new_pid" 2>/dev/null; /bin/sleep 0.2; fi
  fi
  if /bin/kill -0 "$new_pid" 2>/dev/null; then write_status "\${failure_reason}-process-alive-backup-preserved"; exit 26; fi
  if ! /bin/mv -- "$target" "$staged"; then write_status "\${failure_reason}-rollback-preserve-failed"; exit 26; fi
  if ! /bin/mv -- "$backup" "$target"; then
    /bin/mv -- "$staged" "$target" 2>/dev/null
    write_status "\${failure_reason}-restore-failed-new-restored-backup-preserved"
    exit 26
  fi
  if /usr/bin/open -n "$target" >/dev/null 2>&1; then write_status "\${failure_reason}-rolled-back"; else write_status "\${failure_reason}-rolled-back-relaunch-failed"; fi
`;

function trustedRedirect(from, to) {
  if (from.protocol !== 'https:' || to.protocol !== 'https:' || to.username || to.password || to.hash) return false;
  if (from.hostname === 'github.com') return to.hostname === 'release-assets.githubusercontent.com';
  return false;
}
function artifactResponse(urlValue, { request = https.get, redirects = 0 } = {}) {
  const url = new URL(urlValue);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; error ? reject(error) : resolve(value); };
    const req = request(url, { headers: { Accept: 'application/octet-stream', 'User-Agent': 'DogSquad-Updater/1' } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        let next; try { next = new URL(res.headers.location || '', url); } catch { next = null; }
        res.destroy(); req.destroy();
        if (redirects >= 1 || !next || !trustedRedirect(url, next)) return finish(new Error('应用更新下载重定向不受信任'));
        artifactResponse(next, { request, redirects: redirects + 1 }).then(value => finish(null, value), finish);
        return;
      }
      if (res.statusCode !== 200) { res.destroy(); req.destroy(); return finish(new Error('应用更新下载服务暂不可用')); }
      if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') { res.destroy(); req.destroy(); return finish(new Error('应用更新使用了不支持的压缩传输')); }
      finish(null, res);
    });
    req.on('error', finish);
    req.setTimeout?.(30000, () => { req.destroy(new Error('应用更新下载超时')); });
  });
}
async function downloadVerifiedArtifact(entry, destination, options = {}) {
  verifyAppManifest(entry, options.repository);
  await fsp.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temp = `${destination}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  let response;
  try {
    response = await artifactResponse(entry.url, options);
    const declared = Number(response.headers['content-length']);
    if (Number.isFinite(declared) && declared !== entry.size) throw new Error('应用更新下载大小与清单不一致');
    let size = 0; const hash = crypto.createHash('sha256');
    const meter = new Transform({ transform(chunk, _encoding, callback) { size += chunk.length; if (size > entry.size) return callback(new Error('应用更新下载超过签名大小')); hash.update(chunk); callback(null, chunk); } });
    await pipeline(response, meter, fs.createWriteStream(temp, { flags: 'wx', mode: 0o600 }));
    if (size !== entry.size || hash.digest('hex') !== entry.sha256) throw new Error('应用更新签名校验失败');
    const handle = await fsp.open(temp, 'r'); try { await handle.sync(); } finally { await handle.close(); }
    await fsp.rename(temp, destination);
    return destination;
  } catch (error) { response?.destroy?.(); await fsp.rm(temp, { force: true }).catch(() => {}); throw error; }
}
function safeZipEntry(name) {
  if (!name || name.includes('\\') || name.startsWith('/') || name.includes('\0')) return false;
  const parts = name.replace(/\/$/, '').split('/');
  return parts.length > 0 && parts[0] === 'Dog Squad.app' && parts.every(part => part && part !== '.' && part !== '..');
}
async function inspectZip(zip, run = execFile) {
  const [{ stdout }, { stdout: detail }] = await Promise.all([
    run('/usr/bin/zipinfo', ['-1', zip], { encoding: 'utf8', maxBuffer: MAX_ZIP_LIST_BYTES }),
    run('/usr/bin/zipinfo', ['-l', zip], { encoding: 'utf8', maxBuffer: MAX_ZIP_LIST_BYTES })
  ]);
  const names = stdout.split(/\r?\n/).filter(Boolean);
  if (!names.length || names.length > MAX_EXTRACTED_FILES || names.some(name => !safeZipEntry(name))) throw new Error('应用更新压缩包路径不安全');
  const summary = detail.match(/(\d+) files?,\s+(\d+) bytes uncompressed,/i);
  if (!summary || Number(summary[1]) !== names.length || !Number.isSafeInteger(Number(summary[2])) || Number(summary[2]) > MAX_EXTRACTED_BYTES) throw new Error('应用更新解压清单超出限制');
  return names;
}
async function inspectTree(root) {
  let count = 0, size = 0;
  async function walk(directory) {
    for (const name of await fsp.readdir(directory)) {
      const file = path.join(directory, name), stat = await fsp.lstat(file); count++;
      if (count > MAX_EXTRACTED_FILES) throw new Error('应用更新文件数量超过限制');
      if (stat.isSymbolicLink()) {
        const target = await fsp.readlink(file);
        if (path.isAbsolute(target)) throw new Error('应用更新包含越界符号链接');
        let resolved; try { resolved = await fsp.realpath(file); } catch { throw new Error('应用更新包含损坏符号链接'); }
        if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error('应用更新包含越界符号链接');
      } else if (stat.isDirectory()) await walk(file);
      else if (stat.isFile()) { size += stat.size; if (size > MAX_EXTRACTED_BYTES) throw new Error('应用更新解压大小超过限制'); }
      else throw new Error('应用更新包含不支持的文件类型');
    }
  }
  await walk(root); return { count, size };
}
async function plistValue(appPath, key, run = execFile) {
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  const { stdout } = await run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8', maxBuffer: 4096 });
  return stdout.trim();
}
async function validateAppBundle(appPath, entry, run = execFile) {
  const real = await fsp.realpath(appPath);
  if (real !== appPath) throw new Error('应用更新根目录不能是符号链接');
  await inspectTree(real);
  const [bundleId, version, executable] = await Promise.all(['CFBundleIdentifier', 'CFBundleShortVersionString', 'CFBundleExecutable'].map(key => plistValue(real, key, run)));
  if (bundleId !== entry.bundleId || version !== entry.version || executable !== 'Dog Squad') throw new Error('应用更新身份与签名清单不一致');
  const binary = path.join(real, 'Contents', 'MacOS', executable);
  const { stdout: arches } = await run('/usr/bin/lipo', ['-archs', binary], { encoding: 'utf8', maxBuffer: 4096 });
  if (!arches.trim().split(/\s+/).includes('arm64')) throw new Error('应用更新不包含 arm64 程序');
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', real], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  return real;
}
function appBundleFromExecutable(executable) {
  let cursor = path.resolve(executable);
  while (cursor !== path.dirname(cursor)) { if (cursor.endsWith('.app')) return cursor; cursor = path.dirname(cursor); }
  throw new Error('当前程序不在 macOS 应用包中');
}
async function prepareMacAppUpdate({ zip, entry, executable, run = execFile }) {
  if (process.platform !== 'darwin' && run === execFile) throw new Error('应用内安装仅支持 macOS');
  const target = await fsp.realpath(appBundleFromExecutable(executable)), parent = path.dirname(target);
  await fsp.access(parent, fs.constants.W_OK);
  await inspectZip(zip, run);
  const token = crypto.randomBytes(8).toString('hex'), container = path.join(parent, `.dog-squad-update-${token}`);
  const staged = path.join(container, 'Dog Squad.app'), backup = path.join(parent, `.dog-squad-backup-${token}.app`);
  await fsp.mkdir(container, { mode: 0o700 });
  try { await run('/usr/bin/ditto', ['-x', '-k', zip, container], { encoding: 'utf8', maxBuffer: 1024 * 1024 }); await validateAppBundle(staged, entry, run); }
  catch (error) { await fsp.rm(container, { recursive: true, force: true }); throw error; }
  return { target, staged, backup, container };
}
async function launchInstallHelper({ plan, userData, parentPid = process.pid, spawnProcess = spawn, quit }) {
  const updates = path.join(userData, 'app-updates'); await fsp.mkdir(updates, { recursive: true, mode: 0o700 });
  const token = path.basename(plan.container).replace('.dog-squad-update-', '');
  if (!/^[a-f0-9]{16}$/.test(token)) throw new Error('应用更新暂存标识无效');
  const helper = path.join(updates, `install-${token}.zsh`), receipt = path.join(updates, `receipt-${token}.txt`), health = path.join(updates, `health-${token}.txt`);
  await fsp.writeFile(helper, HELPER, { flag: 'wx', mode: 0o700 });
  const child = spawnProcess('/bin/zsh', [helper, String(parentPid), plan.target, plan.staged, plan.backup, receipt, health], { detached: true, stdio: 'ignore' });
  child.unref(); setTimeout(() => quit(), 100).unref?.();
  return { receipt, health };
}
function healthFileFromArg(argv, userData) {
  const prefix = '--dog-squad-update-health=';
  const value = argv.find(arg => typeof arg === 'string' && arg.startsWith(prefix))?.slice(prefix.length);
  if (!value) return '';
  const updates = path.join(path.resolve(userData), 'app-updates'), candidate = path.resolve(value);
  return candidate.startsWith(updates + path.sep) && /^health-[a-f0-9]{16}\.txt$/.test(path.basename(candidate)) ? candidate : '';
}
async function markUpdateHealthy(argv, userData) {
  const file = healthFileFromArg(argv, userData); if (!file) return false;
  try { await fsp.writeFile(file, 'healthy\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST' || await fsp.readFile(file, 'utf8').catch(() => '') !== 'healthy\n') throw error; }
  return true;
}
function decodeAppManifest(raw, keys, repository) { return verifyAppManifest(verifyEnvelope(raw, keys, 256 * 1024).data, repository); }
module.exports = { trustedRedirect, artifactResponse, downloadVerifiedArtifact, safeZipEntry, inspectZip, inspectTree, validateAppBundle, appBundleFromExecutable, prepareMacAppUpdate, launchInstallHelper, healthFileFromArg, markUpdateHealthy, decodeAppManifest, HELPER };
