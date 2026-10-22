(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DogMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Pure presentation: no clocks, randomness, event handlers or simulation writes.
  const TAU = Math.PI * 2;
  const VICTORY_DURATION = 2.8;
  const REDUCED_VICTORY_DURATION = .65;
  const ARCHIVE_REVEAL_TIME = 1.1;
  const ARCHIVE_SETTLE_TIME = 1.55;
  const FONT = '"Avenir Next", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif';
  const HERO_COLORS = Object.freeze(['#77fff0', '#ffcc68']);
  const BOSS_COLORS = Object.freeze(['#7bfff1', '#ffce78', '#bda0ff', '#78cdff', '#ff95bc', '#ffec8b']);
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value, min)));
  const unit = value => clamp(value, 0, 1);
  const ease = value => { const t = unit(value); return 1 - Math.pow(1 - t, 3); };
  const heroIndex = hero => hero === 1 || /bing|bong/i.test(String(hero || '')) ? 1 : 0;
  const phaseTime = (time, reduced) => reduced ? 0 : finite(time);
  const safeOptions = options => options && typeof options === 'object' ? options : {};

  function withContext(ctx, draw) {
    if (!ctx || typeof ctx.save !== 'function' || typeof ctx.restore !== 'function') return false;
    ctx.save();
    try { draw(); return true; } finally { ctx.restore(); }
  }
  function ellipse(ctx, x, y, rx, ry, color, rotation = 0) {
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(.001, rx), Math.max(.001, ry), rotation, 0, TAU);
    ctx.fillStyle = color; ctx.fill();
  }
  function ring(ctx, x, y, rx, ry, color, width = 1, start = 0, end = TAU) {
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(.001, rx), Math.max(.001, ry), 0, start, end);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }
  function path(ctx, points, color, stroke, width = 1) {
    ctx.beginPath();
    points.forEach((point, i) => i ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1]));
    ctx.closePath();
    if (color) { ctx.fillStyle = color; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function line(ctx, x1, y1, x2, y2, color, width) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }
  function round(ctx, x, y, w, h, r, color, stroke, width = 1) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    if (color) { ctx.fillStyle = color; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function star(ctx, x, y, r, color, rotation = 0, stroke) {
    const points = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + rotation + i * Math.PI / 5, radius = i % 2 ? r * .46 : r;
      points.push([x + Math.cos(a) * radius, y + Math.sin(a) * radius]);
    }
    path(ctx, points, color, stroke, Math.max(1, r * .075));
  }
  function label(ctx, value, x, y, size, color, weight = 800) {
    ctx.font = `${weight} ${Math.max(8, size)}px ${FONT}`; ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(value), x, y);
  }
  function sprite(ctx, drawSprite, pose) {
    if (typeof drawSprite === 'function') withContext(ctx, () => drawSprite(ctx, pose));
  }

  /** Coordinates refer to the pet's ground contact. h is the unscaled base size. */
  function captainPose(options) {
    const o = safeOptions(options), reduced = !!o.reducedMotion, t = phaseTime(o.time, reduced);
    const motion = reduced ? 0 : o.motionScale == null ? 1 : unit(o.motionScale);
    const h = clamp(finite(o.h, 72), 8, 1200) * 1.2, move = reduced ? 0 : clamp(finite(o.move), -1, 1);
    const running = Math.sin(t * 14), recoil = reduced ? 0 : unit(o.shoot);
    const won = !!o.won, jump = motion * (won ? Math.max(0, Math.sin(t * 7)) * h * .10 : Math.abs(running) * h * .026);
    return {
      x: finite(o.x), y: finite(o.y) - jump + recoil * h * .025 * motion,
      h, rotation: (move * .07 + running * .016 - recoil * .018) * motion,
      hero: heroIndex(o.hero), back: o.back == null ? !won : !!o.back
    };
  }

  function drawCaptain(ctx, options, drawSprite) {
    const o = safeOptions(options), pose = captainPose(o), h = pose.h, c = HERO_COLORS[pose.hero];
    const motion = o.reducedMotion ? 0 : o.motionScale == null ? 1 : unit(o.motionScale);
    const t = phaseTime(o.time, o.reducedMotion), move = o.reducedMotion ? 0 : clamp(finite(o.move), -1, 1);
    const dash = o.reducedMotion ? 0 : unit(o.dash), surge = Math.max(unit(o.tactical), unit(o.ultimate));
    return withContext(ctx, () => {
      // Captain ground reticle remains readable behind dense friendly formations.
      ellipse(ctx, pose.x, finite(o.y) + h * .025, h * .43, h * .12, '#0b213c55');
      ring(ctx, pose.x, finite(o.y), h * .43, h * .12, c, Math.max(1.5, h * .023));
      ring(ctx, pose.x, finite(o.y), h * .35, h * .085, '#fff5ceaa', Math.max(1, h * .012));
      path(ctx, [[pose.x, finite(o.y) - h * .20], [pose.x - h * .07, finite(o.y) - h * .10], [pose.x + h * .07, finite(o.y) - h * .10]], '#fff3bb');
      if (dash > 0) withContext(ctx, () => {
        for (let i = 3; i > 0; i--) {
          ctx.globalAlpha *= .32 + dash * .13;
          line(ctx, pose.x - move * i * h * .24 - h * .16, pose.y - h * (.16 + i * .12), pose.x - move * h * .14 + h * .17, pose.y - h * (.16 + i * .12), c, h * .035);
        }
      });
      const capeSway = (Math.sin(t * 7) * h * .045 - move * h * .08) * motion;
      // Cape behind the intact original pet sprite, with split fabric and rank trim.
      path(ctx, [[pose.x - h * .23, pose.y - h * .62], [pose.x + h * .23, pose.y - h * .62], [pose.x + h * .29 + capeSway, pose.y - h * .07], [pose.x + capeSway, pose.y - h * .15], [pose.x - h * .29 + capeSway, pose.y - h * .07]], pose.hero ? '#79502deb' : '#235f64ed', '#e6c981aa', Math.max(1, h * .01));
      path(ctx, [[pose.x - h * .07, pose.y - h * .59], [pose.x + h * .06, pose.y - h * .59], [pose.x + h * .16 + capeSway, pose.y - h * .115], [pose.x + capeSway, pose.y - h * .16]], pose.hero ? '#a277425c' : '#589c9650');
      line(ctx, pose.x + capeSway, pose.y - h * .51, pose.x + capeSway, pose.y - h * .19, '#123d4b66', Math.max(1, h * .015));
      if (surge > 0) {
        const count = unit(o.ultimate) > 0 ? 8 : 4;
        for (let i = 0; i < count; i++) {
          const a = i * TAU / count + t * .7, x = pose.x + Math.cos(a) * h * .52, y = pose.y - h * .45 + Math.sin(a) * h * .4;
          star(ctx, x, y, h * .035, i % 2 ? '#fff6bd' : c, a);
        }
      }
      sprite(ctx, drawSprite, pose);
      // Oversized epaulettes and two gold stripes identify the captain at gameplay scale.
      for (const side of [-1, 1]) {
        const xx = pose.x + side * h * .255, yy = pose.y - h * .50;
        path(ctx, [[xx - h * .075, yy], [xx - h * .035, yy - h * .025], [xx + h * .065, yy - h * .015], [xx + h * .075, yy + h * .06], [xx - h * .07, yy + h * .06]], '#244c54', '#e4d18d', Math.max(1, h * .01));
        line(ctx, xx - h * .048, yy - h * .002, xx + h * .04, yy - h * .002, c + 'b0', Math.max(1, h * .01));
        line(ctx, xx - h * .037, yy + h * .02, xx + h * .037, yy + h * .02, '#ffe8a1', Math.max(1.3, h * .015));
        line(ctx, xx - h * .037, yy + h * .043, xx + h * .037, yy + h * .043, '#ffe8a1', Math.max(1.3, h * .015));
      }
      if (unit(o.shoot) > .01) {
        const strength = o.reducedMotion ? .4 : unit(o.shoot);
        ellipse(ctx, pose.x + h * .33, pose.y - h * .38, h * .035 * strength, h * .065 * strength, '#fff4b3');
      }
    });
  }

  function followerPose(options) {
    const o = safeOptions(options), index = Math.floor(clamp(o.index, 0, 1000));
    const reduced = !!o.reducedMotion, t = phaseTime(o.time, reduced), phase = index * 2.39996;
    const motion = reduced ? 0 : o.motionScale == null ? 1 : unit(o.motionScale);
    const h = clamp(finite(o.h, 64), 8, 1200) * (.86 + index % 4 * .025);
    const stride = Math.sin(t * (12.4 + index % 3 * .8) + phase), move = reduced ? 0 : clamp(finite(o.move), -1, 1);
    const jump = motion * (o.won ? Math.max(0, Math.sin(t * 6.5 + phase)) * h * .14 : Math.abs(stride) * h * .038);
    return {
      x: finite(o.x) + Math.sin(t * 2.8 + phase) * h * .014 * motion,
      y: finite(o.y) - jump, h, rotation: (move * .055 + stride * .035) * motion,
      hero: heroIndex(o.hero), back: o.back == null ? !o.won : !!o.back
    };
  }

  function drawFollower(ctx, options, drawSprite) {
    const o = safeOptions(options), pose = followerPose(o), h = pose.h, index = Math.floor(clamp(o.index, 0, 1000));
    const c = HERO_COLORS[pose.hero], dash = o.reducedMotion ? 0 : unit(o.dash), move = clamp(finite(o.move), -1, 1);
    return withContext(ctx, () => {
      ellipse(ctx, finite(o.x), finite(o.y) + h * .02, h * .29, h * .09, '#0b213b33');
      if (dash > 0) for (let i = 0; i < 2; i++) line(ctx, pose.x - move * h * (.45 + i * .15), pose.y - h * (.3 + i * .13), pose.x - move * h * .1, pose.y - h * (.3 + i * .13), c + '99', Math.max(1, h * .025));
      sprite(ctx, drawSprite, pose);
      // Recruits wear one compact band, never the captain's cape or rank plates.
      const xx = pose.x + (index % 2 ? -1 : 1) * h * .255, yy = pose.y - h * .45;
      round(ctx, xx - h * .055, yy, h * .11, h * .055, h * .018, '#183949', c, Math.max(.8, h * .012));
      if (index % 4 === 0) ellipse(ctx, xx, yy + h * .025, h * .015, h * .015, '#fff5ca');
      // Silhouette-readable jobs: Ramen scouts carry a cyan antenna, Bing Bong guards wear gold armour tabs.
      if (pose.hero === 0) {
        line(ctx, xx, yy, xx + (index % 2 ? -1 : 1) * h * .055, yy - h * .09, '#dffff8', Math.max(1, h * .014));
        ellipse(ctx, xx + (index % 2 ? -1 : 1) * h * .055, yy - h * .09, h * .018, h * .018, c);
      } else {
        round(ctx, pose.x - h * .23, pose.y - h * .42, h * .13, h * .1, h * .025, '#72552f', '#ffe4a1', Math.max(1, h * .012));
        line(ctx, pose.x - h * .195, pose.y - h * .39, pose.x - h * .135, pose.y - h * .39, c, Math.max(1, h * .014));
      }
    });
  }

  function bossPose(options) {
    const o = safeOptions(options), reduced = !!o.reducedMotion, t = phaseTime(o.time, reduced);
    const stage = finite(o.stage, 1) >= 2 ? 2 : 1, arrival = o.entrance == null || reduced ? 1 : ease(o.entrance);
    const phaseBlend = stage === 2 ? (o.phaseTransition == null || reduced ? 1 : ease(o.phaseTransition)) : 0;
    const h = clamp(finite(o.h, 170), 12, 1800) * (1 + phaseBlend * .045) * (.78 + arrival * .22);
    const recoil = reduced ? 0 : unit(o.hit) * h * .035 - unit(o.shot) * h * .025;
    return { x: finite(o.x), y: finite(o.y) + Math.sin(t * 2.4) * h * .025 - (1 - arrival) * h * .35 + recoil,
      h, rotation: reduced ? 0 : Math.sin(t * 1.3) * .018 + Math.sin(t * 32) * unit(o.hit) * .022,
      kind: String(o.kind || 'guardian'), chapter: Math.floor(clamp(finite(o.chapter, 1), 1, 6)), stage, back: false };
  }

  function drawBoss(ctx, options, drawSprite) {
    const o = safeOptions(options), pose = bossPose(o), h = pose.h, t = phaseTime(o.time, o.reducedMotion);
    const rage = pose.stage === 2, c = rage ? '#ffa1ba' : BOSS_COLORS[pose.chapter - 1];
    const hp = o.hpRatio == null ? 1 : unit(o.hpRatio), rotation = t * (rage ? .35 : .16);
    const phaseBlend = rage ? (o.phaseTransition == null || o.reducedMotion ? 1 : ease(o.phaseTransition)) : 0;
    const center = pose.y - h * .49, expansion = 1 + phaseBlend * .12, shot = o.reducedMotion ? 0 : unit(o.shot);
    return withContext(ctx, () => {
      ellipse(ctx, pose.x, finite(o.y) + h * .06, h * .57, h * .12, '#061c3c66');
      // Mechanical halo: rotor, separate armor sectors and visible reactor bearings.
      ring(ctx, pose.x, center, h * .60 * expansion, h * .48, '#163c59bb', h * .08);
      ring(ctx, pose.x, center, h * .60 * expansion, h * .48, c + 'aa', h * .012);
      ring(ctx, pose.x, center, h * .49 * expansion, h * .40, '#e2fbff66', h * .008);
      const sectors = rage ? 8 : 6;
      for (let i = 0; i < sectors; i++) {
        const a = rotation + i * TAU / sectors, xx = pose.x + Math.cos(a) * h * .60 * expansion, yy = center + Math.sin(a) * h * .48;
        withContext(ctx, () => {
          ctx.translate(xx, yy); ctx.rotate(a + Math.PI / 2);
          path(ctx, [[-h * .075, -h * .03], [h * .075, -h * .03], [h * .09, h * .025], [-h * .09, h * .025]], '#345574', '#a8cbd9', h * .009);
          line(ctx, -h * .045, -h * .009, h * .045, -h * .009, c, h * .014);
        });
      }
      // Hinged arms extend in phase two; muzzle recoil is separate from the torso.
      for (const side of [-1, 1]) {
        const xx = pose.x + side * h * (.46 + phaseBlend * .09), yy = center + h * .12;
        const armSwing = o.reducedMotion ? 0 : Math.sin(t * 1.9 + side) * .07;
        line(ctx, pose.x + side * h * .28, center + h * .07, xx, yy, '#a6c4da', h * .065);
        withContext(ctx, () => {
          ctx.translate(xx, yy); ctx.rotate(side * (.09 + armSwing));
          const recoil = shot * h * .045;
          round(ctx, -h * .105, -h * .09 - recoil, h * .21, h * .23, h * .035, '#29425d', '#a9d7e5', h * .012);
          round(ctx, -h * .064, -h * .06 - recoil, h * .128, h * .13, h * .018, '#18334b', c, h * .012);
          for (let i = 0; i < 3; i++) line(ctx, -h * .035, -h * .032 + i * h * .027 - recoil, h * .035, -h * .032 + i * h * .027 - recoil, c, h * .009);
          ellipse(ctx, 0, h * .15 - recoil, h * .055, h * .018, '#132a41');
          const engine = o.reducedMotion ? .055 : .055 + (1 + Math.sin(t * 19 + side)) * .018 + (rage ? .035 : 0);
          path(ctx, [[-h * .055, h * .17], [h * .055, h * .17], [h * .018, h * (.17 + engine)], [0, h * (.20 + engine)], [-h * .025, h * (.18 + engine)]], c + 'aa');
          path(ctx, [[-h * .025, h * .17], [h * .025, h * .17], [0, h * (.18 + engine * .7)]], '#f0ffed');
          if (shot > .03) { ellipse(ctx, 0, h * .20, h * .075 * shot, h * .10 * shot, '#ffe9acbb'); star(ctx, 0, h * .20, h * .075 * shot, '#fffbe8', t); }
        });
      }
      if (rage) {
        for (const side of [-1, 1]) {
          const xx = pose.x + side * h * .30, yy = pose.y - h * .67;
          path(ctx, [[xx, yy], [xx + side * h * .17 * phaseBlend, yy - h * .065], [xx + side * h * .14 * phaseBlend, yy + h * .13]], '#31536b', c, h * .011);
        }
      }
      sprite(ctx, drawSprite, pose);
      // Keep the detailed atlas face/reactor untouched: only a thin external core ring.
      const coreX = pose.x, coreY = pose.y - h * .38;
      ring(ctx, coreX, coreY, h * .041, h * .041, c + 'aa', h * .009);
      if (hp < .5) for (let i = 0; i < (hp < .22 ? 5 : 3); i++) {
        const angle = i * 2.4 + pose.chapter, xx = pose.x + Math.sin(angle) * h * .25, yy = pose.y - h * (.25 + i % 3 * .17);
        line(ctx, xx - h * .025, yy - h * .025, xx + h * .012, yy, '#ffe6aa', h * .012);
        line(ctx, xx + h * .012, yy, xx - h * .008, yy + h * .025, '#fff8d9', h * .009);
      }
      if (unit(o.hit) > 0 && !o.reducedMotion) {
        const hit = unit(o.hit), flashRadius = h * (.10 + (1 - hit) * .14);
        ring(ctx, coreX, coreY, flashRadius, flashRadius, '#fff7e6cc', h * .018);
        for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + t * .04; line(ctx, coreX + Math.cos(a) * flashRadius, coreY + Math.sin(a) * flashRadius, coreX + Math.cos(a) * flashRadius * 1.5, coreY + Math.sin(a) * flashRadius * 1.5, i % 2 ? '#ffdf79' : '#a7fff2', Math.max(1, h * .013 * hit)); }
      }
    });
  }

  function victoryFrame(options) {
    const o = safeOptions(options), reduced = !!o.reducedMotion, elapsed = Math.max(0, finite(o.time));
    const archive = o.presentation === 'archive';
    const duration = reduced ? REDUCED_VICTORY_DURATION : VICTORY_DURATION;
    const t = reduced ? VICTORY_DURATION : elapsed;
    const stars = Math.floor(clamp(finite(o.stars, 3), 0, 3));
    return Object.freeze({
      duration, elapsed, progress: unit(elapsed / duration), done: elapsed >= duration,
      phase: t < .55 ? 'breakthrough' : t < 1.65 ? 'celebration' : 'commendation',
      veil: reduced ? .9 : ease((t - .28) / .75) * .9,
      entrance: reduced ? 1 : ease((t - .4) / .65),
      stamp: reduced ? 1 : ease((t - 1.55) / .28),
      starsVisible: reduced ? stars : Math.min(stars, Math.max(0, Math.floor((t - 1.8) / .24) + 1)),
      archiveReady: archive && (reduced || elapsed >= ARCHIVE_REVEAL_TIME),
      archiveProgress: archive ? reduced ? 1 : ease((elapsed - ARCHIVE_REVEAL_TIME) / (ARCHIVE_SETTLE_TIME - ARCHIVE_REVEAL_TIME)) : 0,
      archiveSettled: archive && (reduced || elapsed >= ARCHIVE_SETTLE_TIME)
    });
  }

  function drawVictory(ctx, options, drawSprite) {
    const o = safeOptions(options), frame = victoryFrame(o), w = clamp(finite(o.width, 600), 160, 8192), h = clamp(finite(o.height, 800), 240, 8192);
    const scale = Math.min(w / 600, h / 800), cx = w / 2, cy = h * .43;
    const archive = o.presentation === 'archive', elapsed = Math.max(0, finite(o.time));
    // Archive mode stays on the same screen: the DOM owns rewards and readable story.
    // Capping renderer time makes the settled background cacheable by the caller.
    const t = archive ? Math.min(elapsed, ARCHIVE_SETTLE_TIME) : elapsed;
    const reduced = !!o.reducedMotion, hero = heroIndex(o.hero), color = HERO_COLORS[hero];
    const partyScale = 1 - frame.archiveProgress * .45, motionScale = 1 - frame.archiveProgress;
    return withContext(ctx, () => {
      if (!reduced && t < 1.05) {
        const burst = unit(t / 1.05), radius = 24 + burst * Math.max(w, h) * .72;
        ctx.globalAlpha = (1 - burst) * .9;
        ring(ctx, cx, h * .37, radius, radius * .65, '#fff4bd', (1 - burst) * 19 * scale + 1);
        for (let i = 0; i < 20; i++) {
          const a = i * TAU / 20, rr = radius * (.65 + i % 3 * .08), xx = cx + Math.cos(a) * rr, yy = h * .37 + Math.sin(a) * rr * .65;
          line(ctx, xx, yy, xx + Math.cos(a) * 27 * scale, yy + Math.sin(a) * 27 * scale, i % 2 ? color : '#fff4bd', 3 * scale);
        }
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = '#0b2641'; ctx.globalAlpha = frame.veil; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
      if (frame.entrance <= 0) return;
      // Restrained radial rays frame the victory party without full-screen flashing.
      withContext(ctx, () => {
        ctx.globalAlpha = frame.entrance * .13;
        const spin = reduced ? 0 : t * .07;
        for (let i = 0; i < 12; i++) {
          const a = i * TAU / 12 + spin, reach = Math.max(w, h);
          path(ctx, [[cx, cy], [cx + Math.cos(a) * reach, cy + Math.sin(a) * reach], [cx + Math.cos(a + .15) * reach, cy + Math.sin(a + .15) * reach]], i % 2 ? '#81ddea' : '#ffdb86');
        }
      });
      if (!reduced && !frame.archiveSettled) for (let i = 0; i < 28; i++) {
        const spread = ((i * 173.71) % 1), xx = w * (.06 + spread * .88) + Math.sin(t * 1.4 + i) * 12 * scale;
        const yy = ((i * 61.3 + Math.max(0, t - .4) * (38 + i % 5 * 8)) % (h + 30)) - 15;
        withContext(ctx, () => { ctx.globalAlpha *= 1 - frame.archiveProgress; ctx.translate(xx, yy); ctx.rotate(i + t * (i % 2 ? 1 : -1)); round(ctx, -3 * scale, -5 * scale, 6 * scale, 10 * scale, scale, [color, '#ffcf77', '#edb4ff', '#f7fff4'][i % 4]); });
      }
      const floor = h * (.60 + frame.archiveProgress * .29) + (1 - frame.entrance) * 90 * scale;
      withContext(ctx, () => {
        ctx.globalAlpha = frame.entrance;
        ellipse(ctx, cx, floor + 6 * scale, 171 * scale * partyScale, 22 * scale * partyScale, '#04172a88');
        for (let i = 0; i < 4; i++) drawFollower(ctx, { x: cx + [-136, -77, 77, 136][i] * scale * partyScale, y: floor - (i % 3 ? 0 : 10) * scale * partyScale, h: (i % 3 ? 107 : 91) * scale * partyScale, hero: (hero + i + 1) % 2, index: i + 1, time: t, won: true, reducedMotion: reduced, motionScale }, drawSprite);
        drawCaptain(ctx, { x: cx, y: floor + 2 * scale * partyScale, h: 142 * scale * partyScale, hero, time: t, won: true, reducedMotion: reduced, motionScale }, drawSprite);
      });
      if (!archive && frame.stamp > 0) withContext(ctx, () => {
        const pop = reduced ? 1 : 1 + (1 - frame.stamp) * .18;
        ctx.translate(cx, h * .225); ctx.scale(pop, pop); ctx.globalAlpha = frame.stamp;
        round(ctx, -181 * scale, -42 * scale, 362 * scale, 84 * scale, 16 * scale, '#123450ee', '#f8d588', 2 * scale);
        label(ctx, '任务完成', 0, -4 * scale, 40 * scale, '#fff3cb', 900);
        const chapter = Math.floor(clamp(finite(o.chapter, 1), 1, 99));
        label(ctx, `第 ${chapter} 章 · 信号已恢复`, 0, 27 * scale, 13 * scale, '#a9e6e9', 600);
      });
      if (!archive && frame.stamp > 0) {
        for (let i = 0; i < 3; i++) {
          const active = i < frame.starsVisible, appeared = reduced ? 1 : ease((t - 1.8 - i * .24) / .18);
          const radius = (active ? 27 + (1 - appeared) * 8 : 24) * scale;
          star(ctx, cx + (i - 1) * 72 * scale, h * .72, radius, active ? '#ffdc7d' : '#26485c', 0, active ? '#fff6c9' : '#5c7788');
          if (active && !reduced && appeared < 1) ring(ctx, cx + (i - 1) * 72 * scale, h * .72, (32 + appeared * 17) * scale, (32 + appeared * 17) * scale, '#ffe8ae99', 1.5 * scale);
        }
        const rank = /^(S\+|S|A|B|C|D)$/i.test(String(o.rank || '')) ? String(o.rank).toUpperCase() : '';
        label(ctx, rank ? `${rank} 级战术评价` : '小队集结，继续前进', cx, h * .79, 18 * scale, '#f1fff5', 700);
      }
      if (!archive && (t >= .6 || reduced)) label(ctx, '点击画面或按 Enter 跳过', cx, h * .91, 13 * scale, '#c0d9e4', 500);
    });
  }

  return Object.freeze({ VICTORY_DURATION, REDUCED_VICTORY_DURATION, ARCHIVE_REVEAL_TIME, ARCHIVE_SETTLE_TIME, HERO_COLORS, BOSS_COLORS, captainPose, followerPose, bossPose, victoryFrame, drawCaptain, drawFollower, drawBoss, drawVictory });
});
