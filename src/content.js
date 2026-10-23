(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DogContent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // The public product version restarted at 1.0.0. Content compatibility stays
  // monotonic so packs signed for the pre-release 4.x-6.x builds remain valid.
  const APP_VERSION = '1.1.0';
  const CONTENT_API_VERSION = '6.0.0';
  const ID = /^[a-z][a-z0-9-]{1,63}$/;
  const VERSION = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;
  const MECHANICS = ['standard', 'blackout', 'overcharge', 'crossfire', 'repairSwarm'];
  const KINDS = ['normal', 'runner', 'shooter', 'tank', 'guardian', 'repair'];
  function fail(message) { throw new Error('关卡包无效：' + message); }
  function record(value, fields, where) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(where + '必须为对象');
    for (const k of Object.keys(value)) if (!fields.includes(k)) fail(where + '包含未知字段 ' + k);
    return value;
  }
  function text(value, max, where) {
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(where + '文本不符合限制');
    return value.trim();
  }
  function id(value, where) { if (typeof value !== 'string' || !ID.test(value)) fail(where + '标识不合法'); return value; }
  function version(value) { if (typeof value !== 'string' || !VERSION.test(value)) fail('版本号必须为 x.y.z'); return value; }
  function compareVersions(a, b) { const aa = version(a).split('.').map(Number), bb = version(b).split('.').map(Number); for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] < bb[i] ? -1 : 1; return 0; }
  function number(value, min, max, where, integer = true) {
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(where + '超出范围');
    return value;
  }
  function list(value, min, max, where) { if (!Array.isArray(value) || value.length < min || value.length > max) fail(where + '数量不符合限制'); return value; }
  function validatePack(input, { appVersion = CONTENT_API_VERSION } = {}) {
    const p = record(input, ['schema', 'id', 'version', 'minAppVersion', 'title', 'description', 'acts', 'levels'], '包');
    if (p.schema !== 1) fail('不支持此内容格式');
    const out = { schema: 1, id: id(p.id, '包'), version: version(p.version), minAppVersion: version(p.minAppVersion), title: text(p.title, 80, '标题'), description: text(p.description, 1200, '说明') };
    if (compareVersions(out.minAppVersion, appVersion) > 0) fail('请先将游戏更新到 ' + out.minAppVersion);
    const actIds = new Set(), levelIds = new Set();
    out.acts = list(p.acts, 1, 12, '章节').map(a => {
      record(a, ['id', 'title', 'subtitle', 'synopsis'], '章节');
      const v = { id: id(a.id, '章节'), title: text(a.title, 60, '章节名'), subtitle: text(a.subtitle, 160, '章节副标题'), synopsis: text(a.synopsis, 1500, '章节简介') };
      if (actIds.has(v.id)) fail('章节 ID 重复'); actIds.add(v.id); return v;
    });
    const strings = { name: 60, en: 80, subtitle: 180, boss: 80, tag: 24, intro: 300, brief: 2000, objective: 300, radio: 500, outro: 1800, debrief: 1800, mechanicLabel: 50, mechanicHint: 400 };
    const ranges = { difficulty: [0, 7], duration: [65, 120], speed: [90, 160], bossHp: [1000, 25000], star2: [1, 299], star3: [2, 300], comboGoal: [1, 150], damageGoal: [0, 300], killGoal: [1, 700] };
    out.levels = list(p.levels, 1, 64, '关卡').map(l => {
      record(l, ['id', 'act', ...Object.keys(strings), ...Object.keys(ranges), 'color', 'sea', 'road', 'bossKind', 'mechanic', 'dialogue', 'transmissions', 'archive'], '关卡');
      const v = { id: id(l.id, '关卡'), act: id(l.act, '章节') };
      if (!v.id.startsWith(out.id + '-') || levelIds.has(v.id)) fail('关卡 ID 必须归属当前包且不能重复'); levelIds.add(v.id);
      if (!actIds.has(v.act)) fail('关卡引用不存在的章节');
      for (const [key, max] of Object.entries(strings)) v[key] = text(l[key], max, key);
      for (const [key, [min, max]] of Object.entries(ranges)) v[key] = number(l[key], min, max, key);
      if (v.star2 >= v.star3) fail('三星门槛必须高于二星且不超过兵力上限');
      for (const key of ['color', 'sea', 'road']) { if (typeof l[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(l[key])) fail('无效颜色'); v[key] = l[key]; }
      if (!KINDS.includes(l.bossKind) || !MECHANICS.includes(l.mechanic)) fail('未知机体或战场规则');
      v.bossKind = l.bossKind; v.mechanic = l.mechanic;
      v.dialogue = list(l.dialogue, 2, 8, '战前对话').map(d => { record(d, ['speaker', 'text'], '对话'); return { speaker: text(d.speaker, 40, '说话者'), text: text(d.text, 600, '对话') }; });
      let last = 0;
      v.transmissions = list(l.transmissions, 1, 6, '战中通讯').map(d => {
        record(d, ['at', 'speaker', 'text'], '通讯'); const at = number(d.at, .1, .9, '通讯时机', false);
        if (at <= last) fail('通讯时机必须递增'); last = at;
        return { at, speaker: text(d.speaker, 40, '说话者'), text: text(d.text, 400, '通讯') };
      });
      record(l.archive, ['title', 'text'], '档案'); v.archive = { title: text(l.archive.title, 100, '档案名'), text: text(l.archive.text, 3000, '档案') };
      return v;
    });
    for (const a of out.acts) if (!out.levels.some(l => l.act === a.id)) fail('空章节');
    return out;
  }
  return { APP_VERSION, CONTENT_API_VERSION, validatePack, compareVersions, MECHANICS, KINDS };
});
