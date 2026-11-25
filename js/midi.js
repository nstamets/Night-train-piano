// Web MIDI input (e.g. Mady's Yamaha PSR-E383 over USB on a Mac in Chrome or Edge).
// iPhone/iPad and Mac Safari do not support Web MIDI; then this simply reports "not available".
import { audio } from './audio.js';

const state = { supported: typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess, access: null, inputs: [], listeners: new Set(), statusListeners: new Set() };

export function midiSupported() { return state.supported; }
export function midiConnected() { return state.inputs.length > 0; }
export function midiName() { return state.inputs.map(i => i.name).join(', '); }
export function onMidiStatus(fn) { state.statusListeners.add(fn); return () => state.statusListeners.delete(fn); }

// Call from a tap. Safe to call repeatedly.
export async function initMIDI() {
  if (!state.supported || state.access) return midiConnected();
  try {
    state.access = await navigator.requestMIDIAccess({ sysex: false });
    const refresh = () => {
      state.inputs = [...state.access.inputs.values()].filter(i => i.state !== 'disconnected');
      state.inputs.forEach(i => { i.onmidimessage = handle; });
      state.statusListeners.forEach(fn => fn(midiConnected()));
    };
    state.access.onstatechange = refresh;
    refresh();
  } catch (e) { console.warn('MIDI not available', e); state.supported = false; }
  return midiConnected();
}

function handle(e) {
  const [st, d1, d2] = e.data;
  const type = st & 0xf0;
  if (type === 0x90 && d2 > 0) {
    // map the event's performance-clock time onto the audio clock
    const c = audio();
    const ageS = Math.max(0, (performance.now() - (e.timeStamp || performance.now())) / 1000);
    const t = c.currentTime - ageS;
    state.listeners.forEach(fn => fn({ t, midi: d1, vel: d2 }));
  }
}

// Collect notes; groups notes struck within 70 ms into one event (a chord) with exact pitch classes.
export function listenMIDI(onEvent) {
  let group = null, timer = null;
  const flush = () => {
    if (!group) return;
    const notes = group.notes.slice().sort((a, b) => a - b);
    onEvent({ t: group.t, midi: notes.length === 1 ? notes[0] : notes[0], pcs: [...new Set(notes.map(m => m % 12))], notes, vel: group.vel, source: 'midi' });
    group = null;
  };
  const fn = ev => {
    if (group && ev.t - group.t < 0.07) { group.notes.push(ev.midi); group.vel = Math.max(group.vel, ev.vel); }
    else { flush(); group = { t: ev.t, notes: [ev.midi], vel: ev.vel }; }
    clearTimeout(timer); timer = setTimeout(flush, 90);
  };
  state.listeners.add(fn);
  return { stop() { clearTimeout(timer); flush(); state.listeners.delete(fn); } };
}
