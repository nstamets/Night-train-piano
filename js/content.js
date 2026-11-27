// Curriculum content: lines, stations, items, pieces. Original exercises + public-domain melodies only.

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function toMidi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  return (+m[3] + 1) * 12 + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
// Tokens: "E4:1/3" (note:beats/finger), "[C4,E4,G4]:4" (chord), "R:1" (rest), "...@Sym" (chord symbol above). "|" = bar line (ignored).
export function parse(str) {
  const out = []; let beat = 0;
  str.split(/\s+/).filter(t => t && t !== '|').forEach(tok => {
    let sym; [tok, sym] = tok.split('@');
    const ci = tok.lastIndexOf(':');
    const note = ci >= 0 ? tok.slice(0, ci) : tok;
    const [dur, finger] = (ci >= 0 ? tok.slice(ci + 1) : '1').split('/');
    const d = +dur;
    if (note !== 'R') {
      const names = note.startsWith('[') ? note.slice(1, -1).split(',') : null;
      const midi = names ? names.map(toMidi) : toMidi(note);
      const ev = { midi, beat, dur: d, sp: names || note }; // sp keeps the written spelling (G# vs Ab)
      if (finger) ev.finger = +finger;
      if (sym) ev.sym = sym.replace(/_/g, ' ');
      out.push(ev);
    }
    beat += d;
  });
  return out;
}
// Band chords from a simple chart: "C:4 F:4 G:4 C:4" (m = minor, 7 ignored for bass).
export function chart(str, octave = 3) {
  let beat = 0; const out = [];
  str.split(/\s+/).filter(Boolean).forEach(tok => {
    const [name, dur] = tok.split(':'); const d = +(dur || 4);
    const m = /^([A-G][#b]?)(m(?!aj))?/.exec(name);
    out.push({ beat, dur: d, root: toMidi(m[1] + octave), minor: !!m[2], name });
    beat += d;
  });
  return out;
}

// Bach Prelude in C: each half bar is n1 n2 n3 n4 n5 n3 n4 n5 in sixteenths. Left hand takes the first two notes, right hand the rest.
function preludeBars(bars) {
  const out = []; let beat = 0;
  bars.forEach(([n1, n2, n3, n4, n5]) => {
    for (let h = 0; h < 2; h++) [n1, n2, n3, n4, n5, n3, n4, n5].forEach((n, i) => { out.push({ midi: toMidi(n), sp: n, beat, dur: 0.25, finger: i >= 2 ? [1, 2, 4][(i - 2) % 3] : undefined }); beat += 0.25; });
  });
  return out;
}

export const THEMES = [
  { id: 'midnight', name: 'Midnight Express', desc: 'Deep blue, lamplight gold' },
  { id: 'sleeper', name: 'Sleeper Car', desc: 'Warm wood and brass' },
  { id: 'neon', name: 'Neon Line', desc: 'City lights, bold color' },
  { id: 'daylight', name: 'Daylight Run', desc: 'Bright, high contrast' },
];

export const LINES = [
  { id: 'foundations', name: 'Foundations Local', who: 'Everyone starts here', ready: true },
  { id: 'carol', name: 'Carol Line', who: 'Songs and Christmas carols, solo and duet', ready: true },
  { id: 'gospel', name: 'Gospel Line', who: 'Worship chords, charts, and playing with a team', ready: true },
  { id: 'conservatory', name: 'Conservatory Line', who: 'Classical technique and repertoire', ready: true },
  { id: 'bluenote', name: 'Blue Note Line', who: 'Jazz: 7th chords, swing, comping, improvising', ready: true },
  { id: 'radio', name: 'Radio Line', who: 'Pop: accompaniment grooves, lead sheets, playing by ear', ready: true },
];

// ---------- Pieces ----------
export const PIECES = {
  cdeUpDown: { title: 'Up the Steps', notes: parse('C4:1/1 D4:1/2 E4:1/3 D4:1/2 | C4:4/1'), bpm: 72, range: [57, 69], hand: 'RH' },
  clockTower: { title: 'Clock Tower', notes: parse('C4:1/1 C4:1/1 D4:2/2 | E4:1/3 E4:1/3 D4:2/2 | C4:4/1'), bpm: 76, range: [57, 69], hand: 'RH' },
  fiveFinger: { title: 'Five-Finger Climb', notes: parse('C4:1/1 D4:1/2 E4:1/3 F4:1/4 | G4:1/5 F4:1/4 E4:1/3 D4:1/2 | C4:4/1'), bpm: 80, range: [57, 72], hand: 'RH' },
  hotCrossBuns: { title: 'Hot Cross Buns', credit: 'Traditional', notes: parse('E4:1/3 D4:1/2 C4:2/1 | E4:1/3 D4:1/2 C4:2/1 | C4:1/1 C4:1/1 D4:1/2 D4:1/2 | E4:1/3 D4:1/2 C4:2/1'), bpm: 84, range: [57, 69], hand: 'RH' },
  odeToJoy: { title: 'Ode to Joy (line 1)', credit: 'Beethoven, 1824 (public domain)', notes: parse('E4:1/3 E4:1/3 F4:1/4 G4:1/5 | G4:1/5 F4:1/4 E4:1/3 D4:1/2 | C4:1/1 C4:1/1 D4:1/2 E4:1/3 | E4:1.5/3 D4:0.5/2 D4:2/2'), bpm: 84, range: [57, 72], hand: 'RH',
    phrases: [[0, 7], [8, 14]] },

  // ---- Carol Line ----
  jingle: { title: 'Jingle Bells (chorus)', credit: 'James Lord Pierpont, 1857 (public domain)',
    notes: parse('E4:1/3 E4:1/3 E4:2/3 | E4:1/3 E4:1/3 E4:2/3 | E4:1/3 G4:1/5 C4:1.5/1 D4:0.5/2 | E4:4/3 | F4:1/4 F4:1/4 F4:1.5/4 F4:0.5/4 | F4:1/4 E4:1/3 E4:1/3 E4:0.5/3 E4:0.5/3 | E4:1/3 D4:1/2 D4:1/2 E4:1/3 | D4:2/2 G4:2/5'),
    bpm: 96, range: [57, 72], hand: 'RH', phrases: [[0, 10], [11, 25]] },
  jingleDuet: { title: 'Jingle Bells duet', credit: 'Pierpont, 1857 (public domain) · duet arrangement: Night Train', bpm: 96, range: [45, 72], hand: 'RH',
    duet: { parts: [
      { id: 'melody', name: 'Melody (upper)', clef: 'treble', notes: null },
      { id: 'bass', name: 'Bass notes (lower, easy)', clef: 'bass', notes: parse('C3:4/1 | C3:4/1 | C3:4/1 | C3:4/1 | F3:4/1 | C3:4/1 | G3:4/1 | G3:4/1') },
      { id: 'chords', name: 'Chords (lower)', clef: 'bass', notes: parse('[C3,E3,G3]:4@C | [C3,E3,G3]:4 | [C3,E3,G3]:4 | [C3,E3,G3]:4 | [C3,F3,A3]:4@F | [C3,E3,G3]:4@C | [B2,D3,G3]:4@G | [B2,D3,G3]:4') },
    ] } },
  odeDuet: { title: 'Ode to Joy duet', credit: 'Beethoven (public domain) · duet arrangement: Night Train', bpm: 84, range: [45, 72], hand: 'RH',
    duet: { parts: [
      { id: 'melody', name: 'Melody (upper)', clef: 'treble', notes: null },
      { id: 'bass', name: 'Bass notes (lower, easy)', clef: 'bass', notes: parse('C3:4/1 | G3:4/5 | C3:4/1 | G3:4/5') },
      { id: 'chords', name: 'Chords (lower)', clef: 'bass', notes: parse('[C3,E3,G3]:4@C | [B2,D3,G3]:4@G | [C3,E3,G3]:4@C | [B2,D3,G3]:4@G') },
    ] } },

  // ---- Gospel Line (worship) ----
  chordsC: { title: 'C – F – G – C (root position)', notes: parse('[C4,E4,G4]:4@C_(1) | [F4,A4,C5]:4@F_(4) | [G4,B4,D5]:4@G_(5) | [C4,E4,G4]:4@C_(1)'),
    lh: parse('C3:4 | F3:4 | G3:4 | C3:4'), bpm: 72, range: [48, 76], hand: 'RH', judge: 'chords',
    band: chart('C:4 F:4 G:4 C:4'), bandStyle: 'worship' },
  chordsCsmooth: { title: 'C – F – G – C (smooth)', notes: parse('[C4,E4,G4]:4@C | [C4,F4,A4]:4@F | [B3,D4,G4]:4@G | [C4,E4,G4]:4@C'),
    lh: parse('C3:4 | F3:4 | G3:4 | C3:4'), bpm: 72, range: [45, 72], hand: 'RH', judge: 'chords',
    band: chart('C:4 F:4 G:4 C:4'), bandStyle: 'worship' },
  fourChords: { title: '1 – 5 – 6m – 4 in G', notes: parse('[G4,B4,D5]:4@G_(1) | [A4,D5,F#5]:4@D_(5) | [G4,B4,E5]:4@Em_(6m) | [G4,C5,E5]:4@C_(4)'),
    lh: parse('G3:4 | D3:4 | E3:4 | C3:4'), keySig: { sharps: 1 }, bpm: 76, range: [48, 79], hand: 'RH', judge: 'chords',
    band: chart('G:4 D:4 Em:4 C:4'), bandStyle: 'worship' },
  fourPulse: { title: '1 – 5 – 6m – 4 with a pulse', keySig: { sharps: 1 }, bpm: 76, range: [48, 79], hand: 'RH', judge: 'chords',
    notes: parse('[G4,B4,D5]:1@G [G4,B4,D5]:1 [G4,B4,D5]:1 [G4,B4,D5]:1 | [A4,D5,F#5]:1@D [A4,D5,F#5]:1 [A4,D5,F#5]:1 [A4,D5,F#5]:1 | [G4,B4,E5]:1@Em [G4,B4,E5]:1 [G4,B4,E5]:1 [G4,B4,E5]:1 | [G4,C5,E5]:1@C [G4,C5,E5]:1 [G4,C5,E5]:1 [G4,C5,E5]:1'),
    lh: parse('G3:4 | D3:4 | E3:4 | C3:4'), band: chart('G:4 D:4 Em:4 C:4'), bandStyle: 'worship' },

  // ---- Conservatory Line ----
  gScale: { title: 'G major scale (right hand)', notes: parse('G4:0.5/1 A4:0.5/2 B4:0.5/3 C5:0.5/1 D5:0.5/2 E5:0.5/3 F#5:0.5/4 G5:0.5/5 | F#5:0.5/4 E5:0.5/3 D5:0.5/2 C5:0.5/1 B4:0.5/3 A4:0.5/2 G4:1/1'),
    keySig: { sharps: 1 }, bpm: 80, range: [55, 81], hand: 'RH' },
  minuet: { title: 'Minuet in G (bars 1–8)', credit: 'Christian Petzold, c. 1725, long credited to J. S. Bach (public domain)', beatsPerBar: 3, keySig: { sharps: 1 },
    notes: parse('D5:1/5 G4:0.5/1 A4:0.5/2 B4:0.5/3 C5:0.5/4 | D5:1/5 G4:1/1 G4:1/1 | E5:1/4 C5:0.5/1 D5:0.5/2 E5:0.5/3 F#5:0.5/4 | G5:1/5 G4:1/1 G4:1/1 | C5:1/4 D5:0.5/5 C5:0.5/4 B4:0.5/3 A4:0.5/2 | B4:1/3 C5:0.5/4 B4:0.5/3 A4:0.5/2 G4:0.5/1 | F#4:1/1 G4:0.5/2 A4:0.5/3 B4:0.5/4 G4:0.5/2 | A4:3/3'),
    lh: parse('G3:3/1 | B3:3/2 | C4:3/1 | B3:3/2 | A3:3/3 | G3:3/4 | D4:3/1 | D3:3/5'),
    lhNote: 'Simplified left hand: one held note per bar.',
    bpm: 108, range: [48, 81], hand: 'RH', phrases: [[0, 15], [16, 31]] },

  // ---- Blue Note Line ----
  shells: { title: 'ii – V – I shells in C', notes: parse('[D3,F3]:4@Dm7 | [G2,F3]:4@G7 | [C3,E3]:4@Cmaj7 | [C3,E3]:4'), clef: 'bass',
    bpm: 112, range: [41, 64], hand: 'LH', judge: 'chords', band: chart('Dm7:4 G7:4 C:8', 2), bandStyle: 'swing' },
  charleston: { title: 'Charleston comping', clef: 'bass', bpm: 112, range: [41, 64], hand: 'LH', judge: 'chords',
    notes: parse('[D3,F3]:1.5@Dm7 [D3,F3]:0.5 R:2 | [G2,F3]:1.5@G7 [G2,F3]:0.5 R:2 | [C3,E3]:1.5@Cmaj7 [C3,E3]:0.5 R:2 | [C3,E3]:1.5 [C3,E3]:0.5 R:2'),
    band: chart('Dm7:4 G7:4 C:8', 2), bandStyle: 'swing' },

  // ---- Gospel: more stations ----
  fourD: { title: '1 – 5 – 6m – 4 in D', notes: parse('[D4,F#4,A4]:4@D_(1) | [C#4,E4,A4]:4@A_(5) | [D4,F#4,B4]:4@Bm_(6m) | [D4,G4,B4]:4@G_(4)'),
    lh: parse('D3:4 | A2:4 | B2:4 | G2:4'), keySig: { sharps: 2 }, bpm: 76, range: [41, 72], hand: 'RH', judge: 'chords',
    band: chart('D:4 A:4 Bm:4 G:4', 2), bandStyle: 'worship' },
  fourE: { title: '1 – 5 – 6m – 4 in E', notes: parse('[E4,G#4,B4]:4@E_(1) | [D#4,F#4,B4]:4@B_(5) | [E4,G#4,C#5]:4@C#m_(6m) | [E4,A4,C#5]:4@A_(4)'),
    lh: parse('E3:4 | B2:4 | C#3:4 | A2:4'), keySig: { sharps: 4 }, bpm: 76, range: [45, 74], hand: 'RH', judge: 'chords',
    band: chart('E:4 B:4 C#m:4 A:4', 2), bandStyle: 'worship' },
  susRes: { title: 'Sus chords resolving', notes: parse('[D4,G4,A4]:2@Dsus4 [D4,F#4,A4]:2@D | [D4,G4,A4]:2@Dsus4 [D4,F#4,A4]:2@D | [D4,E4,A4]:2@Asus4 [C#4,E4,A4]:2@A | [D4,E4,A4]:2@Asus4 [C#4,E4,A4]:2@A'),
    lh: parse('D3:4 | D3:4 | A2:4 | A2:4'), keySig: { sharps: 2 }, bpm: 72, range: [43, 72], hand: 'RH', judge: 'chords',
    band: chart('D:8 A:8', 2), bandStyle: 'pad' },
  anchor: { title: 'Anchor notes: G – Dsus – Em7 – Cadd9', notes: parse('[B4,D5,G5]:4@G | [A4,D5,G5]:4@Dsus/F# | [B4,D5,G5]:4@Em7 | [C5,D5,G5]:4@Cadd9'),
    lh: parse('G2:4 | F#2:4 | E2:4 | C3:4'), keySig: { sharps: 1 }, bpm: 72, range: [40, 81], hand: 'RH', judge: 'chords',
    band: chart('G:4 D:4 Em:4 C:4', 2), bandStyle: 'worship' },
  walkup: { title: 'Walking bass: slash chords', notes: parse('[C4,E4,G4]:4@C | [B3,D4,G4]:4@G/B | [C4,E4,A4]:4@Am | [B3,D4,G4]:4@G | [C4,F4,A4]:4@F | [C4,E4,G4]:4@C/E | [D4,F4,A4]:4@Dm | [B3,D4,G4]:4@G'),
    lh: parse('C3:4 | B2:4 | A2:4 | G2:4 | F2:4 | E2:4 | D2:4 | G2:4'), bpm: 72, range: [38, 72], hand: 'RH', judge: 'chords',
    band: chart('C:4 G:4 Am:4 G:4 F:4 C:4 Dm:4 G:4', 2), bandStyle: 'worship' },

  // ---- Conservatory: more stations ----
  arpC: { title: 'C major arpeggio (right hand)', notes: parse('C4:0.5/1 E4:0.5/2 G4:0.5/3 C5:0.5/1 E5:0.5/2 G5:0.5/3 C6:1/5 | G5:0.5/3 E5:0.5/2 C5:0.5/1 G4:0.5/3 E4:0.5/2 C4:1.5/1'),
    bpm: 80, range: [57, 86], hand: 'RH' },
  prelude: { title: 'Prelude in C (bars 1–8)', credit: 'J. S. Bach, BWV 846, 1722 (public domain)', bpm: 66, range: [57, 84], hand: 'RH',
    notes: preludeBars([['C4', 'E4', 'G4', 'C5', 'E5'], ['C4', 'D4', 'A4', 'D5', 'F5'], ['B3', 'D4', 'G4', 'D5', 'F5'], ['C4', 'E4', 'G4', 'C5', 'E5'],
      ['C4', 'E4', 'A4', 'E5', 'A5'], ['C4', 'D4', 'F#4', 'A4', 'D5'], ['B3', 'D4', 'G4', 'D5', 'G5'], ['B3', 'C4', 'E4', 'G4', 'C5']]),
    phrases: [[0, 31], [32, 63], [64, 95], [96, 127]] },
  dScale: { title: 'D major scale (right hand)', notes: parse('D4:0.5/1 E4:0.5/2 F#4:0.5/3 G4:0.5/1 A4:0.5/2 B4:0.5/3 C#5:0.5/4 D5:0.5/5 | C#5:0.5/4 B4:0.5/3 A4:0.5/2 G4:0.5/1 F#4:0.5/3 E4:0.5/2 D4:1/1'),
    keySig: { sharps: 2 }, bpm: 84, range: [57, 76], hand: 'RH' },
  minuet2: { title: 'Minuet in G (bars 9–24)', credit: 'Christian Petzold, c. 1725 (public domain)', beatsPerBar: 3, keySig: { sharps: 1 },
    notes: parse('D5:1/5 G4:0.5/1 A4:0.5/2 B4:0.5/3 C5:0.5/4 | D5:1/5 G4:1/1 G4:1/1 | E5:1/4 C5:0.5/1 D5:0.5/2 E5:0.5/3 F#5:0.5/4 | G5:1/5 G4:1/1 G4:1/1 | C5:1/4 D5:0.5/5 C5:0.5/4 B4:0.5/3 A4:0.5/2 | B4:1/3 C5:0.5/4 B4:0.5/3 A4:0.5/2 G4:0.5/1 | A4:1/2 B4:0.5/3 A4:0.5/2 G4:0.5/1 F#4:0.5/2 | G4:3/1 | '
      + 'B5:1/5 G5:0.5/3 A5:0.5/4 B5:0.5/5 G5:0.5/3 | A5:1/4 D5:0.5/1 E5:0.5/2 F#5:0.5/3 D5:0.5/1 | G5:1/4 E5:0.5/2 F#5:0.5/3 G5:0.5/4 D5:0.5/1 | C#5:1/3 B4:0.5/2 C#5:0.5/3 A4:1/1 | '
      + 'A4:0.5/1 B4:0.5/2 C#5:0.5/3 D5:0.5/1 E5:0.5/2 F#5:0.5/3 | G5:1/4 F#5:1/3 E5:1/2 | F#5:1/3 A4:1/1 C#5:1/2 | D5:3/3'),
    lh: parse('G3:3 | B3:3 | C4:3 | B3:3 | A3:3 | G3:3 | D3:3 | G3:3 | G3:3 | F#3:3 | E3:3 | A3:3 | A3:3 | A3:3 | A3:3 | D3:3'),
    lhNote: 'Simplified left hand: one bass note per bar.',
    bpm: 108, range: [48, 84], hand: 'RH', phrases: [[0, 31], [32, 50], [51, 63]] },
  aMinor: { title: 'A harmonic minor scale (right hand)', notes: parse('A4:0.5/1 B4:0.5/2 C5:0.5/3 D5:0.5/1 E5:0.5/2 F5:0.5/3 G#5:0.5/4 A5:0.5/5 | G#5:0.5/4 F5:0.5/3 E5:0.5/2 D5:0.5/1 C5:0.5/3 B4:0.5/2 A4:1/1'),
    bpm: 84, range: [64, 84], hand: 'RH' },
  elise: { title: 'Für Elise (bars 1–8)', credit: 'Ludwig van Beethoven, 1810 (public domain)', beatsPerBar: 3, timeBottom: 8, grand: true, bpm: 132, range: [40, 77], hand: 'both',
    notes: parse('R:2 E5:0.5/5 D#5:0.5/4 | E5:0.5/5 D#5:0.5/4 E5:0.5/5 B4:0.5/2 D5:0.5/4 C5:0.5/3 | [A2,A4]:0.5/1 E3:0.5 A3:0.5 C4:0.5/1 E4:0.5/2 A4:0.5/3 | [E2,B4]:0.5/4 E3:0.5 G#3:0.5 E4:0.5/1 G#4:0.5/3 B4:0.5/4 | [A2,C5]:0.5/5 E3:0.5 A3:0.5 E4:0.5/1 E5:0.5/5 D#5:0.5/4 | '
      + 'E5:0.5/5 D#5:0.5/4 E5:0.5/5 B4:0.5/2 D5:0.5/4 C5:0.5/3 | [A2,A4]:0.5/1 E3:0.5 A3:0.5 C4:0.5/1 E4:0.5/2 A4:0.5/3 | [E2,B4]:0.5/4 E3:0.5 G#3:0.5 E4:0.5/1 C5:0.5/4 B4:0.5/3 | [A2,A4]:1.5/2 R:1.5'),
    phrases: [[0, 25], [26, 44]] },

  // ---- Blue Note: more stations ----
  blues12: { title: '12-bar blues shells', clef: 'bass', bpm: 120, range: [41, 64], hand: 'LH', judge: 'chords', bandStyle: 'swing',
    notes: parse('[C3,Bb3]:4@C7 | [C3,Bb3]:4 | [C3,Bb3]:4 | [C3,Bb3]:4 | [F3,A3]:4@F7 | [F3,A3]:4 | [C3,Bb3]:4@C7 | [C3,Bb3]:4 | [G2,F3]:4@G7 | [F3,A3]:4@F7 | [C3,Bb3]:4@C7 | [G2,F3]:4@G7'),
    band: chart('C7:4 C7:4 C7:4 C7:4 F7:4 F7:4 C7:4 C7:4 G7:4 F7:4 C7:4 G7:4', 2) },
  bluesComp: { title: 'Comping on 2 and 4', clef: 'bass', bpm: 120, range: [41, 64], hand: 'LH', judge: 'chords', bandStyle: 'swing',
    notes: parse('R:1 [C3,Bb3]:1@C7 R:1 [C3,Bb3]:1 | R:1 [C3,Bb3]:1 R:1 [C3,Bb3]:1 | R:1 [F3,A3]:1@F7 R:1 [F3,A3]:1 | R:1 [C3,Bb3]:1@C7 R:1 [C3,Bb3]:1'),
    band: chart('C7:4 C7:4 F7:4 C7:4', 2) },
  bluesRiff: { title: 'Blues riff (swing it)', bpm: 120, range: [55, 81], hand: 'RH', swing: true, bandStyle: 'swing',
    notes: parse('G4:0.5/1 Bb4:0.5/2 C5:1/3 Eb5:0.5/4 C5:0.5/3 R:1 | G4:0.5/1 Bb4:0.5/2 C5:1/3 F5:0.5/4 F#5:0.5/4 G5:1/5 | G4:0.5/1 Bb4:0.5/2 C5:1/3 Eb5:0.5/4 C5:0.5/3 R:1 | Bb4:0.5/2 G4:0.5/1 Bb4:0.5/2 C5:2.5/3'),
    band: chart('C7:4 C7:4 C7:4 C7:4', 2) },
  rootlessC: { title: 'Rootless ii – V – I in C', clef: 'bass', bpm: 100, range: [48, 69], hand: 'LH', judge: 'chords', bandStyle: 'swing',
    notes: parse('[F3,A3,C4,E4]:4@Dm9 | [F3,A3,B3,E4]:4@G13 | [E3,G3,B3,D4]:4@Cmaj9 | [E3,G3,B3,D4]:4'),
    band: chart('Dm7:4 G7:4 C:8', 2) },
  rootlessF: { title: 'Rootless ii – V – I in F', clef: 'bass', bpm: 100, range: [52, 72], hand: 'LH', judge: 'chords', bandStyle: 'swing',
    notes: parse('[Bb3,D4,F4,A4]:4@Gm9 | [Bb3,D4,E4,A4]:4@C13 | [A3,C4,E4,G4]:4@Fmaj9 | [A3,C4,E4,G4]:4'),
    band: chart('Gm7:4 C7:4 F:8', 2) },

  // ---- Radio Line (pop) ----
  popGroove: { title: 'Pop groove: C – G – Am – F', bpm: 92, range: [41, 72], hand: 'RH', judge: 'chords', bandStyle: 'pop',
    notes: parse('[C4,E4,G4]:1.5@C [C4,E4,G4]:1.5 [C4,E4,G4]:1 | [B3,D4,G4]:1.5@G [B3,D4,G4]:1.5 [B3,D4,G4]:1 | [C4,E4,A4]:1.5@Am [C4,E4,A4]:1.5 [C4,E4,A4]:1 | [C4,F4,A4]:1.5@F [C4,F4,A4]:1.5 [C4,F4,A4]:1'),
    lh: parse('C3:1 G3:1 C4:2 | G2:1 D3:1 G3:2 | A2:1 E3:1 A3:2 | F2:1 C3:1 F3:2'),
    band: chart('C:4 G:4 Am:4 F:4') },
  platformSong: { title: 'Platform Song (lead sheet)', credit: 'Original melody for Night Train', keySig: { sharps: 1 }, bpm: 96, range: [40, 76], hand: 'RH', bandStyle: 'pop',
    notes: parse('B4:1/3@G B4:1/3 A4:1/2 G4:1/1 | A4:1.5/2@D B4:0.5/3 A4:2/2 | G4:1/1@Em B4:1/3 D5:1/5 B4:1/3 | C5:3/4@C B4:1/3 | B4:1/3@G D5:1/5 D5:1/5 B4:1/3 | A4:1/2@D F#4:1/1 A4:2/3 | G4:1/2@C E4:1/1 G4:1/2 A4:1/3 | G4:4/2@G'),
    lh: parse('[G2,D3]:4 | [D3,A3]:4 | [E2,B2]:4 | [C3,G3]:4 | [G2,D3]:4 | [D3,A3]:4 | [C3,G3]:4 | [G2,D3]:4'),
    band: chart('G:4 D:4 Em:4 C:4 G:4 D:4 C:4 G:4'), phrases: [[0, 12], [13, 24]] },
};

// ---------- Items ----------
// type: lesson | keyquiz | readquiz | piano | rhythm | ear | improv | checkpoint
// skill: which skill branch earns XP. core: needed for station readiness.
export const ITEMS = {
  // ---- Station 1: Keyboard Junction ----
  'f1.lesson': { type: 'lesson', title: 'The map of the keys', skill: 'theory', minutes: 2, slides: [
    { text: 'The piano repeats one pattern over and over. Look at the black keys: they come in groups of two and groups of three.', kb: { lo: 48, hi: 71, marks: { 49: 'target', 51: 'target', 61: 'target', 63: 'target' }, labels: 'none' } },
    { text: 'C is the white key just left of every group of two black keys. It is your landmark. Find it and you can find everything.', kb: { lo: 48, hi: 71, marks: { 48: 'target', 60: 'target' }, labels: 'c' } },
    { text: 'Going up from C, the white keys are C D E F G A B, then C again. The C nearest the middle of the piano is "Middle C".', kb: { lo: 48, hi: 71, labels: 'all', marks: { 60: 'target' } } },
  ] },
  'f1.groups': { type: 'keyquiz', title: 'Spot the groups', skill: 'theory', minutes: 1.5, core: true, quiz: 'groups', count: 6 },
  'f1.findC': { type: 'keyquiz', title: 'Find the Cs', skill: 'theory', minutes: 1.5, core: true, quiz: 'letters', letters: ['C'], count: 5 },
  'f1.cWalk': { type: 'piano', title: 'C to C walk', skill: 'technique', minutes: 2, core: true,
    howto: 'At the piano: play every C from the lowest to the highest with your right-hand middle finger (finger 3). Let your arm float sideways, wrist level, like a train gliding along the track. Then come back down with your left hand finger 3.',
    selfCheck: ['Every key was a C', 'My wrist stayed loose and level', 'Each C rang clearly'] },
  'f1.beat': { type: 'rhythm', title: 'Steady beat', skill: 'rhythm', minutes: 1.5, core: true, pattern: [1, 1, 1, 1, 1, 1, 1, 1], bpm: 80,
    intro: 'Tap the big pad with every click, like footsteps. Listen for 4 clicks first, then join in.' },
  'f1.night': { type: 'improv', title: 'Black-key night sky', skill: 'ear', minutes: 2, chords: [[54, 61, 66], [56, 63, 68]], bpm: 70, bars: 8,
    howto: 'The train is rolling through the dark. A soft pad plays. Play ANY black keys, slowly, with any fingers. Every black key sounds good here. Try a few notes, then a pause, like stars appearing.' },
  'f1.check': { type: 'checkpoint', title: 'Ticket inspection: Up the Steps', piece: 'cdeUpDown', skill: 'reading', minutes: 2 },
  'f1.steps': { type: 'piano', title: 'Up the Steps', piece: 'cdeUpDown', skill: 'reading', minutes: 2.5, core: true,
    howto: 'Right hand: thumb (1) on Middle C, finger 2 on D, finger 3 on E. Play up and back down. Let the last C ring for 4 slow counts.' },

  // ---- Station 2: Steady Beat Bridge ----
  'f2.lesson': { type: 'lesson', title: 'Long and short notes', skill: 'rhythm', minutes: 2, slides: [
    { text: 'Music has a pulse, like footsteps. Each step is one beat. Count "1 2 3 4" evenly.' },
    { text: 'A quarter note (filled, with a stem) lasts 1 beat. A half note (hollow, with a stem) lasts 2 beats. A whole note (hollow, no stem) lasts 4 beats.', staff: { notes: 'C4:1 C4:1 C4:2 | C4:4' } },
    { text: 'The trick with long notes: keep counting while they ring. Do not cut them short, and do not rush to the next note.' },
  ] },
  'f2.rhythm1': { type: 'rhythm', title: 'Quarter and half notes', skill: 'rhythm', minutes: 1.5, core: true, pattern: [1, 1, 2, 1, 1, 2], bpm: 76,
    intro: 'Tap the pad when each note starts. Long notes: tap once and keep counting.' },
  'f2.rhythm2': { type: 'rhythm', title: 'Whole notes too', skill: 'rhythm', minutes: 1.5, core: true, pattern: [2, 2, 1, 1, 1, 1, 4], bpm: 80,
    intro: 'Tap once for each note. The last one is a whole note: tap once, then count 4.' },
  'f2.findFG': { type: 'keyquiz', title: 'F and G', skill: 'theory', minutes: 1.5, core: true, quiz: 'letters', letters: ['F', 'G', 'C'], count: 6 },
  'f2.ear': { type: 'ear', title: 'Higher or lower?', skill: 'ear', minutes: 1.5, core: true, ear: 'updown', count: 6 },
  'f2.clock': { type: 'piano', title: 'Clock Tower', piece: 'clockTower', skill: 'rhythm', minutes: 2.5, core: true,
    howto: 'Right hand in C position (thumb on Middle C). Count out loud: "1 2 3 4". Half notes ring for 2 counts. The last note rings for 4.' },
  'f2.callresp': { type: 'improv', title: 'Call and response', skill: 'ear', minutes: 2, callResponse: true, bpm: 76,
    howto: 'The conductor plays a short rhythm on C. You answer with your own rhythm on C, D, or E. Any answer is good. Try copying sometimes and changing it other times.' },
  'f2.check': { type: 'checkpoint', title: 'Ticket inspection: Clock Tower', piece: 'clockTower', skill: 'rhythm', minutes: 2 },

  // ---- Station 3: Middle C Crossing ----
  'f3.lesson': { type: 'lesson', title: 'Finger numbers and C position', skill: 'technique', minutes: 2, slides: [
    { text: 'Fingers have numbers: thumb is 1, pointer 2, middle 3, ring 4, pinky 5. Same on both hands.' },
    { text: 'C position, right hand: thumb on Middle C, then one finger per key: C D E F G.', kb: { lo: 55, hi: 71, labels: 'all', fingers: { 60: 1, 62: 2, 64: 3, 65: 4, 67: 5 } } },
    { text: 'Shape: curve your fingers as if holding a small ball. Play near the front of the keys with the finger pads. Keep your wrist level and loose.' },
  ] },
  'f3.readLesson': { type: 'lesson', title: 'Reading: Middle C, D, E', skill: 'reading', minutes: 2, slides: [
    { text: 'Music is written on five lines called a staff. Higher on the staff means higher on the piano.', staff: { notes: 'C4:1 D4:1 E4:1 F4:1 G4:4', letters: true } },
    { text: 'Middle C sits on its own little line below the staff. D hangs just under the bottom line. E sits ON the bottom line.', staff: { notes: 'C4:2 D4:2 | E4:4', letters: true } },
    { text: 'Reading by steps: if the next note moves from a line to the next space, move one key. You do not need to name every note. Just see which way it goes and how far.' },
  ] },
  'f3.read': { type: 'readquiz', title: 'Read and tap', skill: 'reading', minutes: 2, core: true, pool: ['C4', 'D4', 'E4', 'F4', 'G4'], count: 6 },
  'f3.five': { type: 'piano', title: 'Five-Finger Climb', piece: 'fiveFinger', skill: 'technique', minutes: 2.5, core: true,
    howto: 'Right hand C position. Play up and down slowly. Make each note the same loudness, like even footsteps on a platform.' },
  'f3.buns': { type: 'piano', title: 'Hot Cross Buns', piece: 'hotCrossBuns', skill: 'reading', minutes: 2.5, core: true,
    howto: 'Only three notes: E D C (fingers 3 2 1). Watch the shape: down, down, then the half note rings.' },
  'f3.ode': { type: 'piano', title: 'Ode to Joy', piece: 'odeToJoy', skill: 'reading', minutes: 3, core: true,
    howto: 'Your first real melody (Beethoven). Right hand C position. The ending has a long-short rhythm: "E (long) D (short) D (held)". Practice one phrase at a time.' },
  'f3.ear': { type: 'ear', title: 'Same or different?', skill: 'ear', minutes: 1.5, ear: 'samediff', count: 6 },
  'f3.compose': { type: 'improv', title: 'Your own 4-note tune', skill: 'theory', minutes: 2, compose: true,
    howto: 'Make up a tiny tune with C D E F G. Start on C and end on C. Play it three times so you remember it. Tap the keys below to save it to your ticket.' },
  'f3.check': { type: 'checkpoint', title: 'Ticket inspection: Ode to Joy', piece: 'odeToJoy', skill: 'reading', minutes: 3 },

  // ---- Carol Line: Jingle Bells Junction ----
  'c1.lesson': { type: 'lesson', title: 'Playing with a partner', skill: 'rhythm', minutes: 2, slides: [
    { text: 'In a duet, two players share one piano. One plays the upper part (melody), the other the lower part (bass notes or chords).' },
    { text: 'The golden rule: keep going. If you slip, skip ahead to the next beat and rejoin your partner. A steady beat matters more than every note.' },
    { text: 'Practice with the virtual partner first. The app plays the other part so you can hear how they fit. Then try it with family!' },
  ] },
  'c1.jingle': { type: 'piano', title: 'Jingle Bells', piece: 'jingle', skill: 'reading', minutes: 3, core: true,
    howto: 'Right hand C position. Notice "C. D" in bar 3: the C is long (one and a half beats), the D is short. Practice each phrase, then the whole chorus.' },
  'c1.duet': { type: 'piano', title: 'Jingle Bells duet', piece: 'jingleDuet', skill: 'rhythm', minutes: 3, core: true,
    howto: 'Pick your part. The virtual partner plays the other one. Beginners: try "Bass notes" (one note per bar, left hand). Then swap!' },
  'c1.ode': { type: 'piano', title: 'Ode to Joy duet', piece: 'odeDuet', skill: 'rhythm', minutes: 2.5,
    howto: 'A second duet with the melody you already know. Try each part with the virtual partner.' },
  'c1.ear': { type: 'ear', title: 'Same or different?', skill: 'ear', minutes: 1.5, ear: 'samediff', count: 6 },
  'c1.check': { type: 'checkpoint', title: 'Ticket inspection: Jingle Bells', piece: 'jingle', skill: 'reading', minutes: 3 },

  // ---- Everyone: endless sight-reading (generated fresh each time) ----
  'x.sight': { type: 'sight', title: 'Sight-reading', skill: 'reading', minutes: 3, count: 3 },

  // ---- Carol Line: Holly Hall ----
  'c2.lesson': { type: 'lesson', title: 'Stretching out of C position', skill: 'technique', minutes: 2, slides: [
    { text: 'Deck the Halls dips one key below C, to B. Keep your thumb on C and reach down with it (finger 1 on B), then come right back.' },
    { text: 'Good King Wenceslas sits a little lower: thumb on G below middle C. Watch the first note and find your starting key before you play.' },
    { text: 'Fa-la-la: the quick notes (eighths) come in pairs. Count "1-and 2-and" and keep them light and even.' },
  ] },
  'c2.deck': { type: 'piano', title: 'Deck the Halls', piece: 'deck', skill: 'reading', minutes: 3, core: true,
    howto: 'Thumb on C, but finger 5 starts on G. Lines 1, 2, and 4 are the same, so learn line 1 well and you know most of the carol. Line 3 climbs: let your hand move up.' },
  'c2.deckDuet': { type: 'piano', title: 'Deck the Halls duet', piece: 'deckDuet', skill: 'rhythm', minutes: 3, core: true,
    howto: 'Choose your part. Bass notes: just C, G, and D with your left hand, one per bar. Chords: three-note shapes that barely move.' },
  'c2.king': { type: 'piano', title: 'Good King Wenceslas', piece: 'wenceslas', skill: 'reading', minutes: 3,
    howto: 'Thumb on G below middle C (finger 1), so C is finger 4. Steady and stately: march the quarter notes.' },
  'c2.kingDuet': { type: 'piano', title: 'Good King Wenceslas duet', piece: 'wenceslasDuet', skill: 'rhythm', minutes: 3,
    howto: 'Try the melody with a partner on bass notes, then swap.' },
  'c2.check': { type: 'checkpoint', title: 'Ticket inspection: Deck the Halls', piece: 'deck', skill: 'reading', minutes: 3 },

  // ---- Carol Line: Joy Junction ----
  'c3.lesson': { type: 'lesson', title: 'A whole octave: crossing fingers', skill: 'technique', minutes: 2, slides: [
    { text: 'Joy to the World starts high and walks straight down eight notes: C B A G F E D C. That is more keys than you have fingers!' },
    { text: 'The trick: play C B A G F with fingers 5 4 3 2 1, then cross finger 3 over your thumb to land on E, and finish D (2) C (1).', kb: { lo: 55, hi: 74, labels: 'all', fingers: { 72: 5, 71: 4, 69: 3, 67: 2, 65: 1, 64: 3, 62: 2, 60: 1 } } },
    { text: 'Let the thumb stay relaxed and the hand glide over it, like a train going over a hill. No twisting the wrist.' },
  ] },
  'c3.scale': { type: 'piano', title: 'Down the octave', piece: 'joy', skill: 'technique', minutes: 2.5, core: true,
    howto: 'Practice just phrase 1 (the first line) until the finger crossing feels smooth. Slow is fine.' },
  'c3.duet': { type: 'piano', title: 'Joy to the World duet', piece: 'joyDuet', skill: 'rhythm', minutes: 3, core: true,
    howto: 'Melody players: big and joyful! Bass players: C, G, and F, one per bar, steady as a bell.' },
  'c3.ear': { type: 'ear', title: 'Higher or lower?', skill: 'ear', minutes: 1.5, ear: 'updown', count: 6 },
  'c3.check': { type: 'checkpoint', title: 'Ticket inspection: Joy to the World', piece: 'joy', skill: 'reading', minutes: 3 },

  // ---- Carol Line: Silent Night Siding ----
  'c4.lesson': { type: 'lesson', title: 'Silent Night: 3/4 and moving hands', skill: 'reading', minutes: 2, slides: [
    { text: 'Silent Night is a gentle lullaby in 3: "ONE two three, ONE two three." The long notes last a full three beats. Let them ring.' },
    { text: 'The melody climbs from G up to D, then higher to F and E near the end. Your hand will move. Look ahead in the music and shift during the long notes.' },
    { text: 'Play it softly and smoothly. A carol like this is about calm, not speed.' },
  ] },
  'c4.silent': { type: 'piano', title: 'Silent Night', piece: 'silent', skill: 'reading', minutes: 4, core: true,
    howto: 'Learn it phrase by phrase. Phrases 3 and 4 are the same tune ("Round yon virgin" / "Holy infant"), so that is a free one!' },
  'c4.duet': { type: 'piano', title: 'Silent Night duet', piece: 'silentDuet', skill: 'rhythm', minutes: 4, core: true,
    howto: 'Bass notes: C, G, and F with the left hand, one per bar, held for three beats. Melody: soft and singing. This is your family Christmas duet!' },
  'c4.compose': { type: 'improv', title: 'Christmas bells', skill: 'ear', minutes: 2, chords: [[48, 55, 64], [53, 60, 69], [55, 62, 71], [48, 55, 64]], bpm: 70, bars: 8,
    howto: 'Over gentle chords, play high notes from C D E G A (any octave) slowly, like bells ringing across snow. Let each one ring before the next.' },
  'c4.check': { type: 'checkpoint', title: 'Ticket inspection: Silent Night', piece: 'silent', skill: 'reading', minutes: 3 },

  // ---- Gospel Line: Chapel Hill ----
  'g1.lesson': { type: 'lesson', title: 'Chords: three notes, skip a key', skill: 'theory', minutes: 2, slides: [
    { text: 'A chord is three or more notes played together. The basic chord (a triad) is built by skipping every other white key: play one, skip one, play one, skip one, play one.', kb: { lo: 55, hi: 74, labels: 'all', marks: { 60: 'target', 64: 'target', 67: 'target' } } },
    { text: 'C chord = C E G. F chord = F A C. G chord = G B D. These three chords play thousands of songs.', staff: { notes: '[C4,E4,G4]:4@C | [F4,A4,C5]:4@F | [G4,B4,D5]:4@G' } },
    { text: 'In worship sets, the left hand usually plays the chord\'s name note (the root), low. The right hand plays the chord. The band handles the rhythm, so start with whole notes.' },
  ] },
  'g1.build': { type: 'chordquiz', title: 'Build the chord', skill: 'theory', minutes: 2, core: true, chords: ['C', 'F', 'G', 'Am', 'Dm', 'Em'], count: 5 },
  'g1.cfgc': { type: 'piano', title: 'C – F – G – C with the band', piece: 'chordsC', skill: 'technique', minutes: 3, core: true,
    howto: 'Right hand plays each chord for 4 beats. Left hand plays the root note (optional at first). Lift and land each chord together, all three fingers at once.' },
  'g1.smooth': { type: 'piano', title: 'Smooth changes (inversions)', piece: 'chordsCsmooth', skill: 'theory', minutes: 3, core: true,
    howto: 'Pro secret: keep notes that are shared, and move the others the shortest way. From C (C E G), the F chord becomes C F A: C stays put! The G chord becomes B D G. Your hand barely moves.' },
  'g1.ear': { type: 'ear', title: 'Major or minor?', skill: 'ear', minutes: 1.5, ear: 'majmin', count: 6 },
  'g1.check': { type: 'checkpoint', title: 'Ticket inspection: C – F – G – C', piece: 'chordsCsmooth', skill: 'theory', minutes: 3 },

  // ---- Gospel Line: Four Chords Crossing ----
  'g2.lesson': { type: 'lesson', title: 'Nashville numbers', skill: 'theory', minutes: 2.5, slides: [
    { text: 'Worship teams talk in numbers so songs can change key in seconds. In any key, number the scale notes 1 to 7. The chords built on them are the "1 chord", the "4 chord", and so on.' },
    { text: 'In the key of G: 1 = G, 4 = C, 5 = D, 6m = Em (the 6 chord is minor). "1 – 5 – 6m – 4" is the most common progression in modern worship and pop.', staff: { notes: '[G4,B4,D5]:4@1_(G) | [A4,D5,F#5]:4@5_(D) | [G4,B4,E5]:4@6m_(Em) | [G4,C5,E5]:4@4_(C)', keySig: 1 } },
    { text: 'A chord chart looks like "1 | 5 | 6m | 4". The leader might call "to the 4!" or hold up four fingers. Knowing the numbers lets you follow.' },
  ] },
  'g2.numbers': { type: 'choice', title: 'Number drill', skill: 'theory', minutes: 2, core: true, quiz: 'nashville', count: 6 },
  'g2.four': { type: 'piano', title: '1 – 5 – 6m – 4 in G', piece: 'fourChords', skill: 'technique', minutes: 3, core: true,
    howto: 'These are already the smooth voicings: your thumb stays near G and A. Left hand plays the roots G, D, E, C. Hold each chord 4 beats.' },
  'g2.pulse': { type: 'piano', title: 'Add a pulse', piece: 'fourPulse', skill: 'rhythm', minutes: 3, core: true,
    howto: 'Same chords, now four even quarter-note pulses per bar, like a strummed guitar. Keep the wrist loose and bounce from the elbow. Play softer than you think: the band carries the beat.' },
  'g2.check': { type: 'checkpoint', title: 'Ticket inspection: 1 – 5 – 6m – 4', piece: 'fourChords', skill: 'theory', minutes: 3 },

  // ---- Gospel Line: Key of D Depot ----
  'g3.lesson': { type: 'lesson', title: 'Same numbers, new key', skill: 'theory', minutes: 2, slides: [
    { text: 'Worship leaders choose keys that fit the singers: G, D, E, A, and C are the most common. With numbers, the song stays the same: only the letters change.' },
    { text: 'In D: 1 = D, 4 = G, 5 = A, 6m = Bm. In E: 1 = E, 4 = A, 5 = B, 6m = C♯m. Your hand shapes stay smooth; just start from a new home.', staff: { notes: '[D4,F#4,A4]:4@D_(1) | [C#4,E4,A4]:4@A_(5) | [D4,F#4,B4]:4@Bm_(6m) | [D4,G4,B4]:4@G_(4)', keySig: 2 } },
    { text: 'On the team, watch the leader. A raised hand with fingers up shows the number of the next chord. You will practice reacting live.' },
  ] },
  'g3.d': { type: 'piano', title: '1 – 5 – 6m – 4 in D', piece: 'fourD', skill: 'technique', minutes: 3, core: true,
    howto: 'D (D F♯ A) → A (C♯ E A) → Bm (D F♯ B) → G (D G B). The top notes barely move. Left hand roots: D, A, B, G.' },
  'g3.e': { type: 'piano', title: '1 – 5 – 6m – 4 in E', piece: 'fourE', skill: 'technique', minutes: 3, core: true,
    howto: 'Four sharps, but the same shape idea: E (E G♯ B) → B (D♯ F♯ B) → C♯m (E G♯ C♯) → A (E A C♯).' },
  'g3.numbers': { type: 'choice', title: 'Number drill in new keys', skill: 'theory', minutes: 2, core: true, quiz: 'nashville', count: 8 },
  'g3.cues': { type: 'cues', title: 'Follow the leader (key of D)', skill: 'rhythm', minutes: 3, core: true, key: 'D', bpm: 76, style: 'worship', segments: 10,
    chords: [{ num: '1', name: 'D', root: 'D3' }, { num: '4', name: 'G', root: 'G2' }, { num: '5', name: 'A', root: 'A2' }, { num: '6m', name: 'Bm', root: 'B2', minor: true }] },
  'g3.check': { type: 'checkpoint', title: 'Ticket inspection: 1 – 5 – 6m – 4 in D', piece: 'fourD', skill: 'theory', minutes: 3 },

  // ---- Gospel Line: Bridge Street ----
  'g4.lesson': { type: 'lesson', title: 'Sus, add9, and slash chords', skill: 'theory', minutes: 2.5, slides: [
    { text: 'Sus chords swap the 3rd for the 4th (sus4) or 2nd (sus2). They sound open and unresolved: perfect for worship. Dsus4 = D G A, which resolves to D = D F♯ A.' },
    { text: 'Anchor notes: keep D and G on top through G, Dsus, Em7, and Cadd9, and move only the bottom note. This is the signature modern worship sound.', staff: { notes: '[B4,D5,G5]:4@G | [A4,D5,G5]:4@Dsus | [B4,D5,G5]:4@Em7 | [C5,D5,G5]:4@Cadd9', keySig: 1 } },
    { text: 'Slash chords: "G/B" means a G chord with B in the bass. They make walking bass lines: C – G/B – Am – G. Intros often use the 1 and 4; endings hold the 1 (or 4 → 1).' },
  ] },
  'g4.sus': { type: 'piano', title: 'Sus chords resolving', piece: 'susRes', skill: 'technique', minutes: 2.5, core: true,
    howto: 'Dsus4 → D: only one finger moves (G down to F♯). Asus4 → A: D down to C♯. Feel the tension, then the release.' },
  'g4.anchor': { type: 'piano', title: 'Anchor notes', piece: 'anchor', skill: 'technique', minutes: 3, core: true,
    howto: 'Fingers 3 and 5 hold D and G on top the whole time. Thumb walks B → A → B → C. Left hand: G, F♯, E, C. Let it ring with the pedal.' },
  'g4.walk': { type: 'piano', title: 'Walking bass with slash chords', piece: 'walkup', skill: 'theory', minutes: 3, core: true,
    howto: 'Left hand walks down one step per bar: C B A G F E D, then G. Right hand stays close to middle C. Listen to the bass line sing.' },
  'g4.cues': { type: 'cues', title: 'Follow the leader (key of G)', skill: 'rhythm', minutes: 3, core: true, key: 'G', bpm: 72, style: 'worship', segments: 12,
    chords: [{ num: '1', name: 'G', root: 'G2' }, { num: '4', name: 'C', root: 'C3' }, { num: '5', name: 'D', root: 'D3' }, { num: '6m', name: 'Em', root: 'E2', minor: true }, { num: '2m', name: 'Am', root: 'A2', minor: true }] },
  'g4.check': { type: 'checkpoint', title: 'Ticket inspection: Anchor notes', piece: 'anchor', skill: 'theory', minutes: 3 },

  // ---- Conservatory Line: Minuet Station ----
  'k1.lesson': { type: 'lesson', title: '3/4 time, key signatures, hands separate', skill: 'reading', minutes: 2, slides: [
    { text: 'A minuet is a dance in 3: count "1 2 3, 1 2 3", with a slight lean on beat 1.' },
    { text: 'The ♯ at the start of each line is the key signature: every F is played as F♯ (the black key just right of F). This piece is in G major.', staff: { notes: 'G4:1 A4:1 B4:1 | C5:1 D5:1 E5:1 | F#5:1 G5:2', keySig: 1, bpb: 3 } },
    { text: 'How pros learn a piece: hands separate first, one phrase at a time, slowly. Hands together only when each hand is easy alone.' },
  ] },
  'k1.scale': { type: 'piano', title: 'G major scale', piece: 'gScale', skill: 'technique', minutes: 2.5, core: true,
    howto: 'Thumb tucks under after B (finger 3) to land on C. Keep the wrist level and let the thumb glide; do not twist the hand. Even eighth notes.' },
  'k1.minuet': { type: 'piano', title: 'Minuet in G', piece: 'minuet', skill: 'reading', minutes: 4, core: true,
    howto: 'Start right hand alone, phrase 1. Then left hand alone. Then together, slowly. Shape each phrase: grow toward the middle, relax at the end. Eighth notes even and light.' },
  'k1.ear': { type: 'ear', title: 'Higher or lower?', skill: 'ear', minutes: 1.5, ear: 'updown', count: 6 },
  'k1.check': { type: 'checkpoint', title: 'Ticket inspection: Minuet in G (right hand)', piece: 'minuet', skill: 'reading', minutes: 3 },

  // ---- Blue Note Line: Shell Station ----
  'b1.lesson': { type: 'lesson', title: '7th chords and shell voicings', skill: 'theory', minutes: 2.5, slides: [
    { text: 'Jazz adds a 4th note to triads: the 7th. Dm7 = D F A C. G7 = G B D F. Cmaj7 = C E G B. Their sound is the core of jazz harmony.' },
    { text: 'ii – V – I (Dm7 – G7 – Cmaj7) is the most important progression in jazz. Thousands of standards are built from it.' },
    { text: 'Shells: the left hand plays just the root plus the 3rd or 7th. Dm7 = D + F, G7 = G + F, Cmaj7 = C + E. Notice the F stays while the root moves. That is voice leading.', staff: { notes: '[D3,F3]:4@Dm7 | [G2,F3]:4@G7 | [C3,E3]:4@Cmaj7', clef: 'bass' } },
  ] },
  'b1.build': { type: 'chordquiz', title: 'Spell the 7th chords', skill: 'theory', minutes: 2, core: true, chords: ['Dm7', 'G7', 'Cmaj7', 'Am7', 'D7', 'Fmaj7'], count: 5 },
  'b1.shells': { type: 'piano', title: 'ii – V – I shells with the band', piece: 'shells', skill: 'technique', minutes: 3, core: true,
    howto: 'Left hand: D+F, G+F, C+E, each held for a bar. The bass and drums swing behind you. Right hand free: later it will play melody or improvise.' },
  'b1.charleston': { type: 'piano', title: 'Charleston comping', piece: 'charleston', skill: 'rhythm', minutes: 3, core: true,
    howto: 'The classic comping rhythm: hit on beat 1 (long), then a short hit on the "and" of 2. Then rest. Say it: "ONE (two) AND (three four)". Swing it: lazy and relaxed.' },
  'b1.blues': { type: 'improv', title: 'Blues scale jam', skill: 'ear', minutes: 3, band: chart('C7:4 C7:4 C7:4 C7:4 F7:4 F7:4 C7:4 C7:4 G7:4 F7:4 C7:4 G7:4', 2), bandStyle: 'swing', bpm: 120, blues: true,
    howto: 'A 12-bar blues in C with a swinging band. Use the C blues scale: C E♭ F F♯ G B♭ (marked keys). Start with 2–3 notes, leave space, repeat ideas. Bend toward the F♯ and resolve to G or C.' },
  'b1.check': { type: 'checkpoint', title: 'Ticket inspection: ii – V – I shells', piece: 'shells', skill: 'theory', minutes: 3 },

  // ---- Conservatory: Prelude Platform ----
  'k2.lesson': { type: 'lesson', title: 'Broken chords and harmony', skill: 'theory', minutes: 2, slides: [
    { text: 'Bach\'s Prelude in C is made entirely of broken chords. Each bar is one chord, played as a rippling pattern twice.' },
    { text: 'The hands share the line: the left hand plays the first two notes of each group (and holds them), the right hand plays the three upper notes twice.' },
    { text: 'The music is in the harmony. Listen for how each new chord feels: home, away, tension, home. Shape the dynamics with it, and keep every sixteenth perfectly even.' },
  ] },
  'k2.arp': { type: 'piano', title: 'C major arpeggio', piece: 'arpC', skill: 'technique', minutes: 2.5, core: true,
    howto: 'Thumb passes under after G (finger 3) to the next C. Keep the wrist level and let the arm travel smoothly. No bumps at the thumb crossing.' },
  'k2.prelude': { type: 'piano', title: 'Prelude in C', piece: 'prelude', skill: 'reading', minutes: 4, core: true,
    howto: 'Learn two bars at a time (the phrases). Left hand: the low two notes, held. Right hand: the upper three notes, fingers 1 2 4. Aim for a calm, even ripple, like water.' },
  'k2.ear': { type: 'ear', title: 'Major or minor?', skill: 'ear', minutes: 1.5, ear: 'majmin', count: 6 },
  'k2.check': { type: 'checkpoint', title: 'Ticket inspection: Prelude in C', piece: 'prelude', skill: 'reading', minutes: 3 },

  // ---- Conservatory: Ballroom Return ----
  'k3.lesson': { type: 'lesson', title: 'Second endings and a new key', skill: 'theory', minutes: 2, slides: [
    { text: 'Bars 9–16 repeat the opening, but bar 15 turns home to G instead of stopping on A. Composers love a familiar idea with a new ending.' },
    { text: 'Bars 17–24 travel to D major: watch for C♯ (the black key just right of C). The piece ends this half on D, the new home.', staff: { notes: 'D5:1 E5:1 F#5:1 | G5:1 A5:1 B5:1 | C#6:1 D6:2', keySig: 1, bpb: 3 } },
    { text: 'Contrast: play the second half a little brighter and louder (forte), then relax at the end of each phrase.' },
  ] },
  'k3.scale': { type: 'piano', title: 'D major scale', piece: 'dScale', skill: 'technique', minutes: 2.5, core: true,
    howto: 'Two sharps: F♯ and C♯. Thumb tucks under after F♯ (finger 3). Listen for even, connected notes.' },
  'k3.minuet': { type: 'piano', title: 'Minuet in G, bars 9–24', piece: 'minuet2', skill: 'reading', minutes: 4, core: true,
    howto: 'Phrase 1 should feel familiar. Phrase 2 jumps up to B5 (finger 5): prepare the hand early. Phrase 3 climbs with an A major scale fragment. Hands separate first.' },
  'k3.check': { type: 'checkpoint', title: 'Ticket inspection: Minuet bars 9–24', piece: 'minuet2', skill: 'reading', minutes: 3 },

  // ---- Conservatory: Für Elise Falls ----
  'k4.lesson': { type: 'lesson', title: 'Für Elise, 3/8, and the pedal', skill: 'technique', minutes: 2.5, slides: [
    { text: 'Für Elise is in 3/8: three eighth notes per bar, felt as one gentle pulse per bar. The famous E–D♯ turn starts before bar 1 (a pickup).' },
    { text: 'The hands take turns: left hand plays A–E–A low, then the right hand continues up. It should sound like one smooth line passed between hands.' },
    { text: 'Sustain pedal (right pedal): press it right after the bass note sounds, and lift-then-press again with each new bass note. This is legato pedaling: smooth, never blurred.' },
    { text: 'The app cannot see your foot. After each try, ask yourself: any blur when the harmony changed? Any gap in sound? Recording a take helps you hear it.' },
  ] },
  'k4.pedal': { type: 'piano', title: 'Pedal changes', skill: 'technique', minutes: 2,
    howto: 'Play a low A, then press the pedal. Play a low E: as it sounds, lift the pedal and press it again. Then back to A. Repeat slowly with your eyes closed, listening for clean, connected changes.',
    selfCheck: ['Pedal goes down just AFTER each bass note', 'No blur between A and E', 'No silence gap between changes', 'Heel stays on the floor, foot moves from the ankle'] },
  'k4.scale': { type: 'piano', title: 'A harmonic minor scale', piece: 'aMinor', skill: 'technique', minutes: 2, core: true,
    howto: 'Like A minor (all white keys) but with G♯. That G♯ gives the exotic, classical sound you hear in Für Elise.' },
  'k4.elise': { type: 'piano', title: 'Für Elise', piece: 'elise', skill: 'reading', minutes: 4, core: true,
    howto: 'Start with the E–D♯ turn: fingers 5 and 4, light and relaxed. The left hand enters on the low A. Keep it soft (pianissimo) and flowing. Pedal once comfortable.' },
  'k4.check': { type: 'checkpoint', title: 'Ticket inspection: Für Elise', piece: 'elise', skill: 'reading', minutes: 3 },

  // ---- Blue Note: Swing Street ----
  'b2.lesson': { type: 'lesson', title: 'Swing feel and the 12-bar blues', skill: 'rhythm', minutes: 2.5, slides: [
    { text: 'Swing eighths are written as even eighths but played long-short, like "doo-ba doo-ba". The first note gets about two-thirds of the beat.' },
    { text: 'The 12-bar blues: 4 bars of C7, 2 of F7, 2 of C7, then G7 – F7 – C7 – G7. It is the backbone of jazz, rock, and R&B.' },
    { text: 'Comping (accompanying) on beats 2 and 4 locks in with the drummer\'s hi-hat. Short, crisp chords. Space is part of the groove.' },
  ] },
  'b2.tap': { type: 'rhythm', title: 'Tap the swing', skill: 'rhythm', minutes: 1.5, core: true, swing: true, pattern: [0.5, 0.5, 0.5, 0.5, 1, 1, 0.5, 0.5, 0.5, 0.5, 2], bpm: 100,
    intro: 'Tap long-short on each pair of eighths, like "doo-ba". Quarter notes stay even.' },
  'b2.shells': { type: 'piano', title: '12-bar blues shells', piece: 'blues12', skill: 'technique', minutes: 3, core: true,
    howto: 'C7 = C + B♭. F7 = F + A (the B♭ slides down to A). G7 = G + F. Whole notes with the band; know where you are in the 12 bars.' },
  'b2.comp': { type: 'piano', title: 'Comping on 2 and 4', piece: 'bluesComp', skill: 'rhythm', minutes: 3, core: true,
    howto: 'Rest on 1, short chord on 2, rest on 3, short chord on 4. Crisp and light, like a snare backbeat.' },
  'b2.riff': { type: 'piano', title: 'Blues riff', piece: 'bluesRiff', skill: 'reading', minutes: 3, core: true,
    howto: 'An original riff using the blues scale. Swing the eighths. The F–F♯–G in bar 2 is the "blue note" slide.' },
  'b2.jam': { type: 'improv', title: 'Trade fours', skill: 'ear', minutes: 3, band: chart('C7:4 C7:4 C7:4 C7:4 F7:4 F7:4 C7:4 C7:4 G7:4 F7:4 C7:4 G7:4', 2), bandStyle: 'swing', bpm: 120, blues: true,
    howto: 'Jazz players "trade fours": play for 4 bars, then rest and listen for 4. Try it: use the riff, then change one note, then change its rhythm. Leave space!' },
  'b2.check': { type: 'checkpoint', title: 'Ticket inspection: Blues riff', piece: 'bluesRiff', skill: 'reading', minutes: 3 },

  // ---- Blue Note: Rootless Row ----
  'b3.lesson': { type: 'lesson', title: 'Rootless voicings', skill: 'theory', minutes: 2.5, slides: [
    { text: 'With a bass player on the gig, the pianist can leave out the root. The left hand plays four colorful notes near middle C: 3rd, 5th, 7th, and 9th.' },
    { text: 'ii – V – I in C, rootless: Dm9 = F A C E, G13 = F A B E, Cmaj9 = E G B D. Only one or two notes move each time: the hand barely shifts.', staff: { notes: '[F3,A3,C4,E4]:4@Dm9 | [F3,A3,B3,E4]:4@G13 | [E3,G3,B3,D4]:4@Cmaj9', clef: 'bass' } },
    { text: 'This is how pros sound "jazzy" with almost no effort. Learn the shapes in C, then move them to F.' },
  ] },
  'b3.build': { type: 'chordquiz', title: 'Spell the rootless voicings', skill: 'theory', minutes: 2, core: true, chords: ['Dm9 rootless', 'G13 rootless', 'Cmaj9 rootless', 'Gm9 rootless', 'C13 rootless', 'Fmaj9 rootless'], count: 5 },
  'b3.c': { type: 'piano', title: 'Rootless ii – V – I in C', piece: 'rootlessC', skill: 'technique', minutes: 3, core: true,
    howto: 'F A C E → F A B E (only C moves to B) → E G B D. The band plays the roots. Hold each chord for a bar, then try Charleston rhythm on your own.' },
  'b3.f': { type: 'piano', title: 'Rootless ii – V – I in F', piece: 'rootlessF', skill: 'technique', minutes: 3, core: true,
    howto: 'Same shapes, new key: Gm9 = B♭ D F A, C13 = B♭ D E A, Fmaj9 = A C E G.' },
  'b3.dorian': { type: 'improv', title: 'Dorian vamp', skill: 'ear', minutes: 3, band: chart('Dm7:4 G7:4 Dm7:4 G7:4', 2), bandStyle: 'swing', bpm: 110, dorian: true,
    howto: 'D Dorian is simply the white keys from D to D. Over this Dm7 – G7 vamp, every white key works. Aim for chord tones (D F A C) on beat 1, and use the B to make it sound "modal".' },
  'b3.check': { type: 'checkpoint', title: 'Ticket inspection: Rootless ii – V – I', piece: 'rootlessC', skill: 'theory', minutes: 3 },

  // ---- Radio Line: Four-Chord Diner ----
  'p1.lesson': { type: 'lesson', title: 'Pop accompaniment', skill: 'rhythm', minutes: 2, slides: [
    { text: 'Most pop piano is a left-hand pattern plus right-hand chords. The left hand here plays root – fifth – octave, like a gentle bass line.' },
    { text: 'The right hand uses the "3 + 3 + 2" rhythm: long, long, short (count 1-2-3, 1-2-3, 1-2). It is everywhere on the radio.' },
    { text: 'Smooth voicings again: C (C E G) → G (B D G) → Am (C E A) → F (C F A). The thumb barely moves.', staff: { notes: '[C4,E4,G4]:4@C | [B3,D4,G4]:4@G | [C4,E4,A4]:4@Am | [C4,F4,A4]:4@F' } },
  ] },
  'p1.groove': { type: 'piano', title: 'Pop groove', piece: 'popGroove', skill: 'rhythm', minutes: 3.5, core: true,
    howto: 'Right hand alone with the band first (3 + 3 + 2). Then the left hand pattern. Then hands together, slowly.' },
  'p1.echo': { type: 'echo', title: 'Play it by ear', skill: 'ear', minutes: 2.5, core: true, count: 5, start: 3 },
  'p1.hook': { type: 'improv', title: 'Write a hook', skill: 'theory', minutes: 3, band: chart('C:4 G:4 Am:4 F:4'), bandStyle: 'pop', bpm: 92, pentatonic: true,
    howto: 'Over the four chords, make up a short catchy melody (a hook) with the marked notes (C D E G A). Repeat it until it sticks. Record a take of your favorite!' },
  'p1.check': { type: 'checkpoint', title: 'Ticket inspection: Pop groove', piece: 'popGroove', skill: 'rhythm', minutes: 3 },

  // ---- Radio Line: Lead Sheet Lane ----
  'p2.lesson': { type: 'lesson', title: 'Reading a lead sheet', skill: 'reading', minutes: 2, slides: [
    { text: 'A lead sheet shows only the melody, with chord symbols above. The pianist invents the accompaniment.' },
    { text: 'Simplest version: right hand plays the melody, left hand plays the root and fifth of each chord. Then add rhythm and movement in the left hand.' },
    { text: 'Rule of thumb: the melody is the star. Keep the left hand lower and softer than the right.' },
  ] },
  'p2.lead': { type: 'piano', title: 'Platform Song', piece: 'platformSong', skill: 'reading', minutes: 4, core: true,
    howto: 'An original 8-bar song in G. Learn the melody, then add left-hand fifths, then try your own left-hand pattern (like the pop groove).' },
  'p2.echo': { type: 'echo', title: 'Longer phrases by ear', skill: 'ear', minutes: 2.5, core: true, count: 5, start: 4 },
  'p2.arrange': { type: 'improv', title: 'Arrange it your way', skill: 'theory', minutes: 3, band: chart('G:4 D:4 Em:4 C:4 G:4 D:4 C:4 G:4'), bandStyle: 'pop', bpm: 96,
    howto: 'Play Platform Song with the band, but make the accompaniment yours: broken chords, a 3 + 3 + 2 rhythm, or octaves. Record your favorite arrangement.' },
  'p2.check': { type: 'checkpoint', title: 'Ticket inspection: Platform Song', piece: 'platformSong', skill: 'reading', minutes: 3 },
};

export const STATIONS = [
  { id: 'f1', line: 'foundations', name: 'Keyboard Junction', postcard: 'A lantern-lit platform under a sky full of stars',
    story: 'Conductor Oona punches a fresh ticket and hands it to you. "Every journey starts by knowing the tracks," she says, pointing at the keys. "Find your landmarks, and nobody gets lost."',
    passenger: 'A sleepy cellist in car 3 asks for something quiet to drift off to.',
    items: ['f1.lesson', 'f1.findC', 'f1.cWalk', 'f1.steps', 'f1.groups', 'f1.beat', 'f1.night'], checkpoint: 'f1.check' },
  { id: 'f2', line: 'foundations', name: 'Steady Beat Bridge', postcard: 'An iron bridge over a moonlit river',
    story: 'The train slows for the long bridge. "The rails click in time," Oona says. "Keep the beat steady and we cross without a wobble."',
    passenger: 'The clockmaker in the dining car wants to hear the tower bells ring true.',
    items: ['f2.lesson', 'f2.rhythm1', 'f2.clock', 'f2.findFG', 'f2.rhythm2', 'f2.ear', 'f2.callresp'], checkpoint: 'f2.check' },
  { id: 'f3', line: 'foundations', name: 'Middle C Crossing', postcard: 'A busy crossing with a glowing signal tower',
    story: 'At the crossing, a brass band waits on the platform. "Five fingers, five keys," Oona grins. "You are ready for a real melody."',
    passenger: 'A retired music teacher hums a famous tune and asks if you can play it.',
    items: ['f3.lesson', 'f3.five', 'f3.readLesson', 'f3.buns', 'f3.read', 'f3.ode', 'f3.ear', 'f3.compose'], checkpoint: 'f3.check' },

  { id: 'c1', line: 'carol', name: 'Jingle Bells Junction', postcard: 'A snowy platform strung with lights',
    story: 'Snow drifts past the windows. A family of carolers boards with mittens and cocoa. "Can you play with us?" the youngest asks.',
    passenger: 'The caroling family wants a duet they can sing along to.',
    items: ['c1.lesson', 'c1.jingle', 'c1.duet', 'c1.ear', 'c1.ode'], checkpoint: 'c1.check' },
  { id: 'c2', line: 'carol', name: 'Holly Hall', postcard: 'A great hall hung with holly and candles',
    story: 'The train pulls into a station decked with holly. In the waiting room, a fire crackles and a choir is warming up. "We need a pianist for the fa-la-las!"',
    passenger: 'The station choir needs a pianist.',
    items: ['c2.lesson', 'c2.deck', 'c2.deckDuet', 'c2.king', 'c2.kingDuet'], checkpoint: 'c2.check' },
  { id: 'c3', line: 'carol', name: 'Joy Junction', postcard: 'A bell tower ringing over a snowy town square',
    story: 'Bells ring out over the town square. The bell-ringer waves you up the tower: "Eight bells, top to bottom! Can you ring them on the piano?"',
    passenger: 'The bell-ringer wants to hear Joy to the World.',
    items: ['c3.lesson', 'c3.scale', 'c3.duet', 'c3.ear'], checkpoint: 'c3.check' },
  { id: 'c4', line: 'carol', name: 'Silent Night Siding', postcard: 'A quiet siding under falling snow and starlight',
    story: 'The train rests on a quiet siding. Snow falls; the carriage lamps glow. Conductor Oona whispers: "Everyone is asleep. Something gentle?"',
    passenger: 'The sleeping carriage would love Silent Night.',
    items: ['c4.lesson', 'c4.silent', 'c4.duet', 'c4.compose'], checkpoint: 'c4.check' },
  { id: 'g1', line: 'gospel', name: 'Chapel Hill', postcard: 'A small white chapel glowing at dusk',
    story: 'The train stops below a hilltop chapel. The worship leader waves from the steps: "Our keys player is out sick. Know any chords?"',
    passenger: 'The worship leader needs someone to hold down the chords.',
    items: ['g1.lesson', 'g1.build', 'g1.cfgc', 'g1.smooth', 'g1.ear'], checkpoint: 'g1.check' },
  { id: 'g2', line: 'gospel', name: 'Four Chords Crossing', postcard: 'A crossroads lit by a hundred lanterns',
    story: 'At the crossing, a band rehearses under a tent. The drummer counts off: "1, 5, 6, 4. Ready?"',
    passenger: 'The band leader calls the chords by number. Can you follow?',
    items: ['g2.lesson', 'g2.numbers', 'g2.four', 'g2.pulse'], checkpoint: 'g2.check' },
  { id: 'g3', line: 'gospel', name: 'Key of D Depot', postcard: 'A riverside depot with a choir on the platform',
    story: 'At the depot, a gospel choir is rehearsing. The director laughs: "Our singers need it in D tonight. Same song, new key. Can you follow me?"',
    passenger: 'The choir director will call the chords by number.',
    items: ['g3.lesson', 'g3.d', 'g3.e', 'g3.numbers', 'g3.cues'], checkpoint: 'g3.check' },
  { id: 'g4', line: 'gospel', name: 'Bridge Street', postcard: 'A stone bridge glowing at the edge of a city',
    story: 'A worship band is sound-checking in a church on Bridge Street. The leader grins: "We need that ringing, open sound. And watch me for the ending."',
    passenger: 'The worship leader wants the modern worship sound.',
    items: ['g4.lesson', 'g4.sus', 'g4.anchor', 'g4.walk', 'g4.cues'], checkpoint: 'g4.check' },
  { id: 'k1', line: 'conservatory', name: 'Minuet Station', postcard: 'A marble hall with a gilded harpsichord',
    story: 'The Conservatory Express glides into a station of marble and brass. A dancing master taps his cane in threes.',
    passenger: 'The dancing master needs a minuet for tonight\'s ball.',
    items: ['k1.lesson', 'k1.scale', 'k1.minuet', 'k1.ear'], checkpoint: 'k1.check' },
  { id: 'b1', line: 'bluenote', name: 'Shell Station', postcard: 'A smoky club with a neon "Blue Note" sign',
    story: 'Down a staircase, a trio is warming up. The bass player nods at the empty piano bench: "Grab a seat. ii–V–I in C."',
    passenger: 'The trio needs a pianist who can comp.',
    items: ['b1.lesson', 'b1.build', 'b1.shells', 'b1.charleston', 'b1.blues'], checkpoint: 'b1.check' },
  { id: 'k2', line: 'conservatory', name: 'Prelude Platform', postcard: 'A quiet chapel organ loft at dawn',
    story: 'A cantor at the next station hums a rippling pattern. "Bach wrote this for his students," he says. "Every bar is a chord. Every chord is a feeling."',
    passenger: 'The cantor wants to hear the Prelude ripple like water.',
    items: ['k2.lesson', 'k2.arp', 'k2.prelude', 'k2.ear'], checkpoint: 'k2.check' },
  { id: 'k3', line: 'conservatory', name: 'Ballroom Return', postcard: 'A candlelit ballroom mid-waltz',
    story: 'The dancing master is back: "Last time was only the first half! Tonight, the whole minuet, and the second half modulates."',
    passenger: 'The dancers need the second half of the minuet.',
    items: ['k3.lesson', 'k3.scale', 'k3.minuet'], checkpoint: 'k3.check' },
  { id: 'k4', line: 'conservatory', name: 'Für Elise Falls', postcard: 'A misty waterfall under a stone bridge',
    story: 'Mist rises from a waterfall beside the tracks. A pianist in the observation car plays the first two notes of a melody everyone knows, then stops. "Your turn."',
    passenger: 'The pianist in the observation car wants to hear Für Elise.',
    items: ['k4.lesson', 'k4.scale', 'k4.pedal', 'k4.elise'], checkpoint: 'k4.check' },
  { id: 'b2', line: 'bluenote', name: 'Swing Street', postcard: 'A rainy street outside a late-night jazz club',
    story: 'The trio moves to a bigger club. The drummer grins: "Tonight it\'s the blues. Swing it, and leave some space."',
    passenger: 'The drummer wants to trade fours with you.',
    items: ['b2.lesson', 'b2.tap', 'b2.shells', 'b2.comp', 'b2.riff', 'b2.jam'], checkpoint: 'b2.check' },
  { id: 'b3', line: 'bluenote', name: 'Rootless Row', postcard: 'A rooftop jam under city lights',
    story: 'On a rooftop jam session, the bassist says: "I\'ve got the roots covered. Give me those rich chords."',
    passenger: 'The bassist wants rootless voicings to play against.',
    items: ['b3.lesson', 'b3.build', 'b3.c', 'b3.f', 'b3.dorian'], checkpoint: 'b3.check' },
  { id: 'p1', line: 'radio', name: 'Four-Chord Diner', postcard: 'A neon diner with a jukebox by the window',
    story: 'The train stops for pie at an all-night diner. The jukebox is broken, and the waitress points at the upright in the corner. "Play us something we can sing to?"',
    passenger: 'The diner crowd wants a pop groove.',
    items: ['p1.lesson', 'p1.groove', 'p1.echo', 'p1.hook'], checkpoint: 'p1.check' },
  { id: 'p2', line: 'radio', name: 'Lead Sheet Lane', postcard: 'A recording studio with a red "On Air" light',
    story: 'A songwriter boards with a single page: a melody and some chord symbols. "That\'s all you get," she laughs. "Make it sound like a record."',
    passenger: 'The songwriter needs her song brought to life.',
    items: ['p2.lesson', 'p2.lead', 'p2.echo', 'p2.arrange'], checkpoint: 'p2.check' },
];

// Carols: solo piece + duet built from it (melody upper; bass notes or chords lower)
function carolDuet(soloKey, bassStr, chordStr, extra = {}) {
  const solo = PIECES[soloKey];
  return { title: solo.title.replace(/ \(.*\)$/, '') + ' duet', credit: (solo.credit || '') + ' · duet arrangement: Night Train', bpm: solo.bpm, beatsPerBar: solo.beatsPerBar, keySig: solo.keySig,
    range: [40, solo.range[1]], hand: 'RH', phrases: solo.phrases, ...extra,
    duet: { parts: [
      { id: 'melody', name: 'Melody (upper)', clef: 'treble', notes: solo.notes },
      { id: 'bass', name: 'Bass notes (lower, easy)', clef: 'bass', notes: parse(bassStr) },
      { id: 'chords', name: 'Chords (lower)', clef: 'bass', notes: parse(chordStr) },
    ] } };
}
Object.assign(PIECES, {
  deck: { title: 'Deck the Halls', credit: 'Traditional Welsh carol (public domain)', bpm: 100, range: [57, 74], hand: 'RH',
    notes: parse('G4:1.5/5 F4:0.5/4 E4:1/3 D4:1/2 | C4:1/1 D4:1/2 E4:1/3 C4:1/1 | D4:0.5/2 E4:0.5/3 F4:0.5/4 D4:0.5/2 E4:1.5/3 D4:0.5/2 | C4:1/2 B3:1/1 C4:2/2 | '
      + 'G4:1.5/5 F4:0.5/4 E4:1/3 D4:1/2 | C4:1/1 D4:1/2 E4:1/3 C4:1/1 | D4:0.5/2 E4:0.5/3 F4:0.5/4 D4:0.5/2 E4:1.5/3 D4:0.5/2 | C4:1/2 B3:1/1 C4:2/2 | '
      + 'D4:1.5/1 E4:0.5/2 F4:1/3 D4:1/1 | E4:1.5/2 F4:0.5/3 G4:1/4 D4:1/1 | E4:0.5/1 F#4:0.5/2 G4:1/3 A4:0.5/4 B4:0.5/5 C5:1/5 | B4:1/4 A4:1/3 G4:2/2 | '
      + 'G4:1.5/5 F4:0.5/4 E4:1/3 D4:1/2 | C4:1/1 D4:1/2 E4:1/3 C4:1/1 | D4:0.5/2 E4:0.5/3 F4:0.5/4 D4:0.5/2 E4:1.5/3 D4:0.5/2 | C4:1/2 B3:1/1 C4:2/2'),
    phrases: [[0, 16], [17, 33], [34, 50], [51, 67]] },
  wenceslas: { title: 'Good King Wenceslas', credit: 'Piae Cantiones, 1582 (public domain)', bpm: 96, range: [52, 69], hand: 'RH',
    notes: parse('C4:1/3 C4:1/3 C4:1/3 D4:1/4 | C4:1/3 C4:1/3 G3:2/1 | A3:1/2 G3:1/1 A3:1/2 B3:1/3 | C4:2/4 C4:2/4 | '
      + 'C4:1/3 C4:1/3 C4:1/3 D4:1/4 | C4:1/3 C4:1/3 G3:2/1 | A3:1/2 G3:1/1 A3:1/2 B3:1/3 | C4:2/4 C4:2/4 | '
      + 'G4:1/5 F4:1/4 E4:1/3 D4:1/2 | E4:1/3 D4:1/2 C4:2/1 | A3:1/2 G3:1/1 A3:1/2 B3:1/3 | C4:2/4 C4:2/4 | '
      + 'G3:1/1 G3:1/1 A3:1/2 B3:1/3 | C4:1/4 C4:1/4 D4:2/5 | G4:1/5 F4:1/4 E4:1/3 D4:1/2 | C4:2/1 F4:2/4 | C4:4/1'),
    phrases: [[0, 12], [13, 25], [26, 38], [39, 52]] },
  joy: { title: 'Joy to the World (opening)', credit: 'Isaac Watts / Lowell Mason, 1839 (public domain)', bpm: 88, range: [57, 74], hand: 'RH',
    notes: parse('C5:2/5 B4:1.5/4 A4:0.5/3 | G4:3/2 F4:1/1 | E4:2/3 D4:2/2 | C4:3/1 G4:1/1 | A4:3/2 A4:1/2 | B4:3/3 B4:1/3 | C5:3/4 C5:1/4 | C5:1/5 B4:1/4 A4:1/3 G4:1/2 | G4:1.5/2 F4:0.5/1 E4:2/2'),
    phrases: [[0, 7], [8, 13], [14, 21]] },
  silent: { title: 'Silent Night', credit: 'Franz Gruber, 1818 (public domain)', beatsPerBar: 3, bpm: 84, range: [57, 79], hand: 'RH',
    notes: parse('G4:1.5 A4:0.5 G4:1 | E4:3 | G4:1.5 A4:0.5 G4:1 | E4:3 | D5:2 D5:1 | B4:3 | C5:2 C5:1 | G4:3 | '
      + 'A4:2 A4:1 | C5:1.5 B4:0.5 A4:1 | G4:1.5 A4:0.5 G4:1 | E4:3 | A4:2 A4:1 | C5:1.5 B4:0.5 A4:1 | G4:1.5 A4:0.5 G4:1 | E4:3 | '
      + 'D5:2 D5:1 | F5:1.5 D5:0.5 B4:1 | C5:3 | E5:3 | C5:1.5 G4:0.5 E4:1 | G4:1.5 F4:0.5 D4:1 | C4:3'),
    phrases: [[0, 7], [8, 13], [14, 22], [23, 31], [32, 38], [39, 45]] },
});
Object.assign(PIECES, {
  deckDuet: carolDuet('deck', 'C3:4 | C3:4 | G3:4 | C3:4 | C3:4 | C3:4 | G3:4 | C3:4 | G3:4 | C3:4 | D3:4 | G3:4 | C3:4 | C3:4 | G3:4 | C3:4',
    '[C3,E3,G3]:4@C | [C3,E3,G3]:4 | [B2,D3,G3]:4@G | [C3,E3,G3]:4@C | [C3,E3,G3]:4 | [C3,E3,G3]:4 | [B2,D3,G3]:4@G | [C3,E3,G3]:4@C | [B2,D3,G3]:4@G | [C3,E3,G3]:4@C | [A2,D3,F#3]:4@D | [B2,D3,G3]:4@G | [C3,E3,G3]:4@C | [C3,E3,G3]:4 | [B2,D3,G3]:4@G | [C3,E3,G3]:4@C'),
  wenceslasDuet: carolDuet('wenceslas', 'C3:4 | C3:4 | F3:4 | C3:4 | C3:4 | C3:4 | F3:4 | C3:4 | G3:4 | C3:4 | F3:4 | C3:4 | G3:4 | G3:4 | G3:4 | C3:4 | C3:4',
    '[C3,E3,G3]:4@C | [C3,E3,G3]:4 | [C3,F3,A3]:4@F | [C3,E3,G3]:4@C | [C3,E3,G3]:4 | [C3,E3,G3]:4 | [C3,F3,A3]:4@F | [C3,E3,G3]:4@C | [B2,D3,G3]:4@G | [C3,E3,G3]:4@C | [C3,F3,A3]:4@F | [C3,E3,G3]:4@C | [B2,D3,G3]:4@G | [B2,D3,G3]:4 | [B2,D3,G3]:4 | [C3,E3,G3]:4@C | [C3,E3,G3]:4'),
  joyDuet: carolDuet('joy', 'C3:4 | C3:4 | G3:4 | C3:4 | F3:4 | G3:4 | C3:4 | C3:4 | C3:4',
    '[C3,E3,G3]:4@C | [C3,E3,G3]:4 | [B2,D3,G3]:4@G | [C3,E3,G3]:4@C | [C3,F3,A3]:4@F | [B2,D3,G3]:4@G | [C3,E3,G3]:4@C | [C3,E3,G3]:4 | [C3,E3,G3]:4'),
  silentDuet: carolDuet('silent', 'C3:3 | C3:3 | C3:3 | C3:3 | G3:3 | G3:3 | C3:3 | C3:3 | F3:3 | F3:3 | C3:3 | C3:3 | F3:3 | F3:3 | C3:3 | C3:3 | G3:3 | G3:3 | C3:3 | C3:3 | C3:3 | G3:3 | C3:3',
    '[C3,E3,G3]:3@C | [C3,E3,G3]:3 | [C3,E3,G3]:3 | [C3,E3,G3]:3 | [B2,D3,G3]:3@G | [B2,D3,G3]:3 | [C3,E3,G3]:3@C | [C3,E3,G3]:3 | [C3,F3,A3]:3@F | [C3,F3,A3]:3 | [C3,E3,G3]:3@C | [C3,E3,G3]:3 | [C3,F3,A3]:3@F | [C3,F3,A3]:3 | [C3,E3,G3]:3@C | [C3,E3,G3]:3 | [B2,D3,G3]:3@G | [B2,D3,G3]:3 | [C3,E3,G3]:3@C | [C3,E3,G3]:3 | [C3,E3,G3]:3 | [B2,D3,G3]:3@G | [C3,E3,G3]:3@C'),
});

PIECES.jingleDuet.duet.parts[0].notes = PIECES.jingle.notes;
PIECES.odeDuet.duet.parts[0].notes = PIECES.odeToJoy.notes;
PIECES.jingleDuet.phrases = PIECES.jingle.phrases;

export const CHORD_SPELL = {
  C: [0, 4, 7], F: [5, 9, 0], G: [7, 11, 2], Am: [9, 0, 4], Dm: [2, 5, 9], Em: [4, 7, 11], D: [2, 6, 9],
  Dm7: [2, 5, 9, 0], G7: [7, 11, 2, 5], Cmaj7: [0, 4, 7, 11], Am7: [9, 0, 4, 7], D7: [2, 6, 9, 0], Fmaj7: [5, 9, 0, 4],
  'Dm9 rootless': [5, 9, 0, 4], 'G13 rootless': [5, 9, 11, 4], 'Cmaj9 rootless': [4, 7, 11, 2],
  'Gm9 rootless': [10, 2, 5, 9], 'C13 rootless': [10, 2, 4, 9], 'Fmaj9 rootless': [9, 0, 4, 7],
};
export const KEYS_NASHVILLE = {
  C: ['C', 'Dm', 'Em', 'F', 'G', 'Am'], G: ['G', 'Am', 'Bm', 'C', 'D', 'Em'], D: ['D', 'Em', 'F#m', 'G', 'A', 'Bm'],
  A: ['A', 'Bm', 'C#m', 'D', 'E', 'F#m'], E: ['E', 'F#m', 'G#m', 'A', 'B', 'C#m'],
};

export const READING_LEVELS = [
  { id: 0, name: 'Falling notes', desc: 'Notes fall onto lit keys' },
  { id: 1, name: 'Falling + staff', desc: 'Falling notes with the staff shown' },
  { id: 2, name: 'Staff with letters', desc: 'Real notation, letter hints' },
  { id: 3, name: 'Staff only', desc: 'Real notation, like a musician' },
];

export const TEMPO_LADDER = [0.6, 0.7, 0.8, 0.9, 1.0];

export const POSTURE = [
  'Sit near the front of the bench, feet flat on the floor',
  'Elbows about level with the keys, shoulders relaxed down',
  'Curved fingers, like holding a small ball',
  'Shake out your hands for 5 seconds',
];

export const TIPS = [
  'Slow and clean beats fast and messy. Your brain learns exactly what you repeat.',
  'If a spot keeps tripping you up, loop just that spot. Fix the hardest bar, not the whole song.',
  'Short practice most days beats one long practice a week.',
  'Sleep locks in what you practiced today. Really.',
  'Mistakes are information, not failure. Notice it, slow down, try again.',
  'Listen to the sound you make. Aim for a smooth, singing line.',
];
