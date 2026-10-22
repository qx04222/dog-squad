'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyCatalog, secureURL, ID } = require('../desktop/security.cjs');
const root = path.resolve(__dirname, '..');
function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
function outsideProject(file) {
  const absolute = path.resolve(file);
  // Resolve existing ancestors as well, so a new key directory cannot hide inside
  // the project through an otherwise external symlink.
  let ancestor = absolute; const tail = [];
  while (!fs.existsSync(ancestor)) { tail.unshift(path.basename(ancestor)); const parent = path.dirname(ancestor); if (parent === ancestor) throw new Error('私钥路径无效'); ancestor = parent; }
  const resolved = path.join(fs.realpathSync(ancestor), ...tail), project = fs.realpathSync(root);
  if (resolved === project || resolved.startsWith(project + path.sep)) throw new Error('私钥必须保存在工程之外，不可进入源代码或安装包');
  return resolved;
}
function sign(data, keyId, privateKey) {
  if (!ID.test(keyId)) throw new Error('key-id 无效');
  const key = crypto.createPrivateKey(privateKey); if (key.asymmetricKeyType !== 'ed25519') throw new Error('必须使用 Ed25519 私钥');
  const bytes = Buffer.from(JSON.stringify(data));
  return { schema: 1, keyId, payload: bytes.toString('base64'), sha256: crypto.createHash('sha256').update(bytes).digest('hex'), signature: crypto.sign(null, bytes, key).toString('base64') };
}
if (require.main === module) {
  try {
    if (process.argv.includes('--generate-key')) {
      if (!arg('--out-dir')) throw new Error('生成密钥需要 --out-dir 工程外目录');
      const dir = outsideProject(arg('--out-dir')); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const key = crypto.generateKeyPairSync('ed25519');
      fs.writeFileSync(path.join(dir, 'publisher-private.pem'), key.privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(path.join(dir, 'publisher-public.pem'), key.publicKey.export({ type: 'spki', format: 'pem' }), { flag: 'wx', mode: 0o644 });
      console.log('发行密钥已生成到指定目录。私钥未显示；仅公钥可加入发行配置。');
    } else {
      for (const required of ['--input', '--output', '--key', '--key-id']) if (!arg(required)) throw new Error(`缺少 ${required}`);
      const keyPath = outsideProject(arg('--key'));
      if (process.platform !== 'win32' && (fs.statSync(keyPath).mode & 0o077)) throw new Error('私钥权限必须为仅所有者可读写（0600）');
      let data = JSON.parse(fs.readFileSync(arg('--input'), 'utf8'));
      if (data.type === 'catalog') {
        if (!arg('--origin')) throw new Error('签署目录需 --origin https://更新域名');
        verifyCatalog(data, secureURL(arg('--origin')).origin);
      } else {
        const content = require('../src/content.js');
        data = content.validatePack(data, { appVersion: content.CONTENT_API_VERSION });
      }
      if (data.id === 'daybreak') throw new Error('内置战役应通过应用发行，不可签署为外部包');
      const envelope = sign(data, arg('--key-id'), fs.readFileSync(keyPath));
      fs.writeFileSync(arg('--output'), JSON.stringify(envelope, null, 2) + '\n', { flag: 'wx' });
      console.log(`已签署 ${data.id || 'catalog'} ${data.version}；输出不含私钥。`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { sign, outsideProject };
