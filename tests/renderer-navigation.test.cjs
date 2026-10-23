'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const GAME = require('node:path').resolve(__dirname, '../src/game.js');
const source = fs.readFileSync(GAME, 'utf8');
const begin = source.indexOf('  function setNativeBattle(active)');
const end = source.indexOf('  function pause(reason', begin);
assert.ok(begin >= 0 && end > begin, 'navigation functions must be extractable');
const actualFunctions = source.match(/  function overlayActive\(active\) \{[^\n]+\}/)[0] + '\n' + source.slice(begin, end);

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const nextTurn = () => new Promise(r => setImmediate(r));
async function waitForActivation(api) { for(let i=0;i<100&&!api.snapshot().calls.includes(true);i++)await nextTurn(); assert.ok(api.snapshot().calls.includes(true),'native activation was requested'); }

function runtime({ gateFirstTrue = false } = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, textContent: '', firstChild: { textContent: '' }, style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} }, focus() {} });
    return elements.get(id);
  };
  const firstTrue = deferred(); let trueCount = 0, battleActive = true, starts = 0;
  const h = {
    navigationEpoch: 0, startRequest: null, nativeBattleQueue: Promise.resolve(), terminalFlush: Promise.resolve(),
    game: { state: { phase: 'won' } }, victoryStarted: 0, resultRecorded: true, radioIndex: 0, pointsBefore: 0,
    shotMotion: 0, moveMotion: 0, bossEntrance: 1, bossStageSeen: 0, bossTransition: 1, skillPulse: 0,
    level: 0, hero: 0, ambient: 0, lastFrame: 0, pointerX: null, activeAct: 'act', resultShown: true,
    save: { lastLevelId: 'l1', easy: false, loadout: 0, records: {}, captainBuilds: { ramen: { nodes: [], tactical: 'default' } } },
    LEVELS: [{ id: 'l1', intro: 'one' }, { id: 'l2', intro: 'two' }],
    window: { dogDesktop: { setBattleActive(active) { h.calls.push(active); if (active && gateFirstTrue && trueCount++ === 0) return firstTrue.promise.then(() => { battleActive = true; }); battleActive = active; return Promise.resolve(); } } },
    calls: [], $: element, document: { body: { classList: element('body').classList }, querySelector: () => element('shell') },
    pointerInput: { clear() {} }, keys: new Set(), audio: { init() {} }, canvas: { focus() {} },
    innerWidth: 1000, performance: { now: () => 1 }, crypto: { getRandomValues: a => (a[0] = 7, a) },
    Growth: { HERO_KEYS: ['ramen', 'bing'] },
    captainProfile: () => ({ points: 2, build: { nodes: [], tactical: 'default' } }),
    createGame: () => { starts++; return { state: { phase: 'playing' } }; },
    persist() {}, disableSelection() {}, updateHud() {}, updateMenu() {}, hideToast() {}, toast() {}, requestAnimationFrame() {}, scrollTo() {},
    actFor: () => ({ key: 'act' })
  };
  const factory = new Function('h', `with(h){${actualFunctions}\nreturn {start,home,setNativeBattle,flush:()=>terminalFlush,setFlush:v=>terminalFlush=v,snapshot:()=>({phase:game?.state?.phase||'lobby',battleActive:h.__battle(),starts:h.__starts(),calls:[...h.calls]})};}`);
  h.__battle = () => battleActive; h.__starts = () => starts;
  return { api: factory(h), firstTrue };
}

test('actual game functions cancel a start still waiting for delayed result persistence', async () => {
  const save = deferred(), { api } = runtime();
  api.setFlush(save.promise.then(() => api.setNativeBattle(false)));
  const starting = api.start(); api.home(); save.resolve(); await Promise.all([starting, api.flush()]);
  assert.deepEqual(api.snapshot(), { phase: 'lobby', battleActive: false, starts: 0, calls: [false, false] });
});

test('actual game functions finish false when home cancels a delayed native activation', async () => {
  const { api, firstTrue } = runtime({ gateFirstTrue: true });
  const starting = api.start(); await waitForActivation(api);
  api.home(); firstTrue.resolve(); await Promise.all([starting, api.flush()]);
  assert.deepEqual(api.snapshot(), { phase: 'lobby', battleActive: false, starts: 0, calls: [true, false] });
});

test('actual game functions serialize home cleanup before one newer start', async () => {
  const { api, firstTrue } = runtime({ gateFirstTrue: true });
  const stale = api.start(); await waitForActivation(api);
  api.home(); const newer = api.start(); const duplicate = api.start(); firstTrue.resolve();
  await Promise.all([stale, newer, duplicate, api.flush()]);
  assert.deepEqual(api.snapshot(), { phase: 'playing', battleActive: true, starts: 1, calls: [true, false, true] });
});
