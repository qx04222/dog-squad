'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Motion = require('../src/character-motion.js');

// Strict canvas spy: rejects invalid geometry; save/restore includes public styles.
function canvasSpy({ legacy = false } = {}) {
  const stack = [], calls = [], style = { globalAlpha: 1, lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic' };
  const c = new Proxy({}, {
    get(_, key) {
      if (key === 'calls') return calls;
      if (key === 'depth') return stack.length;
      if (key === 'styles') return { ...style };
      if (key in style) return style[key];
      if (key === 'save') return () => { stack.push({ ...style }); calls.push(['save']); };
      if (key === 'restore') return () => { assert.ok(stack.length, 'restore without save'); Object.assign(style, stack.pop()); calls.push(['restore']); };
      if (key === 'roundRect' && legacy) return undefined;
      return (...args) => {
        for (const a of args) if (typeof a === 'number') assert.ok(Number.isFinite(a), `${String(key)} received ${a}`);
        if (key === 'ellipse') { assert.ok(args[2] > 0, 'ellipse rx positive'); assert.ok(args[3] > 0, 'ellipse ry positive'); }
        calls.push([key, ...args]);
      };
    },
    set(_, key, value) { if (typeof value === 'number') assert.ok(Number.isFinite(value)); style[key] = value; return true; }
  });
  return c;
}
const renderers = ['drawCaptain', 'drawFollower', 'drawBoss', 'drawVictory'];

test('UMD exports the same motion contract to a browser global', () => {
  const sandbox = { globalThis: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/character-motion.js'), 'utf8'), sandbox);
  for (const key of renderers) assert.equal(typeof sandbox.globalThis.DogMotion[key], 'function');
  assert.equal(sandbox.globalThis.DogMotion.VICTORY_DURATION, 2.8);
});

test('all renderers tolerate default, null and incomplete options with balanced context state', () => {
  for (const name of renderers) for (const options of [undefined, null, {}, { hero: 1 }]) {
    const ctx = canvasSpy(), before = ctx.styles;
    assert.equal(Motion[name](ctx, options), true, name);
    assert.equal(ctx.depth, 0, name);
    assert.deepEqual(ctx.styles, before, name);
  }
});

test('NaN, infinity, negative sizes and oversized counts cannot produce invalid geometry', () => {
  const options = Object.freeze({ x: NaN, y: Infinity, h: -100, time: -Infinity, move: NaN, hero: 'bingbong', index: Infinity, dash: Infinity, shoot: NaN, tactical: -9, ultimate: 10, chapter: Infinity, stage: 2, hpRatio: NaN, entrance: NaN, hit: Infinity, shot: NaN, width: -10, height: Infinity, stars: 999999, rank: '<script>' });
  for (const name of renderers) {
    const ctx = canvasSpy();
    assert.equal(Motion[name](ctx, options, (_, pose) => {
      for (const v of Object.values(pose)) if (typeof v === 'number') assert.ok(Number.isFinite(v));
    }), true);
    assert.equal(ctx.depth, 0);
    assert.ok(ctx.calls.length < 2000, `${name} is bounded`);
  }
});

test('captain remains distinctly larger than followers and keeps original hero identity', () => {
  const captain = Motion.captainPose({ h: 70, hero: 'ramen', time: 1 });
  for (let i = 0; i < 54; i++) {
    const follower = Motion.followerPose({ h: 70, hero: 1, index: i, time: 1 });
    assert.ok(captain.h / follower.h > 1.28);
    assert.equal(follower.hero, 1);
    assert.equal(follower.back, true);
  }
  assert.equal(captain.hero, 0);
  assert.equal(Motion.captainPose({ won: true }).back, false);
  assert.equal(Motion.captainPose({ hero: 'Bing Bong' }).hero, 1);
});

test('recruits have staggered steps and captain responds to steering and recoil', () => {
  const poses = Array.from({ length: 12 }, (_, index) => Motion.followerPose({ index, time: .81, x: 10, y: 20 }));
  assert.ok(new Set(poses.map(p => p.y)).size > 9);
  const left = Motion.captainPose({ time: 1, move: -1 }), right = Motion.captainPose({ time: 1, move: 1 });
  assert.ok(right.rotation > left.rotation);
  const shooting = Motion.captainPose({ time: 1, shoot: 1 }), idle = Motion.captainPose({ time: 1 });
  assert.ok(shooting.y > idle.y);
  assert.equal(Motion.captainPose({}).rotation, 0, 'missing move means neutral');
});

test('reduced motion stabilizes poses and removes movement even during actions', () => {
  for (const fn of ['captainPose', 'followerPose', 'bossPose']) {
    const a = Motion[fn]({ x: 12, y: 44, time: 1, reducedMotion: true, move: 1, shoot: 1, hit: 1, shot: 1, entrance: 0, won: true });
    const b = Motion[fn]({ x: 12, y: 44, time: 888, reducedMotion: true, move: -1, shoot: 0, hit: 0, shot: 0, entrance: 1, won: true });
    assert.deepEqual(a, b, fn);
    assert.equal(a.rotation, 0);
  }
  const still = Motion.victoryFrame({ time: .1, reducedMotion: true, stars: 2 });
  assert.equal(still.phase, 'commendation'); assert.equal(still.starsVisible, 2);
  assert.equal(still.duration, .65);
  assert.equal(Motion.victoryFrame({ time: .65, reducedMotion: true }).done, true);
});

test('Boss arrival, phase-two silhouette and six chapter accents remain distinct', () => {
  const arriving = Motion.bossPose({ h: 170, entrance: 0 }), arrived = Motion.bossPose({ h: 170, entrance: 1 });
  assert.ok(arriving.h < arrived.h);
  assert.ok(arriving.y < arrived.y);
  assert.ok(Motion.bossPose({ h: 170, stage: 2 }).h > arrived.h);
  assert.equal(new Set(Motion.BOSS_COLORS).size, 6);
  for (let chapter = 1; chapter <= 6; chapter++) {
    const ctx = canvasSpy(); let count = 0;
    Motion.drawBoss(ctx, { chapter, stage: 2, hpRatio: .12, hit: .4, shot: .9, time: 50 }, (_, p) => { count++; assert.equal(p.chapter, chapter); });
    assert.equal(count, 1);
    assert.equal(ctx.depth, 0);
  }
});

test('victory sequence stages, star reveal and 2.8-second completion use renderer time only', () => {
  assert.equal(Motion.victoryFrame({ time: 0 }).phase, 'breakthrough');
  assert.equal(Motion.victoryFrame({ time: 1 }).phase, 'celebration');
  assert.equal(Motion.victoryFrame({ time: 1.7 }).phase, 'commendation');
  assert.equal(Motion.victoryFrame({ time: 1.79 }).starsVisible, 0);
  assert.equal(Motion.victoryFrame({ time: 1.81 }).starsVisible, 1);
  assert.equal(Motion.victoryFrame({ time: 2.05 }).starsVisible, 2);
  assert.equal(Motion.victoryFrame({ time: 2.29 }).starsVisible, 3);
  assert.equal(Motion.victoryFrame({ time: 2.79 }).done, false);
  assert.equal(Motion.victoryFrame({ time: 2.8 }).done, true);
  assert.equal(Motion.victoryFrame({ time: 100, stars: 1 }).starsVisible, 1);
  const ctx = canvasSpy(), heroes = [];
  Motion.drawVictory(ctx, { time: 2.4, stars: 2, rank: 'S', hero: 1 }, (_, pose) => heroes.push(pose));
  assert.equal(heroes.length, 5);
  assert.equal(heroes.at(-1).hero, 1);
  assert.ok(heroes.every(p => p.back === false));
});

test('renderers are deterministic, never mutate options and do not call Math.random', () => {
  const options = Object.freeze({ time: 2.1, index: 3, h: 81, x: 100, y: 200, move: .6, shoot: .2, dash: .5, tactical: .2, ultimate: .6, hero: 1, stage: 2, hit: .5, shot: .5, stars: 3, chapter: 6 });
  const random = Math.random;
  try {
    Math.random = () => { throw new Error('randomness forbidden'); };
    for (const name of renderers) {
      const a = canvasSpy(), b = canvasSpy(), cb = (ctx, pose) => ctx.translate(pose.x, pose.y);
      Motion[name](a, options, cb); Motion[name](b, options, cb);
      assert.deepEqual(a.calls, b.calls, name);
      assert.equal(a.depth, 0);
    }
  } finally { Math.random = random; }
});

test('sprite callbacks cannot leak drawing styles and a thrown callback restores all owned contexts', () => {
  for (const name of renderers) {
    const ctx = canvasSpy(), before = ctx.styles;
    assert.throws(() => Motion[name](ctx, { time: 2, dash: 1 }, c => { c.globalAlpha = .02; c.fillStyle = '#f00'; throw new Error('sprite unavailable'); }), /sprite unavailable/);
    assert.equal(ctx.depth, 0, name);
    assert.deepEqual(ctx.styles, before, name);
  }
});

test('legacy canvas roundRect fallback works and unavailable contexts return false', () => {
  for (const name of renderers) {
    assert.equal(Motion[name](null, {}), false);
    assert.equal(Motion[name]({}, {}), false);
    const ctx = canvasSpy({ legacy: true });
    assert.equal(Motion[name](ctx, { time: 2.5, stage: 2 }), true);
    assert.equal(ctx.depth, 0);
  }
});

test('archive reveal starts at 1.1 seconds and settles at 1.55 without changing legacy done', () => {
  assert.equal(Motion.ARCHIVE_REVEAL_TIME, 1.1);
  assert.equal(Motion.ARCHIVE_SETTLE_TIME, 1.55);
  const before = Motion.victoryFrame({ time: 1.099, presentation: 'archive' });
  assert.equal(before.archiveReady, false); assert.equal(before.archiveProgress, 0);
  const reveal = Motion.victoryFrame({ time: 1.1, presentation: 'archive' });
  assert.equal(reveal.archiveReady, true); assert.equal(reveal.archiveSettled, false);
  const transition = Motion.victoryFrame({ time: 1.3, presentation: 'archive' });
  assert.ok(transition.archiveProgress > 0 && transition.archiveProgress < 1);
  const settled = Motion.victoryFrame({ time: 1.55, presentation: 'archive' });
  assert.equal(settled.archiveProgress, 1); assert.equal(settled.archiveSettled, true);
  assert.equal(settled.done, false, '2.8-second legacy completion stays compatible');
  assert.equal(Motion.victoryFrame({ time: 9 }).archiveReady, false);
  assert.equal(Motion.victoryFrame({ time: 9 }).archiveProgress, 0);
});

test('archive mode has no Canvas stars, rank, title or skip label to duplicate DOM rewards', () => {
  const zero = canvasSpy(), three = canvasSpy(), legacy = canvasSpy();
  const options = { time: 2.6, presentation: 'archive', chapter: 6, hero: 1 };
  Motion.drawVictory(zero, { ...options, stars: 0, rank: 'C' });
  Motion.drawVictory(three, { ...options, stars: 3, rank: 'S' });
  Motion.drawVictory(legacy, { time: 2.6, stars: 3, rank: 'S' });
  assert.deepEqual(zero.calls, three.calls, 'Canvas presentation never depends on reward value');
  assert.equal(three.calls.filter(c => c[0] === 'fillText').length, 0);
  assert.ok(legacy.calls.filter(c => c[0] === 'fillText').length >= 4);
});

test('archive background stays byte-for-byte deterministic after settling and uses fewer draws', () => {
  const settled = canvasSpy(), later = canvasSpy(), celebration = canvasSpy();
  const cb = (ctx, pose) => ctx.translate(pose.x, pose.y);
  Motion.drawVictory(settled, { time: 1.55, presentation: 'archive', hero: 1 }, cb);
  Motion.drawVictory(later, { time: 10000, presentation: 'archive', hero: 1 }, cb);
  Motion.drawVictory(celebration, { time: 1, presentation: 'archive', hero: 1 }, cb);
  assert.deepEqual(settled.calls, later.calls);
  assert.ok(settled.calls.length < celebration.calls.length);
  assert.equal(settled.depth, 0);
});

test('archive party shrinks into footer and lands smoothly while preserving front-facing identity', () => {
  const collect = time => { const poses = []; Motion.drawVictory(canvasSpy(), { time, presentation: 'archive', width: 600, height: 800, hero: 0 }, (_, p) => poses.push(p)); return poses; };
  const first = collect(1.1), moving = collect(1.3), final = collect(1.55);
  assert.equal(final.length, 5);
  assert.ok(final.every(p => p.y > 680 && p.y < 730 && !p.back && p.rotation === 0));
  assert.ok(first.at(-1).h > moving.at(-1).h && moving.at(-1).h > final.at(-1).h);
  assert.ok(first.at(-1).y < moving.at(-1).y && moving.at(-1).y < final.at(-1).y);
  assert.ok(final.at(-1).y - final.at(-1).h > 610, 'the middle is reserved for the readable DOM result card');
});

test('reduced-motion archive is immediately ready, fully settled and static at time zero', () => {
  const frame = Motion.victoryFrame({ time: 0, presentation: 'archive', reducedMotion: true });
  assert.equal(frame.archiveReady, true); assert.equal(frame.archiveProgress, 1); assert.equal(frame.archiveSettled, true);
  const start = canvasSpy(), later = canvasSpy();
  Motion.drawVictory(start, { time: 0, presentation: 'archive', reducedMotion: true });
  Motion.drawVictory(later, { time: 999, presentation: 'archive', reducedMotion: true });
  assert.deepEqual(start.calls, later.calls);
  assert.equal(start.calls.filter(c => c[0] === 'fillText').length, 0);
});

test('archive mode keeps finite geometry and balanced context with missing or invalid inputs', () => {
  for (const options of [{ presentation: 'archive' }, { presentation: 'archive', time: NaN, width: Infinity, height: -3, stars: 99 }, { presentation: 'archive', time: 2, reducedMotion: true }]) {
    const ctx = canvasSpy(), before = ctx.styles;
    assert.equal(Motion.drawVictory(ctx, Object.freeze(options)), true);
    assert.equal(ctx.depth, 0); assert.deepEqual(ctx.styles, before);
  }
});
