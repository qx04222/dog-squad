'use strict';
const crypto = require('node:crypto');
const https = require('node:https');
const MAX_ENVELOPE_BYTES = 4 * 1024 * 1024;
const ID = /^[a-z][a-z0-9-]{1,63}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA256 = /^[a-f0-9]{64}$/;
function fail(message) { throw new Error(message); }
function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) fail('数据包含未支持字段');
}
function versionCompare(a, b) {
  if (!VERSION.test(a) || !VERSION.test(b)) fail('版本号必须为 x.y.z');
  const aa = a.split('.').map(Number), bb = b.split('.').map(Number);
  if ([...aa, ...bb].some(n => !Number.isSafeInteger(n))) fail('版本号超出范围');
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] > bb[i] ? 1 : -1;
  return 0;
}
function secureURL(value, origin) {
  let url; try { url = new URL(value); } catch { fail('更新地址无效'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (origin && url.origin !== origin)) fail('更新地址必须为可信同源 HTTPS');
  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || /^127\./.test(url.hostname) || url.hostname === '[::1]') fail('发行更新地址不能是本机地址');
  return url;
}
function base64(value, max) {
  if (typeof value !== 'string' || value.length > max * 1.4 + 8 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail('签名包编码无效');
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > max || bytes.toString('base64') !== value) fail('签名包大小或编码无效');
  return bytes;
}
function publicKey(pem) {
  if (typeof pem !== 'string' || !/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PUBLIC KEY-----\s*$/.test(pem) || pem.includes('PRIVATE KEY')) fail('发行配置只能包含 PUBLIC KEY，禁止私钥');
  let key; try { key = crypto.createPublicKey(pem); } catch { fail('发行公钥无效'); }
  if (key.asymmetricKeyType !== 'ed25519') fail('发行公钥必须为 Ed25519');
  return key;
}
function verifyEnvelope(raw, trustedKeys, max = MAX_ENVELOPE_BYTES) {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw === 'string' ? raw : JSON.stringify(raw));
  if (bytes.length > max) fail('签名包超过大小限制');
  let envelope; try { envelope = JSON.parse(bytes.toString('utf8')); } catch { fail('签名包不是有效 JSON'); }
  exactKeys(envelope, ['schema', 'keyId', 'payload', 'sha256', 'signature']);
  if (envelope.schema !== 1 || typeof envelope.keyId !== 'string' || !ID.test(envelope.keyId) || !Object.hasOwn(trustedKeys, envelope.keyId)) fail('关卡包发行方不受信任');
  if (typeof envelope.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.sha256)) fail('关卡包校验值无效');
  const payload = base64(envelope.payload, max), signature = base64(envelope.signature, 64);
  if (signature.length !== 64) fail('关卡包签名长度无效');
  const hash = crypto.createHash('sha256').update(payload).digest('hex');
  if (hash !== envelope.sha256) fail('关卡包内容校验失败');
  const key = publicKey(trustedKeys[envelope.keyId]);
  if (!crypto.verify(null, payload, key, signature)) fail('关卡包签名验证失败');
  let data; try { data = JSON.parse(payload.toString('utf8')); } catch { fail('关卡内容不是有效 JSON'); }
  return { envelope, data, bytes };
}
function verifyCatalog(data, origin) {
  exactKeys(data, ['schema', 'type', 'version', 'packs']);
  if (data.schema !== 1 || data.type !== 'catalog' || !Number.isSafeInteger(data.version) || data.version < 1 || !Array.isArray(data.packs) || data.packs.length > 32) fail('更新目录格式无效');
  const ids = new Set();
  for (const p of data.packs) {
    exactKeys(p, ['id', 'version', 'url', 'sha256']);
    if (!ID.test(p.id) || p.id === 'daybreak' || ids.has(p.id) || !VERSION.test(p.version) || !/^[a-f0-9]{64}$/.test(p.sha256)) fail('更新目录条目无效');
    ids.add(p.id); secureURL(p.url, origin);
  }
  return data;
}
function verifyAppManifest(data, { owner = 'qx04222', repository = 'dog-squad' } = {}) {
  exactKeys(data, ['schema', 'type', 'releaseEpoch', 'version', 'platform', 'arch', 'bundleId', 'url', 'size', 'sha256', 'notes']);
  if (data.schema !== 1 || data.type !== 'app-release' || !Number.isSafeInteger(data.releaseEpoch) || data.releaseEpoch < 1) fail('应用更新序号无效');
  if (!VERSION.test(data.version) || data.platform !== 'darwin' || data.arch !== 'arm64' || data.bundleId !== 'com.dogsquad.game') fail('应用更新目标无效');
  if (!Number.isSafeInteger(data.size) || data.size < 1024 || data.size > 350 * 1024 * 1024 || !SHA256.test(data.sha256)) fail('应用更新文件信息无效');
  if (typeof data.notes !== 'string' || data.notes.length > 1200 || /[<>\u0000-\u001f]/.test(data.notes)) fail('应用更新说明无效');
  let url;
  try { url = new URL(data.url); } catch { fail('应用更新下载地址无效'); }
  const expectedPath = `/${owner}/${repository}/releases/download/v${data.version}/Dog-Squad-${data.version}-arm64.zip`;
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.pathname !== expectedPath || url.username || url.password || url.hash || url.search) fail('应用更新下载地址不受信任');
  return data;
}
function fetchBounded(urlValue, { origin, maxBytes = MAX_ENVELOPE_BYTES, timeoutMs = 15000, request = https.get } = {}) {
  const url = secureURL(urlValue, origin);
  return new Promise((resolve, reject) => {
    let finished = false, timer;
    const done = (error, bytes) => { if (finished) return; finished = true; clearTimeout(timer); error ? reject(error) : resolve(bytes); };
    const req = request(url, { headers: { Accept: 'application/json', 'User-Agent': 'DogSquad-Content/4' } }, res => {
      if (res.statusCode !== 200) { done(new Error('更新服务暂不可用，或返回了不允许的重定向')); res.destroy(); req.destroy(); return; }
      if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') { res.destroy(); done(new Error('更新服务使用了不支持的压缩')); return; }
      if (Number(res.headers['content-length']) > maxBytes) { res.destroy(); done(new Error('更新响应超过大小限制')); return; }
      const chunks = []; let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size > maxBytes) { done(new Error('更新响应超过大小限制')); res.destroy(); req.destroy(); } else chunks.push(chunk); });
      res.on('end', () => done(null, Buffer.concat(chunks)));
      res.on('error', e => done(e));
      res.on('aborted', () => done(new Error('更新下载中断')));
    });
    req.on('error', e => done(e));
    timer = setTimeout(() => { done(new Error('更新请求超时')); req.destroy(); }, timeoutMs);
    timer.unref?.();
  });
}
module.exports = { MAX_ENVELOPE_BYTES, ID, VERSION, SHA256, exactKeys, versionCompare, secureURL, publicKey, verifyEnvelope, verifyCatalog, verifyAppManifest, fetchBounded };
