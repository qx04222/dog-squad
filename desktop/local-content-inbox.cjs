'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { MAX_ENVELOPE_BYTES } = require('./security.cjs');
const { readBoundedFile } = require('./bounded-file.cjs');
const { atomicWrite } = require('./content-store.cjs');

const FILE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,119}\.dogpack$/;
const TRANSIENT_CODES = new Set(['EACCES', 'EBUSY', 'EMFILE', 'ENFILE', 'ENOSPC', 'EPERM']);

function safeMessage(error) {
  return String(error?.message || '未知错误').replace(/[\r\n\t]+/g, ' ').slice(0, 240);
}

class LocalContentInbox {
  constructor({ directory, store, isEnabled = () => true, isBattleActive = () => false, onState, now = () => Date.now(),
    stableAgeMs = 2000, intervalMs = 60000, initialDelayMs = 5000, maxFiles = 64, maxAttempts = 5,
    readFile = readBoundedFile, watcher = fs.watch } = {}) {
    if (!path.isAbsolute(directory) || !store || typeof store.install !== 'function') throw new Error('本机章节收件箱配置无效');
    this.directory = directory; this.store = store; this.isEnabled = isEnabled; this.isBattleActive = isBattleActive;
    this.onState = onState; this.now = now; this.stableAgeMs = stableAgeMs; this.intervalMs = intervalMs;
    this.initialDelayMs = initialDelayMs; this.maxFiles = maxFiles; this.maxAttempts = maxAttempts;
    this.readFile = readFile; this.watcherFactory = watcher; this.observed = new Map(); this.failures = new Map();
    this.installing = false;
    this.queue = Promise.resolve(); this.scanTimer = null; this.interval = null; this.watcher = null; this.stopped = false;
    this.status = { enabled: true, phase: 'idle', pending: 0, installed: 0, rejected: 0, retrying: 0,
      readyToReload: false, lastScan: null, message: '本机章节自动更新已就绪。' };
  }
  snapshot() { return { ...this.status }; }
  isInstalling() { return this.installing; }
  emit(fields = {}) { Object.assign(this.status, fields); this.onState?.(this.snapshot()); }
  async prepare() {
    await Promise.all(['', 'processed', 'rejected'].map(part => fsp.mkdir(path.join(this.directory, part), { recursive: true, mode: 0o700 })));
  }
  async start() {
    await this.prepare(); this.stopped = false;
    try {
      this.watcher = this.watcherFactory(this.directory, { persistent: false }, (_event, name) => {
        if (typeof name === 'string' && name.endsWith('.dogpack')) this.requestScan(500);
      });
      this.watcher.on?.('error', () => { this.watcher?.close?.(); this.watcher = null; });
    } catch { this.watcher = null; }
    this.requestScan(this.initialDelayMs);
    this.interval = setInterval(() => this.scan().catch(() => {}), this.intervalMs); this.interval.unref?.();
    return this.snapshot();
  }
  stop() {
    this.stopped = true; if (this.scanTimer) clearTimeout(this.scanTimer); if (this.interval) clearInterval(this.interval);
    this.scanTimer = null; this.interval = null; this.watcher?.close?.(); this.watcher = null;
  }
  requestScan(delay = 0, options = {}) {
    if (this.stopped) return;
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => { this.scanTimer = null; this.scan(options).catch(() => {}); }, delay);
    this.scanTimer.unref?.();
  }
  scan(options = {}) {
    const run = () => this._scan(options);
    const next = this.queue.then(run, run); this.queue = next.catch(() => {}); return next;
  }
  async listCandidates() {
    const result = []; let limited = false;
    const directory = await fsp.opendir(this.directory);
    try {
      for await (const entry of directory) {
        if (!entry.name.endsWith('.dogpack')) continue;
        if (result.length >= this.maxFiles) { limited = true; break; }
        result.push(entry.name);
      }
    } finally { await directory.close().catch(() => {}); }
    return { names: result.sort(), limited };
  }
  async _scan({ manual = false } = {}) {
    await this.prepare(); const enabled = manual || this.isEnabled();
    if (!enabled) { this.emit({ enabled: false, phase: 'disabled', message: '自动章节更新已关闭；收件箱文件保持原样。' }); return this.snapshot(); }
    if (this.isBattleActive()) { this.emit({ enabled: true, phase: 'deferred', message: '检测到新章节；战斗结束后自动验证安装。' }); return this.snapshot(); }
    const { names, limited } = await this.listCandidates();
    let pending = 0, installed = 0, rejected = 0, retrying = 0;
    for (const name of names) {
      const file = path.join(this.directory, name); let stat;
      try { stat = await fsp.lstat(file); } catch (error) { if (error.code !== 'ENOENT') retrying++; continue; }
      if (!stat.isFile() || stat.isSymbolicLink() || !FILE_NAME.test(name) || stat.size > MAX_ENVELOPE_BYTES) {
        await this.reject(file, name, stat.size > MAX_ENVELOPE_BYTES ? '文件超过 4 MiB 限制' : '文件类型或名称无效'); rejected++; continue;
      }
      const previous = this.observed.get(name), signature = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`;
      if (!previous || previous.signature !== signature) {
        this.observed.set(name, { signature, since: this.now() }); pending++; this.requestScan(this.stableAgeMs + 100, { manual }); continue;
      }
      if (this.now() - previous.since < this.stableAgeMs) { pending++; this.requestScan(this.stableAgeMs - (this.now() - previous.since) + 100, { manual }); continue; }
      const failure = this.failures.get(name);
      if (failure && failure.signature === signature && failure.nextAt > this.now()) { retrying++; continue; }
      let installedExact = false;
      try {
        const bytes = await this.readFile(file, MAX_ENVELOPE_BYTES);
        if (this.isBattleActive()) { pending++; this.emit({ phase: 'deferred', message: '章节已验证前暂停；战斗结束后继续安装。' }); continue; }
        installedExact = typeof this.store.matchesInstalled === 'function' && this.store.matchesInstalled(bytes);
        if (!installedExact) {
          this.installing = true; this.emit({ phase: 'installing', message: '正在安全写入新章节；完成前不会开始战斗。' });
          try {
            try { await this.store.install(bytes); }
            catch (error) {
              // Another installation path may have committed these exact signed
              // bytes while this request waited in the store's transaction queue.
              // Re-check only after that transaction; different/replayed content
              // must still fail the normal signature and version checks.
              if (typeof this.store.matchesInstalled !== 'function' || !this.store.matchesInstalled(bytes)) throw error;
            }
            installedExact = true; installed++;
          }
          finally { this.installing = false; }
          // Installation is already durable. Publish readiness before the
          // source-file archive, which is housekeeping and may need a retry.
          this.emit({ phase: 'updated', readyToReload: true, message: '签名章节已安全安装；返回行动地图后载入。' });
        }
        await this.archive(file, name, 'processed'); this.observed.delete(name); this.failures.delete(name);
      } catch (error) {
        if (error.code === 'ENOENT') { this.observed.delete(name); continue; }
        if (installedExact) {
          const attempts = failure?.signature === signature && failure.kind === 'archive' ? failure.attempts + 1 : 1;
          const delay = attempts < this.maxAttempts ? Math.min(60000, 1000 * (2 ** (attempts - 1))) : 60000;
          this.failures.set(name, { signature, kind: 'archive', attempts: Math.min(attempts, this.maxAttempts), nextAt: this.now() + delay, message: safeMessage(error) });
          retrying++; this.requestScan(delay + 100, { manual }); continue;
        }
        const growing = /读取时超过|resource busy|temporarily unavailable/i.test(safeMessage(error));
        if (growing) { this.observed.delete(name); pending++; this.requestScan(this.stableAgeMs + 100, { manual }); continue; }
        if (TRANSIENT_CODES.has(error.code)) {
          const attempts = failure?.signature === signature ? failure.attempts + 1 : 1;
          if (attempts < this.maxAttempts) {
            const delay = Math.min(60000, 1000 * (2 ** (attempts - 1)));
            this.failures.set(name, { signature, attempts, nextAt: this.now() + delay, message: safeMessage(error) });
            retrying++; this.requestScan(delay + 100, { manual }); continue;
          }
        }
        await this.reject(file, name, safeMessage(error)); this.observed.delete(name); this.failures.delete(name); rejected++;
      }
    }
    const phase = installed ? 'updated' : rejected ? 'rejected' : (pending || retrying || limited) ? 'pending' : 'current';
    let message = installed ? `已自动安装 ${installed} 个签名章节包；返回行动地图后载入新章节。` :
      rejected ? `${rejected} 个文件未通过验证，已移至 rejected。` :
      (pending || retrying) ? '正在等待文件写入完成或下一次安全重试。' : '本机章节收件箱已检查。';
    if (limited) message += ` 单次最多处理 ${this.maxFiles} 个文件，其余稍后处理。`;
    this.emit({ enabled: true, phase, pending, installed: this.status.installed + installed,
      rejected: this.status.rejected + rejected, retrying, readyToReload: this.status.readyToReload || installed > 0,
      lastScan: new Date(this.now()).toISOString(), message });
    if (limited) this.requestScan(1000, { manual });
    return this.snapshot();
  }
  async destination(folder, name) {
    const stem = name.replace(/\.dogpack$/, '').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 100) || 'pack';
    return path.join(this.directory, folder, `${new Date(this.now()).toISOString().replace(/[:.]/g, '-')}-${stem}-${crypto.randomBytes(3).toString('hex')}.dogpack`);
  }
  async archive(file, name, folder) {
    const destination = await this.destination(folder, name); await fsp.rename(file, destination); return destination;
  }
  async reject(file, name, reason) {
    try {
      const destination = await this.archive(file, name, 'rejected');
      await atomicWrite(destination + '.reason.json', JSON.stringify({ rejectedAt: new Date(this.now()).toISOString(), reason: String(reason).slice(0, 240) }));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  markReloaded() { if (this.status.readyToReload) this.emit({ readyToReload: false, message: '新章节已载入。' }); }
}

module.exports = { LocalContentInbox };
