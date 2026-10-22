(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./content.js') : root.DogContent, isNode ? require('../content/builtin.json') : root.DogBuiltin, isNode ? require('./progression.js') : root.DogProgression);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Mochi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Content, Builtin, Growth) {
  'use strict';
  const W = 600, H = 800, PLAYER_Y = 663, MAX_TEAM = 300, MAX_WEAPON = 8;
  const APP_VERSION = Content.APP_VERSION, MAX_PICKUPS = 12, MAX_IMPACTS = 32, MAX_SKILL_EFFECTS = 24;
  const INPUT_BUFFER_WINDOW = .18, PERFECT_DODGE_SHIELD = 12, PERFECT_DODGE_ULTIMATE = 8;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // Content is validated before registration; battle difficulty is independent of catalog index.
  const builtIn = Content.validatePack(Builtin);
  const LEVELS = builtIn.levels.map(level => ({ ...level, packId: builtIn.id }));
  const packs = new Map([[builtIn.id, builtIn]]);
  function registerPack(input) {
    const pack = Content.validatePack(input);
    if (pack.id === builtIn.id) throw new Error('内置战役不能被关卡包替换。');
    const previous = packs.get(pack.id);
    if (previous) {
      const comparison = Content.compareVersions(pack.version, previous.version);
      if (comparison < 0) throw new Error('不能安装旧版本关卡包。');
      if (comparison === 0) return 0;
    }
    const occupied = new Set(LEVELS.filter(level => level.packId !== pack.id).map(level => level.id));
    if (pack.levels.some(level => occupied.has(level.id))) throw new Error('关卡标识与已安装战役冲突。');
    const additions = pack.levels.filter(level => !LEVELS.some(existing => existing.id === level.id)).length;
    const replacement = pack.levels.map(level => ({ ...level, packId: pack.id }));
    const start = LEVELS.findIndex(level => level.packId === pack.id);
    if (start < 0) LEVELS.push(...replacement);
    else {
      const count = LEVELS.filter(level => level.packId === pack.id).length;
      LEVELS.splice(start, count, ...replacement);
    }
    packs.set(pack.id, pack);
    return additions;
  }
  const HEROES = [
    {name:'Ramen',kind:'拉面 · 拉布拉多',trait:'侦察先锋 / 快速脉冲 · 9 秒冷却',role:'RECON / 01',rate:1,damage:1,cooldown:9,support:'守护阵线',supportDetail:'呼叫 Bing Bong：5 秒护盾，吸收 60 点损伤。',tactical:'凝时标记场',tacticalDetail:'Q：展开 3 秒标记场，使敌军与敌弹减速，并令目标承受更多伤害。',tacticalCooldown:14,ultimate:'晨星轨道束',ultimateDetail:'R：消耗 100% 充能，持续 3 秒锁定战场威胁进行轨道灼烧。'},
    {name:'Bing Bong',kind:'冰棒 · 金毛寻回犬',trait:'重火力守卫 / 弹伤 +30% · 射速略慢',role:'SENTINEL / 02',rate:1.1,damage:1.3,cooldown:11,support:'猎踪齐射',supportDetail:'呼叫 Ramen：4 秒弹伤 ×1.5、射击间隔 ×0.75。',tactical:'破阵穿甲齐射',tacticalDetail:'Q：发射一轮爆裂穿甲弹，贯穿成列敌军并撕开护盾。',tacticalCooldown:14,ultimate:'金色饱和轰炸',ultimateDetail:'R：消耗 100% 充能，3 秒内分波轰炸整条战线。'}
  ];
  const LOADOUTS = [
    {name:'侦察回路',detail:'能量恢复 3 / 秒 · 均衡火力',rate:1,hurt:1,regen:3},
    {name:'强袭芯片',detail:'射击间隔 −10% · 承受损伤 +15%',rate:.9,hurt:1.15,regen:2},
    {name:'防卫装甲',detail:'承受损伤 −15% · 射击间隔 +10%',rate:1.1,hurt:.85,regen:2},
    {name:'贯穿棱镜',detail:'普通弹贯穿 1 次 · 基础弹伤 −12% · 射击间隔 +15% · 承伤 +5%',rate:1.15,hurt:1.05,regen:2,damage:.88,pierce:1},
    {name:'疾风伺服',detail:'冲刺恢复 4.5 秒 · 射击间隔 +4% · 承伤 +8%',rate:1.04,hurt:1.08,regen:2,dashRecharge:4.5},
    {name:'蓄能电池',detail:'初始能量 40 · 能量恢复 4.5 / 秒 · 射击间隔 +8% · 承伤 +5%',rate:1.08,hurt:1.05,regen:4.5,energy:40},
    {name:'震荡炮组',detail:'基础弹伤 +12% · 邻近目标受 18% 溅射 · 射击间隔 +20% · 承伤 +5%',rate:1.2,hurt:1.05,regen:1.8,damage:1.12,splash:.18},
    {name:'战术棱镜',detail:'战术技能冷却 −20% · 射击间隔 +7% · 承伤 +8%',rate:1.07,hurt:1.08,regen:2,tacticalCooldown:.8}
  ];
  const ENEMIES=[
    {kind:'normal',name:'巡光球',role:'侦察机',color:'#f5ca69',detail:'轻型巡逻单元。成群前进，优先处理靠近的小队。'},
    {kind:'runner',name:'跃兔',role:'高速冲锋',color:'#f6a18d',detail:'兔耳推进器高速突进。预留冲刺，别被数字门吸引全部注意。'},
    {kind:'shooter',name:'泡泡哨兵',role:'远程炮手',color:'#77dbe0',detail:'悬浮机体锁定队长射击。先诱导弹道，再切换路线。'},
    {kind:'tank',name:'装甲熊',role:'重装拦截',color:'#c4b0e7',detail:'厚装甲与宽大机身阻挡火力。集中射击，避免近身碰撞。'},
    {kind:'guardian',name:'棱镜龟',role:'能量护盾',color:'#91e0c6',detail:'外层护盾先吸收弹伤。电磁脉冲直接破盾，再集中攻击。'},
    {kind:'repair',name:'小狐工匠',role:'战场维修',color:'#f2b0c7',detail:'每 3 秒修复附近一台受损机体。优先击破，切断维修链。'}
  ];
  const PICKUPS = Object.freeze({
    repair:{name:'维修胶囊',color:'#72e6aa',detail:'立即恢复 18 名小队成员。'},
    shield:{name:'棱镜护盾',color:'#68e7f1',detail:'获得 35 点临时护盾，持续 6 秒。'},
    rapid:{name:'疾速芯片',color:'#ffd56a',detail:'射速强化 8 秒。'},
    pierce:{name:'穿透棱镜',color:'#d2a4ff',detail:'普通弹获得贯穿效果 9 秒。'},
    battery:{name:'战术电池',color:'#80a8ff',detail:'恢复 35 点能量并补充终极充能。'},
    magnet:{name:'牵引磁核',color:'#ff9fd0',detail:'扩大拾取范围并吸附补给 10 秒。'},
    nova:{name:'星环震爆',color:'#ff9b78',detail:'立即震击屏幕内敌军与首领。'}
  });
  function missionResults(s){const c=LEVELS[s.level];return [
    {label:'连击链',target:c.comboGoal,value:s.maxCombo,met:s.maxCombo>=c.comboGoal},
    {label:'低损撤离',target:c.damageGoal,value:s.damageTaken,met:s.damageTaken<=c.damageGoal},
    {label:'清扫行动',target:c.killGoal,value:s.kills,met:s.kills>=c.killGoal}
  ];}
  function schedule(level) {
    const cfg = LEVELS[level], difficulty = cfg.difficulty, events = [];
    for (let i = 0, t = .6; t < cfg.duration - 8; t += 12, i++) {
      const good = 8 + i * 2, bad = -12 - difficulty * 3 - i * 4;
      const side = i % 2;
      events.push({ t, type: 'gates', values: side ? [bad, good] : [good, bad], multiply: i === 2 || i === 5 ? side : -1 });
      if (i === 2 || i === 5) events[events.length - 1].values[side] = 2;
    }
    const crateCount = cfg.mechanic === 'repairSwarm' ? 9 : 7;
    for (let i = 0; i < crateCount; i++) events.push({ t: 6.5 + i * (cfg.duration - 17) / crateCount, type: 'crate', x: i % 2 ? 170 : 430 });
    for (let i = 0, t = 4.5; t < cfg.duration - 3; t += 6.5 - difficulty * .18, i++) {
      events.push({ t, type: 'wave', count: 7 + Math.floor(difficulty * 1.4) + i % 3 * 2, wave: i });
      if (i > 0 && i % 2 === 1) events.push({ t: t + 2.1, type: 'rock', x: [300, 430, 170][i % 3] });
    }
    if (cfg.mechanic === 'crossfire') {
      for (let t = 15; t < cfg.duration; t += 15) events.push({ t, type: 'crossfire' });
    }
    // Every operation offers an early, reachable supply. Further drops use a separate loot stream.
    events.push({ t: 10, type: 'pickup', guaranteed: true });
    return events.sort((a, b) => a.t - b.t);
  }
  function sanitizeSave(value) {
    const obj = value && typeof value === 'object' ? value : {};
    const bounded = (v, max) => Number.isFinite(v) ? clamp(Math.floor(v), 0, max) : 0;
    const campaign = obj.version === 2 ? obj : {};
    return { version: 2, stars: Array.from({ length: LEVELS.length }, (_, i) => bounded(campaign.stars?.[i], 3)), best: Array.from({ length: LEVELS.length }, (_, i) => bounded(campaign.best?.[i], 9999999)), easyStars: Array.from({ length: LEVELS.length }, (_, i) => bounded(campaign.easyStars?.[i], 3)), easyBest: Array.from({ length: LEVELS.length }, (_, i) => bounded(campaign.easyBest?.[i], 9999999)), hero: bounded(obj.hero, HEROES.length - 1), sound: obj.sound !== false, easy: obj.version === 2 && obj.easy === true };
  }
  function createGame(options = {}) {
    const level = Number.isFinite(options.level) ? clamp(Math.floor(options.level), 0, LEVELS.length - 1) : 0;
    const hero = Number.isFinite(options.hero) ? clamp(Math.floor(options.hero), 0, HEROES.length - 1) : 0;
    const easy = options.easy === true, cfg = LEVELS[level], difficulty = cfg.difficulty;
    const mechanic = cfg.mechanic || 'standard';
    const loadout = Number.isInteger(options.loadout) ? clamp(options.loadout,0,LOADOUTS.length-1) : 0, kit = LOADOUTS[loadout];
    const profile = Growth.getProfile(options.records, hero, options.captainBuild), training = profile.effects;
    const tacticalModule = profile.tacticals.find(item => item.selected), dashCooldown = kit.dashRecharge || 6;
    let nextId = 1, cursor = 0, group = 0, shotTimer = .08, ultimateTick = 0, bombardWave = 0;
    const events = schedule(level);
    const initialSeed = Number.isFinite(options.seed) ? Math.floor(options.seed) >>> 0 : (437 + level * 99) >>> 0;
    const state = {
      phase: 'playing', level, levelId:cfg.id, mechanic, difficulty, hero, easy, loadout, captainBuild:profile.build, captainEffects:{...training}, tacticalName:tacticalModule.name, tacticalKind:tacticalModule.kind, tacticalDuration:tacticalModule.cooldown*training.cooldown*(kit.tacticalCooldown||1), energy:kit.energy||20, shield:0, shieldTime:0, focus:0, supportCooldown:0, supportUses:0, dashCharges:2, dashRecharge:0, dashTime:0, dashFrom:170, dashUses:0, facing:1, medals:0, rank:'—', time: 0, distance: 0, x: 170, targetX: 170,
      team: (easy ? 14 : 8) + difficulty * 4, peakTeam: (easy ? 14 : 8) + difficulty * 4, weapon: 1 + Math.floor(difficulty / 3), kills: 0, score: 0,
      cooldown: 0, skillBuffer: 0, tacticalBuffer:0, supportBuffer:0, ultimateBuffer:0, tacticalCooldown:0, tacticalTime:0, tacticalUses:0, ultimateCharge:0, ultimateTime:0, ultimateUses:0,
      invulnerable: 0, flash: 0, shake: 0, entities: [], bullets: [], pickups:[], buffs:{rapid:0,pierce:0,magnet:0}, impacts:[], skillEffects:[],
      particles: [], explosions: [], hazards: [], texts: [], signals: [], boss: null, bossSpawned: false, won: false,
      seed: initialSeed, lootSeed:(initialSeed ^ 0x9e3779b9) >>> 0, fxSeed:(initialSeed ^ 0x85ebca6b) >>> 0, stars: 0, skillUses: 0, combo: 0, maxCombo: 0, comboTime: 0, overdrive: 0, overdrives: 0, perfectDodges:0, damageTaken: 0
    };
    function rand() { state.seed = (state.seed * 1664525 + 1013904223) >>> 0; return state.seed / 4294967296; }
    function lootRand() { state.lootSeed = (state.lootSeed * 1103515245 + 12345) >>> 0; return state.lootSeed / 4294967296; }
    function fxRand() { state.fxSeed = (state.fxSeed * 22695477 + 1) >>> 0; return state.fxSeed / 4294967296; }
    function signal(type, data = {}) { state.signals.push({ type, ...data }); }
    function impact(x,y,kind,radius,damage){state.impacts.push({x,y,kind,life:.28,maxLife:.28,...(Number.isFinite(damage)?{damage}:{}),...(radius?{radius}:{})});if(state.impacts.length>MAX_IMPACTS)state.impacts.splice(0,state.impacts.length-MAX_IMPACTS);}
    function skillEffect(x,y,kind,life=.6,radius){state.skillEffects.push({x,y,kind,life,maxLife:life,...(radius?{radius}:{})});if(state.skillEffects.length>MAX_SKILL_EFFECTS)state.skillEffects.splice(0,state.skillEffects.length-MAX_SKILL_EFFECTS);}
    function floating(text, x, y, color = '#276f5c') { state.texts.push({ text, x, y, color, life: 1.2 }); }
    function burst(x, y, color, count = 16, power = 1) {
      for (let i = 0; i < count; i++) { const a = fxRand() * Math.PI * 2, speed = (45 + fxRand() * 180) * power; state.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 20, life: .35 + fxRand() * .55, color, r: 2 + fxRand() * 5 }); }
    }
    function explode(x, y, color, radius = 50) {
      state.explosions.push({ x, y, color, radius, life: .5, maxLife: .5 }); burst(x, y, color, radius > 60 ? 28 : 14, radius / 55);
      state.shake = Math.max(state.shake, radius > 60 ? .3 : .09);
    }
    function changeTeam(delta) {
      state.team = clamp(Math.round(state.team + delta), 0, MAX_TEAM);
      state.peakTeam = Math.max(state.peakTeam, state.team);
      if (state.team <= 0) finish(false);
    }
    function hurt(amount, x = state.x) {
      if (state.invulnerable > 0 || state.phase !== 'playing') return;
      let damage = Math.max(1, Math.round(amount * (easy ? .42 : 1) * kit.hurt * training.hurt * (mechanic === 'overcharge' ? 1.12 : 1)));
      if(state.shield>0){const absorbed=Math.min(state.shield,damage);state.shield-=absorbed;damage-=absorbed;floating('护盾 −'+absorbed,x,PLAYER_Y-80,'#71e6dc');if(!damage){state.invulnerable=.15;signal('shield');return;}}
      state.damageTaken += Math.min(damage, state.team); changeTeam(-damage);
      state.invulnerable = easy ? .85 : .38; state.flash = .24; state.shake = .34;
      state.combo = 0; state.comboTime = 0;
      floating('−' + damage, x, PLAYER_Y - 70, '#ca4660'); explode(x, PLAYER_Y, '#ff8c84', 55); signal('hurt');
    }
    function finish(won) {
      if (state.phase === 'won' || state.phase === 'lost') return;
      clearBuffers();
      state.won = won; state.phase = won ? 'won' : 'lost';
      state.stars = won ? (state.team >= cfg.star3 ? 3 : state.team >= cfg.star2 ? 2 : 1) : 0;
      state.score = state.kills * 50 + state.peakTeam * 12 + state.maxCombo * 30 + (won ? 2000 + state.team * 30 : 0);
      state.medals=won?missionResults(state).filter(m=>m.met).length:0;
      state.rank=won?['C','B','A','S'][state.medals]:'—';state.score+=state.medals*250;
      signal(won ? 'win' : 'lose');
    }
    function gainUltimate(amount) {
      if (state.phase !== 'playing' || state.ultimateTime > 0) return;
      state.ultimateCharge = clamp(state.ultimateCharge + amount, 0, 100);
    }
    function spawnPickup(x, y, forcedKind) {
      if (state.phase !== 'playing' || state.pickups.length >= MAX_PICKUPS) return false;
      const kinds=Object.keys(PICKUPS),kind=forcedKind||kinds[Math.floor(lootRand()*kinds.length)],meta=PICKUPS[kind];
      state.pickups.push({id:nextId++,x:clamp(x,105,495),y,r:18,kind,name:meta.name,color:meta.color,detail:meta.detail,life:14});
      signal('pickupDrop',{kind,name:meta.name}); return true;
    }
    function damageEnemy(e, amount, source='bullet') {
      if (!e || e.dead || state.phase !== 'playing') return 0;
      let damage=amount*training.damage*(hero===0&&tacticalModule.id==='default'&&state.tacticalTime>0?1.3:1), dealt=0;
      if(e.guardHp>0){const absorbed=Math.min(e.guardHp,damage);e.guardHp-=absorbed;damage-=absorbed;dealt+=absorbed;}
      const before=e.hp;e.hp-=damage;dealt+=Math.min(before,Math.max(0,damage));e.hit=.1;
      impact(e.x,e.y,source,e.r||24,dealt);signal('hit',{kind:source,x:e.x,y:e.y,damage:+dealt.toFixed(2)});
      if(e.hp<=0)kill(e);return dealt;
    }
    function damageBoss(amount, source='bullet') {
      if(!state.boss||state.phase!=='playing')return 0;
      const damage=amount*training.damage*(hero===0&&tacticalModule.id==='default'&&state.tacticalTime>0?1.3:1),before=state.boss.hp;
      state.boss.hp-=damage;state.boss.hit=.07;impact(state.boss.x,state.boss.y,source,72,Math.min(before,damage));signal('hit',{kind:source,x:state.boss.x,y:state.boss.y,damage:+Math.min(before,damage).toFixed(2)});
      if(state.boss.hp<=0){explode(state.boss.x,state.boss.y,'#ffd677',185);finish(true);}return Math.min(before,damage);
    }
    function kill(e) {
      if (e.dead) return;
      e.dead = true; state.energy=Math.min(100,state.energy+1.5); gainUltimate(e.eliteVariant?3.5:2); state.kills++; state.combo++; state.comboTime = 2.8; state.maxCombo = Math.max(state.maxCombo, state.combo);
      explode(e.x, e.y, e.kind === 'tank' ? '#bc9dff' : e.kind === 'shooter' ? '#68dfec' : '#ffae6e', e.elite ? 72 : 42);
      if(state.pickups.length<MAX_PICKUPS&&lootRand()<(e.eliteVariant ? .14 : .055))spawnPickup(e.x,e.y);
      if (state.combo % 12 === 0) { state.overdrive = 4; state.overdrives++; floating('火力过载 ×' + state.combo, state.x, PLAYER_Y - 160, '#bc4d92'); signal('overdrive'); }
      signal(e.elite ? 'boom' : 'pop');
    }
    function spawn(event) {
      if (event.type === 'gates') {
        const g = ++group;
        event.values.forEach((value, i) => state.entities.push({ id: nextId++, type: 'gate', x: i ? 430 : 170, y: -55, width: 186, group: g, value, op: event.multiply === i ? 'multiply' : 'add', charge: 0, hit: 0, used: false }));
      } else if (event.type === 'wave') {
        for (let i = 0; i < event.count + (mechanic === 'repairSwarm' ? 1 : 0); i++) {
          const w = event.wave || 0;
          let kind = (i + w) % 7 === 2 ? 'shooter' : (i + w) % 6 === 4 ? 'tank' : (i + w) % 4 === 1 ? 'runner' : 'normal';
          if(difficulty>=1&&kind==='tank'&&(i+w)%12===4)kind='guardian';
          if(difficulty>=1&&kind==='shooter'&&(i+w)%14===9)kind='repair';
          if (mechanic === 'repairSwarm' && i === event.count) kind = 'repair';
          const baseHp = kind === 'guardian' ? 44 + difficulty * 12 : kind === 'tank' ? 65 + difficulty * 16 : (kind === 'shooter'||kind === 'repair') ? 23 + difficulty * 5 : 12 + difficulty * 3;
          const eliteVariant=difficulty>=3&&(i+w)%13===7?(kind==='tank'||kind==='guardian'?'fortified':'overclocked'):null;
          const hp = baseHp * (1 + Math.min(10, w) * .16) * (easy ? .75 : 1) * (eliteVariant ? 1.45 : 1), x = 115 + (i % 5) * 92.5;
          const guardHp=(kind==='guardian'?(24+difficulty*4)*(easy?.75:1):0)+(eliteVariant==='fortified'?Math.max(18,hp*.22):0);
          const sizeTier=hp>=145?'titan':hp>=70?'heavy':hp>=30?'standard':'compact',visualScale={compact:.9,standard:1,heavy:1.14,titan:1.28}[sizeTier];
          state.entities.push({ id: nextId++, type: 'enemy', kind, x, baseX: x, y: -45 - Math.floor(i / 5) * 78, hp, maxHp: hp, r: ((kind === 'tank'||kind==='guardian') ? 32 : 23)*visualScale, elite: kind === 'tank'||kind==='guardian', eliteVariant, sizeTier, visualScale, guardHp, maxGuardHp:guardHp, healTimer:3, healing:null, wobble: rand() * 6, hit: 0, shot: 1.4 + rand() * 1.2 });
        }
      } else if (event.type === 'crate') {
        const hp = 28 + difficulty * 6 + state.weapon * 5;
        state.entities.push({ id: nextId++, type: 'crate', x: event.x, y: -40, hp, maxHp: hp, r: 35, hit: 0 });
      } else if (event.type === 'crossfire') {
        if (!state.bossSpawned) {
          state.hazards.push({ x: state.x, width: 68, delay: 1.5, life: .48, hit: false, source: 'crossfire' });
          signal('warning');
        }
      } else if (event.type === 'rock') state.entities.push({ id: nextId++, type: 'rock', x: event.x, y: -45, r: 35, hit: 0 });
      else if(event.type==='pickup')spawnPickup(300,-25,event.guaranteed?'battery':null);
    }
    function hostile(x, y, target, speed, damage, r = 10) {
      const flight = Math.max(.3, (PLAYER_Y - y) / speed);
      state.bullets.push({ x, y, vx: (target - x) / flight, vy: speed, damage, ratio: .055, r, friendly: false, kind:'hostile', charged:r>=13, pierce:0 });
    }
    function shoot() {
      const columns = Math.min(11, Math.max(1, Math.ceil(state.team / 4))), over = state.overdrive > 0;
      for (let i = 0; i < columns; i++) {
        const side = i - (columns - 1) / 2;
        const pierce=(kit.pierce||0)+(state.buffs.pierce>0?1:0);
        state.bullets.push({ x: state.x + side * 15, y: PLAYER_Y - 28 - Math.abs(side) * 2, vy: -780 - state.weapon * 10, vx: state.weapon >= 5 ? side * 3 : 0, damage: (1 + state.team / columns * .17 + (state.weapon - 1) * .42) * HEROES[hero].damage * (kit.damage||1) * (easy ? 1.2 : 1) * (over ? 1.45 : 1) * (state.focus>0?1.5:1), r: 4 + state.weapon * .4, friendly: true, kind:pierce>0?'pierce':kit.splash?'burst':state.buffs.rapid>0?'rapid':over?'overdrive':'pulse',charged: over, pierce, splash:kit.splash||0, hitIds:[] });
      }
      signal('shoot');
    }
    function skill() {
      if (state.phase !== 'playing' || state.cooldown > .01) return false;
      state.skillBuffer = 0; state.cooldown = HEROES[hero].cooldown * training.cooldown; state.invulnerable = 1.2; state.shake = .65; state.skillUses++;
      for (const e of state.entities) if (e.type === 'enemy' && e.y > 20) { e.guardHp=0;damageEnemy(e,65 + state.weapon * 14 + state.team * .3,'emp'); if (!e.dead) { e.hit = .2; explode(e.x, e.y, '#ffd772', 50); } }
      state.bullets = state.bullets.filter(b => b.friendly);
      state.hazards = []; // The skill is also an emergency escape from telegraphed beams.
      if (state.boss) { damageBoss(220 + state.weapon * 65 + state.team,'emp'); if(state.boss)state.boss.hit=.2; }
      explode(state.x, PLAYER_Y - 30, '#ffdf7e', 130); floating('电磁脉冲！', state.x, PLAYER_Y - 120, '#a86620'); signal('skill');
      return true;
    }
    function requestSkill() {
      if(state.phase !== 'playing' || state.cooldown > .22) return false;
      if(state.cooldown <= .01) return skill();
      state.skillBuffer = .22;
      return true;
    }
    function tactical(){
      if(state.phase!=='playing'||state.tacticalCooldown>.01)return false;
      state.tacticalBuffer=0;state.tacticalCooldown=state.tacticalDuration;state.tacticalTime=3;state.tacticalUses++;state.shake=Math.max(state.shake,.35);
      if(hero===0&&tacticalModule.id==='default')skillEffect(state.x,PLAYER_Y-80,'timeField',3,245);
      else if(hero===0&&tacticalModule.id==='arc'){
        const targets=state.entities.filter(e=>e.type==='enemy'&&!e.dead&&e.y>20).sort((a,b)=>b.y-a.y).slice(0,6);
        for(const e of targets){damageEnemy(e,55+state.weapon*8+state.team*.1,'arc');skillEffect(e.x,e.y,'chainArc',.55,60);}
        if(state.boss&&state.phase==='playing')damageBoss(200+state.weapon*30,'arc');
        state.bullets=state.bullets.filter(b=>b.friendly||Math.hypot(b.x-state.x,b.y-PLAYER_Y)>180);
        skillEffect(state.x,PLAYER_Y-45,'chainArc',.65,180);
      }else if(hero===0&&tacticalModule.id==='rescue'){
        changeTeam(14);state.shield=Math.min(100,state.shield+30);state.shieldTime=Math.max(state.shieldTime,4);
        state.bullets=state.bullets.filter(b=>b.friendly||Math.hypot(b.x-state.x,b.y-PLAYER_Y)>180);
        skillEffect(state.x,PLAYER_Y-45,'rescueBeacon',1,150);
      }else if(tacticalModule.id==='barrage'){
        state.buffs.rapid=Math.max(state.buffs.rapid,6);state.focus=Math.max(state.focus,3);
        skillEffect(state.x,PLAYER_Y-45,'rapidBarrage',3,130);
      }else if(tacticalModule.id==='bulwark'){
        state.shield=Math.min(100,state.shield+50);state.shieldTime=Math.max(state.shieldTime,5);
        for(const e of state.entities)if(e.type==='enemy'&&!e.dead&&e.y>PLAYER_Y-360&&Math.abs(e.x-state.x)<210)damageEnemy(e,48+state.weapon*7,'bulwark');
        if(state.boss&&state.boss.y>PLAYER_Y-400&&state.phase==='playing')damageBoss(130+state.weapon*20,'bulwark');
        state.bullets=state.bullets.filter(b=>b.friendly||Math.hypot(b.x-state.x,b.y-PLAYER_Y)>270);
        skillEffect(state.x,PLAYER_Y-80,'bulwarkWave',1,270);
      }else{
        const columns=9;
        for(let i=0;i<columns;i++){const side=i-(columns-1)/2;state.bullets.push({x:state.x+side*10,y:PLAYER_Y-42-Math.abs(side)*3,vx:side*34,vy:-900,damage:22+state.weapon*7+state.team*.12,r:8,friendly:true,kind:'armorBurst',charged:true,pierce:3,hitIds:[]});}
        skillEffect(state.x,PLAYER_Y-55,'armorVolley',.75,150);
      }
      floating(tacticalModule.name,state.x,PLAYER_Y-135,hero===0?'#77e9ff':'#ffd46b');
      signal('tactical',{hero,kind:tacticalModule.kind,name:tacticalModule.name,module:tacticalModule.id});return true;
    }
    function requestTactical(){
      if(state.phase!=='playing'||state.tacticalCooldown>INPUT_BUFFER_WINDOW)return false;
      if(state.tacticalCooldown<=.01)return tactical();
      state.tacticalBuffer=INPUT_BUFFER_WINDOW;return true;
    }
    function ultimate(){
      if(state.phase!=='playing'||state.ultimateCharge<100||state.ultimateTime>0)return false;
      state.ultimateBuffer=0;state.ultimateCharge=0;state.ultimateTime=3;state.ultimateUses++;ultimateTick=0;bombardWave=0;state.invulnerable=Math.max(state.invulnerable,.5);state.shake=.8;
      skillEffect(300,330,hero===0?'orbitalBeam':'bombardment',3,hero===0?105:280);floating(HEROES[hero].ultimate,state.x,PLAYER_Y-150,hero===0?'#83efff':'#ffc55f');
      signal('ultimate',{hero,kind:hero===0?'orbitalBeam':'bombardment'});return true;
    }
    function requestUltimate(){
      if(state.phase!=='playing'||state.ultimateTime>0||state.ultimateCharge<98)return false;
      if(state.ultimateCharge>=100)return ultimate();
      state.ultimateBuffer=INPUT_BUFFER_WINDOW;return true;
    }
    function collectPickup(p){
      if(!p||p.dead||state.phase!=='playing')return;
      p.dead=true;
      if(p.kind==='repair')changeTeam(18);
      else if(p.kind==='shield'){state.shield=Math.min(100,state.shield+35);state.shieldTime=Math.max(state.shieldTime,6);}
      else if(p.kind==='rapid')state.buffs.rapid=Math.max(state.buffs.rapid,8);
      else if(p.kind==='pierce')state.buffs.pierce=Math.max(state.buffs.pierce,9);
      else if(p.kind==='battery'){state.energy=Math.min(100,state.energy+35);gainUltimate(15);}
      else if(p.kind==='magnet')state.buffs.magnet=Math.max(state.buffs.magnet,10);
      else if(p.kind==='nova'){
        for(const e of state.entities)if(e.type==='enemy'&&!e.dead)damageEnemy(e,55+state.weapon*9,'nova');
        if(state.phase==='playing'&&state.boss)damageBoss(280+state.weapon*35,'nova');
      }
      skillEffect(p.x,p.y,'pickup-'+p.kind,.7,75);floating(PICKUPS[p.kind].name,p.x,p.y-22,p.color);signal('pickup',{kind:p.kind,name:PICKUPS[p.kind].name});
    }
    function support(){
      if(state.phase!=='playing'||state.energy<60||state.supportCooldown>0)return false;
      state.supportBuffer=0;state.energy-=60;state.supportCooldown=8;state.supportUses++;
      if(hero===0){state.shield=60;state.shieldTime=5;}else state.focus=4;
      explode(state.x,PLAYER_Y-35,hero===0?'#66e0d7':'#ffd37d',90);
      floating(HEROES[hero].support,state.x,PLAYER_Y-130,'#70ddd2');signal('support');return true;
    }
    function requestSupport(){
      if(state.phase!=='playing'||state.energy<60||state.supportCooldown>INPUT_BUFFER_WINDOW)return false;
      if(state.supportCooldown<=.01)return support();
      state.supportBuffer=INPUT_BUFFER_WINDOW;return true;
    }
    function rewardPerfectDodge(from,to){
      const low=Math.min(from,to)-26,high=Math.max(from,to)+26;
      const crossed=state.bullets.filter(b=>!b.friendly&&!b.dead&&!b.dodged&&Number.isFinite(b.x)&&Number.isFinite(b.y)&&b.x>=low&&b.x<=high&&Math.abs(b.y-PLAYER_Y)<=(Number.isFinite(b.r)?b.r:10)+42);
      if(!crossed.length)return false;
      for(const bullet of crossed)bullet.dodged=true;
      state.perfectDodges++;state.shield=Math.min(100,state.shield+PERFECT_DODGE_SHIELD);state.shieldTime=Math.max(state.shieldTime,3);gainUltimate(PERFECT_DODGE_ULTIMATE);
      skillEffect((from+to)/2,PLAYER_Y-26,'perfectDodge',.72,Math.abs(to-from)+58);floating('完美闪避 +护盾',to,PLAYER_Y-118,'#a9fff0');
      signal('perfectDodge',{count:state.perfectDodges,shield:PERFECT_DODGE_SHIELD,ultimate:PERFECT_DODGE_ULTIMATE});return true;
    }
    function dash(direction){
      if(state.phase!=='playing'||state.dashCharges<=0)return false;
      const dir=Number.isFinite(direction)&&direction!==0?Math.sign(direction):state.facing;
      const next=clamp(state.x+dir*112,103,497);if(Math.abs(next-state.x)<2)return false;
      state.dashFrom=state.x;state.x=next;state.targetX=next;state.facing=dir;state.dashCharges--;state.dashUses++;
      if(state.dashRecharge<=0)state.dashRecharge=dashCooldown;
      state.dashTime=.22;state.invulnerable=Math.max(state.invulnerable,.28);rewardPerfectDodge(state.dashFrom,next);signal('dash');return true;
    }
    function hitEntity(e, b) {
      e.hit = .1;
      if (e.type === 'gate') {
        e.charge++;
        const threshold = e.op === 'multiply' ? 40 : 4;
        while (e.charge >= threshold) { e.charge -= threshold; e.value = Math.min(e.op === 'multiply' ? 5 : 99, e.value + 1); }
      } else if (e.type === 'crate') {
        e.hp -= b.damage * training.damage;
        if (e.hp <= 0) { e.dead = true; state.energy=Math.min(100,state.energy+(mechanic === 'blackout' ? 24 : 12)); state.weapon = Math.min(MAX_WEAPON, state.weapon + 1); if(lootRand()<.42)spawnPickup(e.x,e.y); explode(e.x, e.y, '#ffd471', 75); floating('火力升级 Lv.' + state.weapon, e.x, e.y - 20, '#b27424'); signal('weapon'); }
      } else if (e.type === 'enemy') {
        const dealt=damageEnemy(e,b.damage,b.kind||'pulse');if(dealt>0)gainUltimate(Math.min(.65,.12+dealt*.008));
        if(b.splash>0&&state.phase==='playing'){
          const nearby=state.entities.filter(other=>other!==e&&other.type==='enemy'&&!other.dead&&Math.hypot(other.x-e.x,other.y-e.y)<64).slice(0,3);
          for(const other of nearby)damageEnemy(other,b.damage*b.splash,'splash');
          if(nearby.length)skillEffect(e.x,e.y,'shellSplash',.3,64);
        }
      }
    }
    function step(dt, input = {}) {
      dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .05);
      if (state.phase !== 'playing' || dt === 0) return;
      const buffered={skill:state.skillBuffer>0,tactical:state.tacticalBuffer>0,support:state.supportBuffer>0,ultimate:state.ultimateBuffer>0};
      state.time += dt; state.distance += cfg.speed * dt;
      for (const key of ['cooldown', 'skillBuffer', 'tacticalBuffer', 'supportBuffer', 'ultimateBuffer', 'tacticalCooldown', 'tacticalTime', 'ultimateTime', 'invulnerable', 'flash', 'shake', 'comboTime', 'overdrive', 'shieldTime', 'focus', 'supportCooldown', 'dashTime']) state[key] = Math.max(0, state[key] - dt);
      for(const key of Object.keys(state.buffs))state.buffs[key]=Math.max(0,state.buffs[key]-dt);
      state.energy=Math.min(100,state.energy+kit.regen*dt*(mechanic === 'blackout' ? .55 : 1));
      if(state.shieldTime===0)state.shield=0;
      if(state.dashCharges<2){state.dashRecharge-=dt;if(state.dashRecharge<=0){state.dashCharges++;state.dashRecharge=state.dashCharges<2?dashCooldown:0;}}
      if (state.comboTime === 0) state.combo = 0;
      if (Number.isFinite(input.x)) state.targetX = clamp(input.x, 103, 497);
      if(input.axis)state.facing=Math.sign(input.axis);else if(Math.abs(state.targetX-state.x)>2)state.facing=Math.sign(state.targetX-state.x);
      if (input.axis) { state.x = clamp(state.x + clamp(input.axis, -1, 1) * 480 * dt, 103, 497); state.targetX = state.x; }
      else state.x += (state.targetX - state.x) * (1 - Math.exp(-36 * dt));
      if(input.skill)requestSkill();if(buffered.skill)skill();
      if(input.support)requestSupport();if(buffered.support&&support())state.supportBuffer=0;if(input.dash)dash(input.axis||state.facing);
      if(input.tactical)requestTactical();if(buffered.tactical&&tactical())state.tacticalBuffer=0;
      if(input.ultimate)requestUltimate();if(buffered.ultimate&&ultimate())state.ultimateBuffer=0;
      if (state.phase !== 'playing') return;
      if(state.ultimateTime>0){
        ultimateTick-=dt;
        if(ultimateTick<=0){
          if(hero===0){
            const target=state.boss||state.entities.filter(e=>e.type==='enemy'&&!e.dead&&e.y>20).sort((a,b)=>b.y-a.y)[0];
            if(target){if(target===state.boss)damageBoss(64+state.weapon*10,'orbital');else damageEnemy(target,52+state.weapon*8,'orbital');skillEffect(target.x,target.y,'orbitalStrike',.32,70);}
            ultimateTick=.18;
          }else{
            const xs=[135,300,465],x=xs[bombardWave++%xs.length],radius=125;
            for(const e of state.entities)if(e.type==='enemy'&&!e.dead&&Math.abs(e.x-x)<radius)damageEnemy(e,44+state.weapon*7,'bombard');
            if(state.phase==='playing'&&state.boss&&Math.abs(state.boss.x-x)<radius+65)damageBoss(78+state.weapon*10,'bombard');
            skillEffect(x,310,'bombardWave',.42,radius);ultimateTick=.42;
          }
        }
      }
      if(state.phase!=='playing')return;
      while (cursor < events.length && state.time >= events[cursor].t) spawn(events[cursor++]);
      if (!state.bossSpawned && state.time >= cfg.duration) {
        state.bossSpawned = true;
        state.boss = { x: 300, y: 142, hp: cfg.bossHp, maxHp: cfg.bossHp, clock: 0, shot: 1.6, beam: 3, summon: 8, stage: 1, hit: 0, volleys: 0 };
        state.cooldown = 0; signal('boss'); state.shake = .5;
      }
      shotTimer -= dt;
      if (shotTimer <= 0) { shoot(); shotTimer += Math.max(.115, .23 - (state.weapon - 1) * .014) * HEROES[hero].rate * kit.rate * (mechanic === 'overcharge' ? .82 : 1) * (state.focus>0?.75:1) * (state.overdrive > 0 ? .72 : 1) * (state.buffs.rapid>0?.68:1); }
      const worldSlow=hero===0&&tacticalModule.id==='default'&&state.tacticalTime>0?.55:1;
      for (const e of state.entities) {
        if (e.dead) continue;
        e.hit = Math.max(0, e.hit - dt);
        const speed = e.kind === 'runner' ? 1.8 : e.kind === 'tank'||e.kind==='guardian' ? .86 : e.kind === 'shooter'||e.kind==='repair' ? .85 : 1.15;
        e.y += cfg.speed * dt * (e.type === 'enemy' ? speed*worldSlow*(e.eliteVariant==='overclocked'?1.18:1) : 1);
        if (e.type === 'enemy') {
          e.x = e.baseX + Math.sin(state.time * (e.kind === 'runner' ? 4 : 2.4) + e.wobble) * (e.kind === 'runner' ? 23 : 10);
          if(e.healing){e.healing.life-=dt;if(e.healing.life<=0)e.healing=null;}
          if(e.kind==='repair'&&e.y>45&&e.y<PLAYER_Y-130){e.healTimer-=dt;if(e.healTimer<=0){
            const ally=state.entities.filter(a=>a!==e&&!a.dead&&a.type==='enemy'&&a.hp<a.maxHp&&Math.hypot(a.x-e.x,a.y-e.y)<165).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
            if(ally){const healed=Math.min(ally.maxHp-ally.hp,12+difficulty*2);ally.hp+=healed;e.healing={x:ally.x,y:ally.y,life:.35};floating('+'+Math.round(healed),ally.x,ally.y-30,'#74d7b1');signal('repair');}e.healTimer=3;
          }}
          if (e.kind === 'shooter' && e.y > 40 && e.y < PLAYER_Y - 140) {
            e.shot -= dt*worldSlow;
            if (e.shot <= 0) { hostile(e.x, e.y, state.x, 205 + difficulty * 12, 4 + difficulty); e.shot = Math.max(1.4, 2.7 - difficulty * .12); e.hit = .15; }
          }
        }
        if (e.type === 'gate' && !e.used && e.y >= PLAYER_Y - 25) {
          const gates = state.entities.filter(a => a.type === 'gate' && a.group === e.group && !a.used); gates.forEach(a => { a.used = true; });
          const selected = gates.find(a => Math.abs(state.x - a.x) <= a.width / 2);
          if (selected) {
            const delta = selected.op === 'multiply' ? state.team * (selected.value - 1) : selected.value;
            changeTeam(delta); floating(selected.op === 'multiply' ? '小队 ×' + selected.value : (delta >= 0 ? '+' : '−') + Math.abs(delta), state.x, PLAYER_Y - 95, delta >= 0 ? '#247765' : '#bd5b58');
            burst(state.x, PLAYER_Y - 25, delta >= 0 ? '#7ff4c1' : '#ff777f', 30); signal(delta >= 0 ? 'gate' : 'hurt');
          }
        }
        if (e.type !== 'gate' && e.y >= PLAYER_Y - 12 && e.y < PLAYER_Y + 50 && Math.abs(e.x - state.x) < (e.type === 'rock' ? 53 : 55)) {
          if (e.type === 'enemy') { e.dead = true; hurt(Math.max(5 + difficulty, Math.ceil(state.team * (e.elite ? .16 : .07))), e.x); }
          if (e.type === 'rock') { e.dead = true; hurt(Math.max(10 + difficulty * 2, Math.ceil(state.team * .15)), e.x); }
        }
      }
      for(const p of state.pickups){
        if(p.dead)continue;p.life-=dt;p.y+=cfg.speed*dt*.72;
        const distance=Math.hypot(state.x-p.x,PLAYER_Y-35-p.y),collectRadius=30+(state.buffs.magnet>0?105:0);
        if(state.buffs.magnet>0&&distance<210){const pull=1-Math.exp(-5*dt);p.x+=(state.x-p.x)*pull;p.y+=(PLAYER_Y-35-p.y)*pull;}
        if(distance<collectRadius)collectPickup(p);
        else if(p.y>760||p.life<=0)p.dead=true;
      }
      if (state.phase !== 'playing') return;
      const boss = state.boss;
      if (boss) {
        boss.clock += dt; boss.hit = Math.max(0, boss.hit - dt);
        if (boss.stage === 1 && boss.hp < boss.maxHp * .55) { boss.stage = 2; boss.beam = .8; boss.shot = .4; state.shake = .55; explode(boss.x, boss.y, '#ff7db3', 115); signal('rage'); }
        boss.x = 300 + Math.sin(boss.clock * (boss.stage === 2 ? .95 : .65)) * (115 + difficulty * 3);
        boss.y = 145 + Math.min(170, Math.max(0, boss.clock - 26) * 4);
        boss.shot -= dt; boss.beam -= dt; boss.summon -= dt;
        if (boss.shot <= 0) {
          const count = 5 + Math.floor(difficulty / 2) * 2 + (boss.stage === 2 ? 2 : 0);
          for (let i = 0; i < count; i++) { const target = 80 + i * 440 / (count - 1) + Math.sin(boss.volleys * 1.7) * 28; if (Math.abs(target - [145, 300, 455][boss.volleys % 3]) < 68) continue; hostile(boss.x, boss.y + 38, target, 205 + difficulty * 10 + boss.stage * 18, 7 + difficulty * 2, 9 + difficulty * .3); }
          hostile(boss.x, boss.y + 48, state.x, 290 + difficulty * 12, 10 + difficulty * 2, 13);
          boss.shot = (easy ? 1.2 : 1) * (boss.stage === 2 ? 1.35 : 1.85) - difficulty * .035; boss.volleys++; signal('bossShot');
        }
        if (boss.beam <= 0) {
          const xs = [state.x]; if (difficulty >= 4 && boss.stage === 2) xs.push(state.x < 300 ? 445 : 155);
          xs.forEach(x => state.hazards.push({ x, width: difficulty >= 5 ? 78 : 68, delay: easy ? 1.5 : 1.1, life: .48, hit: false }));
          boss.beam = boss.stage === 2 ? 3.5 : 5; signal('warning');
        }
        if (boss.summon <= 0 && difficulty >= 2) { spawn({ type: 'wave', count: 4 + difficulty, wave: 3 + difficulty }); boss.summon = boss.stage === 2 ? 9 : 13; signal('reinforce'); }
      }
      for (const h of state.hazards) {
        if (h.delay > 0) h.delay -= dt;
        else { h.life -= dt; if (!h.hit && Math.abs(state.x - h.x) < h.width / 2 + 22) { h.hit = true; hurt(Math.max(16 + difficulty * 3, Math.ceil(state.team * .18))); } }
      }
      const targets = state.entities.filter(e => !e.dead && !(e.type === 'gate' && e.used)).sort((a, b) => b.y - a.y);
      for (const b of state.bullets) {
        const oldY = b.y,bulletScale=!b.friendly?worldSlow:1; b.y += b.vy * dt*bulletScale; b.x += (b.vx || 0) * dt*bulletScale;
        if (b.friendly) {
          for (const e of targets) {
            if (e.dead || e.y > PLAYER_Y - 25 || b.hitIds?.includes(e.id)) continue;
            const rx = e.type === 'gate' ? e.width / 2 : e.r, ry = e.type === 'gate' ? 21 : e.r;
            if (Math.abs(b.x - e.x) < rx + b.r && b.y - b.r < e.y + ry && oldY + b.r > e.y - ry) { hitEntity(e, b);if(e.type==='enemy'&&b.pierce>0){b.pierce--;b.hitIds=(b.hitIds||[]).concat(e.id);}else b.dead=true;break; }
          }
          if (!b.dead && boss && Math.abs(b.x - boss.x) < 70 && b.y - b.r < boss.y + 65 && oldY + b.r > boss.y - 65) {
            const dealt=damageBoss(b.damage,b.kind||'pulse');gainUltimate(Math.min(.65,.12+dealt*.008));b.dead = true;
            if(state.phase!=='playing')break;
          }
        } else if (oldY - b.r < PLAYER_Y + 22 && b.y + b.r > PLAYER_Y - 22 && Math.abs(b.x - state.x) < b.r + 24) { b.dead = true; hurt(Math.max(b.damage, Math.ceil(state.team * (b.ratio || .055)))); }
        if (b.y < -90 || b.y > 840 || b.x < -40 || b.x > W + 40) b.dead = true;
      }
      for (const p of state.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 90 * dt; p.life -= dt; }
      for (const a of state.explosions) a.life -= dt;
      for(const a of state.impacts)a.life-=dt;
      for(const a of state.skillEffects)a.life-=dt;
      for (const t of state.texts) { t.y -= 33 * dt; t.life -= dt; }
      state.entities = state.entities.filter(e => !e.dead && e.y < 850);
      state.bullets = state.bullets.filter(b => !b.dead);
      state.pickups=state.pickups.filter(p=>!p.dead).slice(-MAX_PICKUPS);
      state.hazards = state.hazards.filter(h => h.delay > 0 || h.life > 0);
      state.particles = state.particles.filter(p => p.life > 0).slice(-480);
      state.explosions = state.explosions.filter(e => e.life > 0).slice(-24);
      state.impacts=state.impacts.filter(e=>e.life>0).slice(-MAX_IMPACTS);
      state.skillEffects=state.skillEffects.filter(e=>e.life>0).slice(-MAX_SKILL_EFFECTS);
      state.texts = state.texts.filter(t => t.life > 0).slice(-18);
      if (boss && boss.clock > 80) hurt(20 + difficulty * 3);
      state.signals = state.signals.slice(-100);
    }
    function clearBuffers(){state.skillBuffer=0;state.tacticalBuffer=0;state.supportBuffer=0;state.ultimateBuffer=0;}
    function pause() { if (state.phase === 'playing') { state.targetX = state.x; clearBuffers(); state.phase = 'paused'; return true; } return false; }
    function resume() { if (state.phase === 'paused') { state.phase = 'playing'; return true; } return false; }
    function drainSignals() { return state.signals.splice(0); }
    function snapshot() {
      const projectile=b=>({x:b.x,y:b.y,vx:b.vx,vy:b.vy,r:b.r,kind:b.kind||'pulse',charged:!!b.charged,pierce:b.pierce||0});
      return { phase: state.phase, level, levelId:cfg.id, mechanic, difficulty, hero, easy, loadout, captainBuild:{nodes:[...state.captainBuild.nodes],tactical:state.captainBuild.tactical},captainEffects:{...training},tacticalName:state.tacticalName,tacticalKind:state.tacticalKind,tacticalDuration:state.tacticalDuration,energy:state.energy, shield:state.shield, shieldTime:state.shieldTime, focus:state.focus, supportCooldown:state.supportCooldown, supportUses:state.supportUses, dashCharges:state.dashCharges, dashRecharge:state.dashRecharge, dashUses:state.dashUses,
        tacticalCooldown:+state.tacticalCooldown.toFixed(2),tacticalTime:+state.tacticalTime.toFixed(2),tacticalUses:state.tacticalUses,ultimateCharge:+state.ultimateCharge.toFixed(2),ultimateTime:+state.ultimateTime.toFixed(2),ultimateUses:state.ultimateUses,buffs:{...state.buffs},
        medals:state.medals, rank:state.rank, time: +state.time.toFixed(2), team: state.team, peakTeam: state.peakTeam, weapon: state.weapon, kills: state.kills, score: state.score, stars: state.stars, x: +state.x.toFixed(2), cooldown: +state.cooldown.toFixed(2), bossHp: state.boss ? Math.max(0, +state.boss.hp.toFixed(2)) : null, boss: state.boss ? { x: state.boss.x, y: state.boss.y, stage: state.boss.stage, clock: state.boss.clock, maxHp: state.boss.maxHp } : null,
        entities: state.entities.map(e => ({ id:e.id,type: e.type, kind: e.kind, group: e.group, x: e.x, y: e.y, value: e.value, op: e.op, hp: e.hp,maxHp:e.maxHp, hpRatio:e.maxHp?clamp(e.hp/e.maxHp,0,1):null,damageRatio:e.maxHp?1-clamp(e.hp/e.maxHp,0,1):0, guardHp:e.guardHp,maxGuardHp:e.maxGuardHp||0, used: e.used,sizeTier:e.sizeTier,visualScale:e.visualScale||1,elite:!!e.elite,eliteVariant:e.eliteVariant||null,r:e.r })),
        pickups:state.pickups.map(p=>({...p})),projectiles: state.bullets.filter(b => !b.friendly).map(projectile),friendlyProjectiles:state.bullets.filter(b=>b.friendly).map(projectile), impacts:state.impacts.map(a=>({...a})),skillEffects:state.skillEffects.map(a=>({...a})),hazards: state.hazards.map(h => ({ ...h })), skillUses: state.skillUses, combo: state.combo, maxCombo: state.maxCombo, overdrive: state.overdrive, overdrives: state.overdrives, perfectDodges:state.perfectDodges, damageTaken: state.damageTaken };
    }
    return { state, step, skill, requestSkill, tactical, requestTactical, ultimate, requestUltimate, support, requestSupport, dash, pause, resume, drainSignals, snapshot };
  }
  return { W, H, PLAYER_Y, MAX_TEAM, MAX_WEAPON, APP_VERSION, LEVELS, HEROES, LOADOUTS, ENEMIES, PICKUPS, registerPack, missionResults, createGame, sanitizeSave, clamp };
});
