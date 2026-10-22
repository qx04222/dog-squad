'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { MAX_ENVELOPE_BYTES, ID, versionCompare, verifyEnvelope, verifyCatalog, secureURL, fetchBounded } = require('./security.cjs');
async function atomicWrite(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  let handle;
  try { handle = await fs.open(tmp, 'wx', 0o600); await handle.writeFile(value); await handle.sync(); await handle.close(); handle = null; await fs.rename(tmp, file); }
  finally { await handle?.close().catch(() => {}); await fs.rm(tmp, { force: true }).catch(() => {}); }
}
class ContentStore {
  constructor({ directory, keys = {}, appVersion, validatePack, feedURL = '', fetcher = fetchBounded }) {
    this.directory = directory; this.keys = keys; this.appVersion = appVersion; this.validatePack = validatePack; this.feedURL = feedURL; this.fetcher = fetcher;
    this.records = new Map(); this.highCatalogVersion = 0; this.warning = ''; this.queue = Promise.resolve(); this.mutationCount = 0;
  }
  serialized(fn) { const next = this.queue.then(fn); this.queue = next.catch(() => {}); return next; }
  mutating(fn) {
    this.mutationCount++;
    return this.serialized(fn).finally(() => { this.mutationCount = Math.max(0, this.mutationCount - 1); });
  }
  isMutating() { return this.mutationCount > 0; }
  decode(raw) {
    const { envelope, data } = verifyEnvelope(raw, this.keys);
    const pack = this.validatePack(data, { appVersion: this.appVersion });
    if (pack.id === 'daybreak') throw new Error('下载内容不能覆盖内置战役');
    return { pack, envelope };
  }
  ensureUnique(pack) { const ids=new Set([...this.records.values()].filter(r=>r.pack.id!==pack.id).flatMap(r=>r.pack.levels.map(l=>l.id)));if(pack.levels.some(l=>ids.has(l.id)))throw new Error('关卡标识与另一个已安装包冲突'); }
  file(id) { if (!ID.test(id)) throw new Error('关卡包标识无效'); return path.join(this.directory, `${id}.json`); }
  async load() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    let catalog; try { catalog = JSON.parse(await fs.readFile(path.join(this.directory, '_catalog.json'), 'utf8')); this.highCatalogVersion = Number.isSafeInteger(catalog.version) ? Math.max(0, catalog.version) : 0; } catch {}
    const names = await fs.readdir(this.directory);
    for (const name of names.filter(n => /^[a-z][a-z0-9-]{1,63}\.json$/.test(n))) {
      const file = path.join(this.directory, name); let record;
      try {
        const stat = await fs.stat(file); if (stat.size > MAX_ENVELOPE_BYTES * 2 + 2048) throw new Error('存档包过大');
        record = JSON.parse(await fs.readFile(file, 'utf8'));
        const current = this.decode(record.current);
        if (current.pack.id + '.json' !== name || versionCompare(record.highestVersion, current.pack.version) < 0) throw new Error('存档版本无效');
        if (record.previous) { const previous = this.decode(record.previous); if (previous.pack.id !== current.pack.id || versionCompare(record.highestVersion, previous.pack.version) < 0) throw new Error('恢复包无效'); }
        this.ensureUnique(current.pack);
        this.records.set(current.pack.id, { ...record, pack: current.pack });
      } catch {
        await fs.mkdir(path.join(this.directory, 'quarantine'), { recursive: true, mode: 0o700 });
        await fs.rename(file, path.join(this.directory, 'quarantine', `${Date.now()}-${name}`));
        this.warning = '发现损坏的关卡包，已隔离；内置战役仍可游玩。';
        try {
          const backupBytes = await fs.readFile(file + '.backup');
          if (backupBytes.length > MAX_ENVELOPE_BYTES * 2 + 2048) throw new Error('恢复包过大');
          const backup = JSON.parse(backupBytes.toString('utf8')), restored = this.decode(backup.current);
          if (restored.pack.id + '.json' !== name || versionCompare(backup.highestVersion, restored.pack.version) < 0) throw new Error('恢复包无效');
          this.ensureUnique(restored.pack);
          await atomicWrite(file, JSON.stringify(backup)); this.records.set(restored.pack.id, { ...backup, pack: restored.pack });
          this.warning = '关卡包损坏已隔离，并恢复到上一可用版本。';
        } catch {}
      }
    }
    return this.getPacks();
  }
  getPacks() { return [...this.records.values()].map(r => structuredClone(r.pack)); }
  summaries() { return [...this.records.values()].map(r => ({ id: r.pack.id, title: r.pack.title, version: r.pack.version, levelCount: r.pack.levels.length, canRollback: !!r.previous })); }
  matchesInstalled(raw) {
    const { pack, envelope } = this.decode(raw), current = this.records.get(pack.id)?.current;
    return !!current && pack.version === this.records.get(pack.id).pack.version &&
      ['schema', 'keyId', 'payload', 'sha256', 'signature'].every(key => current[key] === envelope[key]);
  }
  async install(raw, expected) {
    return this.mutating(async () => {
      const { pack, envelope } = this.decode(raw), old = this.records.get(pack.id);
      this.ensureUnique(pack);
      if (!old && this.records.size >= 32) throw new Error('已达到 32 个扩展包的安装上限');
      if (expected && (pack.id !== expected.id || pack.version !== expected.version)) throw new Error('关卡包与发行目录不一致');
      if (old && versionCompare(pack.version, old.highestVersion) <= 0) throw new Error('关卡包版本未升级，已拒绝重复安装或降级');
      const record = { schema: 1, current: envelope, previous: old?.current || null, highestVersion: pack.version };
      if (old) await atomicWrite(this.file(pack.id) + '.backup', JSON.stringify({ schema: 1, current: old.current, previous: null, highestVersion: pack.version }));
      await atomicWrite(this.file(pack.id), JSON.stringify(record));
      this.records.set(pack.id, { ...record, pack }); return this.summaries();
    });
  }
  async rollback(id) {
    return this.mutating(async () => {
      const old = this.records.get(id); if (!old?.previous) throw new Error('没有可恢复的上一版本');
      const restored = this.decode(old.previous);
      const record = { schema: 1, current: old.previous, previous: null, highestVersion: old.highestVersion };
      await atomicWrite(this.file(id), JSON.stringify(record)); await fs.rm(this.file(id) + '.backup', { force: true });
      this.records.set(id, { ...record, pack: restored.pack }); return this.summaries();
    });
  }
  async checkUpdates(canInstall = () => true) {
    if (!this.feedURL) return { installed: 0, message: '尚未配置关卡发行服务；可导入受信任的离线关卡包。' };
    const origin = secureURL(this.feedURL).origin;
    const raw = await this.fetcher(this.feedURL, { origin, maxBytes: 256 * 1024 });
    const catalog = verifyCatalog(verifyEnvelope(raw, this.keys, 256 * 1024).data, origin);
    if (catalog.version < this.highCatalogVersion) throw new Error('更新目录版本回退，已拒绝');
    let installed = 0;
    for (const entry of catalog.packs) {
      const old = this.records.get(entry.id); if (old && versionCompare(entry.version, old.highestVersion) <= 0) continue;
      const bytes = await this.fetcher(entry.url, { origin });
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('下载文件与目录校验值不一致');
      if (!canInstall()) throw new Error('战斗中已暂停安装；返回行动地图后再次检查。');
      await this.install(bytes, entry); installed++;
    }
    this.highCatalogVersion = catalog.version;
    await atomicWrite(path.join(this.directory, '_catalog.json'), JSON.stringify({ version: catalog.version }));
    return { installed, message: installed ? `已安装 ${installed} 个新关卡包，请返回行动地图加载。` : '所有已发布关卡包均为最新版本。' };
  }
}
module.exports = { ContentStore, atomicWrite };
