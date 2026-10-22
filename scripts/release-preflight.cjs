'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { secureURL, publicKey } = require('../desktop/security.cjs');
function preflight({ root = path.resolve(__dirname, '..'), configPath = path.join(root, 'desktop/release-config.json'), production = false, inspectSigning = true } = {}) {
  const errors = [], warnings = [];
  let config; try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { return { ok: false, errors: ['无法读取发行配置'], warnings }; }
  if (production !== (config.production === true)) errors.push('发行模式与配置不一致');
  const keys = config.contentPublicKeys || {};
  for (const [id, pem] of Object.entries(keys)) {
    try { if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) throw new Error(); publicKey(pem); } catch { errors.push(`关卡公钥无效：${id}`); }
  }
  const appKeys = config.appPublicKeys || {};
  for (const [id, pem] of Object.entries(appKeys)) {
    try { if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) throw new Error(); publicKey(pem); } catch { errors.push(`应用更新公钥无效：${id}`); }
  }
  const appUpdatesConfigured = !!config.appUpdateURL || Object.keys(appKeys).length > 0 || config.releaseEpoch !== undefined;
  if (appUpdatesConfigured) {
    if (!Number.isSafeInteger(config.releaseEpoch) || config.releaseEpoch < 1) errors.push('应用更新 releaseEpoch 必须是正整数');
    if (!config.appUpdateURL) errors.push('应用更新清单地址尚未配置');
    if (!Object.keys(appKeys).length) errors.push('缺少应用更新签名公钥');
    if (config.channel !== 'stable') errors.push('公开应用更新 channel 必须为 stable');
  }
  for (const name of ['appUpdateURL', 'contentFeedURL']) {
    if (config[name]) {
      try { const url = secureURL(config[name]); if (/\.example$|example\.com$|your-domain|REPLACE/i.test(url.hostname)) errors.push(`${name} 仍为示例域名`); } catch { errors.push(`${name} 必须为可信 HTTPS 地址`); }
    } else if (production) errors.push(`${name} 尚未配置`);
  }
  if (production) {
    if (config.channel !== 'stable') errors.push('正式发行 channel 必须为 stable');
    if (!/^[A-Z0-9]{10}$/.test(config.teamId)) errors.push('缺少有效的 Apple Team ID');
    if (!Object.keys(keys).length) errors.push('缺少内容签名公钥');
    if (!Object.keys(appKeys).length) errors.push('缺少应用更新签名公钥');
    if (Object.keys(keys).some(id => /test|demo|sample|qa/i.test(id))) errors.push('正式发行不能信任测试或演示密钥');
    if (inspectSigning) {
      let identities = ''; try { identities = execFileSync('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' }); } catch {}
      if (!identities.includes('Developer ID Application:') || !identities.includes(`(${config.teamId})`)) errors.push('钥匙串没有匹配的 Developer ID Application 签名身份');
      if (!(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID === config.teamId) && !(process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER)) errors.push('缺少 Apple 公证凭据环境变量');
    }
  } else if (appUpdatesConfigured) warnings.push('这是社区签名安装包：应用更新由内置 Ed25519 公钥校验；安装包未获 Apple 公证。');
  else warnings.push('这是本机签名安装包：应用自动更新停用；不能作为已公证的公开发行版本。');
  for (const relative of ['src/content.js', 'src/core.js', 'src/game.js', 'desktop/main.cjs', 'desktop/preload.cjs', 'desktop/app.html', 'content/builtin.js']) if (!fs.existsSync(path.join(root, relative))) errors.push(`缺少构建文件 ${relative}`);
  return { ok: !errors.length, errors, warnings, production, releaseEpoch: config.releaseEpoch || 0, configuredAppKeys: Object.keys(appKeys), configuredContentKeys: Object.keys(keys) };
}
if (require.main === module) { const result = preflight({ production: process.argv.includes('--production'), configPath: process.env.DOG_SQUAD_RELEASE_CONFIG || undefined }); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 1; }
module.exports = { preflight };
