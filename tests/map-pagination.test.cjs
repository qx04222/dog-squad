'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SOURCE_ROOT = process.env.DOG_SQUAD_SOURCE_ROOT || path.resolve(__dirname, '..', 'src');

class FakeStyle {
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(name, String(value)); }
  getPropertyValue(name) { return this.values.get(name) || ''; }
}

class FakeClassList {
  constructor(node) { this.node = node; }
  add(...names) { names.forEach(name => this.node._classes.add(name)); }
  remove(...names) { names.forEach(name => this.node._classes.delete(name)); }
  toggle(name, force) {
    const next = force === undefined ? !this.contains(name) : Boolean(force);
    if (next) this.add(name); else this.remove(name);
    return next;
  }
  contains(name) { return this.node._classes.has(name); }
}

function dataName(attribute) {
  return attribute.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function matches(node, selector) {
  if (!node || node.nodeType !== 1) return false;
  const attribute = selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
  if (attribute) {
    const actual = node.getAttribute(attribute[1]);
    return attribute[2] === undefined ? actual !== null : actual === attribute[2];
  }
  const tagAndClasses = selector.match(/^([a-z][a-z0-9-]*)?((?:\.[a-z0-9_-]+)*)$/i);
  if (!tagAndClasses) return false;
  if (tagAndClasses[1] && node.tagName !== tagAndClasses[1].toUpperCase()) return false;
  return tagAndClasses[2].split('.').filter(Boolean).every(name => node.classList.contains(name));
}

class FakeNode {
  constructor(tagName = 'div', nodeType = 1) {
    this.tagName = String(tagName).toUpperCase();
    this.nodeType = nodeType;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.style = new FakeStyle();
    this._classes = new Set();
    this.classList = new FakeClassList(this);
    this.listeners = new Map();
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.open = false;
  }
  set className(value) { this._classes = new Set(String(value || '').split(/\s+/).filter(Boolean)); }
  get className() { return [...this._classes].join(' '); }
  append(...nodes) {
    for (const node of nodes) {
      if (node === null || node === undefined) continue;
      if (node.nodeType === 11) { this.append(...node.children); node.children = []; continue; }
      if (typeof node !== 'object') { this.textContent += String(node); continue; }
      if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node);
      node.parentNode = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    this.children.forEach(node => { node.parentNode = null; });
    this.children = [];
    this.textContent = '';
    this.append(...nodes);
  }
  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === 'id') this.id = text;
    if (name === 'class') this.className = text;
    if (name.startsWith('data-')) this.dataset[dataName(name)] = text;
  }
  getAttribute(name) {
    if (name === 'id' && this.id) return this.id;
    if (name === 'class') return this.className || null;
    if (name.startsWith('data-')) return this.dataset[dataName(name)] ?? null;
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }
  click() {
    if (this.disabled) return;
    for (const callback of this.listeners.get('click') || []) callback({ target: this, currentTarget: this });
    if (typeof this.onclick === 'function') this.onclick({ target: this, currentTarget: this });
  }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(value => value.trim());
    const found = [];
    const visit = node => {
      for (const child of node.children) {
        if (selectors.some(part => matches(child, part))) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(node) {
    for (let current = node; current; current = current.parentNode) if (current === this) return true;
    return false;
  }
  focus() { if (global.document) global.document.activeElement = this; }
  scrollIntoView() {}
  showModal() { this.open = true; this.showModalCount = (this.showModalCount || 0) + 1; }
  close() { this.open = false; for (const callback of this.listeners.get('close') || []) callback({ target: this }); }
}

class FakeDocument {
  constructor(ids = ['campaign-map', 'campaign-summary']) {
    this.elements = new Map(ids.map(id => {
      const node = new FakeNode(id.endsWith('-dialog') ? 'dialog' : 'div');
      node.id = id;
      return [id, node];
    }));
    this.body = new FakeNode('body');
    this.activeElement = this.body;
    this.listeners = new Map();
  }
  createElement(tag) { return new FakeNode(tag); }
  createElementNS(_namespace, tag) { return new FakeNode(tag); }
  createDocumentFragment() { return new FakeNode('#fragment', 11); }
  createTextNode(text) { const node = new FakeNode('#text', 3); node.textContent = String(text); return node; }
  getElementById(id) { return this.elements.get(id) || null; }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
}

function freshModule(name) {
  const filename = path.join(SOURCE_ROOT, name);
  delete require.cache[require.resolve(filename)];
  return require(filename);
}

function installMapDom() {
  global.document = new FakeDocument();
  global.window = { DOG_WORLD_CUTE: 'world-cute.jpg' };
  global.requestAnimationFrame = callback => callback();
  return global.document;
}

function act(id, packId = 'builtin') { return { id, key: `${packId}:${id}`, packId, title: `第${id}章 岛屿${id}` }; }
function level(actRow, index, options = {}) {
  const id = options.id || `${actRow.packId}-${actRow.id}-${index + 1}`;
  return { id, key: options.key || id, packId: actRow.packId, act: actRow.id, name: options.name || `任务 ${index + 1}` };
}
function campaign(actCount, levelsPerAct = 8) {
  const acts = Array.from({ length: actCount }, (_, index) => act(String(index + 1)));
  const levels = acts.flatMap(row => Array.from({ length: levelsPerAct }, (_, index) => level(row, index)));
  return { acts, levels };
}

function render(options) {
  const document = installMapDom();
  const Expedition = freshModule('expedition-ui.js');
  Expedition.renderCampaign(options);
  return document.getElementById('campaign-map');
}

test.afterEach(() => {
  delete global.document;
  delete global.window;
  delete global.requestAnimationFrame;
});

test('六岛地图渲染 48 个唯一、可选择的关卡节点', () => {
  const data = campaign(6);
  const selected = [];
  const map = render({ ...data, currentLevel: 0, records: {}, onSelect: index => selected.push(index) });
  const nodes = map.querySelectorAll('[data-map-level]');

  assert.equal(nodes.length, 48);
  assert.equal(new Set(nodes.map(node => node.dataset.levelKey)).size, 48);
  assert.deepEqual(nodes.map(node => Number(node.dataset.levelIndex)), Array.from({ length: 48 }, (_, index) => index));
  assert.ok(nodes.every(node => node.tagName === 'BUTTON' && node.getAttribute('aria-label')));
  nodes[31].click();
  assert.deepEqual(selected, [31]);
});

test('单章 9 关会拆成不重叠岛组，且只有第 9 关是终章', () => {
  const chapter = act('1');
  const levels = Array.from({ length: 9 }, (_, index) => level(chapter, index));
  const map = render({ acts: [chapter], levels, currentLevel: 8, records: {} });
  const nodes = map.querySelectorAll('[data-map-level]');
  const positions = nodes.map(node => `${node.style.getPropertyValue('--node-x')}/${node.style.getPropertyValue('--node-y')}`);
  const finales = map.querySelectorAll('.chapter-finale');

  assert.equal(nodes.length, 9);
  assert.equal(new Set(positions).size, 9, '九个关卡按钮不应共享坐标');
  assert.ok(nodes.every(node => node.tagName === 'BUTTON' && node.getAttribute('aria-label')));
  assert.equal(finales.length, 1);
  assert.equal(finales[0].dataset.levelIndex, '8');
  assert.equal(finales[0].querySelector('.picture-level-token').textContent, '★');
});

test('七岛以上出现分页，并默认打开当前关卡所在页', () => {
  const data = campaign(7);
  const map = render({ ...data, currentLevel: 50, records: {} });
  const tabs = map.querySelectorAll('.map-page-tab');

  assert.equal(tabs.length, 2);
  assert.equal(tabs[1].getAttribute('aria-pressed'), 'true');
  assert.ok(tabs[1].classList.contains('active'));
  assert.deepEqual(map.querySelectorAll('[data-map-level]').map(node => Number(node.dataset.levelIndex)), [48,49,50,51,52,53,54,55]);
  assert.equal(map.querySelector('.picture-level.current').dataset.levelIndex, '50');

  tabs[0].click();
  assert.equal(tabs[0].getAttribute('aria-pressed'), 'true');
  assert.equal(map.querySelectorAll('[data-map-level]').length, 48);
});

test('相同 act id 在不同关卡包中保持关卡键与岛组隔离', () => {
  const first = act('shared', 'pack-a');
  const second = act('shared', 'pack-b');
  const levels = [
    level(first, 0, { id: 'intro', key: 'intro-a' }),
    level(second, 0, { id: 'intro', key: 'intro-b' })
  ];
  const map = render({ acts: [first, second], levels, currentLevel: 0, records: {} });
  const nodes = map.querySelectorAll('[data-map-level]');
  const islands = map.querySelectorAll('.map-island');

  assert.equal(nodes.length, 2);
  assert.deepEqual(nodes.map(node => node.dataset.levelKey).sort(), ['pack-a:intro-a', 'pack-b:intro-b']);
  assert.deepEqual(islands.map(node => node.dataset.actKey).sort(), ['pack-a:shared', 'pack-b:shared']);
});

test('轻松模式成绩在样式和无障碍名称中都与标准通关区分', () => {
  const chapter = act('1');
  const mission = level(chapter, 0, { id: 'assist-win' });
  const map = render({ acts: [chapter], levels: [mission], currentLevel: 0, records: { 'assist-win': { assist: { stars: 2 } } } });
  const node = map.querySelector('[data-map-level]');

  assert.ok(node.classList.contains('complete'));
  assert.ok(node.classList.contains('assist-only'));
  assert.match(node.getAttribute('aria-label'), /轻松模式/);
  assert.doesNotMatch(node.getAttribute('aria-label'), /标准模式/);
});

test('Story.open 在宿主初始化前安全返回 false', () => {
  const Story = freshModule('story-ui.js');
  assert.equal(Story.open({ type: 'prologue' }), false);
  assert.equal(Story.isOpen(), false);
});

test('Story.canRead 拒绝 ending 时不渲染也不打开对话框', () => {
  const document = new FakeDocument(['story-dialog', 'story-title', 'story-btn', 'close-story']);
  global.document = document;
  global.window = { DOG_STORY_POSTCARD: 'story-postcard.jpg' };
  const Story = freshModule('story-ui.js');
  Story.init({
    story: { chapters: [{ id: '1', title: '第一章', opening: [], ending: [{ speaker: 'Ramen', text: '秘密结局' }] }] },
    canRead: request => request.phase !== 'ending'
  });
  const dialog = document.getElementById('story-dialog');
  const title = document.getElementById('story-title');
  title.textContent = '未渲染';

  assert.equal(Story.open({ type: 'chapter', actId: '1', phase: 'ending' }), false);
  assert.equal(dialog.open, false);
  assert.equal(dialog.showModalCount || 0, 0);
  assert.equal(title.textContent, '未渲染');
});


test('挑战成绩点亮地图并明确显示档位，不冒充标准或辅助', () => {
  const chapter=act('1'), mission=level(chapter,0,{id:'expert-win'});
  const map=render({acts:[chapter],levels:[mission],currentLevel:0,records:{'expert-win':{expert:{stars:3,medals:2}}}});
  const node=map.querySelector('[data-map-level]');
  assert.ok(node.classList.contains('complete'));
  assert.ok(!node.classList.contains('assist-only'));
  assert.match(node.getAttribute('aria-label'),/3 星完成，挑战模式/);
  assert.doesNotMatch(node.getAttribute('aria-label'),/标准模式|轻松模式/);
});
