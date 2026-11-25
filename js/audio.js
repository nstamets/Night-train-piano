// Synthesized piano + metronome. No sample files needed.
// The piano voice is additive: slightly inharmonic partials with per-partial decay,
// a soft hammer "thunk", and a gentle compressor. Lower notes ring longer.

let ctx = null;
let master = null;

export function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.8;
    master.connect(comp); comp.connect(ctx.destination);
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
  out.connect(master);
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
  ns.connect(nf); nf.connect(ng); ng.connect(master); ns.start(t0);
  return t0;
}

export function click(when, accent = false) {
  const c = audio();
  const t = Math.max(c.currentTime, when || c.currentTime);
  const o = c.createOscillator(); const g = c.createGain();
  o.type = 'square'; o.frequency.value = accent ? 1760 : 1175;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(accent ? 0.22 : 0.13, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.06);
}

// Soft pad chord for improvisation backing (sustained, gentle).
export function pad(midis, when, dur) {
  const c = audio();
  const t = Math.max(c.currentTime, when || c.currentTime);
  midis.forEach(m => {
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = midiToFreq(m);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.3);
    g.gain.setValueAtTime(0.05, t + dur - 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  });
}

// ---------- Scheduler for metronome + play-along ----------
// events: [{beat, midi, dur(beats)}]; beatsPerBar; bpm.
// Returns a controller with stop(). onBeat(beatIndex, time) and onNote(i) callbacks run in sync (setTimeout aligned).
export function schedulePlayback({ events = [], bpm = 80, beatsPerBar = 4, countIn = 1, metronome = true, playNotes = true, loop = false, onBeat, onNote, onEnd, startBeat = 0 }) {
  const c = audio();
  const spb = 60 / bpm;
  const totalBeats = events.length ? Math.max(...events.map(e => e.beat + e.dur)) : beatsPerBar * 2;
  const lengthBeats = Math.ceil((totalBeats - startBeat) / beatsPerBar) * beatsPerBar;
  const countBeats = countIn * beatsPerBar;
  let start = c.currentTime + 0.15;
  let stopped = false;
  const timers = [];
  function at(time, fn) { const ms = (time - c.currentTime) * 1000; timers.push(setTimeout(() => { if (!stopped) fn(); }, Math.max(0, ms))); }

  function runPass(passStart, isFirst) {
    const cb = isFirst ? countBeats : 0;
    for (let b = 0; b < cb; b++) {
      const t = passStart + b * spb;
      click(t, b % beatsPerBar === 0);
      at(t, () => onBeat && onBeat(b - cb, t));
    }
    const musicStart = passStart + cb * spb;
    for (let b = 0; b < lengthBeats; b++) {
      const t = musicStart + b * spb;
      if (metronome) click(t, b % beatsPerBar === 0);
      at(t, () => onBeat && onBeat(b + startBeat, t));
    }
    events.forEach((e, i) => {
      if (e.beat < startBeat) return;
      const t = musicStart + (e.beat - startBeat) * spb;
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
    stop() { stopped = true; timers.forEach(clearTimeout); },
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
