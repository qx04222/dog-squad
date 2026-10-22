const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame, PLAYER_Y } = require('../src/core.js');
const VFX = require('../src/battle-vfx.js');

function advance(game, seconds) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) game.step(1 / 60);
}

test('Q and E accept a deliberate 180ms early press and activate exactly once', () => {
  const tactical = createGame();
  tactical.state.tacticalCooldown = .18;
  assert.equal(tactical.requestTactical(), true);
  assert.equal(tactical.state.tacticalUses, 0);
  advance(tactical, .22);
  assert.equal(tactical.state.tacticalUses, 1);
  advance(tactical, .3);
  assert.equal(tactical.state.tacticalUses, 1);

  const support = createGame();
  support.state.energy = 60;
  support.state.supportCooldown = .18;
  assert.equal(support.requestSupport(), true);
  advance(support, .22);
  assert.equal(support.state.supportUses, 1);
  assert.ok(support.state.energy < 1);
});

test('R buffers near-full charge briefly, then fires after combat tops it up', () => {
  const game = createGame();
  game.state.ultimateCharge = 99.6;
  assert.equal(game.requestUltimate(), true);
  game.state.entities = [{ id: 77, type: 'enemy', kind: 'normal', x: 170, baseX: 170, y: 300, hp: 100, maxHp: 100, guardHp: 0, r: 23, hit: 0, wobble: 0 }];
  game.state.bullets = [{ x: 170, y: 322, vx: 0, vy: -700, damage: 50, r: 5, friendly: true, kind: 'pulse', pierce: 0, hitIds: [] }];
  advance(game, .08);
  assert.equal(game.state.ultimateUses, 1);
  assert.ok(game.state.ultimateTime > 2.9);
});

test('ability buffers reject long cooldowns and are erased by pause', () => {
  const game = createGame();
  game.state.tacticalCooldown = .181;
  game.state.energy = 100;
  game.state.supportCooldown = .181;
  game.state.ultimateCharge = 97.99;
  assert.equal(game.requestTactical(), false);
  assert.equal(game.requestSupport(), false);
  assert.equal(game.requestUltimate(), false);
  game.state.tacticalCooldown = game.state.supportCooldown = .1;
  game.state.ultimateCharge = 99;
  assert.equal(game.requestTactical(), true);
  assert.equal(game.requestSupport(), true);
  assert.equal(game.requestUltimate(), true);
  game.pause();
  assert.deepEqual([game.state.tacticalBuffer, game.state.supportBuffer, game.state.ultimateBuffer], [0, 0, 0]);
  advance(game, .5);
  assert.deepEqual([game.state.tacticalUses, game.state.supportUses, game.state.ultimateUses], [0, 0, 0]);
});

test('one dash through hostile fire earns one capped perfect-dodge reward', () => {
  const game = createGame();
  game.state.shield = 95;
  game.state.shieldTime = 1;
  game.state.ultimateCharge = 96;
  game.state.bullets = [
    { x: 225, y: PLAYER_Y - 8, vx: 0, vy: 220, damage: 12, r: 9, friendly: false },
    { x: 248, y: PLAYER_Y + 5, vx: 0, vy: 220, damage: 12, r: 9, friendly: false }
  ];
  assert.equal(game.dash(1), true);
  assert.equal(game.state.perfectDodges, 1);
  assert.equal(game.state.shield, 100);
  assert.equal(game.state.shieldTime, 3);
  assert.equal(game.state.ultimateCharge, 100);
  assert.equal(game.drainSignals().filter(event => event.type === 'perfectDodge').length, 1);
  assert.equal(game.state.skillEffects.at(-1).kind, 'perfectDodge');

  assert.equal(game.dash(-1), true);
  assert.equal(game.state.perfectDodges, 1, 'the same bullets cannot be farmed twice');
});

test('a dash far from hostile fire gives no reward and invalid time steps stay inert', () => {
  const game = createGame();
  game.state.bullets = [{ x: 225, y: PLAYER_Y - 120, vx: 0, vy: 220, damage: 12, r: 9, friendly: false }];
  game.dash(1);
  assert.equal(game.state.perfectDodges, 0);
  const before = JSON.stringify(game.state);
  game.step(-1);
  game.step(Number.NaN);
  assert.equal(JSON.stringify(game.state), before);
});

test('perfect-dodge VFX is finite, bounded and does not mutate its effect', () => {
  const calls = [];
  const context = new Proxy({ save() {}, restore() {}, setLineDash() {}, fill() {}, stroke() {}, beginPath() {}, closePath() {},
    moveTo(...args) { calls.push(args); }, lineTo(...args) { calls.push(args); }, arc(...args) { calls.push(args); },
    translate(...args) { calls.push(args); }, ellipse(...args) { calls.push(args); }
  }, { get(target, key) { return key in target ? target[key] : () => {}; }, set(target, key, value) { target[key] = value; return true; } });
  const effect = Object.freeze({ x: 220, y: 640, kind: 'perfectDodge', radius: 170, life: .4, maxLife: .72 });
  assert.equal(VFX.drawSkillEffect(context, effect, { time: 2, reducedMotion: false }), true);
  assert.ok(calls.flat().every(Number.isFinite));
  assert.equal(JSON.stringify(effect), '{"x":220,"y":640,"kind":"perfectDodge","radius":170,"life":0.4,"maxLife":0.72}');
});
