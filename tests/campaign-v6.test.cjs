'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { validatePack } = require('../src/content.js');
const pack = require('../content/builtin.json');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Prose can grow without invalidating old saves. The stable contract is mission
// identity plus combat tuning, which downloadable packs and progress refer to.
test('expanded campaign retains the shipped mission IDs and combat contract', () => {
  const gameplayFields = ['id', 'act', 'duration', 'speed', 'bossHp', 'star2', 'star3', 'comboGoal', 'damageGoal', 'killGoal', 'difficulty', 'bossKind', 'mechanic'];
  const gameplay = level => Object.fromEntries(gameplayFields.map(field => [field, level[field]]));
  assert.equal(hash(pack.levels.slice(0, 24).map(gameplay)), '6d4989f385585aea4b5d1eb2e53178335e3b189a5e5df60a6d38522590af9706');
  assert.equal(hash(pack.levels.slice(24).map(gameplay)), '73d59733964d971e4bb1698e56941519a2df7118b2460f8c57f9bc1d7fc80078');
  assert.deepEqual(pack.acts.map(act => act.id), ['lockdown', 'echoes', 'tomorrow', 'sky-garden', 'aurora', 'star-harbor']);
});

test('v6 campaign validates as six consecutive eight-mission chapters', () => {
  const validated = validatePack(pack, { appVersion: '6.0.0' });
  assert.equal(validated.version, '6.0.0');
  assert.equal(validated.minAppVersion, '6.0.0');
  assert.equal(validated.acts.length, 6);
  assert.equal(validated.levels.length, 48);
  assert.deepEqual(validated.levels.map(l => l.id), Array.from({ length: 48 }, (_, i) => `daybreak-${String(i + 1).padStart(2, '0')}`));
  validated.acts.forEach((act, index) => {
    const chapter = validated.levels.filter(l => l.act === act.id);
    assert.equal(chapter.length, 8, act.id);
    assert.deepEqual(chapter.map(l => l.id), validated.levels.slice(index * 8, index * 8 + 8).map(l => l.id));
  });
  assert.throws(() => validatePack(pack, { appVersion: '5.0.0' }), /6\.0\.0/);
});

test('every mission has its own complete narrative and timed radio beats', () => {
  const levels = pack.levels;
  for (const field of ['name', 'en', 'subtitle', 'brief', 'objective', 'intro', 'radio', 'outro', 'debrief']) {
    assert.equal(new Set(levels.map(l => l[field])).size, 48, `unique ${field}`);
  }
  assert.equal(new Set(levels.map(l => l.archive.title)).size, 48);
  assert.equal(new Set(levels.map(l => l.archive.text)).size, 48);
  assert.equal(new Set(levels.flatMap(l => l.dialogue.map(d => d.text))).size, 240);
  assert.equal(new Set(levels.flatMap(l => l.transmissions.map(d => d.text))).size, 192);
  for (const l of levels) {
    assert.equal(l.dialogue.length, 5, `${l.id} dialogue`);
    assert.equal(l.transmissions.length, 4, `${l.id} transmissions`);
    assert.deepEqual(l.transmissions.map(d => d.at), [.22, .52, .78, .9]);
    assert.ok(l.brief.length >= 65, `${l.id} complete conflict`);
    assert.ok(l.debrief.length >= 90, `${l.id} character aftermath`);
    assert.ok(l.archive.text.length >= 85, `${l.id} archive`);
  }
});

test('new acts alternate challenge with recovery and have distinct chapter finales', () => {
  for (const id of ['sky-garden', 'aurora', 'star-harbor']) {
    const levels = pack.levels.filter(l => l.act === id);
    assert.equal(levels[0].difficulty, 5, `${id} entry recovery`);
    assert.equal(levels[4].difficulty, 5, `${id} midpoint recovery`);
    assert.ok(levels[4].bossHp < levels[3].bossHp, `${id} no linear HP treadmill`);
    assert.equal(levels[7].difficulty, 7);
    assert.ok(levels[7].tag === '章末' || levels[7].tag === '终章');
    assert.ok(new Set(levels.map(l => l.mechanic)).size >= 4, `${id} mechanic variety`);
    assert.ok(new Set(levels.map(l => l.bossKind)).size >= 4, `${id} enemy variety`);
  }
  assert.deepEqual([pack.levels[31].boss, pack.levels[39].boss, pack.levels[47].boss], ['春穹 · 折翼守园者', '织夜 · 极光鲸', '曙光 · 双子方舟']);
  assert.equal(pack.levels[47].tag, '终章');
});
