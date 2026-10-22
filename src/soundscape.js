(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DogAudio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_VOICES = 96, LOOKAHEAD = .14, TICK_MS = 25;
  const EFFECT_TYPES = new Set(['win', 'lose', 'shoot', 'pop', 'boom', 'bossShot', 'hurt', 'dash', 'boss', 'rage', 'warning', 'ui', 'pickup', 'gate', 'weapon', 'tactical', 'support', 'shield', 'skill', 'overdrive', 'ultimate', 'upgrade']);
  const CHAPTERS = Object.freeze([
    { bpm: 150, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], wave: 'triangle', title: '晨光疾行' },
    { bpm: 152, root: 43, scale: [0, 2, 3, 5, 7, 9, 10], wave: 'square', title: '霓虹追踪' },
    { bpm: 154, root: 47, scale: [0, 1, 3, 5, 7, 8, 10], wave: 'triangle', title: '空港突围' },
    { bpm: 150, root: 42, scale: [0, 2, 3, 5, 7, 8, 11], wave: 'sawtooth', title: '深海脉冲' },
    { bpm: 156, root: 40, scale: [0, 2, 3, 5, 7, 9, 10], wave: 'square', title: '星环跃迁' },
    { bpm: 156, root: 45, scale: [0, 2, 3, 5, 7, 8, 11], wave: 'sawtooth', title: '极光归航' }
  ]);
  const clamp = (n, min, max) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
  const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
  const safe = fn => { try { return fn(); } catch { return undefined; } };
  function engine(options = {}) {
    let context = options.context || null, graph = null, timer = null, disposed = false, suspended = false;
    let step = 0, nextStep = 0, lastChapter = 1, resultPlayed = false, lastPhase = 'menu';
    let state = { phase: 'menu', bossStage: 0, chapter: 1, pressure: 0, time: 0 };
    let ticks = 0, dropped = 0, peakVoices = 0, scheduledSteps = 0, voicesCreated = 0;
    let previousMusicGain, previousEffectsGain;
    const voices = new Set(), cooldown = new Map();
    const prefs = () => { const p = options.getPreferences?.() || {}; return { sound: p.sound !== false, musicVolume: clamp(p.musicVolume ?? .7, 0, 1), effectsVolume: clamp(p.effectsVolume ?? .7, 0, 1) }; };
    const chapter = () => CHAPTERS[clamp(Math.floor(state.chapter || 1), 1, 6) - 1];
    const bpm = () => state.bossStage > 0 ? (state.bossStage > 1 ? 172 : 168) : chapter().bpm;
    const isOffline = () => context && typeof context.startRendering === 'function';
    function param(p, value, at, smooth = false) {
      if (smooth && p.setTargetAtTime) p.setTargetAtTime(value, at, .025); else p.setValueAtTime(value, at);
    }
    function refreshGains() {
      if (!graph) return;
      const p = prefs(), now = context.currentTime;
      const musicGain = p.sound && !suspended ? p.musicVolume * .78 : 0;
      const effectsGain = p.sound && !suspended ? p.effectsVolume * .88 : 0;
      if (musicGain !== previousMusicGain) { param(graph.music.gain, musicGain, now, previousMusicGain !== undefined && musicGain > 0); previousMusicGain = musicGain; }
      if (effectsGain !== previousEffectsGain) { param(graph.effects.gain, effectsGain, now, previousEffectsGain !== undefined && effectsGain > 0); previousEffectsGain = effectsGain; }
    }
    function buildGraph() {
      if (graph) return;
      const music = context.createGain(), effects = context.createGain(), master = context.createGain();
      const compressor = context.createDynamicsCompressor(), limiter = context.createWaveShaper();
      master.gain.value = .92;
      compressor.threshold.value = -14; compressor.knee.value = 16; compressor.ratio.value = 5;
      compressor.attack.value = .003; compressor.release.value = .12;
      const curve = new Float32Array(4097);
      for (let i = 0; i < curve.length; i++) { const x = i * 2 / (curve.length - 1) - 1; curve[i] = Math.tanh(x * 1.45) * .94; }
      limiter.curve = curve; limiter.oversample = '2x';
      music.connect(master); effects.connect(master); master.connect(compressor); compressor.connect(limiter); limiter.connect(context.destination);
      const noise = context.createBuffer(1, Math.ceil(context.sampleRate * .85), context.sampleRate);
      let seed = 0x56a91;
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; samples[i] = ((seed >>> 0) / 4294967296) * 2 - 1; }
      graph = { music, effects, master, compressor, limiter, noise };
      refreshGains();
    }
    function cleanup(v) {
      if (!voices.delete(v)) return;
      // Offline previews schedule future voices in advance; keep their graph until rendered.
      if (!isOffline() || context.currentTime >= v.end) for (const node of v.nodes) safe(() => node.disconnect());
    }
    function prune(at) { for (const v of voices) if (v.end < at - .02) cleanup(v); }
    function stopVoices(channel) {
      if (!context) return;
      const at = context.currentTime;
      for (const v of [...voices]) if (!channel || v.channel === channel) {
        safe(() => v.gain.gain.cancelScheduledValues(at));
        safe(() => v.gain.gain.setValueAtTime(0, at));
        safe(() => v.source.stop(at + .005)); cleanup(v);
      }
    }
    function register(source, gain, nodes, at, duration, channel) {
      prune(isOffline() ? at : context.currentTime);
      if (voices.size >= MAX_VOICES) { dropped++; nodes.forEach(n => safe(() => n.disconnect())); return false; }
      const end = at + duration + .025, voice = { source, gain, nodes, end, channel };
      voices.add(voice); voicesCreated++; peakVoices = Math.max(peakVoices, voices.size);
      source.onended = () => cleanup(voice);
      source.start(at); source.stop(end);
      return true;
    }
    function envelope(gain, at, duration, volume, attack = .006) {
      gain.gain.setValueAtTime(.00001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(.00002, volume), at + Math.min(attack, duration * .25));
      gain.gain.exponentialRampToValueAtTime(.00001, at + duration);
    }
    function note(frequency, at, duration, volume, wave = 'triangle', channel = 'music', cutoff = 3800, glide) {
      if (!graph || !prefs().sound || suspended || volume <= 0) return;
      const osc = context.createOscillator(), gain = context.createGain(), filter = context.createBiquadFilter();
      osc.type = wave; osc.frequency.setValueAtTime(frequency, at);
      if (glide) osc.frequency.exponentialRampToValueAtTime(glide, at + duration * .85);
      filter.type = 'lowpass'; filter.frequency.setValueAtTime(cutoff, at); filter.Q.value = .7;
      envelope(gain, at, duration, volume);
      osc.connect(filter); filter.connect(gain); gain.connect(graph[channel]);
      register(osc, gain, [osc, filter, gain], at, duration, channel);
    }
    function noise(at, duration, volume, cutoff, channel = 'music', type = 'highpass') {
      if (!graph || !prefs().sound || suspended) return;
      const source = context.createBufferSource(), gain = context.createGain(), filter = context.createBiquadFilter();
      source.buffer = graph.noise; filter.type = type; filter.frequency.setValueAtTime(cutoff, at); filter.Q.value = .65;
      envelope(gain, at, duration, volume, .002);
      source.connect(filter); filter.connect(gain); gain.connect(graph[channel]);
      register(source, gain, [source, filter, gain], at, duration, channel);
    }
    function kick(at, strength = 1, channel = 'music') {
      note(155, at, .24, .69 * strength, 'sine', channel, 1300, 43);
      noise(at, .018, .13 * strength, 3000, channel);
    }
    function snare(at, strength = 1, channel = 'music') {
      noise(at, .15, .3 * strength, 1200, channel);
      note(185, at, .105, .11 * strength, 'triangle', channel, 1000, 115);
    }
    function scheduleStep(at, index) {
      const c = chapter(), beat = 60 / bpm(), sixteenth = beat / 4, pos = index % 16, bar = Math.floor(index / 16), boss = state.bossStage > 0;
      const chord = [0, 5, 3, 6][Math.floor(bar / 2) % 4];
      const degree = d => c.root + c.scale[((d + chord) % 7 + 7) % 7] + Math.floor((d + chord) / 7) * 12;
      if ([0, 6, 8].includes(pos) || (boss && [3, 10, 14].includes(pos))) kick(at, pos === 0 ? 1 : .8);
      if (pos === 4 || pos === 12) snare(at, 1);
      if (pos % 2 === 0 || boss) noise(at, pos === 14 ? .12 : .045, pos % 4 === 0 ? .115 : .075, 6500);
      if (boss && bar % 4 === 3 && pos >= 13) snare(at, .45 + (pos - 13) * .12);
      if (pos % 2 === 0) {
        const bassDegree = [0, 0, 4, 0, 0, 2, 4, 6][pos / 2];
        note(hz(degree(bassDegree) - 12), at, sixteenth * 1.6, .25, 'sawtooth', 'music', boss ? 1350 : 950);
        note(hz(degree(0) - 24), at, sixteenth * 1.7, .12, 'sine', 'music', 700);
      }
      if (pos === 0 || pos === 8) {
        for (const d of [0, 2, 4]) note(hz(degree(d) + 12), at, beat * 1.65, .033, 'triangle', 'music', 2400);
      }
      // Original eight-bar motif; deliberate rests keep the firing effects legible.
      const motif = [0, null, 4, 5, null, 4, 2, null, 0, 2, 4, null, 6, 5, 4, 2];
      if (pos % 2 === 0) {
        const d = motif[(Math.floor(index / 2) + Math.floor(bar / 4) * 3) % motif.length];
        if (d !== null) note(hz(degree(d) + 12), at, sixteenth * (boss ? 1.6 : 2.7), boss ? .115 : .085, c.wave, 'music', boss ? 4900 : 3100);
      }
      if ((boss || state.pressure > .66) && pos % 2 === 1) {
        note(hz(degree([0, 4, 6, 4][pos % 4]) + 24), at, sixteenth * .75, state.pressure > .66 ? .065 : .043, 'triangle', 'music', 5300);
      }
      if (state.pressure > .78 && (pos === 0 || pos === 3)) note(54, at, .13, .16, 'sine', 'music', 400, 38);
      scheduledSteps++;
    }
    function scheduleUntil(until) {
      if (!context || !graph || disposed || suspended || state.phase !== 'playing' || !prefs().sound) return;
      const now = context.currentTime;
      // If a tab stalls, skip missed beats. Never emit a catch-up burst.
      if (nextStep < now - .08) nextStep = now + .018;
      let guard = 0;
      while (nextStep < until && guard++ < 200000) {
        scheduleStep(nextStep, step++); nextStep += 60 / bpm() / 4;
      }
    }
    function tick() { ticks++; refreshGains(); scheduleUntil(context.currentTime + LOOKAHEAD); prune(context.currentTime); }
    function startTimer() {
      if (options.autoSchedule === false || isOffline() || timer !== null || !context) return;
      const set = options.setInterval || globalThis.setInterval;
      timer = set(tick, TICK_MS);
    }
    function stopTimer() { if (timer !== null) { (options.clearInterval || globalThis.clearInterval)(timer); timer = null; } }
    function init() {
      if (disposed || !prefs().sound) return false;
      try {
        if (!context) { const Constructor = options.AudioContext || globalThis.AudioContext || globalThis.webkitAudioContext; if (!Constructor) return false; context = new Constructor({ latencyHint: 'interactive' }); }
        buildGraph(); suspended = false; refreshGains();
        if (!isOffline() && context.state === 'suspended') Promise.resolve(context.resume()).catch(() => {});
        startTimer(); return true;
      } catch { return false; }
    }
    function fanfare(won) {
      const now = context.currentTime + .012;
      stopVoices('music');
      if (won) {
        // 2.8-second ascent, held major chord and a clean drum resolution.
        const melody = [[0, 72, .18], [.16, 76, .18], [.32, 79, .22], [.55, 84, .42], [1.02, 81, .2], [1.24, 83, .2], [1.48, 84, 1.15]];
        for (const [t, midi, length] of melody) note(hz(midi), now + t, length, .22, 'triangle', 'effects', 6000);
        for (const offset of [0, .55, 1.48]) { kick(now + offset, .7, 'effects'); for (const midi of [48, 60, 64, 67]) note(hz(midi), now + offset, offset > 1 ? 1.25 : .32, .105, 'triangle', 'effects', 3600); }
        noise(now + 1.48, .7, .17, 5500, 'effects');
      } else {
        [[0, 55], [.24, 51], [.5, 48], [.82, 43]].forEach(([t, midi]) => note(hz(midi), now + t, .55, .19, 'triangle', 'effects', 1500));
        noise(now, .24, .12, 800, 'effects', 'lowpass');
      }
    }
    function effect(type, data = {}) {
      if (!graph || !prefs().sound || suspended || disposed || !EFFECT_TYPES.has(type)) return;
      const now = context.currentTime, limits = { shoot: .075, pop: .055, boom: .09, bossShot: .08, hurt: .18, warning: .35, rage: .6 };
      if (now - (cooldown.get(type) ?? -99) < (limits[type] || .035)) return;
      cooldown.set(type, now);
      const t = now + .006;
      if (type === 'win' || type === 'lose') { if (!resultPlayed) { resultPlayed = true; fanfare(type === 'win'); } return; }
      if (type === 'shoot') { note(1250, t, .045, .055, 'triangle', 'effects', 5100, 550); return; }
      if (type === 'pop') { note(390 + (voicesCreated % 6) * 38, t, .075, .105, 'triangle', 'effects', 2500, 180); return; }
      if (type === 'boom' || type === 'bossShot') { note(100, t, .22, .29, 'sine', 'effects', 1400, 30); noise(t, .18, .19, 1400, 'effects', 'lowpass'); return; }
      if (type === 'hurt') { note(175, t, .2, .19, 'sawtooth', 'effects', 1200, 78); noise(t, .08, .14, 1100, 'effects'); return; }
      if (type === 'dash') { noise(t, .11, .23, 2400, 'effects'); note(300, t, .12, .09, 'triangle', 'effects', 3800, 1100); return; }
      if (type === 'boss' || type === 'rage' || type === 'warning') {
        [0, .15, .3].forEach((offset, i) => note(i % 2 ? 277 : 220, t + offset, .12, .14, 'square', 'effects', 1900));
        if (type !== 'warning') { noise(t, .65, .22, 950, 'effects', 'lowpass'); kick(t + .4, 1, 'effects'); } return;
      }
      const sequences = {
        ui: [76], pickup: [76, 83, 88], gate: [72, 76, 79], weapon: [67, 74, 79, 86],
        tactical: [55, 67, 79], support: [64, 71, 76], shield: [60, 67, 79],
        skill: [55, 62, 67, 74], overdrive: [60, 67, 72, 79], ultimate: [36, 48, 60, 72, 84], upgrade: [67, 72, 76, 79, 84]
      };
      const sequence = sequences[type];
      if (sequence) { const big = type === 'ultimate' || type === 'skill'; sequence.forEach((midi, i) => note(hz(midi), t + i * .052, big ? .46 : .22, big ? .2 : .13, 'triangle', 'effects', 4400)); if (big) { kick(t, .9, 'effects'); noise(t, .32, .16, 3200, 'effects'); } }
    }
    function update(next = {}) {
      if (disposed) return;
      state = { ...state, ...next, chapter: clamp(Math.floor(next.chapter ?? state.chapter), 1, 6), pressure: clamp(next.pressure ?? state.pressure, 0, 1), bossStage: clamp(next.bossStage ?? state.bossStage, 0, 2) };
      if (state.phase !== lastPhase) {
        if (state.phase === 'playing') {
          if (lastPhase !== 'paused') { step = 0; resultPlayed = false; }
          nextStep = (context?.currentTime || 0) + .025;
        } else stopVoices('music');
        if (state.phase === 'won') effect('win');
        if (state.phase === 'lost') effect('lose');
        if (state.phase === 'menu') stopVoices();
        lastPhase = state.phase;
      }
      if (state.chapter !== lastChapter) { lastChapter = state.chapter; step = 0; }
      if (!prefs().sound) { stopVoices(); stopTimer(); }
      refreshGains();
    }
    function suspend() {
      suspended = true; stopTimer(); stopVoices(); refreshGains();
      if (context && !isOffline() && context.state === 'running') return Promise.resolve(context.suspend()).catch(() => {});
      return Promise.resolve();
    }
    function resume() { if (disposed || !prefs().sound) return Promise.resolve(); init(); nextStep = (context?.currentTime || 0) + .025; return Promise.resolve(); }
    function dispose() {
      if (disposed) return; disposed = true; stopTimer(); stopVoices();
      if (graph) for (const key of ['music', 'effects', 'master', 'compressor', 'limiter']) safe(() => graph[key].disconnect());
      if (context && !options.context && !isOffline()) safe(() => Promise.resolve(context.close()).catch(() => {}));
    }
    const api = {
      init, effect, fx: effect, update, suspend, resume, dispose,
      // Menu compatibility. The mixer now owns final gain and channel isolation.
      tone(frequency, duration = .12, volume = .035, wave = 'sine', when = 0, channel = 'effects') {
        if (graph) note(clamp(frequency, 20, 16000), context.currentTime + clamp(when, 0, 3), clamp(duration, .015, 3), clamp(volume * 3, 0, .3), wave, channel === 'music' ? 'music' : 'effects');
      },
      diagnostics() { return { initialized: !!graph, disposed, suspended, contextState: context?.state || 'unavailable', phase: state.phase, chapter: state.chapter, track: chapter().title, bpm: bpm(), activeVoices: voices.size, peakVoices, maxVoices: MAX_VOICES, voicesCreated, droppedVoices: dropped, scheduledSteps, schedulerTicks: ticks, intervalMs: TICK_MS, lookaheadSeconds: LOOKAHEAD, limiterCeiling: .94, preferences: prefs() }; },
      get ctx() { return context; }
    };
    return { api, scheduleUntil };
  }
  function create(options) { return engine(options).api; }
  async function renderPreview(options = {}) {
    const Constructor = options.OfflineAudioContext || globalThis.OfflineAudioContext;
    if (!Constructor) throw new Error('OfflineAudioContext unavailable');
    const seconds = clamp(options.seconds ?? 8, 1, 60), sampleRate = 48000;
    const context = new Constructor(2, Math.ceil(seconds * sampleRate), sampleRate);
    const e = engine({ context, autoSchedule: false, getPreferences: () => ({ sound: true, musicVolume: .7, effectsVolume: .7, ...options.preferences }) });
    e.api.init();
    if (options.mode === 'win' || options.mode === 'lose') e.api.effect(options.mode);
    else { e.api.update({ phase: 'playing', bossStage: options.mode === 'boss' ? 2 : 0, chapter: options.chapter || 1, pressure: options.pressure || 0 }); e.scheduleUntil(seconds); }
    for (const type of (options.effectTypes || []).slice(0, 24)) e.api.effect(type);
    const diagnostics = e.api.diagnostics(), buffer = await context.startRendering();
    e.api.dispose(); return { buffer, diagnostics };
  }
  return { create, renderPreview, CHAPTERS, MAX_VOICES };
});
