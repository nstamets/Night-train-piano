// Sight-reading generator: fresh, musical exercises at four levels.
// Melodies walk mostly by step, with a few skips, start on a chord tone and end on the home note.

const KEYS = {
  C: { scale: [0, 2, 4, 5, 7, 9, 11], tonic: 0, sig: null, names: ['C', 'D', 'E', 'F', 'G', 'A', 'B'] },
  G: { scale: [7, 9, 11, 0, 2, 4, 6], tonic: 7, sig: { sharps: 1 }, names: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'] },
  F: { scale: [5, 7, 9, 10, 0, 2, 4], tonic: 5, sig: { flats: 1 }, names: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'] },
};

export const SIGHT_LEVELS = [
  null,
  { name: 'Level 1', desc: 'C position, quarter and half notes', keys: ['C'], lo: 60, hi: 67, bars: 4, bpb: [4], maxLeap: 1, bpm: 72,
    rhythms: { 4: [[1, 1, 1, 1], [1, 1, 2], [2, 1, 1], [2, 2]] }, end: { 4: [[4], [2, 2]] } },
  { name: 'Level 2', desc: 'Skips and eighth notes', keys: ['C'], lo: 60, hi: 69, bars: 4, bpb: [4], maxLeap: 2, bpm: 76,
    rhythms: { 4: [[1, 1, 1, 1], [1, 1, 2], [0.5, 0.5, 1, 2], [1, 0.5, 0.5, 1, 1], [2, 1, 1]] }, end: { 4: [[4], [2, 2]] } },
  { name: 'Level 3', desc: 'Key of G, 3/4 time, dotted rhythms', keys: ['G', 'C'], lo: 62, hi: 74, bars: 6, bpb: [4, 3], maxLeap: 3, bpm: 80,
    rhythms: { 4: [[1, 1, 1, 1], [1.5, 0.5, 1, 1], [0.5, 0.5, 1, 2], [1, 0.5, 0.5, 2]], 3: [[1, 1, 1], [2, 1], [1.5, 0.5, 1], [0.5, 0.5, 1, 1]] },
    end: { 4: [[4], [2, 2]], 3: [[3]] } },
  { name: 'Level 4', desc: 'Wider range, F and G major, busier rhythms', keys: ['G', 'F', 'C'], lo: 60, hi: 79, bars: 8, bpb: [4, 3], maxLeap: 4, bpm: 84,
    rhythms: { 4: [[1, 1, 1, 1], [1.5, 0.5, 1, 1], [0.5, 0.5, 0.5, 0.5, 1, 1], [1, 0.5, 0.5, 0.5, 0.5, 1], [0.5, 0.5, 1, 1.5, 0.5]], 3: [[1, 1, 1], [1.5, 0.5, 1], [0.5, 0.5, 0.5, 0.5, 1], [2, 1]] },
    end: { 4: [[4], [2, 2], [3, 1]], 3: [[3], [2, 1]] } },
];

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export function generateSight(level, rand = Math.random) {
  const L = SIGHT_LEVELS[Math.max(1, Math.min(4, level))];
  const keyName = L.keys[Math.floor(rand() * L.keys.length)];
  const K = KEYS[keyName];
  const bpb = L.bpb[Math.floor(rand() * L.bpb.length)];
  const pitches = []; for (let m = L.lo; m <= L.hi; m++) if (K.scale.includes(m % 12)) pitches.push(m);
  const tonics = pitches.map((m, i) => [m, i]).filter(([m]) => m % 12 === K.tonic);
  const chordTones = new Set([K.scale[0], K.scale[2], K.scale[4]]);
  const starts = pitches.map((m, i) => [m, i]).filter(([m]) => chordTones.has(m % 12));
  let idx = starts[Math.floor(rand() * Math.min(starts.length, 3))][1];
  const notes = []; let beat = 0;
  for (let bar = 0; bar < L.bars; bar++) {
    const last = bar === L.bars - 1;
    const pool = last ? L.end[bpb] : L.rhythms[bpb];
    const rh = pool[Math.floor(rand() * pool.length)];
    rh.forEach((d, j) => {
      if (!(bar === 0 && j === 0)) {
        if (last && j === rh.length - 2) {
          const t = tonics.reduce((b, x) => Math.abs(x[1] - idx) < Math.abs(b[1] - idx) ? x : b)[1];
          idx = t + (idx >= t ? 1 : -1); idx = Math.max(0, Math.min(pitches.length - 1, idx));
        } else if (last && j === rh.length - 1) {
          // land on the nearest home note
          idx = tonics.reduce((b, t) => Math.abs(t[1] - idx) < Math.abs(b[1] - idx) ? t : b)[1];
        } else {
          let step = rand() < 0.7 ? (rand() < 0.5 ? -1 : 1) : (rand() < 0.5 ? -1 : 1) * (2 + Math.floor(rand() * (L.maxLeap - 1 || 1)));
          if (L.maxLeap === 1) step = Math.sign(step) || 1;
          if (rand() < 0.08) step = 0; // occasional repeated note
          let nx = idx + step;
          if (nx < 0 || nx >= pitches.length) nx = idx - step; // bounce off the edges
          idx = Math.max(0, Math.min(pitches.length - 1, nx));
        }
      }
      const m = pitches[idx];
      notes.push({ midi: m, beat, dur: d, sp: K.names[K.scale.indexOf(m % 12)] + (Math.floor(m / 12) - 1) });
      beat += d;
    });
  }
  void NOTE_NAMES;
  return { title: `Sight-reading · ${L.name}`, notes, beatsPerBar: bpb, keySig: K.sig, bpm: L.bpm, range: [Math.min(L.lo, 57), Math.max(L.hi + 2, 72)], hand: 'RH', key: keyName, level };
}
