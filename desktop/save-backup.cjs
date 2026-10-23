'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { atomicWrite } = require('./content-store.cjs');
const { readBoundedFile } = require('./bounded-file.cjs');
const DogProgress = require('../src/progress.js');
const Growth = require('../src/progression.js');

const MAX_SAVE_BYTES = 1024 * 1024;
const MAX_BACKUP_FILE_BYTES = MAX_SAVE_BYTES + 16 * 1024;
const DAILY_KEEP = 7;
function isPlainObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function parseSaveData(json) {
  if (typeof json !== 'string' || Buffer.byteLength(json) > MAX_SAVE_BYTES) throw new Error('存档超过 1 MB 限制');
  let parsed; try { parsed = JSON.parse(json); } catch { throw new Error('存档 JSON 无效'); }
  const data = parsed?.format === 'dog-squad-save' && parsed.schema === 1 ? parsed.data : parsed;
  if (!isPlainObject(data) || data.version !== 4 || !isPlainObject(data.records)) throw new Error('只支持第 4 版狗狗突击队存档');
  return data;
}
function parseProgress(json) { return DogProgress.capture(DogProgress.normalize(parseSaveData(json), []), []); }
function envelope(data, now) { return { format: 'dog-squad-native-backup', schema: 1, savedAt: new Date(now).toISOString(), data }; }
function validateEnvelope(raw) {
  const parsed = JSON.parse(raw);
  if (parsed?.format !== 'dog-squad-native-backup' || parsed.schema !== 1 || typeof parsed.savedAt !== 'string' ||
    !Number.isFinite(Date.parse(parsed.savedAt)) || new Date(parsed.savedAt).toISOString() !== parsed.savedAt) throw new Error('本机备份格式无效');
  const storedData = JSON.stringify(parsed.data), data = parseProgress(storedData);
  return { savedAt: parsed.savedAt, data, requestedBuilds: parsed.data.captainBuilds, needsHealing: storedData !== JSON.stringify(data) };
}
const PREFERENCES = ['hero', 'loadout', 'difficultyMode', 'easy', 'sound', 'musicVolume', 'effectsVolume', 'reducedMotion', 'combatText', 'effectsQuality', 'lastLevelId', 'captainBuilds'];
function mergeScoresKeepPreferences(primary, secondary) {
  const preferences = Object.fromEntries(PREFERENCES.map(key => [key, primary[key]]));
  const merged = DogProgress.importSave(JSON.stringify({ format: 'dog-squad-save', schema: 1, data: secondary }), primary, []);
  Object.assign(merged, preferences); return DogProgress.capture(merged, []);
}

class SaveBackupStore {
  constructor({ directory, now = () => Date.now(), keepDaily = DAILY_KEEP } = {}) {
    if (!path.isAbsolute(directory)) throw new Error('本机存档目录无效');
    this.directory = directory; this.now = now; this.keepDaily = keepDaily; this.queue = Promise.resolve(); this.lastHash = '';
  }
  file(name) { return path.join(this.directory, name); }
  serialized(fn) { const next = this.queue.then(fn, fn); this.queue = next.catch(() => {}); return next; }
  async prepare() { await fs.mkdir(this.file('daily'), { recursive: true, mode: 0o700 }); }
  save(json) {
    const requested = parseSaveData(json), incoming = DogProgress.capture(DogProgress.normalize(requested, []), []);
    return this.serialized(async () => {
      await this.prepare();
      const existing = await this.readLatest();
      const data = existing ? DogProgress.capture(DogProgress.importSave(JSON.stringify({ format: 'dog-squad-save', schema: 1, data: incoming }), existing.data, []), []) : incoming;
      // Incoming choices may rely on historical achievements recovered from disk.
      // Validate once the union of best records is known, preserving explicit resets.
      data.captainBuilds = Growth.normalizeBuilds(requested.captainBuilds, data.records);
      const canonical = JSON.stringify(data), hash = crypto.createHash('sha256').update(canonical).digest('hex');
      // A loaded hash may describe a merge that only exists in memory. Skip a write
      // only when the actual current file already contains the same canonical data.
      if (hash === this.lastHash && existing?.source === 'current' && !existing.needsHealing && canonical === JSON.stringify(existing.data)) return { saved: false, deduplicated: true };
      const current = this.file('current.json'), previous = this.file('previous.json');
      if (existing) await atomicWrite(previous, existing.raw);
      const now = this.now(), wrapped = JSON.stringify(envelope(data, now));
      await atomicWrite(current, wrapped);
      const day = new Date(now).toISOString().slice(0, 10), daily = this.file(path.join('daily', `${day}.json`));
      await atomicWrite(daily, wrapped);
      await this.pruneDaily(); this.lastHash = hash;
      return { saved: true, savedAt: new Date(now).toISOString() };
    });
  }
  async pruneDaily() {
    const directory = this.file('daily');
    const files = (await fs.readdir(directory)).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().reverse();
    await Promise.all(files.slice(this.keepDaily).map(name => fs.rm(path.join(directory, name), { force: true })));
  }
  async load() {
    return this.serialized(async () => {
      await this.prepare(); const parsed = await this.readLatest();
      if (parsed) {
        this.lastHash = crypto.createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex');
        return { found: true, json: JSON.stringify(parsed.data), source: parsed.source, savedAt: parsed.savedAt };
      }
      return { found: false, json: null, source: null, savedAt: null };
    });
  }
  async readLatest() {
    const daily = (await fs.readdir(this.file('daily'))).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().reverse().slice(0, this.keepDaily);
    const candidates = [['current', this.file('current.json')], ['previous', this.file('previous.json')], ...daily.map(name => [`daily:${name.slice(0, 10)}`, this.file(path.join('daily', name))])];
    const valid = [];
    for (const [source, file] of candidates) try {
      const raw = (await readBoundedFile(file, MAX_BACKUP_FILE_BYTES)).toString('utf8'), parsed = validateEnvelope(raw);
      valid.push({ ...parsed, source, raw, time: Date.parse(parsed.savedAt) });
    } catch {}
    if (!valid.length) return null;
    const freshest = Math.max(...valid.map(item => item.time));
    const priority = source => source === 'current' ? 0 : source === 'previous' ? 1 : 2;
    const group = valid.filter(item => item.time === freshest).sort((a, b) => priority(a.source) - priority(b.source));
    const primary = group[0], primaryCanonical = JSON.stringify(primary.data); let data = primary.data;
    for (const item of group.slice(1)) data = mergeScoresKeepPreferences(data, item.data);
    data.captainBuilds = Growth.normalizeBuilds(primary.requestedBuilds, data.records);
    const needsHealing = primary.source !== 'current' || primary.needsHealing || primaryCanonical !== JSON.stringify(data);
    const raw = JSON.stringify(envelope(data, freshest));
    return { savedAt: primary.savedAt, data, source: primary.source, raw, needsHealing };
  }
}

module.exports = { MAX_SAVE_BYTES, MAX_BACKUP_FILE_BYTES, parseProgress, SaveBackupStore };
