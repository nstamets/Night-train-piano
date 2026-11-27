// "My Own Song": turn a chord chart (chord names or Nashville numbers) into a playable practice piece.
// Chords only: no melodies or lyrics are stored, so players can use charts from songs they already play.

const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11 };
export const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const KEY_SIG = { C: { sharps: 0 }, G: { sharps: 1 }, D: { sharps: 2 }, A: { sharps: 3 }, E: { sharps: 4 }, B: { sharps: 5 }, 'F#': { sharps: 6 },
  F: { flats: 1 }, Bb: { flats: 2 }, Eb: { flats: 3 }, Ab: { flats: 4 }, Db: { flats: 5 } };
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db']);
const SCALE = [0, 2, 4, 5, 7, 9, 11];
const QUALITY = [
  ['maj7', [0, 4, 7, 11]], ['m7b5', [0, 3, 6, 10]], ['m7', [0, 3, 7, 10]], ['m9', [0, 3, 7, 10, 2]], ['madd9', [0, 3, 7, 2]],
  ['add9', [0, 4, 7, 2]], ['add2', [0, 4, 7, 2]], ['sus4', [0, 5, 7]], ['sus2', [0, 2, 7]], ['sus', [0, 5, 7]],
  ['dim', [0, 3, 6]], ['aug', [0, 4, 8]], ['+', [0, 4, 8]], ['maj9', [0, 4, 7, 11, 2]], ['9', [0, 4, 7, 10, 2]], ['7', [0, 4, 7, 10]],
  ['6', [0, 4, 7, 9]], ['5', [0, 7]], ['2', [0, 4, 7, 2]], ['m', [0, 3, 7]], ['-', [0, 3, 7]], ['', [0, 4, 7]],
];

export function nameOf(pc, key) { return (FLAT_KEYS.has(key) ? FLAT_NAMES : SHARP_NAMES)[((pc % 12) + 12) % 12]; }

// Parse one chord token into {root pc, intervals, bass pc, quality text}. key is needed for numbers.
export function parseChord(tok, key) {
  let m = /^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?))?$/.exec(tok);
  let root, rest, bass;
  if (m && NOTE[m[1]] !== undefined) { root = NOTE[m[1]]; rest = m[2]; bass = m[3] !== undefined ? NOTE[m[3]] : null; }
  else {
    m = /^([b#]?)([1-7])(.*?)(?:\/([b#]?)([1-7]))?$/.exec(tok);
    if (!m) return null;
    const k = NOTE[key] ?? 0;
    const acc = s => (s === 'b' ? -1 : s === '#' ? 1 : 0);
    root = (k + SCALE[+m[2] - 1] + acc(m[1]) + 12) % 12; rest = m[3];
    bass = m[5] ? (k + SCALE[+m[5] - 1] + acc(m[4]) + 12) % 12 : null;
  }
  const q = QUALITY.find(([name]) => rest === name) || QUALITY.find(([name]) => name && rest.startsWith(name));
  if (!q) return null;
  return { root, iv: q[1], bass: bass ?? root, qual: q[0] === '-' ? 'm' : q[0], minor: q[1][1] === 3 };
}

// Tokens: chord or number per bar ("G", "D/F#", "6m", "4"), "G:2" for 2 beats, "-" or "%" = hold previous bar, "|" ignored.
export function parseChart(text, key) {
  const bars = []; const bad = [];
  (text || '').replace(/\|/g, ' ').split(/\s+/).filter(Boolean).forEach(tok => {
    const [t, beats] = tok.split(':');
    const dur = beats ? Math.max(1, Math.min(8, +beats || 4)) : 4;
    if (t === '-' || t === '%') { if (bars.length) bars.push({ ...bars[bars.length - 1], dur }); return; }
    const c = parseChord(t, key);
    if (!c) { bad.push(t); return; }
    bars.push({ ...c, tok: t, dur });
  });
  return { bars, bad };
}

// Voice-led right-hand voicings (3–4 notes around middle C) and a low bass note.
function voicings(pcs) {
  const uniq = [...new Set(pcs.map(p => ((p % 12) + 12) % 12))];
  let use = uniq;
  if (use.length > 4) use = use.filter(p => p !== ((uniq[0] + 7) % 12)); // drop the 5th
  const out = [];
  for (let r = 0; r < use.length; r++) {
    const order = use.slice(r).concat(use.slice(0, r));
    for (let base = 52; base <= 64; base++) {
      if (base % 12 !== order[0]) continue;
      const notes = [base]; for (let i = 1; i < order.length; i++) { let n = notes[i - 1] + 1; while (n % 12 !== order[i]) n++; notes.push(n); }
      if (notes[0] >= 53 && notes[notes.length - 1] <= 77) out.push(notes);
    }
  }
  return out;
}
function bestVoicing(pcs, prev) {
  const cands = voicings(pcs);
  if (!cands.length) return [60, 64, 67];
  if (!prev) return cands.sort((a, b) => Math.abs(a[a.length - 1] - 67) - Math.abs(b[b.length - 1] - 67))[0];
  const dist = v => { const a = v.slice().sort((x, y) => x - y), b = prev.slice().sort((x, y) => x - y); let d = 0; const n = Math.max(a.length, b.length); for (let i = 0; i < n; i++) d += Math.abs((a[Math.min(i, a.length - 1)]) - (b[Math.min(i, b.length - 1)])); return d + Math.abs(a[a.length - 1] - 68) * 0.3; };
  return cands.sort((a, b) => dist(a) - dist(b))[0];
}

const PC_SP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PC_SP_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const spell = (m, key) => (FLAT_KEYS.has(key) ? PC_SP_FLAT : PC_SP)[m % 12] + (Math.floor(m / 12) - 1);

export function numberOf(c, key) {
  const k = NOTE[key] ?? 0; const d = ((c.root - k) + 12) % 12; const i = SCALE.indexOf(d);
  const num = i >= 0 ? String(i + 1) : (SCALE.indexOf((d + 1) % 12) >= 0 ? 'b' + (SCALE.indexOf((d + 1) % 12) + 1) : '#' + (SCALE.indexOf((d + 11) % 12) + 1));
  return num + (c.qual || '').replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
}
export function displayName(c, key) {
  return nameOf(c.root, key) + (c.qual || '') + (c.bass !== c.root ? '/' + nameOf(c.bass, key) : '');
}

// Build a practice piece. song: {title, key, chart, bpm, style, rhythm, transpose}
export function buildSongPiece(song) {
  const srcKey = song.key || 'C';
  const key = KEYS[(KEYS.indexOf(srcKey) + (song.transpose || 0) + 120) % 12];
  const shift = ((NOTE[key] - NOTE[srcKey]) + 12) % 12;
  const { bars, bad } = parseChart(song.chart, srcKey);
  const notes = [], lh = [], band = [];
  let beat = 0, prev = null;
  bars.forEach(b0 => {
    const c = { ...b0, root: (b0.root + shift) % 12, bass: (b0.bass + shift) % 12 };
    const rh = bestVoicing(c.iv.map(i => c.root + i), prev); prev = rh;
    let bassM = 40; while (bassM % 12 !== c.bass) bassM++;
    const sym = `${displayName(c, key)} (${numberOf(c, key)})`.replace(/ /g, '_');
    const hits = song.rhythm === 'pulse' ? Array(b0.dur).fill(1) : song.rhythm === '332' && b0.dur === 4 ? [1.5, 1.5, 1] : [b0.dur];
    let t = beat;
    hits.forEach((d, i) => { notes.push({ midi: rh, sp: rh.map(m => spell(m, key)), beat: t, dur: d, sym: i === 0 ? sym.replace(/_/g, ' ') : undefined }); t += d; });
    lh.push({ midi: bassM, sp: spell(bassM, key), beat, dur: b0.dur });
    band.push({ beat, dur: b0.dur, root: bassM, minor: c.minor, name: displayName(c, key) });
    beat += b0.dur;
  });
  return {
    piece: { title: song.title || 'My song', credit: `Your chart · key of ${key}`, bpm: song.bpm || 72, range: [38, 79], hand: 'RH', judge: 'chords',
      keySig: KEY_SIG[key] || null, notes, lh, band, bandStyle: song.style || 'worship' },
    key, bad, bars: bars.length,
  };
}
