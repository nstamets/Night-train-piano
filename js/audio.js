// Synthesized piano + metronome. No sample files needed.
// The piano voice is additive: slightly inharmonic partials with per-partial decay,
// a soft hammer "thunk", and a gentle compressor. Lower notes ring longer.

let ctx = null;
let master = null;
let backing = null;
let backingLevel = 1;
// While a playback is being scheduled, its sounds go through its own buses so Stop can silence them instantly.
let routeMain = null, routeBack = null;
const outMain = () => routeMain || master;
const outBack = () => routeBack || backing;
export function makeRoute() {
  const c = audio();
  const m = c.createGain(); m.connect(master);
  const b = c.createGain(); b.connect(backing);
  let dead = false;
  return {
    run(fn) { if (dead) return; const pm = routeMain, pb = routeBack; routeMain = m; routeBack = b; try { return fn(); } finally { routeMain = pm; routeBack = pb; } },
    stop() {
      if (dead) return; dead = true;
      const t = c.currentTime;
      [m, b].forEach(g => { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.04); });
      setTimeout(() => { try { m.disconnect(); b.disconnect(); } catch { /* ignore */ } }, 300);
    },
  };
}

// Backing tracks (pads, band) go through their own volume control.
export function setBackingVolume(v) { backingLevel = v; if (backing) backing.gain.value = v; }
export function backingBus() { audio(); return backing; }

export function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.8;
    master.connect(comp); comp.connect(ctx.destination);
    backing = ctx.createGain(); backing.gain.value = backingLevel; backing.connect(master);
  }
  return ctx;
}

// Must be called from a tap/click (iOS requirement).
export async function unlockAudio() {
  const c = audio();
  if (c.state !== 'running') { try { await c.resume(); } catch { /* ignore */ } }
  // Play a silent buffer: helps older iOS start audio output.
  const b = c.createBuffer(1, 1, 22050); const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
}

export const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);

const PARTIALS = [1, 0.55, 0.32, 0.22, 0.12, 0.08, 0.05];

export function playNote(midi, { when = 0, dur = 0.8, vel = 0.7 } = {}) {
  const c = audio();
  const t0 = Math.max(c.currentTime, when || c.currentTime);
  const f0 = midiToFreq(midi);
  const ring = Math.max(0.6, 3.2 - (midi - 48) * 0.045); // low notes ring longer
  const release = Math.min(dur, ring);
  const out = c.createGain();
  out.gain.value = 0;
  out.connect(outMain());
  const B = 0.0004; // inharmonicity
  PARTIALS.forEach((amp, i) => {
    const n = i + 1;
    const f = f0 * n * Math.sqrt(1 + B * n * n);
    if (f > 12000) return;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = c.createGain();
    const a = amp * vel * 0.28 * (f0 < 200 ? 1.15 : 1);
    const decay = ring / (1 + i * 0.9);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(a, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(Math.max(a * 0.25, 0.0001), t0 + Math.min(decay * 0.25, 0.35));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    o.connect(g); g.connect(out);
    o.start(t0); o.stop(t0 + Math.max(decay, release) + 0.3);
  });
  // damper: when key released, fade quickly
  out.gain.setValueAtTime(1, t0);
  out.gain.setValueAtTime(1, t0 + release);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + release + 0.25);
  // hammer noise
  const len = Math.floor(c.sampleRate * 0.03);
  const nb = c.createBuffer(1, len, c.sampleRate); const d = nb.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const ns = c.createBufferSource(); ns.buffer = nb;
  const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = Math.min(f0 * 4, 4000); nf.Q.value = 1;
  const ng = c.createGain(); ng.gain.value = 0.05 * vel;
  ns.connect(nf); nf.connect(ng); ng.connect(outMain()); ns.start(t0);
  return t0;
}

export function click(when, accent = false, loud = false) {
  const c = audio();
  const t = Math.max(c.currentTime, when || c.currentTime);
  const o = c.createOscillator(); const g = c.createGain();
  o.type = 'square'; o.frequency.value = accent ? 1760 : 1175;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime((accent ? 0.22 : 0.13) * (loud ? 2.6 : 1), t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g); g.connect(outMain()); o.start(t); o.stop(t + 0.06);
}

// Soft pad chord for improvisation backing (sustained, gentle).
export function pad(midis, when, dur) {
  const c = audio();
  const t = Math.max(c.currentTime, when || c.currentTime);
  midis.forEach(m => {
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = midiToFreq(m);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.13, t + 0.3);
    g.gain.setValueAtTime(0.13, t + dur - 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(outBack()); o.start(t); o.stop(t + dur + 0.05);
  });
}

// ---------- Backing band (all through the backing volume bus) ----------
let noiseBuf = null;
function noise() {
  const c = audio();
  if (!noiseBuf) { const n = c.sampleRate; noiseBuf = c.createBuffer(1, n, n); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
  const src = c.createBufferSource(); src.buffer = noiseBuf; return src;
}
export function drum(kind, t, vel = 1) {
  const c = audio(); t = Math.max(c.currentTime, t);
  const g = c.createGain(); g.connect(outBack());
  if (kind === 'kick') {
    const o = c.createOscillator(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.55 * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); o.start(t); o.stop(t + 0.32);
  } else {
    const n = noise(); const f = c.createBiquadFilter();
    const conf = { snare: ['bandpass', 1900, 0.28, 0.16], hat: ['highpass', 7500, 0.09, 0.045], ride: ['highpass', 5200, 0.07, 0.35], brush: ['bandpass', 3000, 0.08, 0.2] }[kind];
    f.type = conf[0]; f.frequency.value = conf[1];
    g.gain.setValueAtTime(conf[2] * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + conf[3]);
    n.connect(f); f.connect(g); n.start(t, Math.random() * 0.5); n.stop(t + conf[3] + 0.02);
    if (kind === 'snare') { const o = c.createOscillator(); o.frequency.value = 190; const g2 = c.createGain(); g2.gain.setValueAtTime(0.18 * vel, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.08); o.connect(g2); g2.connect(outBack()); o.start(t); o.stop(t + 0.1); }
  }
}
export function bass(midi, t, dur, vel = 1) {
  const c = audio(); t = Math.max(c.currentTime, t);
  const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = midiToFreq(midi);
  const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = midiToFreq(midi);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32 * vel, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.12 * vel, t + Math.min(dur, 0.4)); g.gain.setValueAtTime(0.12 * vel, t + Math.max(0.02, dur - 0.05)); g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(outBack());
  o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}

// chords: [{beat, dur, root (midi), pcs?:[semitones from root], minor?:bool}] ; style: 'worship' | 'swing' | 'pad' | 'pop'
export function scheduleBand(chords, { start, spb, style = 'worship', beatsPerBar = 4, lengthBeats }) {
  const total = lengthBeats || Math.max(...chords.map(ch => ch.beat + ch.dur));
  const chordAt = b => chords.slice().reverse().find(ch => ch.beat <= b + 1e-6) || chords[0];
  const swing = 2 / 3;
  for (let b = 0; b < total; b++) {
    const t = start + b * spb; const inBar = b % beatsPerBar; const ch = chordAt(b);
    const root = ch.root; const third = ch.minor ? 3 : 4;
    if (style === 'worship' || style === 'pop') {
      if (inBar === 0) drum('kick', t, 1);
      if (inBar === 2) drum('kick', t, style === 'pop' ? 1 : 0.8);
      if (style === 'pop' && inBar === 1) drum('kick', t + spb / 2, 0.7);
      if (inBar === 1 || inBar === 3) drum('snare', t, style === 'pop' ? 1 : 0.6);
      drum('hat', t, 0.8); drum('hat', t + spb / 2, 0.5);
      if (ch.beat === b) bass(root, t, Math.min(ch.dur, 2) * spb * 0.95);
      else if (inBar === 2 && ch.dur >= 4) bass(root, t, 2 * spb * 0.95);
    } else if (style === 'swing') {
      drum('ride', t, inBar % 2 ? 0.8 : 1);
      if (inBar === 1 || inBar === 3) { drum('ride', t + spb * swing, 0.6); drum('hat', t, 0.7); }
      const walk = [root, root + third, root + 7, null][inBar];
      let m = walk;
      if (inBar === 3) { const nx = chordAt(b + 1); m = (nx.beat === b + 1 ? nx.root : root) + (Math.random() < 0.5 ? -1 : 1); }
      bass(m, t, spb * 0.9, inBar === 0 ? 1 : 0.85);
    }
    if (style === 'pad' || style === 'worship') {
      if (ch.beat === b) pad([root + 12, root + 12 + third, root + 19], t, ch.dur * spb);
    }
  }
}

// ---------- Scheduler for metronome + play-along ----------
// events: [{beat, midi, dur(beats)}]; beatsPerBar; bpm.
// Returns a controller with stop(). onBeat(beatIndex, time) and onNote(i) callbacks run in sync (setTimeout aligned).
export function schedulePlayback({ events = [], bpm = 80, beatsPerBar = 4, countIn = 1, metronome = true, playNotes = true, loop = false, onBeat, onNote, onEnd, startBeat = 0, accompany = null, band = null, bandStyle = 'worship', loudClicks = false, swing = false }) {
  const c = audio();
  const spb = 60 / bpm;
  const allEv = events.concat(accompany || []);
  const totalBeats = allEv.length ? Math.max(...allEv.map(e => e.beat + e.dur)) : (band ? Math.max(...band.map(ch => ch.beat + ch.dur)) : beatsPerBar * 2);
  const lengthBeats = Math.ceil((totalBeats - startBeat) / beatsPerBar) * beatsPerBar;
  const countBeats = countIn * beatsPerBar;
  let start = c.currentTime + 0.15;
  let stopped = false;
  const route = makeRoute();
  const timers = [];
  function at(time, fn) { const ms = (time - c.currentTime) * 1000; timers.push(setTimeout(() => { if (!stopped) fn(); }, Math.max(0, ms))); }

  function runPass(passStart, isFirst) { return route.run(() => runPassInner(passStart, isFirst)); }
  function runPassInner(passStart, isFirst) {
    const cb = isFirst ? countBeats : 0;
    for (let b = 0; b < cb; b++) {
      const t = passStart + b * spb;
      click(t, b % beatsPerBar === 0, loudClicks);
      at(t, () => onBeat && onBeat(b - cb, t));
    }
    const musicStart = passStart + cb * spb;
    for (let b = 0; b < lengthBeats; b++) {
      const t = musicStart + b * spb;
      if (metronome) click(t, b % beatsPerBar === 0);
      at(t, () => onBeat && onBeat(b + startBeat, t));
    }
    if (accompany) accompany.forEach(e => {
      if (e.beat < startBeat) return;
      const t = musicStart + (e.beat - startBeat) * spb;
      (Array.isArray(e.midi) ? e.midi : [e.midi]).forEach(m => playNote(m, { when: t, dur: e.dur * spb * 0.95, vel: 0.6 }));
    });
    if (band) scheduleBand(band.filter(ch => ch.beat >= startBeat).map(ch => ({ ...ch, beat: ch.beat - startBeat })), { start: musicStart, spb, style: bandStyle, beatsPerBar, lengthBeats });
    const sw = b => swing && Math.abs((b % 1) - 0.5) < 1e-6 ? b + 1 / 6 : b;
    events.forEach((e, i) => {
      if (e.beat < startBeat) return;
      const t = musicStart + (sw(e.beat) - startBeat) * spb;
      if (playNotes) (Array.isArray(e.midi) ? e.midi : [e.midi]).forEach(m => playNote(m, { when: t, dur: e.dur * spb * 0.95 }));
      at(t, () => onNote && onNote(i, t));
    });
    const end = musicStart + lengthBeats * spb;
    at(end, () => {
      if (loop && !stopped) runPass(end, false);
      else onEnd && onEnd();
    });
    return musicStart;
  }
  const musicStart = runPass(start, true);
  return {
    musicStart, spb, lengthBeats, loop,
    stop() { stopped = true; timers.forEach(clearTimeout); route.stop(); },
  };
}

// Simple free-running metronome
export function metronome(bpm, beatsPerBar = 4, onBeat) {
  const c = audio();
  const spb = 60 / bpm;
  let next = c.currentTime + 0.1; let n = 0; let running = true;
  const tick = () => {
    if (!running) return;
    while (next < c.currentTime + 0.2) {
      click(next, n % beatsPerBar === 0);
      const bi = n, t = next;
      setTimeout(() => running && onBeat && onBeat(bi, t), Math.max(0, (t - c.currentTime) * 1000));
      next += spb; n++;
    }
    setTimeout(tick, 50);
  };
  tick();
  return { stop() { running = false; } };
}
