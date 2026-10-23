'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/game.js'), 'utf8');
const intro = source.slice(source.indexOf('  const VISUAL_INTRO_KEY'), source.indexOf('  function setNativeBattle'));
function listener(id, end) {
  const begin = source.indexOf(`  $('${id}').addEventListener`);
  assert.ok(begin >= 0);
  return source.slice(begin, source.indexOf(end, begin));
}
const cancel = listener('close-brief', "  $('deploy-btn')");
const deploy = listener('deploy-btn', "  $('support-btn')");
const next = listener('result-next', "  $('skill-btn')");
function runtime({ seen = [], won = true, level = 0 } = {}) {
  const elements = new Map(), calls = [];
  const h = { save: { storySeen: [...seen] }, level, LEVELS: [{}, {}], game: { state: { won } },
    start: () => calls.push('start'), persist: () => calls.push('persist'),
    home: () => calls.push('home'), homeToMap: () => calls.push('map'),
    $: id => { if (!elements.has(id)) elements.set(id, { textContent: '', open: false,
      addEventListener(type, fn) { this[type] = fn; }, showModal() { this.open = true; }, close() { this.open = false; }
    }); return elements.get(id); }
  };
  const brief = new Function('h', `with(h){${intro}\n${cancel}\n${deploy}\n${next}\nreturn brief;}`)(h);
  return { h, calls, brief, element: h.$ };
}
test('fresh visual introduction is one cancellable page without recording unread story', () => {
  const r = runtime(); r.brief();
  assert.equal(r.element('brief-dialog').open, true);
  assert.deepEqual(r.calls, []);
  r.element('close-brief').click();
  assert.equal(r.element('brief-dialog').open, false);
  assert.deepEqual(r.h.save.storySeen, []);
  assert.deepEqual(r.calls, []);
});
test('deploy records only the visual introduction, and later starts skip the page', () => {
  const r = runtime({ seen: ['prologue'] }); r.brief(); r.element('deploy-btn').click();
  assert.deepEqual(r.h.save.storySeen, ['prologue', 'visual-intro-v1']);
  assert.deepEqual(r.calls, ['persist', 'start']);
  assert.equal(r.element('brief-dialog').open, false);
  r.calls.length = 0; r.brief();
  assert.deepEqual(r.calls, ['start']);
  assert.equal(r.element('brief-dialog').open, false);
});
test('victory advances once through existing home/start barriers without a story gate', () => {
  const r = runtime(); r.element('result-next').click();
  assert.equal(r.h.level, 1); assert.deepEqual(r.calls, ['home', 'start']);
  assert.deepEqual(r.h.save.storySeen, []);
});
test('failure retries the same mission and final victory returns to the map', () => {
  const lost = runtime({ won: false }); lost.element('result-next').click();
  assert.equal(lost.h.level, 0); assert.deepEqual(lost.calls, ['start']);
  const final = runtime({ level: 1 }); final.element('result-next').click();
  assert.equal(final.h.level, 1); assert.deepEqual(final.calls, ['map']);
});
