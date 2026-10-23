(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DogProgression = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const HERO_KEYS = Object.freeze(['ramen', 'bing']);
  const VALID_ID = /^[a-z][a-z0-9-]{1,63}$/;
  const LOADOUT_COUNT = 8;
  const heroKey = hero => hero === 1 || hero === 'bing' ? 'bing' : 'ramen';
  const safeInt = (value, max) => Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
  const routeNames = {
    ramen: [['precision', '精准先锋', '让每一次命中更有分量。', 'damage'], ['reflex', '机动指挥', '缩短脉冲与战术技能的等待。', 'cooldown'], ['guard', '救援护航', '在危险路线中保全队伍。', 'hurt']],
    bing: [['precision', '重装火力', '稳定提高所有直接攻击伤害。', 'damage'], ['reflex', '战术工程', '更频繁地调度脉冲与战术技能。', 'cooldown'], ['guard', '坚守阵线', '强化队伍的损伤承受能力。', 'hurt']]
  };
  const ROUTES = Object.fromEntries(HERO_KEYS.map(key => [key, routeNames[key].map(([id, name, detail, effect]) => ({
    id, name, detail, nodes: Array.from({ length: 3 }, (_, i) => ({ id: `${key}-${id}-${i + 1}`, name: `${name} ${['I', 'II', 'III'][i]}`, detail: effect === 'damage' ? '直接伤害 +2%' : effect === 'cooldown' ? '脉冲 / 战术冷却 −1.5%' : '承受损伤 −2%', cost: 1, parent: i ? `${key}-${id}-${i}` : null, effect, value: effect === 'cooldown' ? .015 : .02 }))
  }))]));
  const TACTICALS = {
    ramen: [
      { id: 'default', name: '凝时标记场', detail: '3 秒敌军 / 敌弹减速 45%，对目标伤害 +30%。', cooldown: 14, kind: 'timeField' },
      { id: 'arc', name: '链闪脉冲', detail: '瞬间打击最前方 6 个目标，震散近身敌弹；对首领追加定向电击。', cooldown: 13, kind: 'chainArc', node: 'ramen-reflex-1', completed: 2 },
      { id: 'rescue', name: '救援信标', detail: '补充 14 名队员与 30 点护盾，护盾持续 4 秒；清除近身敌弹。', cooldown: 18, kind: 'rescueBeacon', node: 'ramen-guard-1', completed: 6 }
    ],
    bing: [
      { id: 'default', name: '破阵穿甲齐射', detail: '发射 9 枚爆裂穿甲弹，每枚可贯穿 4 个敌人。', cooldown: 14, kind: 'armorVolley' },
      { id: 'barrage', name: '疾风弹幕', detail: '6 秒快速射击与 3 秒集火，牺牲瞬间穿甲换取持续压制。', cooldown: 17, kind: 'rapidBarrage', node: 'bing-reflex-1', completed: 2 },
      { id: 'bulwark', name: '堡垒震波', detail: '获得 50 点护盾持续 5 秒，并震击前方区域、驱散附近敌弹。', cooldown: 18, kind: 'bulwarkWave', node: 'bing-guard-1', completed: 6 }
    ]
  };
  // Historical signed-pack records remain useful even if a pack is temporarily removed.
  // A local save is user controlled; the cap bounds growth without inventing spendable currencies.
  function earned(records) {
    let completed = 0, medals = 0;
    if (records && typeof records === 'object' && !Array.isArray(records)) {
      for (const [id, record] of Object.entries(records)) {
        if (!VALID_ID.test(id) || id === 'constructor') continue;
        const completedModes = ['normal', 'assist', 'expert'].filter(mode => safeInt(record?.[mode]?.stars, 3) > 0);
        if (!completedModes.length) continue;
        completed++;
        medals += Math.max(...completedModes.map(mode => safeInt(record[mode].medals, 3)));
      }
    }
    return { completed, medals, points: Math.min(9, 2 + Math.floor(completed / 4) + Math.floor(medals / 9)) };
  }
  function unlocked(tactical, nodes, stats) { return tactical.id === 'default' || nodes.includes(tactical.node) || stats.completed >= tactical.completed; }
  function normalizeBuild(raw, hero, records) {
    const key = heroKey(hero), stats = earned(records), candidate = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const requested = new Set(Array.isArray(candidate.nodes) ? candidate.nodes.filter(id => typeof id === 'string') : []), nodes = [];
    // Canonical parent-first order makes malformed input order harmless and budget trimming deterministic.
    for (const route of ROUTES[key]) for (const node of route.nodes) if (requested.has(node.id) && (!node.parent || nodes.includes(node.parent)) && nodes.length < stats.points) nodes.push(node.id);
    const tactical = TACTICALS[key].find(item => item.id === candidate.tactical && unlocked(item, nodes, stats));
    return { nodes, tactical: tactical?.id || 'default' };
  }
  function normalizeBuilds(raw, records) { return Object.fromEntries(HERO_KEYS.map(key => [key, normalizeBuild(raw?.[key], key, records)])); }
  function effectsFor(build, hero) {
    const selected = new Set(build.nodes), effects = { damage: 1, hurt: 1, cooldown: 1 };
    for (const route of ROUTES[heroKey(hero)]) for (const node of route.nodes) if (selected.has(node.id)) effects[node.effect] += node.effect === 'damage' ? node.value : -node.value;
    for (const key of Object.keys(effects)) effects[key] = Math.round(effects[key] * 10000) / 10000;
    return effects;
  }
  function getProfile(records, hero, raw) {
    const key = heroKey(hero), stats = earned(records), build = normalizeBuild(raw, key, records), available = stats.points - build.nodes.length;
    return { heroKey: key, ...stats, spent: build.nodes.length, available, build, effects: effectsFor(build, key),
      routes: ROUTES[key].map(route => ({ ...route, nodes: route.nodes.map(node => ({ ...node, selected: build.nodes.includes(node.id), available: !build.nodes.includes(node.id) && available > 0 && (!node.parent || build.nodes.includes(node.parent)) })) })),
      tacticals: TACTICALS[key].map(item => ({ ...item, unlocked: unlocked(item, build.nodes, stats), selected: build.tactical === item.id, unlockDetail: item.id === 'default' ? '初始可用' : `完成 ${item.completed} 关，或训练「${ROUTES[key].flatMap(r => r.nodes).find(n => n.id === item.node).name}」` })) };
  }
  function setNode(records, hero, raw, id, selected = true) {
    const key = heroKey(hero), build = normalizeBuild(raw, key, records), known = ROUTES[key].flatMap(route => route.nodes).find(node => node.id === id);
    if (!known) return build;
    if (selected) {
      if (build.nodes.includes(id) || build.nodes.length >= earned(records).points || (known.parent && !build.nodes.includes(known.parent))) return build;
      return normalizeBuild({ ...build, nodes: [...build.nodes, id] }, key, records);
    }
    const removed = new Set([id]);
    for (const node of ROUTES[key].flatMap(route => route.nodes)) if (removed.has(node.parent)) removed.add(node.id);
    return normalizeBuild({ ...build, nodes: build.nodes.filter(node => !removed.has(node)) }, key, records);
  }
  function selectTactical(records, hero, raw, id) { return normalizeBuild({ ...normalizeBuild(raw, hero, records), tactical: id }, hero, records); }
  function resetBuild() { return { nodes: [], tactical: 'default' }; }
  return { HERO_KEYS, LOADOUT_COUNT, heroKey, earned, normalizeBuild, normalizeBuilds, getProfile, setNode, selectTactical, resetBuild };
});
