'use strict';
const path = require('node:path');
const { secureURL, fetchBounded, versionCompare } = require('./security.cjs');
const { decodeAppManifest, downloadVerifiedArtifact, prepareMacAppUpdate, launchInstallHelper } = require('./app-update.cjs');

class ApplicationUpdater {
  constructor({ version, config, isPackaged, notify, isBattleActive, userData = '', executable = '', quit = () => {}, manifestFetcher = fetchBounded, artifactDownloader = downloadVerifiedArtifact, prepare = prepareMacAppUpdate, launch = launchInstallHelper }) {
    this.notify = notify; this.isBattleActive = isBattleActive; this.preferences = { automaticUpdates: true }; this.busy = null; this.manifest = null; this.download = '';
    this.config = config || {}; this.userData = userData; this.executable = executable; this.quit = quit; this.manifestFetcher = manifestFetcher; this.artifactDownloader = artifactDownloader; this.prepare = prepare; this.launch = launch;
    this.state = { version, phase: 'disabled', enabled: false, reason: '此安装包未连接可信应用更新频道；现有战役可完整离线游玩。', progress: 0, availableVersion: null };
    if (!isPackaged || !config?.appUpdateURL || !Number.isSafeInteger(config.releaseEpoch) || config.releaseEpoch < 1 || !Object.keys(config.appPublicKeys || {}).length) return;
    try { secureURL(config.appUpdateURL); } catch { this.state.reason = '发行更新地址配置无效。'; return; }
    this.state = { ...this.state, enabled: true, phase: 'idle', reason: '签名应用更新已就绪。' };
  }
  change(fields) { Object.assign(this.state, fields); this.notify?.(); }
  setPreferences(value) { this.preferences = { ...value }; }
  async check({ manual = false } = {}) {
    if (!this.state.enabled || (!manual && !this.preferences.automaticUpdates)) return this.state;
    if (['ready', 'installing'].includes(this.state.phase)) return this.state;
    if (this.busy) return this.busy;
    this.busy = (async () => {
      try {
        this.change({ phase: 'checking', reason: '正在检查签名应用更新…' });
        const origin = secureURL(this.config.appUpdateURL).origin;
        const raw = await this.manifestFetcher(this.config.appUpdateURL, { origin, maxBytes: 256 * 1024 });
        const manifest = decodeAppManifest(raw, this.config.appPublicKeys);
        if (manifest.releaseEpoch <= this.config.releaseEpoch) { this.manifest = null; this.change({ phase: 'current', availableVersion: null, reason: '当前应用已是最新版本。' }); return this.state; }
        if (versionCompare(manifest.version, this.state.version) <= 0) throw new Error('应用更新版本未递增，已拒绝');
        this.manifest = manifest;
        this.change({ phase: 'available', availableVersion: manifest.version, reason: `发现签名版本 ${manifest.version}。` });
        if (manual || this.preferences.automaticUpdates) {
          this.change({ phase: 'downloading', progress: 0, reason: '正在后台下载并校验更新；可以继续游玩。' });
          this.download = path.join(this.userData, 'app-updates', `Dog-Squad-${manifest.version}-arm64.zip`);
          await this.artifactDownloader(manifest, this.download);
          this.change({ phase: 'ready', progress: 100, reason: '更新包的签名与完整性已验证。返回行动地图后可重启安装。' });
        }
      } catch (error) {
        this.change({ phase: 'error', reason: `应用更新未完成：${String(error?.message || '未知错误').slice(0, 180)}。当前版本与存档不受影响。` });
      }
      return this.state;
    })().finally(() => { this.busy = null; });
    return this.busy;
  }
  async install() {
    if (this.isBattleActive()) throw new Error('请先结束当前战斗，再重启安装更新。');
    if (this.state.phase !== 'ready' || !this.manifest || !this.download) throw new Error('没有已验证并下载完成的应用更新。');
    this.change({ phase: 'installing', reason: '正在验证应用包并准备安全重启…' });
    try {
      const plan = await this.prepare({ zip: this.download, entry: this.manifest, executable: this.executable });
      await this.launch({ plan, userData: this.userData, quit: this.quit });
      return true;
    } catch (error) {
      this.change({ phase: 'ready', reason: `更新包已验证，但无法自动替换当前安装：${String(error?.message || '未知错误').slice(0, 160)}。请从 GitHub Release 手动安装。` });
      throw error;
    }
  }
}
module.exports = { ApplicationUpdater };
