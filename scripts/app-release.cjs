'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { sign, outsideProject } = require('./pack-sign.cjs');
const { VERSION, verifyAppManifest } = require('../desktop/security.cjs');
function arg(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function createAppRelease({ artifact, version, releaseEpoch, notes = '' }) {
  if (!VERSION.test(version)) throw new Error('版本号必须为 x.y.z');
  if (!Number.isSafeInteger(releaseEpoch) || releaseEpoch < 1) throw new Error('releaseEpoch 必须为正整数');
  const expected = `Dog-Squad-${version}-arm64.zip`;
  if (path.basename(artifact) !== expected) throw new Error(`安装包文件名必须为 ${expected}`);
  const stat = fs.statSync(artifact); if (!stat.isFile() || stat.size < 1024 || stat.size > 350 * 1024 * 1024) throw new Error('安装包大小不在发行限制内');
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
  return verifyAppManifest({ schema: 1, type: 'app-release', releaseEpoch, version, platform: 'darwin', arch: 'arm64', bundleId: 'com.dogsquad.game',
    url: `https://github.com/qx04222/dog-squad/releases/download/v${version}/${expected}`, size: stat.size, sha256, notes });
}
if (require.main === module) {
  try {
    for (const required of ['--artifact', '--version', '--epoch', '--key', '--key-id', '--output']) if (!arg(required)) throw new Error(`缺少 ${required}`);
    const keyPath = outsideProject(arg('--key'));
    if (process.platform !== 'win32' && (fs.statSync(keyPath).mode & 0o077)) throw new Error('私钥权限必须为仅所有者可读写（0600）');
    const data = createAppRelease({ artifact: path.resolve(arg('--artifact')), version: arg('--version'), releaseEpoch: Number(arg('--epoch')), notes: arg('--notes') || '' });
    const envelope = sign(data, arg('--key-id'), fs.readFileSync(keyPath));
    fs.writeFileSync(path.resolve(arg('--output')), JSON.stringify(envelope, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
    console.log(`已生成应用更新清单 ${data.version} / epoch ${data.releaseEpoch}；输出不含私钥。`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { createAppRelease };
