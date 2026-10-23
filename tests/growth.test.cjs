const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const G = require('../src/progression.js');
const P = require('../src/progress.js');
const M = require('../src/core.js');
const { SaveBackupStore, parseProgress } = require('../desktop/save-backup.cjs');

const records = (count, medals = 0, start = 1) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`daybreak-${String(i + start).padStart(2, '0')}`, { normal: { stars: 3, best: 5000, medals }, assist: { stars: 3, best: 6000, medals } }]));
const allNodes = hero => G.getProfile(records(24, 3), hero).routes.flatMap(route => route.nodes.map(node => node.id));
const save = (count = 0) => P.normalize({ version: 4, records: records(count) }, []);
const makeEnemy = (id, x = 170, y = 600) => ({ id, type: 'enemy', kind: 'normal', x, baseX: x, y, hp: 1000, maxHp: 1000, r: 12, guardHp: 0, wobble: 0, hit: 0, shot: 99 });
const hit = (game, damage = 100) => { game.state.entities.push(makeEnemy(900)); game.state.bullets.push({ x: 170, y: 630, vx: 0, vy: -800, damage, r: 4, friendly: true, pierce: 0, kind: 'pulse' }); game.step(.04); return 1000 - game.state.entities.find(e => e.id === 900).hp; };
const buildFor = (hero, tactical) => ({ nodes: [`${G.heroKey(hero)}-${tactical === 'arc' || tactical === 'barrage' ? 'reflex' : 'guard'}-1`], tactical });

test('both captain profiles expose three ordered routes with nine unique nodes and three modules', () => {
  const ids = [];
  for (const hero of G.HERO_KEYS) {
    const profile = G.getProfile({}, hero);
    assert.equal(profile.points, 2); assert.equal(profile.available, 2); assert.equal(profile.routes.length, 3); assert.equal(profile.tacticals.length, 3);
    for (const route of profile.routes) { assert.equal(route.nodes.length, 3); assert.equal(route.nodes[0].parent, null); assert.equal(route.nodes[1].parent, route.nodes[0].id); ids.push(...route.nodes.map(n => n.id)); }
  }
  assert.equal(ids.length, 18); assert.equal(new Set(ids).size, 18);
});
test('training points derive from stable unique clears and best medals, never duplicate modes or replay', () => {
  const source = records(4, 3), before = JSON.stringify(source), a = G.earned(source);
  assert.deepEqual(a, { completed: 4, medals: 12, points: 4 });
  assert.deepEqual(G.earned(JSON.parse(before)), a);
  source['daybreak-01'].assist.medals = 1; assert.deepEqual(G.earned(source), a);
  source['daybreak-99'] = { normal: { stars: 0, medals: 3 }, assist: { stars: 0, medals: 3 } };
  assert.deepEqual(G.earned(source), a);
  assert.equal(G.earned(records(240, 3)).points, 9);
});
test('malformed achievements cannot create non-finite budgets or prototype contamination', () => {
  const raw = JSON.parse('{"__proto__":{"normal":{"stars":3}},"constructor":{"normal":{"stars":3}},"bad id":{"normal":{"stars":3}},"valid-id":{"normal":{"stars":"3","medals":3}},"nan-id":{"normal":{"stars":null,"medals":3}}}');
  assert.deepEqual(G.earned(raw), { completed: 0, medals: 0, points: 2 }); assert.equal({}.stars, undefined);
});
test('normalization canonicalizes parent order, removes unknowns and bounds independent hero spending', () => {
  const reverse = allNodes(0).reverse(), normalized = G.normalizeBuild({ nodes: ['unknown', ...reverse, ...reverse], tactical: 'wrong', damage: 999 }, 0, {});
  assert.deepEqual(normalized, { nodes: ['ramen-precision-1', 'ramen-precision-2'], tactical: 'default' });
  assert.deepEqual(G.normalizeBuild({ nodes: ['ramen-precision-3'] }, 0, {}), G.resetBuild());
  const both = G.normalizeBuilds({ ramen: { nodes: allNodes(0) }, bing: { nodes: allNodes(1) } }, records(24, 3));
  assert.equal(both.ramen.nodes.length, 9); assert.equal(both.bing.nodes.length, 9);
  assert.equal(G.normalizeBuild(both.ramen, 1, records(24, 3)).nodes.length, 0);
});
test('explicit node choices reject unavailable nodes, support cascading refunds and free reset', () => {
  let build = G.setNode({}, 0, null, 'ramen-guard-1');
  build = G.setNode({}, 0, build, 'ramen-guard-2');
  assert.deepEqual(G.setNode({}, 0, build, 'ramen-precision-1'), build, 'full budget cannot silently replace existing choices');
  assert.deepEqual(G.setNode({}, 0, build, 'ramen-guard-1', false), G.resetBuild());
  assert.deepEqual(G.setNode({}, 0, null, 'ramen-guard-3'), G.resetBuild());
});
test('modules unlock by captain training OR completed missions and relock safely after reset', () => {
  for (const hero of [0, 1]) {
    const [base, second, third] = G.getProfile({}, hero).tacticals;
    assert.equal(base.unlocked, true); assert.equal(second.unlocked, false); assert.equal(third.unlocked, false);
    assert.equal(G.selectTactical({}, hero, null, second.id).tactical, 'default');
    assert.equal(G.normalizeBuild(buildFor(hero, second.id), hero, {}).tactical, second.id);
    assert.equal(G.normalizeBuild({ tactical: second.id }, hero, records(2)).tactical, second.id);
    assert.equal(G.normalizeBuild({ tactical: third.id }, hero, records(6)).tactical, third.id);
    const built = G.normalizeBuild(buildFor(hero, third.id), hero, {});
    assert.equal(G.setNode({}, hero, built, built.nodes[0], false).tactical, 'default');
  }
});
test('all training remains within the 20 percent additive passive budget and arbitrary multipliers are ignored', () => {
  for (const hero of [0, 1]) {
    const profile = G.getProfile(records(24, 3), hero, { nodes: allNodes(hero), damage: 100, hurt: 0, cooldown: 0 });
    assert.deepEqual(profile.effects, { damage: 1.06, hurt: .94, cooldown: .955 });
    assert.ok(profile.effects.damage - 1 + 1 - profile.effects.hurt + 1 - profile.effects.cooldown < .2);
    const plain = M.createGame({ hero }), unsafe = M.createGame({ hero, captainBuild: { nodes: [], damage: 9999, hurt: 0 } });
    assert.equal(hit(plain), hit(unsafe));
  }
});
test('training affects real damage, incoming damage and skill cooldown without changing untrained defaults', () => {
  const options = { records: records(24, 3), captainBuild: { nodes: allNodes(0) } };
  assert.equal(hit(M.createGame(options)), 106); assert.equal(hit(M.createGame()), 100);
  for (const [game, expected] of [[M.createGame(), 50], [M.createGame(options), 47]]) {
    game.state.team = 200; game.state.bullets.push({ x: 170, y: M.PLAYER_Y - 22, vx: 0, vy: 300, damage: 50, r: 10, friendly: false });
    game.step(.04); assert.equal(game.state.damageTaken, expected); game.skill(); assert.equal(game.state.cooldown, 9 * (expected === 47 ? .955 : 1));
  }
});
test('precision training also applies to destructible supply crates as promised by direct damage wording', () => {
  for (const [game, expected] of [[M.createGame(), 100], [M.createGame({ records: records(24, 3), captainBuild: { nodes: allNodes(0) } }), 106]]) {
    game.state.entities = [{ id: 950, type: 'crate', x: 170, y: 600, hp: 1000, maxHp: 1000, r: 24, hit: 0 }];
    game.state.bullets = [{ x: 170, y: 630, vx: 0, vy: -800, damage: 100, r: 4, friendly: true }];
    game.step(.04); assert.equal(1000 - game.state.entities[0].hp, expected);
  }
});
test('loadout catalog grows to eight with preserved original indexes and safe selection bounds', () => {
  assert.equal(M.LOADOUTS.length, 8); assert.equal(G.LOADOUT_COUNT, M.LOADOUTS.length);
  assert.deepEqual(M.LOADOUTS.slice(0, 3).map(l => l.name), ['侦察回路', '强袭芯片', '防卫装甲']);
  assert.equal(M.createGame({ loadout: 999 }).state.loadout, 7); assert.equal(M.createGame({ loadout: NaN }).state.loadout, 0);
  assert.equal(P.normalize({ loadout: 7 }, []).loadout, 7); assert.equal(P.normalize({ loadout: Infinity }, []).loadout, 0);
});
test('new equipment changes actual projectile, dash, energy, splash and tactical behavior', () => {
  const piercing = M.createGame({ loadout: 3 }); piercing.step(.05); piercing.step(.05);
  assert.ok(piercing.state.bullets.some(b => b.friendly));
  assert.ok(piercing.state.bullets.filter(b => b.friendly).every(b => b.pierce === 1 && b.kind === 'pierce'));
  const fast = M.createGame({ loadout: 4 }); fast.dash(1); assert.equal(fast.state.dashRecharge, 4.5);
  const cell = M.createGame({ loadout: 5 }); assert.equal(cell.state.energy, 40); cell.step(.05); assert.equal(cell.state.energy, 40.225);
  const shell = M.createGame({ loadout: 6 }); shell.step(.05); shell.step(.05); const ammo = shell.state.bullets.find(b => b.friendly); assert.equal(ammo.splash, .18); assert.equal(ammo.kind, 'burst');
  shell.state.bullets = [{ ...ammo, x: 170, y: 630 }]; shell.state.entities = [makeEnemy(901), makeEnemy(902, 205)]; shell.step(.04);
  assert.ok(shell.state.entities.find(e => e.id === 902).hp < 1000); assert.ok(shell.state.skillEffects.some(e => e.kind === 'shellSplash'));
  const tactical = M.createGame({ loadout: 7 }); tactical.tactical(); assert.ok(Math.abs(tactical.state.tacticalCooldown - 11.2) < 1e-9);
});
test('Ramen arc damages six targets and clears only nearby hostile projectiles', () => {
  const game = M.createGame({ captainBuild: buildFor(0, 'arc') });
  game.state.entities = Array.from({ length: 8 }, (_, i) => makeEnemy(i, 140 + i * 35, 500 - i * 30));
  game.state.bullets = [{ x: 170, y: 620, friendly: false }, { x: 480, y: 100, friendly: false }, { x: 170, y: 620, friendly: true }];
  assert.equal(game.tactical(), true); assert.equal(game.state.entities.filter(e => e.hp < 1000).length, 6); assert.equal(game.state.bullets.length, 2);
  assert.equal(game.state.tacticalKind, 'chainArc'); assert.equal(game.state.tacticalCooldown, 13 * .985);
  const snapshot = game.snapshot(); assert.equal(snapshot.captainBuild.tactical, 'arc'); assert.equal(snapshot.tacticalName, '链闪脉冲');
  game.state.bullets = []; const enemy = game.state.entities[0], oldY = enemy.y; game.step(.05); assert.ok(enemy.y - oldY > 2, 'alternate module does not accidentally inherit time-field slow');
});
test('Ramen rescue adds capped team and shield without secretly enabling time-field vulnerability', () => {
  const game = M.createGame({ captainBuild: buildFor(0, 'rescue') }); game.state.team = M.MAX_TEAM - 5; assert.equal(game.tactical(), true);
  assert.equal(game.state.team, M.MAX_TEAM); assert.equal(game.state.shield, 30); assert.equal(game.state.shieldTime, 4);
  assert.equal(hit(game), 100); assert.equal(game.state.tacticalKind, 'rescueBeacon');
});
test('Bing barrage and bulwark implement distinct sustained and defensive choices', () => {
  const barrage = M.createGame({ hero: 1, captainBuild: buildFor(1, 'barrage') }); barrage.tactical();
  assert.equal(barrage.state.buffs.rapid, 6); assert.equal(barrage.state.focus, 3); assert.equal(barrage.state.bullets.length, 0);
  const shield = M.createGame({ hero: 1, captainBuild: buildFor(1, 'bulwark') }); shield.state.entities = [makeEnemy(1), makeEnemy(2, 170, 100)]; shield.tactical();
  assert.equal(shield.state.shield, 50); assert.equal(shield.state.shieldTime, 5); assert.ok(shield.state.entities[0].hp < 1000); assert.equal(shield.state.entities[1].hp, 1000);
});
test('every module rejects paused and finished phases and repeated cooldown activation', () => {
  for (const hero of [0, 1]) for (const module of G.getProfile(records(24, 3), hero).tacticals) {
    const game = M.createGame({ hero, records: records(24, 3), captainBuild: { tactical: module.id } });
    game.pause(); const before = JSON.stringify(game.snapshot()); assert.equal(game.tactical(), false); assert.equal(JSON.stringify(game.snapshot()), before);
    game.resume(); assert.equal(game.tactical(), true); assert.equal(game.tactical(), false); game.state.phase = 'won'; assert.equal(game.tactical(), false);
  }
});
test('save migration defaults and roundtrips preserve both independent builds with levels absent', () => {
  const original = save(24); original.loadout = 7; original.captainBuilds = { ramen: buildFor(0, 'arc'), bing: buildFor(1, 'bulwark') };
  const exported = P.exportSave(original, []), imported = P.importSave(JSON.stringify(exported), save(), []);
  assert.deepEqual(imported.captainBuilds, original.captainBuilds); assert.equal(imported.loadout, 7);
  assert.deepEqual(parseProgress(JSON.stringify(P.capture(imported, []))).captainBuilds, original.captainBuilds);
  assert.deepEqual(P.normalize({ version: 2, stars: [3] }, []).captainBuilds.ramen, G.resetBuild());
});
test('import validates incoming choices after merging achievements and honors an explicit reset', () => {
  const current = save(4), incoming = { version: 4, records: records(1), captainBuilds: { ramen: { nodes: allNodes(0).slice(0, 3), tactical: 'default' } } };
  const merged = P.importSave(JSON.stringify({ format: 'dog-squad-save', schema: 1, data: incoming }), current, []);
  assert.equal(merged.captainBuilds.ramen.nodes.length, 3); assert.equal(G.earned(merged.records).completed, 4);
  incoming.captainBuilds.ramen = G.resetBuild();
  assert.equal(P.importSave(JSON.stringify({ format: 'dog-squad-save', schema: 1, data: incoming }), merged, []).captainBuilds.ramen.nodes.length, 0);
});
test('local automatic backup recovers captain choices when the primary save is damaged', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const original = save(6); original.captainBuilds = { ramen: buildFor(0, 'rescue'), bing: buildFor(1, 'barrage') };
  P.writeLocal(storage, original, []); values.set('dog-squad-v4', '{broken');
  const recovered = P.readLocal(storage, []); assert.equal(recovered.recovered, true); assert.deepEqual(recovered.save.captainBuilds, original.captainBuilds);
  P.writeLocal(storage, recovered.save, []); assert.equal(P.readLocal(storage, []).recovered, false);
});
test('native saves use final merged records for training budgets and persist resets on disk', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-growth-save-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let now = Date.parse('2026-10-22T10:00:00Z'); const store = new SaveBackupStore({ directory, now: () => now });
  await store.save(JSON.stringify(P.capture(save(4), []))); now += 1000;
  const incoming = { version: 4, records: records(1), loadout: 7, captainBuilds: { ramen: { nodes: allNodes(0).slice(0, 3), tactical: 'default' }, bing: buildFor(1, 'barrage') } };
  await store.save(JSON.stringify(incoming)); let loaded = JSON.parse((await store.load()).json);
  assert.equal(loaded.captainBuilds.ramen.nodes.length, 3); assert.equal(loaded.captainBuilds.bing.tactical, 'barrage'); assert.equal(loaded.loadout, 7);
  incoming.captainBuilds.ramen = G.resetBuild(); now += 1000; await store.save(JSON.stringify(incoming)); loaded = JSON.parse((await store.load()).json);
  assert.equal(loaded.captainBuilds.ramen.nodes.length, 0); assert.equal(G.earned(loaded.records).completed, 4);
});
test('native tied backups merge best records before preserving the current captain choices', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-growth-recover-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new SaveBackupStore({ directory }); await store.prepare(); const savedAt = '2026-10-22T10:00:00.000Z';
  const current = { version: 4, records: records(1), captainBuilds: { ramen: { nodes: allNodes(0).slice(0, 3), tactical: 'default' } } }, previous = { version: 4, records: records(3, 0, 2), captainBuilds: { ramen: buildFor(0, 'rescue') } };
  for (const [file, data] of [['current.json', current], ['previous.json', previous]]) await fs.writeFile(path.join(directory, file), JSON.stringify({ format: 'dog-squad-native-backup', schema: 1, savedAt, data }));
  const loaded = JSON.parse((await store.load()).json); assert.equal(G.earned(loaded.records).completed, 4); assert.equal(loaded.captainBuilds.ramen.nodes.length, 3); assert.equal(loaded.captainBuilds.ramen.tactical, 'default');
});
test('tied backup load then identical save durably heals merged records and the recalculated captain budget', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-growth-tie-heal-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const savedAt = '2026-10-22T10:00:00.000Z', store = new SaveBackupStore({ directory, now: () => Date.parse(savedAt) + 1000 }); await store.prepare();
  const current = save(1); current.captainBuilds.ramen = { nodes: allNodes(0).slice(0, 3), tactical: 'default' };
  const previous = P.normalize({ version: 4, records: records(3, 0, 2) }, []);
  for (const [file, data] of [['current.json', current], ['previous.json', previous]]) await fs.writeFile(path.join(directory, file), JSON.stringify({ format: 'dog-squad-native-backup', schema: 1, savedAt, data }));
  const loaded = await store.load(); assert.equal(loaded.source, 'current');
  assert.equal(G.earned(JSON.parse(loaded.json).records).completed, 4); assert.equal(JSON.parse(loaded.json).captainBuilds.ramen.nodes.length, 3);
  const result = await store.save(loaded.json); assert.equal(result.saved, true, 'an in-memory union is not yet a durable current save');
  const persisted = JSON.parse(await fs.readFile(path.join(directory, 'current.json'), 'utf8')).data;
  assert.equal(G.earned(persisted.records).completed, 4); assert.equal(persisted.captainBuilds.ramen.nodes.length, 3);
  assert.deepEqual(await store.save(loaded.json), { saved: false, deduplicated: true }, 'deduplication resumes after current was healed');
});
test('cached hash cannot skip repairing a valid current file that changed after load', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-growth-current-heal-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const savedAt = '2026-10-22T10:00:00.000Z'; let now = Date.parse(savedAt) + 2000;
  const store = new SaveBackupStore({ directory, now: () => now });
  await store.save(JSON.stringify(P.capture(save(4), []))); const loaded = await store.load();
  const changed = P.capture(save(1), []);
  await fs.writeFile(path.join(directory, 'current.json'), JSON.stringify({ format: 'dog-squad-native-backup', schema: 1, savedAt: '2026-10-22T10:00:03.000Z', data: changed }));
  now += 2000;
  const result = await store.save(loaded.json); assert.equal(result.saved, true, 'the cached hash must be compared with the actual canonical current data');
  const persisted = JSON.parse(await fs.readFile(path.join(directory, 'current.json'), 'utf8')).data; assert.equal(G.earned(persisted.records).completed, 4);
});
test('browser UMD progression and save modules load without Node dependencies', async () => {
  const context = vm.createContext({});
  vm.runInContext(await fs.readFile(path.join(__dirname, '../src/progression.js'), 'utf8'), context);
  vm.runInContext(await fs.readFile(path.join(__dirname, '../src/progress.js'), 'utf8'), context);
  assert.equal(context.DogProgression.getProfile({}, 'bing').available, 2); assert.equal(context.DogProgress.normalize(null, []).captainBuilds.ramen.tactical, 'default');
});
