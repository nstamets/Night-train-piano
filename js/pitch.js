// Microphone listening for "ticket inspections".
// Approach: we know what the player SHOULD play, so we detect note onsets + pitch (YIN),
// then align what we heard against the expected notes. Judging against an expectation is
// far more reliable on a phone than open-ended transcription.

import { audio } from './audio.js';

let micStream = null;
let micSource = null;
let analyser = null;

export function micSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export async function openMic() {
  const c = audio();
  if (c.state !== 'running') await c.resume();
  if (!micStream || micStream.getTracks().every(t => t.readyState === 'ended')) {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    micSource = c.createMediaStreamSource(micStream);
    analyser = c.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0;
    micSource.connect(analyser);
  }
  return analyser;
}

export function closeMic() {
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  try { micSource && micSource.disconnect(); } catch { /* ignore */ }
  micStream = null; micSource = null; analyser = null;
}

// ---------- DSP ----------
export function rms(buf, start = 0, end = buf.length) {
  let s = 0; for (let i = start; i < end; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, end - start));
}

// YIN pitch estimate. Returns {freq, clarity} or null.
export function yin(buf, sampleRate, { minF = 60, maxF = 2100, threshold = 0.15, W = 1024 } = {}) {
  const minLag = Math.floor(sampleRate / maxF);
  const maxLag = Math.min(Math.floor(sampleRate / minF), buf.length - W - 1);
  if (maxLag <= minLag) return null;
  const off = buf.length - W - maxLag - 1;
  if (off < 0) return null;
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const x = buf[off + i] - buf[off + i + tau]; s += x * x; }
    d[tau] = s;
  }
  // cumulative mean normalized difference
  const cmnd = new Float32Array(maxLag + 1); cmnd[0] = 1; let run = 0;
  for (let tau = 1; tau <= maxLag; tau++) { run += d[tau]; cmnd[tau] = run ? d[tau] * tau / run : 1; }
  let tau = -1;
  for (let t = Math.max(2, minLag); t <= maxLag; t++) {
    if (cmnd[t] < threshold) { while (t + 1 <= maxLag && cmnd[t + 1] < cmnd[t]) t++; tau = t; break; }
  }
  if (tau < 0) {
    // fall back to global minimum if reasonably clear
    let best = Infinity, bt = -1;
    for (let t = Math.max(2, minLag); t <= maxLag; t++) if (cmnd[t] < best) { best = cmnd[t]; bt = t; }
    if (best > 0.3) return null; tau = bt;
  }
  // parabolic interpolation
  let better = tau;
  if (tau > 1 && tau < maxLag) {
    const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1];
    const den = a + c - 2 * b; if (den) better = tau + (a - c) / (2 * den);
  }
  return { freq: sampleRate / better, clarity: 1 - cmnd[tau] };
}

export const freqToMidi = f => 69 + 12 * Math.log2(f / 440);

// Chroma: energy per pitch class from the spectrum (peaks only, 90-2400 Hz). Normalized to max 1.
let fbuf = null;
export function chroma(an, sampleRate, centsShift = 0) {
  if (!fbuf || fbuf.length !== an.frequencyBinCount) fbuf = new Float32Array(an.frequencyBinCount);
  an.getFloatFrequencyData(fbuf);
  return chromaFromDb(fbuf, sampleRate, an.fftSize, centsShift);
}
export function chromaFromDb(db, sampleRate, fftSize, centsShift = 0) {
  const c = new Float32Array(12);
  const binHz = sampleRate / fftSize;
  const lo = Math.ceil(90 / binHz), hi = Math.min(db.length - 2, Math.floor(2400 / binHz));
  for (let k = lo; k <= hi; k++) {
    if (db[k] < db[k - 1] || db[k] < db[k + 1] || db[k] < -90) continue;
    const mag = Math.pow(10, db[k] / 20);
    const m = freqToMidi(k * binHz) - centsShift / 100;
    const pc = ((Math.round(m) % 12) + 12) % 12;
    const f = k * binHz;
    c[pc] += mag * mag * (f < 300 ? 1.3 : 1); // favor fundamentals a little
  }
  let mx = 0; for (let i = 0; i < 12; i++) mx = Math.max(mx, c[i]);
  if (mx > 0) for (let i = 0; i < 12; i++) c[i] /= mx;
  return Array.from(c);
}

// ---------- Live listener ----------
// Emits note events {t (audio time), midi, conf}. Also reports level for a meter.
export function listen({ noiseFloor = 0.004, onNote, onLevel, onOnset, minMidi = 36, maxMidi = 96, centsOffset = 0, wantChroma = false }) {
  const shift = centsOffset / 100;
  const c = audio();
  const sr = c.sampleRate;
  const buf = new Float32Array(analyser.fftSize);
  const hop = 1024;
  const recent = []; // rms history
  let lastOnset = -1;
  let pending = null; // {t, pitches:[]}
  let lastEmitted = null; // {midi, t}
  let stableCount = 0, stableMidi = null;
  let running = true;
  const gate = Math.max(noiseFloor * 4, 0.006);

  function frame() {
    if (!running || !analyser) return;
    analyser.getFloatTimeDomainData(buf);
    const now = c.currentTime;
    const r = rms(buf, buf.length - hop, buf.length);
    recent.push(r); if (recent.length > 8) recent.shift();
    onLevel && onLevel(r, gate);
    const ref = recent.length >= 4 ? Math.min(recent[recent.length - 4], recent[recent.length - 3]) : 0;
    const isOnset = r > gate && r > ref * 1.45 + 0.002 && (now - lastOnset) > 0.09;
    if (isOnset) {
      if (pending) finish(pending);
      lastOnset = now;
      pending = { t: now - hop / sr / 2, pitches: [], frames: 0, chroma: null, cn: 0 };
      onOnset && onOnset({ t: pending.t, rms: r });
    }
    let p = null;
    if (r > gate * 0.6) {
      const est = yin(buf, sr);
      if (est && est.clarity > 0.75) {
        const m = freqToMidi(est.freq) - shift;
        if (m >= minMidi - 0.5 && m <= maxMidi + 0.5) p = m;
      }
    }
    if (pending) {
      pending.frames++;
      if (pending.frames >= 2 && p !== null) pending.pitches.push(p);
      if (wantChroma && pending.frames >= 3 && pending.frames <= 8) {
        const ch = chroma(analyser, sr, centsOffset);
        if (!pending.chroma) pending.chroma = ch; else ch.forEach((v, i) => { pending.chroma[i] += v; });
        pending.cn++;
      }
      if (pending.frames >= 9 || (!wantChroma && pending.pitches.length >= 5)) { finish(pending); pending = null; }
    } else if (p !== null) {
      // soft new note without a clear attack: pitch changed and stayed changed
      const rm = Math.round(p);
      if (rm === stableMidi) stableCount++; else { stableMidi = rm; stableCount = 1; }
      if (stableCount === 5 && lastEmitted && rm !== lastEmitted.midi && (now - lastOnset) > 0.2) {
        emit(now - 0.1, rm, 0.6);
      }
    }
    setTimeout(frame, 20);
  }
  function finish(pd) {
    let ch = null;
    if (pd.chroma) { const mx = Math.max(...pd.chroma) || 1; ch = pd.chroma.map(v => v / mx); }
    if (!pd.pitches.length) { if (ch) emit(pd.t, null, 0, null, ch); return; }
    const s = pd.pitches.slice().sort((a, b) => a - b);
    const med = s[Math.floor(s.length / 2)];
    const close = s.filter(x => Math.abs(x - med) < 0.6).length / s.length;
    emit(pd.t, Math.round(med), close, med + shift, ch);
  }
  function emit(t, midi, conf, raw = midi, ch = null) {
    if (midi !== null) { lastEmitted = { midi, t }; stableMidi = midi; stableCount = 0; }
    onNote && onNote({ t, midi, conf, raw, chroma: ch });
  }
  frame();
  return { stop() { running = false; if (pending) finish(pending); } };
}

// Measure room noise for `ms` milliseconds.
export async function measureNoise(ms = 1500) {
  const c = audio();
  const buf = new Float32Array(analyser.fftSize);
  const vals = [];
  const end = performance.now() + ms;
  while (performance.now() < end) {
    analyser.getFloatTimeDomainData(buf); vals.push(rms(buf, buf.length - 1024, buf.length));
    await new Promise(r => setTimeout(r, 30));
  }
  vals.sort((a, b) => a - b);
  void c;
  return vals[Math.floor(vals.length * 0.7)] || 0.002;
}

// ---------- Judging ----------
// expected: [{midi, beat, dur}] (one note per entry; chords not judged in this version)
// heard: [{t, midi}]
export function judge(expected, heard) {
  const n = expected.length, m = heard.length;
  const INS = 0.6, DEL = 1;
  const cost = (e, h) => matchCost(e, h);
  const D = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  const B = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1 diag 2 up(del) 3 left(ins)
  for (let i = 1; i <= n; i++) { D[i][0] = i * DEL; B[i][0] = 2; }
  for (let j = 1; j <= m; j++) { D[0][j] = j * INS; B[0][j] = 3; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const a = D[i - 1][j - 1] + cost(expected[i - 1], heard[j - 1]);
    const b = D[i - 1][j] + DEL, c = D[i][j - 1] + INS;
    if (a <= b && a <= c) { D[i][j] = a; B[i][j] = 1; } else if (b <= c) { D[i][j] = b; B[i][j] = 2; } else { D[i][j] = c; B[i][j] = 3; }
  }
  const per = expected.map(() => ({ status: 'missed', heard: null, t: null }));
  let extras = 0;
  for (let i = n, j = m; i > 0 || j > 0;) {
    const k = B[i][j];
    if (k === 1) {
      const e = expected[i - 1], h = heard[j - 1];
      const c0 = matchCost(e, h);
      per[i - 1] = { status: c0 <= 0.2 ? 'hit' : c0 <= 0.5 ? 'partial' : 'wrong', heard: h.midi, t: h.t, missing: missingPcs(e, h) };
      i--; j--;
    } else if (k === 2) { i--; } else { extras++; j--; }
  }
  const hits = per.filter(p => p.status === 'hit').length;
  const partial = per.filter(p => p.status === 'partial').length;
  const wrong = per.filter(p => p.status === 'wrong').length;
  const pitchScore = n ? (hits + partial * 0.5) / n : 0;

  // Rhythm: fit time = a + k*beat over notes we heard, then look at residuals (in beats).
  const pts = per.map((p, i) => ({ beat: expected[i].beat, t: p.t, i })).filter(p => p.t !== null);
  let rhythmScore = null, tempo = null; const timing = [];
  if (pts.length >= 3) {
    const mb = pts.reduce((s, p) => s + p.beat, 0) / pts.length;
    const mt = pts.reduce((s, p) => s + p.t, 0) / pts.length;
    let sxy = 0, sxx = 0; pts.forEach(p => { sxy += (p.beat - mb) * (p.t - mt); sxx += (p.beat - mb) ** 2; });
    const k = sxx ? sxy / sxx : 0.75;
    if (k > 0.15 && k < 3) {
      tempo = 60 / k;
      let score = 0;
      pts.forEach(p => {
        const pred = mt + k * (p.beat - mb);
        const resid = (p.t - pred) / k; // in beats
        timing[p.i] = resid;
        const a = Math.abs(resid);
        score += a < 0.2 ? 1 : a < 0.35 ? 0.5 : 0;
      });
      rhythmScore = score / pts.length;
    }
  }
  const heardEnough = m >= Math.max(2, Math.ceil(n * 0.4));
  let verdict;
  const rs = rhythmScore === null ? 1 : rhythmScore;
  if (!heardEnough) verdict = 'unclear';
  else if (pitchScore >= 0.95 && rs >= 0.85) verdict = 'clean';
  else if (pitchScore >= 0.7 && rs >= 0.5) verdict = 'nearly';
  else verdict = 'notyet';

  return { verdict, pitchScore, rhythmScore, tempo, hits, partial, wrong, extras, per, timing, n, messages: feedback(expected, per, timing, rhythmScore, verdict) };
}

const pcOf = m => ((m % 12) + 12) % 12;
// heard can carry: midi (single pitch), pcs (from MIDI keyboard, exact), chroma (from mic spectrum)
function presentPcs(h) {
  if (h.pcs) return new Set(h.pcs);
  const out = new Set();
  if (h.chroma) h.chroma.forEach((v, i) => { if (v >= 0.28) out.add(i); });
  if (h.midi !== null && h.midi !== undefined) out.add(pcOf(h.midi));
  return out;
}
function missingPcs(e, h) {
  if (!Array.isArray(e.midi)) return [];
  const have = presentPcs(h);
  return [...new Set(e.midi.map(pcOf))].filter(pc => !have.has(pc));
}
export function matchCost(e, h) {
  if (Array.isArray(e.midi)) {
    const need = [...new Set(e.midi.map(pcOf))];
    const miss = missingPcs(e, h).length;
    if (!h.pcs && !h.chroma && (h.midi === null || h.midi === undefined)) return 1;
    if (miss === 0) return 0;
    return miss === 1 && need.length >= 2 ? 0.5 : 1;
  }
  if (h.midi === null || h.midi === undefined) {
    if (h.pcs) return h.pcs.includes(pcOf(e.midi)) ? 0.15 : 1;
    if (h.chroma) { const mx = h.chroma.indexOf(Math.max(...h.chroma)); return mx === pcOf(e.midi) ? 0.15 : 1; }
    return 1;
  }
  if (e.midi === h.midi) return 0;
  return Math.abs(e.midi - h.midi) === 12 ? 0.15 : 1;
}

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = m => NAMES[((m % 12) + 12) % 12];

function feedback(expected, per, timing, rhythmScore, verdict) {
  const msgs = [];
  if (verdict === 'unclear') {
    msgs.push("I couldn't hear that clearly. Try playing a little louder, and make sure the phone is on the music stand facing the keys.");
    return msgs;
  }
  const wrongs = per.map((p, i) => ({ ...p, i })).filter(p => p.status === 'wrong');
  const missed = per.map((p, i) => ({ ...p, i })).filter(p => p.status === 'missed');
  const hits = per.filter(p => p.status === 'hit').length;
  msgs.push(`${expected.some(e => Array.isArray(e.midi)) ? 'Chords' : 'Notes'}: ${hits} of ${per.length} right.`);
  const isChord = i => Array.isArray(expected[i].midi);
  const label = i => isChord(i) ? `Chord ${i + 1}${expected[i].sym ? ' (' + expected[i].sym + ')' : ''}` : `Note ${i + 1}`;
  wrongs.slice(0, 2).forEach(w => msgs.push(isChord(w.i)
    ? `${label(w.i)}: I didn't hear ${w.missing.map(noteName).join(', ')}.`
    : `Note ${w.i + 1} should be ${noteName(expected[w.i].midi)}.${w.heard !== null && w.heard !== undefined ? ` I heard ${noteName(w.heard)}.` : ''}`));
  per.map((p, i) => ({ ...p, i })).filter(p => p.status === 'partial').slice(0, 2)
    .forEach(w => msgs.push(`${label(w.i)}: nearly. ${w.missing.length ? `${w.missing.map(noteName).join(', ')} was quiet or missing.` : ''}`));
  if (missed.length && missed.length <= 2) missed.forEach(w => msgs.push(`I didn't hear ${label(w.i).toLowerCase()}${isChord(w.i) ? '' : ` (${noteName(expected[w.i].midi)})`}.`));
  else if (missed.length > 2) msgs.push(`I missed ${missed.length} notes. Play each one clearly, a little louder.`);
  if (rhythmScore !== null) {
    if (rhythmScore >= 0.85) msgs.push('Rhythm: nice and steady.');
    else {
      // find the worst rushed note after a long note
      let worst = -1, wv = 0;
      timing.forEach((r, i) => { if (r !== undefined && Math.abs(r) > wv) { wv = Math.abs(r); worst = i; } });
      if (worst > 0) {
        const prev = expected[worst - 1];
        if (timing[worst] < 0 && prev && prev.dur >= 2) msgs.push(`Rhythm: let the long note before note ${worst + 1} ring for its full ${prev.dur} counts.`);
        else if (timing[worst] < 0) msgs.push(`Rhythm: note ${worst + 1} came in early. Keep the beat even, like footsteps.`);
        else msgs.push(`Rhythm: there was a pause before note ${worst + 1}. Try a slower tempo so every note arrives on time.`);
      } else msgs.push('Rhythm: aim for even, steady counts.');
    }
  }
  return msgs;
}
