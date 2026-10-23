const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame, LEVELS } = require('../src/core.js');
const { pilot } = require('./pilot.cjs');
const find = mechanic => {
  const level = LEVELS.findIndex(level => level.mechanic === mechanic);
  assert.ok(level >= 0, `Built-in campaign must contain ${mechanic}`);
  return { level, config: LEVELS[level], game: createGame({ level }) };
};
const advance = (game, seconds, input = {}) => {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++) game.step(1 / 60, input);
};
const damage = (game, amount) => {
  game.state.team = 100;
  game.state.invulnerable = 0;
  game.state.bullets = [{ x: game.state.x, y: 655, vy: 240, vx: 0, damage: amount, ratio: 0, r: 10, friendly: false }];
  game.step(1 / 60);
};

test('every operation has a stable identifier and bounded difficulty independent of catalog index', () => {
  assert.equal(LEVELS.length, 48);
  assert.equal(new Set(LEVELS.map(level => level.id)).size, LEVELS.length);
  for (let level = 0; level < LEVELS.length; level++) {
    const cfg = LEVELS[level], game = createGame({ level }), snapshot = game.snapshot();
    assert.ok(Number.isInteger(cfg.difficulty) && cfg.difficulty >= 0 && cfg.difficulty <= 7);
    assert.equal(snapshot.levelId, cfg.id);
    assert.equal(snapshot.difficulty, cfg.difficulty);
    assert.equal(snapshot.mechanic, cfg.mechanic);
    assert.equal(game.state.team, 8 + cfg.difficulty * 4);
    assert.equal(game.state.weapon, 1 + Math.floor(cfg.difficulty / 3));
  }
  for (let level = 0; level < 8; level++) assert.equal(LEVELS[level].difficulty, level);
});

test('blackout reduces passive energy to 55 percent and doubles crate energy to 24', () => {
  const { game } = find('blackout');
  advance(game, 2);
  assert.ok(Math.abs(game.state.energy - 23.3) < 1e-8);
  game.state.energy = 0;
  game.state.entities = [{ id: 1, type: 'crate', x: 170, y: 300, hp: 1, maxHp: 1, r: 35, hit: 0 }];
  game.state.bullets = [{ x: 170, y: 310, vy: -650, damage: 9, r: 5, friendly: true }];
  game.step(1 / 60);
  assert.ok(Math.abs(game.state.energy - (24 + 3 * .55 / 60)) < 1e-8);
});

test('overcharge fires at 82 percent interval and takes 112 percent damage', () => {
  const { game, config } = find('overcharge');
  let shots = 0;
  for (let frame = 0; frame < 120; frame++) {
    game.step(1 / 60);
    shots += game.drainSignals().filter(signal => signal.type === 'shoot').length;
  }
  const weapon = 1 + Math.floor(config.difficulty / 3);
  const interval = Math.max(.115, .23 - (weapon - 1) * .014) * .82;
  assert.equal(shots, Math.floor((2 - .08) / interval) + 1);
  damage(game, 20);
  assert.equal(game.state.damageTaken, 22);
});

test('crossfire locks its warning position, can be dodged, and respects pause', () => {
  const { game } = find('crossfire');
  game.state.team = 300;
  advance(game, 14.9);
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.state.hazards.filter(hazard => hazard.source === 'crossfire').length, 0);
  advance(game, .15);
  const hazard = game.state.hazards.find(hazard => hazard.source === 'crossfire');
  assert.ok(hazard);
  assert.equal(hazard.width, 68);
  assert.ok(hazard.delay > 1.4 && hazard.delay <= 1.5);
  const lockedX = hazard.x;
  game.pause();
  const before = JSON.stringify(hazard);
  advance(game, 2, { axis: 1 });
  assert.equal(JSON.stringify(hazard), before);
  game.resume();
  advance(game, .5, { axis: 1 });
  assert.equal(hazard.x, lockedX);
  assert.ok(Math.abs(game.state.x - hazard.x) > 100);
  const damageBefore = game.state.damageTaken;
  // Isolate the scheduled beam from unrelated enemies for its damage assertion.
  game.state.entities = []; game.state.bullets = [];
  advance(game, .9);
  assert.equal(game.state.damageTaken, damageBefore);
});

test('crossfire warning cadence is fifteen seconds before the boss only', () => {
  const { game, config } = find('crossfire');
  let input = {}, warnings = 0;
  for (let frame = 0; frame < (config.duration - .05) * 60 && game.state.phase === 'playing'; frame++) {
    if (frame % 6 === 0) input = pilot(game.state);
    game.step(1 / 60, input);
    warnings += game.drainSignals().filter(signal => signal.type === 'warning').length;
  }
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.state.bossSpawned, false);
  assert.equal(warnings, Math.floor((config.duration - .05) / 15));
  const blocked = find('crossfire').game;
  blocked.state.team = 300;
  blocked.state.bossSpawned = true;
  // No boss object is present: isolate the scheduled warning guard from boss beams.
  advance(blocked, 15.1);
  assert.equal(blocked.state.hazards.length, 0);
});

test('repair swarm adds one repair unit to the normal opening wave and schedules nine distinct crates', () => {
  const { game, config } = find('repairSwarm');
  advance(game, 4.6);
  const enemies = game.state.entities.filter(entity => entity.type === 'enemy');
  const ordinaryCount = 7 + Math.floor(config.difficulty * 1.4);
  assert.equal(enemies.length, ordinaryCount + 1);
  assert.equal(enemies.at(-1).kind, 'repair');
  const crates = new Set();
  // This assertion measures the schedule, not crate survival under a 600-member volley.
  // Keep the observer alive and remove outgoing fire so no crate vanishes in its spawn frame.
  for (let frame = 0; frame < 130 * 60 && game.state.time < config.duration && game.state.phase === 'playing'; frame++) {
    game.state.bullets = []; game.state.invulnerable = 1;
    game.step(1 / 60);
    for (const entity of game.state.entities) if (entity.type === 'crate') crates.add(entity.id);
    game.drainSignals();
  }
  assert.equal(crates.size, 9);
});
