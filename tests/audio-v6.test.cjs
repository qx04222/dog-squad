'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Audio = require('../src/soundscape.js');
class Param {
  constructor() { this.value = 1; this.events = []; }
  setValueAtTime(value, at) { this.value = value; this.events.push({ value, at }); }
  exponentialRampToValueAtTime(value, at) { this.events.push({ value, at }); }
  setTargetAtTime(value, at) { this.value = value; this.events.push({ value, at }); }
  cancelScheduledValues() {}
}
class Node {
  constructor(kind, context) { this.kind = kind; this.context = context; this.gain = new Param(); this.frequency = new Param(); this.Q = new Param(); this.threshold = new Param(); this.knee = new Param(); this.ratio = new Param(); this.attack = new Param(); this.release = new Param(); this.connected = false; }
  connect() { this.connected = true; }
  disconnect() { this.connected = false; }
  start(at) { this.started = at; }
  stop(at) { this.stopped = at; }
}
class Context {
  constructor() { this.sampleRate = 48000; this.currentTime = 0; this.state = 'running'; this.destination = {}; this.nodes = []; this.closed = 0; }
  node(kind) { const node = new Node(kind, this); this.nodes.push(node); return node; }
  createGain() { return this.node('gain'); }
  createDynamicsCompressor() { return this.node('compressor'); }
  createWaveShaper() { return this.node('limiter'); }
  createOscillator() { return this.node('oscillator'); }
  createBiquadFilter() { return this.node('filter'); }
  createBufferSource() { return this.node('noise'); }
  createBuffer(channels, length, sampleRate) { const data = new Float32Array(length); return { getChannelData: () => data }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.closed++; this.state = 'closed'; return Promise.resolve(); }
  advance(time) { this.currentTime = time; for (const n of this.nodes) if (!n.ended && n.stopped <= time) { n.ended = true; n.onended?.(); } }
}
function fixture(preferences = {}) {
  const ctx = new Context(), callbacks = new Map(); let id = 0, scheduled = 0;
  const settings = { sound: true, musicVolume: .7, effectsVolume: .7, ...preferences };
  const audio = Audio.create({ context: ctx, getPreferences: () => settings,
    setInterval(fn) { const key = ++id; callbacks.set(key, fn); scheduled++; return key; }, clearInterval(key) { callbacks.delete(key); } });
  return { audio, ctx, settings, callbacks, scheduled: () => scheduled, tick(t) { ctx.advance(t); for (const cb of callbacks.values()) cb(); } };
}
test('one mixer and one scheduler survive repeated init; dispose removes live voices and timer', () => {
  const f = fixture(); assert.equal(f.audio.init(), true); const initial = f.ctx.nodes.length;
  for (let i = 0; i < 8; i++) f.audio.init(); assert.equal(f.ctx.nodes.length, initial); assert.equal(f.scheduled(), 1);
  f.audio.update({ phase: 'playing' }); f.tick(.05); assert.ok(f.audio.diagnostics().voicesCreated > 0);
  f.audio.dispose(); assert.equal(f.callbacks.size, 0); assert.equal(f.audio.diagnostics().activeVoices, 0);
  const nodes = f.ctx.nodes.length; assert.equal(f.audio.init(), false); f.audio.effect('ultimate'); assert.equal(f.ctx.nodes.length, nodes);
});
test('clock scheduler skips a stalled tab without a burst and recovers after pause', () => {
  const f = fixture(); f.audio.init(); f.audio.update({ phase: 'playing' }); f.tick(0);
  const before = f.audio.diagnostics().scheduledSteps; f.tick(20);
  const after = f.audio.diagnostics().scheduledSteps; assert.ok(after - before <= 2);
  f.audio.update({ phase: 'paused' }); assert.equal(f.audio.diagnostics().activeVoices, 0); f.tick(21); assert.equal(f.audio.diagnostics().scheduledSteps, after);
  f.audio.update({ phase: 'playing' }); f.tick(21.02); assert.ok(f.audio.diagnostics().scheduledSteps > after);
});
test('music and effects have independent gains; fresh zero music starts at zero', () => {
  const f = fixture({ musicVolume: 0, effectsVolume: .8 }); f.audio.init();
  const gains = f.ctx.nodes.filter(n => n.kind === 'gain'); assert.equal(gains[0].gain.value, 0); assert.equal(gains[1].gain.value, .8 * .88);
  const count = f.audio.diagnostics().voicesCreated; f.audio.effect('pickup'); assert.ok(f.audio.diagnostics().voicesCreated > count);
  f.settings.sound = false; f.audio.update(); assert.equal(f.audio.diagnostics().activeVoices, 0); assert.equal(f.callbacks.size, 0); assert.equal(gains[1].gain.value, 0);
  assert.equal(f.audio.init(), false);
});
test('victory is played once when both win signal and won phase arrive', () => {
  const f = fixture(); f.audio.init(); f.audio.update({ phase: 'playing' }); f.tick(0);
  f.audio.effect('win'); const count = f.audio.diagnostics().voicesCreated; f.audio.update({ phase: 'won' });
  f.tick(.1); f.audio.effect('win'); assert.equal(f.audio.diagnostics().voicesCreated, count);
  f.audio.update({ phase: 'menu' }); f.audio.update({ phase: 'playing' }); f.tick(.2); f.audio.effect('win'); assert.ok(f.audio.diagnostics().voicesCreated > count);
});
test('all sources have finite stop times and heavy effects stay under the voice budget', () => {
  const f = fixture(); f.audio.init(); for (let i = 0; i < 180; i++) f.audio.tone(440, .2, .1);
  const d = f.audio.diagnostics(); assert.equal(d.activeVoices, Audio.MAX_VOICES); assert.equal(d.droppedVoices, 180 - Audio.MAX_VOICES);
  for (const source of f.ctx.nodes.filter(n => n.started !== undefined)) { assert.ok(Number.isFinite(source.stopped)); assert.ok(source.stopped > source.started); assert.ok(source.stopped - source.started <= 3.1); }
  f.tick(4); assert.equal(f.audio.diagnostics().activeVoices, 0);
});
test('fire-rate effects are throttled independently from music and priority skill cues', () => {
  const f = fixture(); f.audio.init(); for (let i = 0; i < 100; i++) f.audio.effect('shoot');
  assert.equal(f.audio.diagnostics().voicesCreated, 1); f.audio.effect('ultimate'); assert.ok(f.audio.diagnostics().voicesCreated > 1);
  f.tick(.08); f.audio.effect('shoot'); assert.ok(f.audio.diagnostics().voicesCreated >= 10);
});
test('six chapter arrangements retain fast battle tempo and a faster two-stage boss', () => {
  const f = fixture(); f.audio.init(); const tracks = new Set();
  for (let chapter = 1; chapter <= 6; chapter++) { f.audio.update({ chapter, phase: 'playing', bossStage: 0 }); const d = f.audio.diagnostics(); tracks.add(d.track); assert.ok(d.bpm >= 148 && d.bpm <= 156); }
  assert.equal(tracks.size, 6); f.audio.update({ bossStage: 1 }); assert.equal(f.audio.diagnostics().bpm, 168); f.audio.update({ bossStage: 2 }); assert.equal(f.audio.diagnostics().bpm, 172);
});
test('suspension stops tails and resuming retains only one scheduler', async () => {
  const f = fixture(); f.audio.init(); f.audio.update({ phase: 'playing' }); f.tick(.03); await f.audio.suspend();
  assert.equal(f.ctx.state, 'suspended'); assert.equal(f.audio.diagnostics().activeVoices, 0); assert.equal(f.callbacks.size, 0);
  await f.audio.resume(); await f.audio.resume(); assert.equal(f.callbacks.size, 1); f.tick(.08); assert.ok(f.audio.diagnostics().activeVoices > 0);
});
