'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const VFX = require('../src/battle-vfx.js');

function fakeCanvas() {
  const trace = [], styles = [], state = { saves: 0, restores: 0 };
  const gradient = { addColorStop(offset, color) { assert(Number.isFinite(offset)); styles.push(String(color)); } };
  const context = new Proxy({}, {
    get(_target, property) {
      if (property === 'save') return () => { state.saves++; trace.push('save'); };
      if (property === 'restore') return () => { state.restores++; trace.push('restore'); };
      if (property === 'createRadialGradient' || property === 'createLinearGradient') return (...args) => {
        args.forEach(value => assert(Number.isFinite(value), `${String(property)} received ${value}`));
        trace.push(`${String(property)}:${args.length}`); return gradient;
      };
      return (...args) => {
        for (const arg of args) {
          if (typeof arg === 'number') assert(Number.isFinite(arg), `${String(property)} received ${arg}`);
          if (Array.isArray(arg)) arg.forEach(value => assert(Number.isFinite(value), `${String(property)} dash received ${value}`));
        }
        trace.push(`${String(property)}:${args.length}`);
      };
    },
    set(_target, property, value) {
      if (typeof value === 'number') assert(Number.isFinite(value), `${String(property)} set to ${value}`);
      if (property === 'fillStyle' || property === 'strokeStyle') styles.push(String(value));
      return true;
    }
  });
  return { context, trace, styles, state };
}

function render(kind, reducedMotion = false, additions = {}) {
  const canvas = fakeCanvas();
  const effect = { kind, x: 150, y: 220, life: .38, maxLife: .8, angle: -.61, ...additions };
  const before = JSON.stringify(effect);
  assert.equal(VFX.drawSkillEffect(canvas.context, effect, { x: 310, y: 420, s: .83, time: 12.5, reducedMotion }), true);
  assert.equal(JSON.stringify(effect), before, `${kind} must not mutate its effect`);
  assert.equal(canvas.state.saves, canvas.state.restores, `${kind} must balance canvas state`);
  assert(canvas.trace.length > 8, `${kind} should draw a layered effect`);
  return `${canvas.trace.join('|')}::${canvas.styles.join('|')}`;
}

test('v6 growth skill kinds render finite, balanced and distinct visuals', () => {
  const kinds = ['chainArc', 'rescueBeacon', 'rapidBarrage', 'bulwarkWave', 'shellSplash'];
  const signatures = kinds.map(kind => render(kind));
  assert.equal(new Set(signatures).size, kinds.length, 'each growth skill needs a distinct drawing signature');
});

test('v6 growth skill effects remain informative with reduced motion', () => {
  for (const kind of ['chainArc', 'rescueBeacon', 'rapidBarrage', 'bulwarkWave', 'shellSplash']) {
    const signature = render(kind, true);
    assert.match(signature, /(lineTo|arc|ellipse|roundRect)/, `${kind} should retain a static silhouette`);
  }
});

test('chain arc clamps target nodes and accepts sparse effect records', () => {
  const low = render('chainArc', false, { targetCount: -20 });
  const high = render('chainArc', false, { targetCount: 999 });
  assert.notEqual(low, high);
  assert.doesNotThrow(() => render('chainArc', false, { x: NaN, y: Infinity, life: NaN, maxLife: 0 }));
});

test('existing v5 skill kinds and API remain compatible', () => {
  const existing = [
    'timeField', 'armorVolley', 'orbitalBeam', 'bombardment', 'orbitalStrike',
    'bombardWave', 'dash', 'shield', 'overdrive', 'focus', 'support',
    'pickup-repair', 'pickup-shield', 'pickup-rapid', 'pickup-pierce',
    'pickup-battery', 'pickup-magnet', 'pickup-nova'
  ];
  for (const kind of existing) render(kind);
  for (const name of ['drawEnemyDetails', 'drawBossDetails', 'drawBullet', 'drawExplosion', 'drawImpact', 'drawDamageNumber', 'drawPickup', 'drawSkillEffect', 'drawAura']) {
    assert.equal(typeof VFX[name], 'function', `${name} export changed`);
  }
});

test('rendering is deterministic and does not append persistent entities', () => {
  for (const kind of ['chainArc', 'rescueBeacon', 'rapidBarrage', 'bulwarkWave', 'shellSplash']) {
    assert.equal(render(kind), render(kind), `${kind} should be deterministic for the same frame`);
  }
});

// Dense friendly fire may simplify decorative trails, never hostile readability or simulation data.
test('dense friendly rendering keeps a filled outlined projectile and leaves enemy warnings unchanged', () => {
  for (const friendly of [true, false]) {
    const bullet = Object.freeze({ x: 120, y: 240, vx: 0, vy: friendly ? -860 : 240, r: 6, kind: friendly ? 'armorBurst' : 'enemy', friendly });
    const full = fakeCanvas(), compact = fakeCanvas(), before = JSON.stringify(bullet);
    VFX.drawBullet(full.context, bullet, { time: 2 });
    VFX.drawBullet(compact.context, bullet, { time: 2, compact: true });
    assert.equal(JSON.stringify(bullet), before);
    assert.equal(compact.state.saves, compact.state.restores);
    assert(compact.trace.includes('fill:0') && compact.trace.includes('stroke:0'), 'every projectile keeps its solid silhouette and outline');
    if (friendly) assert(compact.trace.length < full.trace.length, 'dense friendly effect uses fewer drawing operations');
    else { assert.deepEqual(compact.trace, full.trace); assert.deepEqual(compact.styles, full.styles); }
  }
});
