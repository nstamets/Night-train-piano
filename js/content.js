// Curriculum content: lines, stations, items, pieces. Original exercises + public-domain melodies only.

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function toMidi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  return (+m[3] + 1) * 12 + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
// "E4:1 E4:1 F4:1/3" => [{midi, beat, dur, finger}]  ('|' bar lines ignored, 'R:1' = rest)
export function parse(str) {
  const out = []; let beat = 0;
  str.split(/\s+/).filter(t => t && t !== '|').forEach(tok => {
    const [note, rest] = tok.split(':');
    const [dur, finger] = (rest || '1').split('/');
    const d = +dur;
    if (note !== 'R') out.push({ midi: toMidi(note), beat, dur: d, finger: finger ? +finger : undefined });
    beat += d;
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
  { id: 'carol', name: 'Carol Line', who: 'Songs and Christmas carols, solo and duet', ready: false },
  { id: 'gospel', name: 'Gospel Line', who: 'Worship chords, charts, and playing with a team', ready: false },
  { id: 'conservatory', name: 'Conservatory Line', who: 'Classical technique and repertoire', ready: false },
  { id: 'bluenote', name: 'Blue Note Line', who: 'Jazz and pop: grooves, 7th chords, lead sheets', ready: false },
];

// ---------- Pieces ----------
export const PIECES = {
  cdeUpDown: { title: 'Up the Steps', notes: parse('C4:1/1 D4:1/2 E4:1/3 D4:1/2 | C4:4/1'), bpm: 72, range: [57, 69], hand: 'RH' },
  clockTower: { title: 'Clock Tower', notes: parse('C4:1/1 C4:1/1 D4:2/2 | E4:1/3 E4:1/3 D4:2/2 | C4:4/1'), bpm: 76, range: [57, 69], hand: 'RH' },
  fiveFinger: { title: 'Five-Finger Climb', notes: parse('C4:1/1 D4:1/2 E4:1/3 F4:1/4 | G4:1/5 F4:1/4 E4:1/3 D4:1/2 | C4:4/1'), bpm: 80, range: [57, 72], hand: 'RH' },
  hotCrossBuns: { title: 'Hot Cross Buns', credit: 'Traditional', notes: parse('E4:1/3 D4:1/2 C4:2/1 | E4:1/3 D4:1/2 C4:2/1 | C4:1/1 C4:1/1 D4:1/2 D4:1/2 | E4:1/3 D4:1/2 C4:2/1'), bpm: 84, range: [57, 69], hand: 'RH' },
  odeToJoy: { title: 'Ode to Joy (line 1)', credit: 'Beethoven, 1824 (public domain)', notes: parse('E4:1/3 E4:1/3 F4:1/4 G4:1/5 | G4:1/5 F4:1/4 E4:1/3 D4:1/2 | C4:1/1 C4:1/1 D4:1/2 E4:1/3 | E4:1.5/3 D4:0.5/2 D4:2/2'), bpm: 84, range: [57, 72], hand: 'RH',
    phrases: [[0, 7], [8, 14]] },
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
];

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
