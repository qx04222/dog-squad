(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DogVFX = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const PALETTE = Object.freeze({
    allyCyan: '#62f4e6',
    allyCyanHot: '#e7fffb',
    allyGold: '#ffca57',
    allyGoldHot: '#fff6bd',
    allyPlasma: '#e77cff',
    enemyPink: '#ff477e',
    enemyRed: '#ff6b5f',
    enemyHot: '#fff0e5',
    armor: '#253e59',
    armorLight: '#84a9bc',
    shield: '#85ffe1',
    ink: '#10273d'
  });

  const KIND_BASE_HP = Object.freeze({
    runner: 26,
    shooter: 38,
    repair: 42,
    jelly: 44,
    tank: 82,
    guardian: 94,
    boss: 9000
  });

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value, min)));
  const positive = (value, fallback = 1) => Math.max(.001, finite(value, fallback));
  const healthRatio = entity => clamp(finite(entity && entity.hp, 1) / positive(entity && entity.maxHp, 1), 0, 1);
  const guardRatio = entity => clamp(finite(entity && entity.guardHp, 0) / positive(entity && (entity.maxGuardHp || entity.guardHp), 1), 0, 1);
  const motionTime = (time, reducedMotion) => reducedMotion ? 0 : finite(time, 0);
  const seedOf = value => {
    const string = String(value == null ? '' : value);
    let hash = 2166136261;
    for (let i = 0; i < string.length; i++) hash = Math.imul(hash ^ string.charCodeAt(i), 16777619);
    return hash >>> 0;
  };
  const unit = (seed, index) => {
    let value = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    value ^= value >>> 16; value = Math.imul(value, 0x7feb352d); value ^= value >>> 15;
    return (value >>> 0) / 4294967295;
  };

  function withContext(ctx, paint) {
    if (!ctx || typeof ctx.save !== 'function' || typeof ctx.restore !== 'function') return false;
    ctx.save();
    try { paint(); return true; } finally { ctx.restore(); }
  }

  function path(ctx, points, close) {
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1]));
    if (close) ctx.closePath();
  }

  function ellipse(ctx, x, y, rx, ry, rotation = 0) {
    ctx.beginPath();
    ctx.ellipse(finite(x), finite(y), positive(rx), positive(ry), finite(rotation), 0, TAU);
  }

  function rounded(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, width, height, radius);
    else ctx.rect(x, y, width, height);
  }

  function strokeLine(ctx, x1, y1, x2, y2, color, width) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = positive(width); ctx.stroke();
  }

  function polygon(ctx, x, y, radius, sides, rotation) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = rotation + i * TAU / sides;
      const xx = x + Math.cos(angle) * radius, yy = y + Math.sin(angle) * radius;
      i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
    }
    ctx.closePath();
  }

  /** Stable size: maximum health and enemy class affect silhouette, current damage never does. */
  function enemyScale(entity) {
    const e = entity || {};
    const kind = String(e.kind || (e.boss ? 'boss' : 'jelly')).toLowerCase();
    const base = KIND_BASE_HP[kind] || (e.boss ? KIND_BASE_HP.boss : KIND_BASE_HP.jelly);
    const hpFactor = Math.pow(positive(e.maxHp, base) / base, .18);
    const classFactor = kind === 'tank' ? 1.13 : kind === 'guardian' ? 1.1 : kind === 'runner' ? .9 : kind === 'repair' ? .96 : 1;
    const eliteFactor = e.elite ? 1.08 : 1;
    const explicit = Number.isFinite(e.visualScale) ? clamp(e.visualScale, .82, 1.68) : null;
    const tierFactor = e.sizeTier === 'heavy' ? 1.1 : e.sizeTier === 'large' ? 1.06 : e.sizeTier === 'small' ? .92 : 1;
    return explicit == null ? clamp(hpFactor * classFactor * eliteFactor * tierFactor, .82, e.boss ? 1.68 : 1.48) : explicit;
  }

  function healthBand(entity) {
    const ratio = healthRatio(entity);
    return ratio <= .22 ? 'critical' : ratio <= .52 ? 'damaged' : ratio < .86 ? 'scratched' : 'intact';
  }

  function projectileStyle(bullet) {
    const b = bullet || {};
    const friendly = b.friendly !== false;
    let kind = String(b.kind || b.type || b.projectile || '').toLowerCase();
    kind = ({pulse:'normal',overdrive:'plasma',armorburst:'burst',hostile:'enemy'})[kind] || kind;
    if (!friendly) kind = 'enemy';
    else if (!['rapid','burst','pierce','plasma'].includes(kind)) kind = finite(b.pierce, 0) > 0 ? 'pierce' : b.charged || b.overdrive ? 'plasma' : finite(b.burst, 0) > 0 ? 'burst' : kind || 'normal';
    if (!['normal', 'rapid', 'burst', 'pierce', 'plasma', 'enemy'].includes(kind)) kind = friendly ? 'normal' : 'enemy';
    const styles = {
      normal: { core: PALETTE.allyGoldHot, mid: PALETTE.allyGold, edge: '#e98e31', tail: '#ffd87388', shape: 'bolt' },
      rapid: { core: '#f1ffff', mid: PALETTE.allyCyan, edge: '#1aaabb', tail: '#5effe589', shape: 'needle' },
      burst: { core: '#fff9d1', mid: '#ffad4e', edge: '#ee6f38', tail: '#ffbb5888', shape: 'chevron' },
      pierce: { core: '#ffffff', mid: '#68e9ff', edge: '#287de5', tail: '#66dfff96', shape: 'lance' },
      plasma: { core: '#fff1ff', mid: PALETTE.allyPlasma, edge: '#8852f5', tail: '#ed83ff90', shape: 'orb' },
      enemy: { core: PALETTE.enemyHot, mid: PALETTE.enemyPink, edge: '#a91d59', tail: '#ff477e78', shape: 'hazard' }
    };
    return Object.freeze({ kind, friendly, ...styles[kind] });
  }

  function drawEnemyDetails(ctx, entity, options) {
    const e = entity || {}, o = options || {};
    const x = finite(o.x), y = finite(o.y), s = positive(o.s), time = motionTime(o.time, o.reducedMotion);
    const scale = enemyScale(e), radius = positive(o.radius, finite(e.r, 24) * s * scale);
    const height = positive(o.height, radius * 2.5), ratio = healthRatio(e), band = healthBand(e);
    const seed = seedOf(e.id == null ? e.kind : e.id), elite = Boolean(e.elite);
    return withContext(ctx, () => {
      ctx.translate(x, y);

      // Ground contact and a slim cyan rim visually anchor the sprite without hiding its face.
      ellipse(ctx, 0, 5 * s, radius * .9, radius * .25); ctx.fillStyle = '#061b2940'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, -height * .43, radius * .88, Math.PI * 1.07, Math.PI * 1.93);
      ctx.strokeStyle = band === 'critical' ? '#ff5d72' : '#5de9de80'; ctx.lineWidth = Math.max(1, 1.5 * s); ctx.stroke();

      // Segmented shoulder armour communicates class/weight even over a detailed sprite.
      for (const side of [-1, 1]) {
        const plateX = side * radius * .68;
        path(ctx, [[plateX - side * radius * .05, -height * .68], [plateX + side * radius * .38, -height * .58], [plateX + side * radius * .3, -height * .39], [plateX - side * radius * .08, -height * .43]], true);
        ctx.fillStyle = elite ? '#ffbd48d9' : '#335a70c9'; ctx.fill();
        ctx.strokeStyle = elite ? '#fff0a8' : '#8ac9d4'; ctx.lineWidth = Math.max(1, s); ctx.stroke();
        strokeLine(ctx, plateX, -height * .61, plateX + side * radius * .18, -height * .53, elite ? '#fff5c6' : '#a7eced99', s);
      }

      // Central reactor and elite double crown create useful targets/readability at small sizes.
      const pulse = o.reducedMotion ? 1 : 1 + Math.sin(time * 5 + seed % 17) * .08;
      polygon(ctx, 0, -height * .48, radius * .18 * pulse, 6, Math.PI / 6);
      ctx.fillStyle = band === 'critical' ? PALETTE.enemyPink : '#6ff6db'; ctx.fill();
      ctx.strokeStyle = '#f3fffb'; ctx.lineWidth = Math.max(1, 1.1 * s); ctx.stroke();
      if (elite) {
        for (const side of [-1, 1]) {
          path(ctx, [[side * radius * .12, -height - 4 * s], [side * radius * .36, -height - 12 * s], [side * radius * .5, -height + 1 * s], [side * radius * .3, -height + 6 * s]], true);
          ctx.fillStyle = '#ffc94f'; ctx.fill(); ctx.strokeStyle = '#fff1a8'; ctx.stroke();
        }
      }

      if (e.eliteVariant === 'overclocked') {
        ctx.beginPath(); ctx.arc(0, -height * .48, radius * .34, time * 2.2, time * 2.2 + Math.PI * 1.4);
        ctx.strokeStyle = '#ff6d8d'; ctx.lineWidth = Math.max(1, 2.2 * s); ctx.stroke();
      } else if (e.eliteVariant === 'fortified') {
        for (const side of [-1, 1]) {
          rounded(ctx, side * radius * .22 - radius * .18, -height * .75, radius * .36, height * .42, 3 * s);
          ctx.fillStyle = '#203b52aa'; ctx.fill(); ctx.strokeStyle = '#ffd06b'; ctx.lineWidth = Math.max(1, 1.4 * s); ctx.stroke();
        }
      }

      // Damage is structural: cracks, missing armour and exposed hot circuitry at clear thresholds.
      if (band !== 'intact') {
        const crackCount = band === 'critical' ? 5 : band === 'damaged' ? 3 : 1;
        ctx.lineCap = 'round';
        for (let i = 0; i < crackCount; i++) {
          const side = unit(seed, i) > .5 ? 1 : -1;
          const yy = -height * (.34 + unit(seed, i + 7) * .38);
          const xx = side * radius * (.1 + unit(seed, i + 13) * .33);
          path(ctx, [[xx, yy], [xx + side * radius * .17, yy + 4 * s], [xx + side * radius * .09, yy + 11 * s], [xx + side * radius * .25, yy + 16 * s]], false);
          ctx.strokeStyle = band === 'critical' ? '#ffbd70' : '#112e43c9'; ctx.lineWidth = Math.max(1, 1.6 * s); ctx.stroke();
        }
        if (ratio <= .52) {
          const side = seed % 2 ? 1 : -1;
          path(ctx, [[side * radius * .65, -height * .65], [side * radius * 1.02, -height * .56], [side * radius * .82, -height * .37]], true);
          ctx.fillStyle = '#122c3de8'; ctx.fill(); ctx.strokeStyle = '#ff8b5b'; ctx.stroke();
        }
      }

      if (finite(e.guardHp, 0) > 0) {
        const spin = time * .45;
        ctx.setLineDash([Math.max(3, 8 * s), Math.max(2, 5 * s)]);
        ctx.beginPath(); ctx.ellipse(0, -height * .49, radius * 1.16, height * .53, 0, spin, spin + TAU);
        ctx.strokeStyle = PALETTE.shield; ctx.lineWidth = Math.max(1.4, 2.4 * s); ctx.stroke(); ctx.setLineDash([]);
        for (let i = 0; i < 3; i++) {
          const angle = spin + i * TAU / 3;
          polygon(ctx, Math.cos(angle) * radius * 1.16, -height * .49 + Math.sin(angle) * height * .53, 3.5 * s, 4, angle);
          ctx.fillStyle = '#eafffa'; ctx.fill();
        }
      }

      if (band === 'critical') {
        for (let i = 0; i < 3; i++) {
          const flicker = o.reducedMotion ? .5 : (time * (1.4 + i * .3) + unit(seed, i) * 2) % 1;
          const xx = (unit(seed, i + 4) - .5) * radius * 1.2;
          const yy = -height * (.35 + unit(seed, i + 10) * .45) - flicker * 10 * s;
          strokeLine(ctx, xx, yy, xx + (i - 1) * 4 * s, yy - 7 * s, '#ffdb68', Math.max(1, 1.5 * s));
        }
      }
    });
  }

  function drawBossDetails(ctx, boss, options) {
    const b = boss || {}, o = options || {}, x = finite(o.x, b.x), y = finite(o.y, b.y), s = positive(o.s);
    const time = motionTime(o.time, o.reducedMotion), ratio = healthRatio(b), stage = Math.max(1, Math.floor(finite(b.stage, 1)));
    const radius = positive(o.radius, 86 * s), height = positive(o.height, 150 * s), seed = seedOf(b.id || b.kind || 'boss');
    const charging = clamp(finite(b.charge, b.shotCharge), 0, 1);
    return withContext(ctx, () => {
      ctx.translate(x, y);

      // Thin external armour rails frame the existing boss sprite instead of painting over it.
      for (const side of [-1, 1]) {
        path(ctx, [
          [side * radius * .7, -height * .8], [side * radius * 1.02, -height * .62],
          [side * radius * 1.07, -height * .25], [side * radius * .82, -height * .1]
        ], false);
        ctx.strokeStyle = stage > 1 ? '#ff728f' : '#78f3e2'; ctx.lineWidth = Math.max(2, 5 * s); ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const yy = -height * (.66 - i * .2);
          polygon(ctx, side * radius * (.9 + i * .035), yy, 7 * s, 6, Math.PI / 6);
          ctx.fillStyle = ratio < .35 && i === 1 ? '#142b3c' : '#466d82'; ctx.fill();
          ctx.strokeStyle = stage > 1 ? '#ffae75' : '#bafff2'; ctx.lineWidth = Math.max(1, 1.2 * s); ctx.stroke();
        }
      }

      // Triple reactor rings leave the character silhouette and face visible.
      const reactorY = -height * .46, pulse = o.reducedMotion ? 1 : 1 + Math.sin(time * 4.5) * .06;
      [1, .68, .38].forEach((factor, index) => {
        ctx.beginPath();
        ctx.arc(0, reactorY, radius * .24 * factor * pulse, time * (index % 2 ? -.8 : .6), time * (index % 2 ? -.8 : .6) + Math.PI * 1.55);
        ctx.strokeStyle = index === 2 ? '#fffbd7' : stage > 1 ? (index ? '#ffae69' : '#ff557f') : (index ? '#ffd464' : '#63f5e1');
        ctx.lineWidth = Math.max(1, (4 - index) * s); ctx.stroke();
      });

      // Current HP drives visible breakage, never scale or hit box.
      if (ratio < .68) {
        const count = ratio < .28 ? 5 : 3;
        for (let i = 0; i < count; i++) {
          const side = unit(seed, i) > .5 ? 1 : -1, yy = -height * (.22 + unit(seed, i + 8) * .52);
          const xx = side * radius * (.32 + unit(seed, i + 16) * .35);
          path(ctx, [[xx, yy], [xx + side * 9 * s, yy + 7 * s], [xx + side * 3 * s, yy + 15 * s], [xx + side * 14 * s, yy + 22 * s]], false);
          ctx.strokeStyle = ratio < .28 ? '#ffbc62' : '#173247'; ctx.lineWidth = Math.max(1.2, 2.2 * s); ctx.stroke();
        }
      }
      if (stage > 1) {
        ctx.setLineDash([9 * s, 7 * s]);
        ctx.beginPath(); ctx.ellipse(0, -height * .45, radius * 1.2, height * .58, 0, time * .35, time * .35 + TAU);
        ctx.strokeStyle = '#ff5d858c'; ctx.lineWidth = Math.max(1.5, 2.6 * s); ctx.stroke(); ctx.setLineDash([]);
      }

      // Muzzle charge is compact and does not overlap road beam/hazard telegraphs.
      if (charging > 0) {
        for (const side of [-1, 1]) {
          const mx = side * radius * .92, my = -height * .18;
          ctx.globalAlpha = .45 + charging * .45;
          ctx.beginPath(); ctx.arc(mx, my, (5 + charging * 11) * s, 0, TAU);
          ctx.strokeStyle = '#ff6b92'; ctx.lineWidth = Math.max(1, 2.5 * s); ctx.stroke();
          ellipse(ctx, mx, my, (2 + charging * 5) * s, (2 + charging * 5) * s); ctx.fillStyle = '#fff2dd'; ctx.fill();
        }
      }
    });
  }

  function drawDamageNumber(ctx, impact, options) {
    const e = impact || {};
    if (!Number.isFinite(e.damage)) return false;
    const o = options || {}, x = finite(o.x, e.x), y = finite(o.y, e.y), s = positive(o.s), progress = effectProgress(e);
    const value = Math.max(0, Math.round(e.damage)), critical = e.kind === 'critical' || e.critical;
    if (!value) return false;
    return withContext(ctx, () => {
      const rise = (8 + progress * 24) * s;
      ctx.globalAlpha = clamp(1 - Math.max(0, progress - .55) / .45, 0, 1);
      ctx.font = `${critical ? 900 : 800} ${Math.round((critical ? 20 : 15) * s)}px "Avenir Next", "PingFang SC", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, 4 * s); ctx.strokeStyle = '#10273dde'; ctx.strokeText(String(value), x, y - rise);
      ctx.fillStyle = critical ? '#ffe067' : e.friendly === false ? '#ff7b91' : '#efffff'; ctx.fillText(String(value), x, y - rise);
    });
  }

  function drawBullet(ctx, bullet, options) {
    const b = bullet || {}, o = options || {}, style = projectileStyle(b);
    const compact = o.compact === true && style.friendly;
    const x = finite(o.x, b.x), y = finite(o.y, b.y), s = positive(o.s), time = motionTime(o.time, o.reducedMotion);
    const radius = clamp(positive(o.radius, finite(b.r, 4) * s), 2, 18);
    const vx = finite(b.vx), vy = finite(b.vy, style.friendly ? -1 : 1);
    const angle = Math.atan2(vy, vx) + Math.PI / 2;
    const speed = Math.hypot(vx, vy), tail = clamp(speed * .026 * s, radius * 2.4, radius * (style.kind === 'pierce' ? 8 : 5.5));
    return withContext(ctx, () => {
      ctx.translate(x, y); ctx.rotate(angle); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // Three bounded trail strokes read as speed while avoiding per-projectile blur/shadow costs.
      const lanes = compact ? [] : style.kind === 'burst' ? [-1, 0, 1] : [0];
      lanes.forEach((lane, index) => {
        ctx.globalAlpha = .34 + index * .1;
        strokeLine(ctx, lane * radius * .72, radius, lane * radius * 1.35, radius + tail * (1 - Math.abs(lane) * .16), style.tail, Math.max(1, radius * (.7 - Math.abs(lane) * .16)));
      });
      ctx.globalAlpha = 1;
      if (style.shape === 'needle' || style.shape === 'lance') {
        path(ctx, [[0, -radius * 2], [radius * .64, radius * .45], [0, radius * 1.25], [-radius * .64, radius * .45]], true);
      } else if (style.shape === 'chevron') {
        path(ctx, [[0, -radius * 1.35], [radius * 1.15, radius * .7], [0, radius * .18], [-radius * 1.15, radius * .7]], true);
      } else if (style.shape === 'hazard') {
        polygon(ctx, 0, 0, radius * 1.15, 6, time * 2.5);
      } else if (style.shape === 'orb') {
        ellipse(ctx, 0, 0, radius * 1.35, radius * 1.55);
      } else {
        path(ctx, [[0, -radius * 1.5], [radius, 0], [radius * .45, radius * 1.2], [-radius * .45, radius * 1.2], [-radius, 0]], true);
      }
      ctx.fillStyle = style.mid; ctx.fill(); ctx.strokeStyle = style.edge; ctx.lineWidth = Math.max(1, radius * .23); ctx.stroke();
      if (!compact) { ellipse(ctx, -radius * .24, -radius * .35, radius * .3, radius * .52, -.35); ctx.fillStyle = style.core; ctx.fill(); }
      if (style.kind === 'plasma') {
        ctx.globalAlpha = .45; ctx.lineWidth = Math.max(1, radius * .18); ctx.strokeStyle = '#ffb0ff';
        ctx.beginPath(); ctx.arc(0, 0, radius * 1.85, time * 3, time * 3 + Math.PI * 1.4); ctx.stroke();
      }
      if (style.kind === 'enemy') {
        path(ctx, [[-radius * 1.55, 0], [-radius * 1.05, -radius * .32], [-radius * .85, radius * .28]], false);
        ctx.strokeStyle = '#ff718c'; ctx.lineWidth = Math.max(1, radius * .24); ctx.stroke();
        path(ctx, [[radius * 1.55, 0], [radius * 1.05, -radius * .32], [radius * .85, radius * .28]], false); ctx.stroke();
      }
    });
  }

  function effectProgress(effect) {
    const e = effect || {};
    if (Number.isFinite(e.progress)) return clamp(e.progress, 0, 1);
    if (Number.isFinite(e.age) && Number.isFinite(e.duration)) return clamp(e.age / positive(e.duration), 0, 1);
    if (Number.isFinite(e.life) && Number.isFinite(e.maxLife)) return clamp(1 - e.life / positive(e.maxLife), 0, 1);
    return .35;
  }

  function drawExplosion(ctx, effect, options) {
    const e = effect || {}, o = options || {}, x = finite(o.x, e.x), y = finite(o.y, e.y), s = positive(o.s);
    const progress = effectProgress(e), radius = positive(o.radius, finite(e.radius, 54) * s), seed = seedOf(e.id == null ? `${e.x}:${e.y}:${e.color}` : e.id);
    const color = String(e.color || PALETTE.allyGold), reduced = Boolean(o.reducedMotion);
    return withContext(ctx, () => {
      ctx.translate(x, y); ctx.lineCap = 'round';
      const ring = radius * (.2 + progress * 1.05);
      ctx.globalAlpha = (1 - progress) * .8;
      ctx.beginPath(); ctx.arc(0, 0, ring, 0, TAU); ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, (1 - progress) * 10 * s); ctx.stroke();
      ctx.globalAlpha = Math.max(0, .75 - progress * 1.4);
      const core = radius * (.42 + progress * .25);
      const gradient = typeof ctx.createRadialGradient === 'function' ? ctx.createRadialGradient(-core * .15, -core * .2, 1, 0, 0, core) : null;
      if (gradient) { gradient.addColorStop(0, '#fffdf0'); gradient.addColorStop(.35, '#ffe26f'); gradient.addColorStop(1, color + '00'); }
      ellipse(ctx, 0, 0, core, core); ctx.fillStyle = gradient || '#fff4a8'; ctx.fill();
      const pieces = reduced ? 4 : 8;
      for (let i = 0; i < pieces; i++) {
        const angle = unit(seed, i) * TAU, distance = radius * progress * (.5 + unit(seed, i + 11) * .75);
        const px = Math.cos(angle) * distance, py = Math.sin(angle) * distance;
        ctx.globalAlpha = (1 - progress) * (.5 + unit(seed, i + 7) * .4);
        ctx.save(); ctx.translate(px, py); ctx.rotate(angle + progress * 2);
        path(ctx, [[-4 * s, 2 * s], [0, -8 * s], [4 * s, 3 * s]], true); ctx.fillStyle = i % 2 ? color : '#ffe7a1'; ctx.fill(); ctx.restore();
      }
      // Smoke stays translucent and low contrast so it never obscures incoming hazards.
      ctx.globalAlpha = progress * (1 - progress) * .36;
      for (let i = 0; i < 3; i++) {
        const angle = unit(seed, i + 20) * TAU, distance = radius * progress * .46;
        ellipse(ctx, Math.cos(angle) * distance, Math.sin(angle) * distance - progress * 12 * s, radius * (.16 + i * .035), radius * (.12 + i * .025));
        ctx.fillStyle = i % 2 ? '#253c52' : '#587284'; ctx.fill();
      }
    });
  }

  function drawImpact(ctx, effect, options) {
    const e = effect || {}, o = options || {}, x = finite(o.x, e.x), y = finite(o.y, e.y), s = positive(o.s);
    const source = String(e.source || e.kind || 'pulse'), progress = effectProgress(e), guarded = source === 'shield' || source === 'armorBurst' || e.guarded;
    const critical = source === 'critical' || source === 'orbital' || e.critical;
    const sourceColors = { overdrive: '#ed7bff', armorBurst: '#ffc952', emp: '#61f3e2', nova: '#ff7857', orbital: '#fff1a3', bomb: '#ff8b54' };
    const color = guarded ? PALETTE.shield : critical ? '#ffcc4f' : String(e.color || sourceColors[source] || '#fff0a0');
    return withContext(ctx, () => {
      ctx.translate(x, y); ctx.globalAlpha = 1 - progress; ctx.lineCap = 'round';
      const rays = o.reducedMotion ? 4 : critical ? 10 : 6;
      for (let i = 0; i < rays; i++) {
        const angle = i * TAU / rays + finite(e.angle), inner = (5 + progress * 6) * s, outer = (critical ? 28 : 18) * s * (1 + progress);
        strokeLine(ctx, Math.cos(angle) * inner, Math.sin(angle) * inner, Math.cos(angle) * outer, Math.sin(angle) * outer, color, (critical ? 3 : 2) * s * (1 - progress * .5));
      }
      if (guarded) {
        ctx.beginPath(); ctx.arc(0, 0, (14 + progress * 15) * s, -Math.PI * .8, Math.PI * .8);
        ctx.strokeStyle = PALETTE.shield; ctx.lineWidth = 4 * s * (1 - progress * .5); ctx.stroke();
      } else {
        polygon(ctx, 0, 0, (8 + progress * 8) * s, critical ? 8 : 6, progress); ctx.fillStyle = '#fffbe8'; ctx.fill();
      }
    });
  }

  function drawPickup(ctx, pickup, options) {
    const p = pickup || {}, o = options || {}, x = finite(o.x, p.x), y = finite(o.y, p.y), s = positive(o.s);
    const time = motionTime(o.time, o.reducedMotion), kind = String(p.kind || p.type || 'energy').toLowerCase();
    const colors = { energy: ['#55ead4', '#eafff9'], battery: ['#55ead4', '#eafff9'], shield: ['#62cfff', '#edfaff'], rapid: ['#ffbe4a', '#fff4b0'], repair: ['#7ded91', '#efffe9'], pierce: ['#c27aff', '#fff1ff'], magnet: ['#ff728c', '#fff1e9'], nova: ['#ff6b4c', '#fff0b2'] };
    const color = colors[kind] || colors.energy, bob = o.reducedMotion ? 0 : Math.sin(time * 3 + seedOf(p.id) % 9) * 3 * s;
    return withContext(ctx, () => {
      ctx.translate(x, y + bob); ctx.rotate(o.reducedMotion ? 0 : Math.sin(time * 1.7) * .08);
      polygon(ctx, 0, 0, 18 * s, 6, Math.PI / 6); ctx.fillStyle = PALETTE.ink + 'df'; ctx.fill(); ctx.strokeStyle = color[0]; ctx.lineWidth = 3 * s; ctx.stroke();
      polygon(ctx, 0, 0, 12 * s, 6, Math.PI / 6); ctx.fillStyle = color[0] + '75'; ctx.fill();
      ctx.strokeStyle = color[1]; ctx.fillStyle = color[1]; ctx.lineWidth = 2.3 * s; ctx.lineCap = 'round';
      if (kind === 'repair') { strokeLine(ctx, -6 * s, 0, 6 * s, 0, color[1], 3 * s); strokeLine(ctx, 0, -6 * s, 0, 6 * s, color[1], 3 * s); }
      else if (kind === 'shield') { ctx.beginPath(); ctx.arc(0, -1 * s, 7 * s, Math.PI, 0); ctx.lineTo(5 * s, 5 * s); ctx.lineTo(0, 8 * s); ctx.lineTo(-5 * s, 5 * s); ctx.closePath(); ctx.stroke(); }
      else if (kind === 'rapid') { path(ctx, [[-3 * s, -8 * s], [5 * s, -2 * s], [1 * s, 0], [5 * s, 7 * s], [-6 * s, 1 * s], [-1 * s, -1 * s]], true); ctx.fill(); }
      else if (kind === 'pierce') { path(ctx, [[0, -9 * s], [6 * s, 0], [0, 9 * s], [-6 * s, 0]], true); ctx.fill(); strokeLine(ctx, 0, -7 * s, 0, 7 * s, '#7d4ce8', 1.5 * s); }
      else if (kind === 'nova') { for (let i = 0; i < 8; i++) { const a = i * TAU / 8; strokeLine(ctx, Math.cos(a) * 3 * s, Math.sin(a) * 3 * s, Math.cos(a) * 9 * s, Math.sin(a) * 9 * s, color[1], 2.2 * s); } }
      else if (kind === 'magnet') { ctx.beginPath(); ctx.arc(0, 0, 7 * s, 0, Math.PI); ctx.stroke(); strokeLine(ctx, -7 * s, 0, -7 * s, -5 * s, color[1], 3 * s); strokeLine(ctx, 7 * s, 0, 7 * s, -5 * s, color[1], 3 * s); }
      else { polygon(ctx, 0, 0, 7 * s, kind === 'overdrive' ? 8 : 4, Math.PI / 4); ctx.fill(); }
      ctx.globalAlpha = .42; ctx.beginPath(); ctx.arc(0, 0, 25 * s, time, time + Math.PI * 1.25); ctx.strokeStyle = color[0]; ctx.lineWidth = 2 * s; ctx.stroke();
    });
  }

  function drawSkillEffect(ctx, effect, options) {
    const e = effect || {}, o = options || {}, x = finite(o.x, e.x), y = finite(o.y, e.y), s = positive(o.s);
    const progress = effectProgress(e), kind = String(e.kind || e.type || 'support').toLowerCase(), time = motionTime(o.time, o.reducedMotion);
    if (kind.startsWith('pickup-')) return drawPickup(ctx, { ...e, kind: kind.slice(7) }, { ...o, x, y, s });
    return withContext(ctx, () => {
      ctx.translate(x, y); ctx.globalAlpha = clamp(1 - progress * .82, .12, 1);
      if (kind === 'chainarc') {
        // Six linked nodes read as a chain attack; broken angular segments distinguish it from beams.
        const nodeCount = clamp(Math.round(finite(e.targetCount, 6)), 2, 6), radius = (34 + progress * 28) * s;
        const nodes = [];
        for (let i = 0; i < nodeCount; i++) {
          const angle = -Math.PI * .74 + i * Math.PI * 1.48 / Math.max(1, nodeCount - 1);
          nodes.push([Math.cos(angle) * radius, Math.sin(angle) * radius * .72]);
        }
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (let i = 0; i < nodes.length - 1; i++) {
          const from = nodes[i], to = nodes[i + 1], bend = (i % 2 ? -1 : 1) * 7 * s;
          path(ctx, [from, [(from[0] * 2 + to[0]) / 3 + bend, (from[1] * 2 + to[1]) / 3], [(from[0] + to[0] * 2) / 3 - bend, (from[1] + to[1] * 2) / 3], to], false);
          ctx.strokeStyle = '#4ceee5'; ctx.lineWidth = Math.max(1.5, 4 * s * (1 - progress * .45)); ctx.stroke();
          ctx.strokeStyle = '#f2ffff'; ctx.lineWidth = Math.max(1, 1.35 * s); ctx.stroke();
        }
        for (const [nx, ny] of nodes) {
          polygon(ctx, nx, ny, 6 * s, 6, Math.PI / 6); ctx.fillStyle = '#173d59'; ctx.fill();
          ctx.strokeStyle = '#9ffff6'; ctx.lineWidth = 2 * s; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(0, 0, (18 + progress * 34) * s, 0, TAU); ctx.strokeStyle = '#75f5e055'; ctx.lineWidth = 2 * s; ctx.stroke();
      } else if (kind === 'rescuebeacon') {
        // A stable medical beacon: vertical locator, plus sign and shield arch remain readable with reduced motion.
        const beaconHeight = (82 + progress * 26) * s, arch = (42 + progress * 20) * s;
        ctx.globalAlpha = clamp(1 - progress * .7, .26, 1);
        strokeLine(ctx, 0, -beaconHeight, 0, 9 * s, '#85ffe19a', 13 * s);
        strokeLine(ctx, 0, -beaconHeight, 0, 9 * s, '#f1fff8', 3 * s);
        ctx.beginPath(); ctx.arc(0, 0, arch, Math.PI, TAU); ctx.lineTo(arch * .72, 13 * s); ctx.lineTo(0, 27 * s); ctx.lineTo(-arch * .72, 13 * s); ctx.closePath();
        ctx.fillStyle = '#4ce5be20'; ctx.fill(); ctx.strokeStyle = '#65e9c5'; ctx.lineWidth = 4 * s; ctx.stroke();
        rounded(ctx, -12 * s, -35 * s, 24 * s, 24 * s, 5 * s); ctx.fillStyle = '#183f51'; ctx.fill(); ctx.strokeStyle = '#eafff2'; ctx.lineWidth = 2 * s; ctx.stroke();
        strokeLine(ctx, -6 * s, -23 * s, 6 * s, -23 * s, '#86f3a8', 4 * s); strokeLine(ctx, 0, -29 * s, 0, -17 * s, '#86f3a8', 4 * s);
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.arc(0, -23 * s, (23 + progress * 12) * s, side < 0 ? Math.PI * .55 : -Math.PI * .45, side < 0 ? Math.PI * 1.05 : Math.PI * .05);
          ctx.strokeStyle = '#ffd66c'; ctx.lineWidth = 2.5 * s; ctx.stroke();
        }
      } else if (kind === 'rapidbarrage') {
        // Parallel tracer packets communicate sustained fire without creating persistent projectile objects.
        const lanes = o.reducedMotion ? 5 : 7, angle = finite(e.angle, -Math.PI / 2);
        ctx.rotate(angle + Math.PI / 2); ctx.lineCap = 'round';
        for (let i = 0; i < lanes; i++) {
          const offset = (i - (lanes - 1) / 2) * 11 * s, stagger = (i % 3) * 13 * s;
          const front = -(30 + stagger + progress * 48) * s, back = front + (28 + i % 2 * 9) * s;
          strokeLine(ctx, offset, back, offset, front, i % 2 ? '#58eee1' : '#ffc956', 4.5 * s);
          strokeLine(ctx, offset, front + 2 * s, offset, front - 6 * s, '#fffce1', 1.5 * s);
        }
        path(ctx, [[-46 * s, 13 * s], [0, -2 * s], [46 * s, 13 * s]], false); ctx.strokeStyle = '#ffcd6559'; ctx.lineWidth = 2 * s; ctx.stroke();
      } else if (kind === 'bulwarkwave') {
        // A forward-only shield wall keeps directionality clear and does not resemble the full squad shield.
        const angle = finite(e.angle, -Math.PI / 2), distance = (24 + progress * 62) * s, spread = (44 + progress * 27) * s;
        ctx.rotate(angle + Math.PI / 2); ctx.translate(0, -distance);
        ctx.beginPath(); ctx.arc(0, spread * .28, spread, Math.PI * 1.08, Math.PI * 1.92);
        ctx.strokeStyle = '#72f3dd'; ctx.lineWidth = Math.max(2, 8 * s * (1 - progress * .5)); ctx.stroke();
        for (let i = -2; i <= 2; i++) {
          const nx = i * spread * .32, ny = Math.abs(i) * 5 * s;
          polygon(ctx, nx, ny, 9 * s, 6, Math.PI / 6); ctx.fillStyle = i % 2 ? '#163e56cc' : '#71e9d648'; ctx.fill();
          ctx.strokeStyle = '#dffff9'; ctx.lineWidth = 1.5 * s; ctx.stroke();
        }
        path(ctx, [[-spread * .75, 16 * s], [0, 28 * s], [spread * .75, 16 * s]], false); ctx.strokeStyle = '#ffd764'; ctx.lineWidth = 2 * s; ctx.stroke();
      } else if (kind === 'shellsplash') {
        // Orange scalloped blast and shell fins separate grenade splash from smooth circular nova effects.
        const radius = (18 + progress * 56) * s, lobAngle = finite(e.angle, -.7);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const angle = i * TAU / 16, rr = radius * (i % 2 ? .72 : 1), xx = Math.cos(angle) * rr, yy = Math.sin(angle) * rr;
          i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
        }
        ctx.closePath(); ctx.fillStyle = '#ff6a4129'; ctx.fill(); ctx.strokeStyle = '#ff8a48'; ctx.lineWidth = Math.max(1.5, 5 * s * (1 - progress * .55)); ctx.stroke();
        ellipse(ctx, 0, 0, radius * .38, radius * .3); ctx.fillStyle = '#ffe274'; ctx.fill();
        for (let i = 0; i < 5; i++) {
          const angle = lobAngle + (i - 2) * .55, inner = radius * .48, outer = radius * (1.05 + (i % 2) * .18);
          path(ctx, [[Math.cos(angle) * inner, Math.sin(angle) * inner], [Math.cos(angle - .08) * outer, Math.sin(angle - .08) * outer], [Math.cos(angle + .08) * outer, Math.sin(angle + .08) * outer]], true);
          ctx.fillStyle = i % 2 ? '#ffb34f' : '#fff0a0'; ctx.fill();
        }
      } else if (kind === 'timefield') {
        const radius = (42 + progress * 62) * s;
        ctx.setLineDash([7 * s, 6 * s]);
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.arc(0, 0, radius * (1 - i * .17), time * (i % 2 ? -.35 : .25), time * (i % 2 ? -.35 : .25) + Math.PI * 1.45);
          ctx.strokeStyle = i === 1 ? '#f5fff8' : PALETTE.allyCyan; ctx.lineWidth = Math.max(1, (3 - i * .5) * s); ctx.stroke();
        }
        ctx.setLineDash([]); strokeLine(ctx, 0, 0, Math.cos(-.85 + time * .15) * radius * .55, Math.sin(-.85 + time * .15) * radius * .55, '#fff6b4', 3 * s);
      } else if (kind === 'armorvolley') {
        for (let i = -2; i <= 2; i++) {
          const xx = i * 17 * s, yy = Math.abs(i) * 7 * s + progress * 24 * s;
          path(ctx, [[xx, yy - 22 * s], [xx + 7 * s, yy], [xx, yy - 5 * s], [xx - 7 * s, yy]], true);
          ctx.fillStyle = i % 2 ? PALETTE.allyCyan : PALETTE.allyGold; ctx.fill(); ctx.strokeStyle = '#fffbdc'; ctx.lineWidth = s; ctx.stroke();
        }
      } else if (kind === 'orbitalbeam' || kind === 'orbitalstrike') {
        const beamHeight = positive(o.beamHeight, 240 * s), width = (8 + (1 - progress) * 18) * s;
        ctx.globalAlpha = clamp((1 - progress) * 1.5, .16, .9);
        strokeLine(ctx, 0, -beamHeight, 0, 12 * s, '#63f5e1', width * 1.55);
        strokeLine(ctx, 0, -beamHeight, 0, 12 * s, '#fffbd8', width * .55);
        ctx.beginPath(); ctx.ellipse(0, 8 * s, (28 + progress * 45) * s, (11 + progress * 18) * s, 0, 0, TAU); ctx.strokeStyle = '#ffd85f'; ctx.lineWidth = 4 * s; ctx.stroke();
      } else if (kind === 'bombardment' || kind === 'bombardwave') {
        const waves = kind === 'bombardwave' ? 3 : 5;
        for (let i = 0; i < waves; i++) {
          const a = i * TAU / waves + .2, distance = (18 + progress * 42) * s, xx = Math.cos(a) * distance, yy = Math.sin(a) * distance;
          ctx.beginPath(); ctx.arc(xx, yy, (13 + progress * 12) * s, 0, TAU); ctx.strokeStyle = i % 2 ? '#ff6656' : '#ffcf5b'; ctx.lineWidth = 3 * s; ctx.stroke();
          strokeLine(ctx, xx - 7 * s, yy, xx + 7 * s, yy, '#fff1b5', 1.5 * s); strokeLine(ctx, xx, yy - 7 * s, xx, yy + 7 * s, '#fff1b5', 1.5 * s);
        }
      } else if (kind === 'perfectdodge') {
        const radius = (34 + progress * 72) * s, width = positive(e.radius, 142) * s * .5;
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          const sweep = side * width * (1 - progress * .2);
          path(ctx, [[-sweep, 16 * s], [side * width * .18, -18 * s], [sweep, -4 * s]], false);
          ctx.strokeStyle = side < 0 ? PALETTE.allyCyan : PALETTE.allyGold; ctx.lineWidth = Math.max(2, 7 * s * (1 - progress * .55)); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(0, 0, radius, Math.PI * .12, Math.PI * 1.88); ctx.strokeStyle = '#f4ffff'; ctx.lineWidth = Math.max(1.5, 4 * s * (1 - progress * .5)); ctx.stroke();
        for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + time * .3; polygon(ctx, Math.cos(a) * radius, Math.sin(a) * radius * .58, 4 * s, 4, a); ctx.fillStyle = i % 2 ? '#fff2a8' : '#9ffff4'; ctx.fill(); }
      } else if (kind === 'dash') {
        for (let i = 0; i < 4; i++) {
          const yy = (i - 1.5) * 11 * s, length = (42 + i * 11) * s * (1 - progress * .35);
          strokeLine(ctx, -length, yy, length * .2, yy, i % 2 ? PALETTE.allyGold : PALETTE.allyCyan, (5 - i * .55) * s);
        }
      } else if (kind === 'shield') {
        ctx.beginPath(); ctx.ellipse(0, 0, 68 * s * (1 + progress * .08), 54 * s * (1 + progress * .08), 0, 0, TAU);
        ctx.fillStyle = '#62f4e61c'; ctx.fill(); ctx.strokeStyle = PALETTE.shield; ctx.lineWidth = 4 * s; ctx.stroke();
        for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + time * .25; polygon(ctx, Math.cos(a) * 68 * s, Math.sin(a) * 54 * s, 4 * s, 4, a); ctx.fillStyle = '#ecfffb'; ctx.fill(); }
      } else if (kind === 'overdrive' || kind === 'focus') {
        const rays = o.reducedMotion ? 6 : 12;
        for (let i = 0; i < rays; i++) {
          const angle = i * TAU / rays + time * .22, inner = (28 + progress * 32) * s, outer = (72 + progress * 55) * s;
          strokeLine(ctx, Math.cos(angle) * inner, Math.sin(angle) * inner, Math.cos(angle) * outer, Math.sin(angle) * outer, i % 2 ? PALETTE.allyGold : PALETTE.allyPlasma, (3.5 - progress * 2) * s);
        }
        ctx.beginPath(); ctx.arc(0, 0, (35 + progress * 50) * s, 0, TAU); ctx.strokeStyle = '#fff7c8'; ctx.lineWidth = 5 * s * (1 - progress * .7); ctx.stroke();
      } else {
        const radius = (30 + progress * 105) * s;
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.strokeStyle = PALETTE.allyGold; ctx.lineWidth = Math.max(1, 8 * s * (1 - progress)); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, radius * .76, 0, TAU); ctx.strokeStyle = PALETTE.allyCyan; ctx.lineWidth = Math.max(1, 3 * s); ctx.stroke();
        polygon(ctx, 0, 0, 13 * s, 8, time * .4); ctx.fillStyle = '#fff8c9'; ctx.fill();
      }
    });
  }

  function drawAura(ctx, state, options) {
    const st = state || {}, o = options || {}, x = finite(o.x, st.x), y = finite(o.y, st.y), s = positive(o.s);
    const time = motionTime(o.time, o.reducedMotion), team = clamp(finite(st.team, 1), 1, 999), radius = clamp(34 + Math.sqrt(team) * 7, 38, 112) * s;
    const active = finite(st.overdrive, 0) > 0 || finite(st.focus, 0) > 0 || finite(st.shield, 0) > 0;
    if (!active) return false;
    return withContext(ctx, () => {
      ctx.translate(x, y); ctx.globalAlpha = .58;
      const color = st.overdrive > 0 ? PALETTE.allyPlasma : st.shield > 0 ? PALETTE.shield : PALETTE.allyGold;
      ctx.setLineDash([8 * s, 7 * s]);
      ctx.beginPath(); ctx.ellipse(0, 0, radius, radius * .48, 0, time * .3, time * .3 + TAU); ctx.strokeStyle = color; ctx.lineWidth = 2.5 * s; ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 5; i++) {
        const angle = i * TAU / 5 - time * .42;
        polygon(ctx, Math.cos(angle) * radius, Math.sin(angle) * radius * .48, 3.5 * s, 4, angle); ctx.fillStyle = '#f8ffec'; ctx.fill();
      }
    });
  }

  return Object.freeze({
    version: '1.0.0',
    palette: PALETTE,
    enemyScale,
    healthBand,
    healthRatio,
    guardRatio,
    projectileStyle,
    effectProgress,
    drawEnemyDetails,
    drawBossDetails,
    drawBullet,
    drawExplosion,
    drawImpact,
    drawDamageNumber,
    drawPickup,
    drawSkillEffect,
    drawAura
  });
});
