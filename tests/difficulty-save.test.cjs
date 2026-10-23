'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const P = require('../src/progress.js');
const G = require('../src/progression.js');
const { SaveBackupStore, parseProgress } = require('../desktop/save-backup.cjs');
const levels = [{ id: 'daybreak-01' }, { id: 'daybreak-02' }];
const zero = () => ({ stars: 0, best: 0, medals: 0 });
const raw = (mode = 'expert', records = {}) => ({ version: 4, difficultyMode: mode, records });
const envelope = data => JSON.stringify({ format: 'dog-squad-save', schema: 1, data });
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }; };
async function directory(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-difficulty-save-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; }

test('difficulty helpers prioritize valid explicit modes and strictly migrate legacy easy', () => {
  assert.deepEqual(P.MODES, { relaxed: 'assist', standard: 'normal', expert: 'expert' });
  assert.equal(Object.isFrozen(P.MODES), true);
  for (const [mode, recordKey] of Object.entries(P.MODES)) for (const easy of [true, false]) {
    assert.equal(P.normalizeDifficultyMode(mode, easy), mode);
    assert.equal(P.difficultyRecordKey(mode, easy), recordKey);
  }
  for (const value of [undefined, null, '', 'assist', 'normal', 'EXPERT', '__proto__', 'constructor', {}, 1]) {
    assert.equal(P.normalizeDifficultyMode(value, true), 'relaxed');
    assert.equal(P.normalizeDifficultyMode(value, false), 'standard');
    assert.equal(P.difficultyRecordKey(value, true), 'assist');
  }
  assert.equal(P.normalizeDifficultyMode(undefined, 'true'), 'standard');
});

test('schema 4 and version 2 legacy records remain separate while expert defaults to zero', () => {
  const original = { version: 2, easy: true, stars: [2], best: [300], medals: [1], easyStars: [3], easyBest: [900], easyMedals: [2] };
  const migrated = P.normalize(original, levels);
  assert.equal(migrated.version, 4); assert.equal(migrated.difficultyMode, 'relaxed'); assert.equal(migrated.easy, true);
  assert.deepEqual(migrated.records['daybreak-01'], { normal: { stars: 2, best: 300, medals: 1 }, assist: { stars: 3, best: 900, medals: 2 }, expert: zero() });
  assert.deepEqual(migrated.expertStars, [0, 0]);
  const explicit = P.normalize({ ...raw('expert'), easy: true }, levels);
  assert.equal(explicit.difficultyMode, 'expert'); assert.equal(explicit.easy, false);
  assert.equal(P.normalize({ version: 4, easy: true, records: {} }, levels).difficultyMode, 'relaxed');
  assert.equal(P.normalize(null, levels).difficultyMode, 'standard');
});

test('expert normalization clamps malformed values independently from the other modes', () => {
  const save = P.normalize(raw('expert', { 'daybreak-01': { normal: { stars: 2, best: 50, medals: 1 }, assist: { stars: 1, best: 80, medals: 2 }, expert: { stars: 8, best: Infinity, medals: -1 } } }), levels);
  assert.deepEqual(save.records['daybreak-01'].expert, { stars: 3, best: 0, medals: 0 });
  assert.deepEqual(save.records['daybreak-01'].normal, { stars: 2, best: 50, medals: 1 });
  assert.deepEqual(save.expertStars, [3, 0]); assert.deepEqual(save.easyBest, [80, 0]);
});

test('expert capture persists by stable ID, drops projection arrays, and survives removed packs', () => {
  const save = P.normalize(raw(), levels);
  save.expertStars[1] = 3; save.expertBest[1] = 45000; save.expertMedals[1] = 2;
  const captured = P.capture(save, levels);
  for (const key of ['stars', 'best', 'medals', 'easyStars', 'easyBest', 'easyMedals', 'expertStars', 'expertBest', 'expertMedals']) assert.equal(key in captured, false, key);
  assert.deepEqual(captured.records['daybreak-02'].expert, { stars: 3, best: 45000, medals: 2 });
  const reordered = P.normalize(JSON.parse(JSON.stringify(captured)), [...levels].reverse());
  assert.equal(reordered.expertBest[0], 45000); assert.equal(reordered.best[0], 0);
  const removed = P.normalize(P.capture(reordered, [...levels].reverse()), levels.slice(0, 1));
  const restored = P.normalize(P.capture(removed, levels.slice(0, 1)), levels);
  assert.equal(restored.expertStars[1], 3); assert.equal(restored.expertMedals[1], 2);
});

test('capture adds missing expert records in legacy in-memory saves and synchronizes easy', () => {
  const save = P.normalize(raw('standard', { 'daybreak-01': { normal: { stars: 1, best: 600, medals: 1 } } }), levels);
  delete save.records['daybreak-01'].expert;
  save.difficultyMode = 'relaxed'; save.easy = false;
  const data = P.capture(save, levels);
  assert.deepEqual(data.records['daybreak-01'].expert, zero()); assert.equal(data.easy, true);
  assert.equal(save.easy, true); assert.equal(data.records['daybreak-01'].normal.best, 600);
});

test('import merges all three modes by field without copying scores across difficulties', () => {
  const current = P.normalize(raw('standard', { 'daybreak-01': { normal: { stars: 3, best: 800, medals: 2 }, expert: { stars: 1, best: 1000, medals: 1 } } }), levels);
  const incoming = raw('expert', { 'daybreak-01': { assist: { stars: 2, best: 700, medals: 1 }, expert: { stars: 3, best: 500, medals: 3 } } });
  const merged = P.importSave(envelope(incoming), current, levels);
  assert.deepEqual(merged.records['daybreak-01'], { normal: { stars: 3, best: 800, medals: 2 }, assist: { stars: 2, best: 700, medals: 1 }, expert: { stars: 3, best: 1000, medals: 3 } });
  assert.equal(merged.difficultyMode, 'expert'); assert.equal(merged.easy, false);
  const again = P.importSave(JSON.stringify(P.exportSave(merged, levels)), P.normalize(null, levels), levels);
  assert.deepEqual(again.records['daybreak-01'], merged.records['daybreak-01']); assert.equal(again.expertBest[0], 1000);
});

test('local save and corrupt-primary recovery preserve expert scores and selected difficulty', () => {
  const db = storage(), save = P.normalize(raw(), levels);
  save.expertStars[0] = 2; save.expertBest[0] = 4000; save.expertMedals[0] = 1;
  P.writeLocal(db, save, levels);
  assert.equal(P.readLocal(db, levels).save.expertBest[0], 4000);
  save.sound = false; P.writeLocal(db, save, levels); db.setItem('dog-squad-v4', '{broken');
  const recovered = P.readLocal(db, levels);
  assert.equal(recovered.recovered, true); assert.equal(recovered.save.difficultyMode, 'expert');
  assert.equal(recovered.save.easy, false); assert.equal(recovered.save.expertStars[0], 2); assert.equal(recovered.save.best[0], 0);
});

test('expert-only completions unlock training and all modes reward each mission only once', () => {
  const records = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`daybreak-${String(i + 1).padStart(2, '0')}`, { normal: zero(), assist: zero(), expert: { stars: 1, best: 2000, medals: 3 } }]));
  assert.deepEqual(G.earned(records), { completed: 6, medals: 18, points: 5 });
  assert.equal(G.getProfile(records, 0, { nodes: [], tactical: 'rescue' }).build.tactical, 'rescue');
  for (const record of Object.values(records)) { record.normal = { stars: 3, best: 9000, medals: 2 }; record.assist = { stars: 3, best: 12000, medals: 3 }; }
  assert.deepEqual(G.earned(records), { completed: 6, medals: 18, points: 5 });
  assert.deepEqual(G.earned({ 'daybreak-01': { normal: { stars: 1, medals: 1 }, expert: { stars: 0, medals: 3 } } }), { completed: 1, medals: 1, points: 2 });
});

test('native parse and serialized saves retain expert scores despite a later stale request', async t => {
  let now = Date.parse('2026-10-23T12:00:00.000Z');
  const dir = await directory(t), store = new SaveBackupStore({ directory: dir, now: () => now++ });
  const newer = raw('expert', { 'daybreak-01': { expert: { stars: 3, best: 18000, medals: 3 } } });
  assert.equal(parseProgress(JSON.stringify(newer)).records['daybreak-01'].expert.best, 18000);
  const stale = raw('relaxed', { 'daybreak-01': { expert: { stars: 1, best: 200, medals: 0 }, assist: { stars: 1, best: 600, medals: 1 } } });
  await Promise.all([store.save(JSON.stringify(newer)), store.save(JSON.stringify(stale))]);
  const loaded = JSON.parse((await new SaveBackupStore({ directory: dir }).load()).json);
  assert.deepEqual(loaded.records['daybreak-01'].expert, { stars: 3, best: 18000, medals: 3 });
  assert.equal(loaded.records['daybreak-01'].assist.best, 600); assert.equal(loaded.records['daybreak-01'].normal.best, 0);
  assert.equal(loaded.difficultyMode, 'relaxed'); assert.equal(loaded.easy, true);
  await fs.writeFile(path.join(dir, 'current.json'), '{broken');
  const recovered = JSON.parse((await store.load()).json);
  assert.equal(recovered.records['daybreak-01'].expert.best, 18000); assert.equal(recovered.difficultyMode, 'relaxed');
});

test('same-time native backups merge expert records, keep current mode, and durably heal', async t => {
  const dir = await directory(t), savedAt = '2026-10-23T12:00:00.000Z';
  const store = new SaveBackupStore({ directory: dir, now: () => Date.parse(savedAt) + 1000 }); await store.prepare();
  const primary = raw('standard', { 'daybreak-01': { expert: { stars: 1, best: 200, medals: 1 } } });
  const secondary = raw('relaxed', { 'daybreak-01': { expert: { stars: 3, best: 1500, medals: 3 } } });
  for (const [name, data] of [['current.json', primary], ['previous.json', secondary]]) await fs.writeFile(path.join(dir, name), JSON.stringify({ format: 'dog-squad-native-backup', schema: 1, savedAt, data }));
  const loaded = await store.load(), data = JSON.parse(loaded.json);
  assert.equal(loaded.source, 'current'); assert.equal(data.difficultyMode, 'standard'); assert.equal(data.easy, false);
  assert.equal(data.records['daybreak-01'].expert.best, 1500); assert.equal((await store.save(loaded.json)).saved, true);
  const disk = JSON.parse(await fs.readFile(path.join(dir, 'current.json'), 'utf8')).data;
  assert.equal(disk.difficultyMode, 'standard'); assert.equal(disk.records['daybreak-01'].expert.stars, 3);
  assert.equal(JSON.parse((await new SaveBackupStore({ directory: dir }).load()).json).records['daybreak-01'].expert.best, 1500);
});

test('native merged expert achievements preserve legal captain builds and explicit resets', async t => {
  const dir = await directory(t); let now = Date.parse('2026-10-23T12:00:00.000Z');
  const store = new SaveBackupStore({ directory: dir, now: () => now });
  const records = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`daybreak-${String(i + 1).padStart(2, '0')}`, { expert: { stars: 1, best: 1000, medals: 3 } }]));
  await store.save(JSON.stringify(raw('expert', records))); now += 1000;
  const incoming = { ...raw('expert'), captainBuilds: { ramen: { nodes: ['ramen-precision-1', 'ramen-precision-2', 'ramen-precision-3', 'ramen-reflex-1', 'ramen-reflex-2'], tactical: 'rescue' } } };
  await store.save(JSON.stringify(incoming)); let loaded = JSON.parse((await store.load()).json);
  assert.equal(loaded.captainBuilds.ramen.nodes.length, 5); assert.equal(loaded.captainBuilds.ramen.tactical, 'rescue');
  now += 1000; incoming.captainBuilds.ramen = G.resetBuild(); await store.save(JSON.stringify(incoming));
  loaded = JSON.parse((await store.load()).json); assert.deepEqual(loaded.captainBuilds.ramen, G.resetBuild()); assert.equal(G.earned(loaded.records).completed, 6);
});
