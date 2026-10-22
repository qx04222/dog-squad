(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./progression.js') : root.DogProgression);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DogProgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Growth) {
  'use strict';
  const VALID_ID = /^[a-z][a-z0-9-]{1,63}$/;
  const bounded = (v, max) => Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0;
  const storyFlags = value => Array.isArray(value) ? [...new Set(value.filter(key => typeof key === 'string' && /^[a-z][a-z0-9:-]{0,79}$/.test(key)))].slice(-128) : [];
  const cleanRecord = r => ({ stars: bounded(r?.stars, 3), best: bounded(r?.best, 9999999), medals: bounded(r?.medals, 3) });
  function normalize(raw, levels) {
    const p = raw && typeof raw === 'object' ? raw : {};
    const records = Object.create(null);
    if (p.version === 4 && p.records && typeof p.records === 'object' && !Array.isArray(p.records)) {
      for (const [key, value] of Object.entries(p.records)) if (VALID_ID.test(key)) records[key] = { normal: cleanRecord(value?.normal), assist: cleanRecord(value?.assist) };
    } else if (p.version === 2) {
      // v3 game used save format 2, exactly eight known story operations.
      for (let i = 0; i < 8; i++) records['daybreak-' + String(i + 1).padStart(2, '0')] = {
        normal: cleanRecord({ stars: p.stars?.[i], best: p.best?.[i], medals: p.medals?.[i] }),
        assist: cleanRecord({ stars: p.easyStars?.[i], best: p.easyBest?.[i], medals: p.easyMedals?.[i] })
      };
    }
    const volume = v => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : .7;
    const selected = typeof p.lastLevelId === 'string' && VALID_ID.test(p.lastLevelId) ? p.lastLevelId : levels[0]?.id;
    const save = { version: 4, records, storySeen: storyFlags(p.storySeen), captainBuilds: Growth.normalizeBuilds(p.captainBuilds, records), lastLevelId: selected, hero: bounded(p.hero, 1), loadout: bounded(p.loadout, Growth.LOADOUT_COUNT - 1), easy: p.easy === true, sound: p.sound !== false, musicVolume: volume(p.musicVolume), effectsVolume: volume(p.effectsVolume), reducedMotion: p.reducedMotion === true, combatText: p.combatText !== false, effectsQuality: p.effectsQuality === 'high' ? 'high' : 'balanced' };
    return project(save, levels);
  }
  function project(save, levels) {
    for (const [mode, prefix] of [['normal', ''], ['assist', 'easy']]) for (const [field, suffix] of [['stars', 'Stars'], ['best', 'Best'], ['medals', 'Medals']]) {
      const key = prefix ? prefix + suffix : field;
      save[key] = levels.map(l => cleanRecord(save.records[l.id]?.[mode])[field]);
    }
    return save;
  }
  function capture(save, levels) {
    save.storySeen = storyFlags(save.storySeen);
    for (let i = 0; i < levels.length; i++) {
      const id = levels[i].id, old = save.records[id] || { normal: cleanRecord(), assist: cleanRecord() };
      for (const [mode, prefix] of [['normal', ''], ['assist', 'easy']]) for (const [field, suffix] of [['stars', 'Stars'], ['best', 'Best'], ['medals', 'Medals']]) {
        const key = prefix ? prefix + suffix : field;
        old[mode][field] = Math.max(old[mode][field], bounded(save[key]?.[i], field === 'best' ? 9999999 : 3));
      }
      save.records[id] = old;
    }
    save.captainBuilds = Growth.normalizeBuilds(save.captainBuilds, save.records);
    const { stars, best, medals, easyStars, easyBest, easyMedals, ...data } = save;
    return data;
  }
  function exportSave(save, levels) { return { format: 'dog-squad-save', schema: 1, exportedAt: new Date().toISOString(), data: capture(save, levels) }; }
  function importSave(text, current, levels) {
    if (typeof text !== 'string' || text.length > 1024 * 1024) throw new Error('存档超过 1 MB 限制');
    let envelope; try { envelope = JSON.parse(text); } catch { throw new Error('无法读取存档，请选择游戏导出的 JSON 文件'); }
    if (envelope?.format !== 'dog-squad-save' || envelope.schema !== 1 || ![2, 4].includes(envelope.data?.version)) throw new Error('这不是受支持的狗狗突击队存档');
    if (envelope.data.version === 4 && (!envelope.data.records || typeof envelope.data.records !== 'object' || Array.isArray(envelope.data.records))) throw new Error('存档缺少行动记录');
    const incoming = normalize(envelope.data, levels), merged = normalize(capture(current, levels), levels);
    for (const [id, value] of Object.entries(incoming.records)) {
      const old = merged.records[id] || { normal: cleanRecord(), assist: cleanRecord() };
      for (const mode of ['normal', 'assist']) for (const field of ['stars', 'best', 'medals']) old[mode][field] = Math.max(old[mode][field], value[mode][field]);
      merged.records[id] = old;
    }
    merged.storySeen = storyFlags([...merged.storySeen, ...incoming.storySeen]);
    // Preferences follow the imported save, scores are never reduced by import.
    for (const key of ['hero', 'loadout', 'sound', 'easy', 'musicVolume', 'effectsVolume', 'reducedMotion', 'combatText', 'effectsQuality', 'lastLevelId']) merged[key] = incoming[key];
    // Build choices follow the incoming save, but their budget must use the merged
    // achievements. Normalizing incoming builds first would discard valid choices.
    merged.captainBuilds = Growth.normalizeBuilds(envelope.data.captainBuilds, merged.records);
    return project(merged, levels);
  }
  const SAVE_KEY = 'dog-squad-v4', BACKUP_KEY = SAVE_KEY + '-previous';
  function validStored(raw) { return raw && (raw.version === 2 || (raw.version === 4 && raw.records && typeof raw.records === 'object' && !Array.isArray(raw.records))); }
  function readLocal(storage, levels) {
    let failed = false;
    for (const key of [SAVE_KEY, BACKUP_KEY, 'dog-squad-v3']) {
      try {
        const text = storage.getItem(key); if (!text) continue;
        const raw = JSON.parse(text); if (!validStored(raw)) { failed = true; continue; }
        return { save: normalize(raw, levels), recovered: key === BACKUP_KEY, source: key, storageWorks: true };
      } catch { failed = true; }
    }
    return { save: normalize(null, levels), recovered: false, source: null, storageWorks: !failed };
  }
  function writeLocal(storage, save, levels) {
    const json = JSON.stringify(capture(save, levels));
    let previous = null;
    try { const old = storage.getItem(SAVE_KEY); if (old && validStored(JSON.parse(old))) previous = old; } catch { /* Keep an existing valid backup when the primary is damaged. */ }
    try { if (previous) storage.setItem(BACKUP_KEY, previous); else if (!storage.getItem(BACKUP_KEY)) storage.setItem(BACKUP_KEY, json); } catch { /* Primary persistence still gets a chance when backup quota is full. */ }
    storage.setItem(SAVE_KEY, json);
    return json;
  }
  return { normalize, project, capture, exportSave, importSave, readLocal, writeLocal };
});
