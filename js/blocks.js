// Renderers for each kind of practice block. Each mount() returns a cleanup function.
// ctx: { player, done(result), save(), toast(msg), openMicCheck(opts) }
import { ITEMS, PIECES, POSTURE, TIPS, TEMPO_LADDER, READING_LEVELS, parse, CHORD_SPELL, KEYS_NASHVILLE, toMidi } from './content.js';
import { midiConnected, listenMIDI } from './midi.js';
import { recSupported, startRec, stopRec, shareTake, recording } from './recorder.js';
import { generateSight, SIGHT_LEVELS } from './sight.js';
import { judge } from './pitch.js';
import { renderStaff, renderScore, renderKeyboard, bindKeyboard, fallingNotes, letterOf } from './notation.js';
import { playNote, schedulePlayback, audio, pad, click, unlockAudio, setBackingVolume, makeRoute, scheduleBand } from './audio.js';
import { recordRating, ratingFromScore, itemState, hardestPhrase, milesFor, shuffle, paceFast } from './engine.js';

const $ = (el, sel) => el.querySelector(sel);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function barsPerLine() { return window.innerWidth > window.innerHeight && window.innerWidth > 600 ? 4 : 2; }

export function mountBlock(el, block, ctx) {
  if (block.kind === 'warmup') return mountWarmup(el, ctx);
  const it = ITEMS[block.id];
  switch (it.type) {
    case 'lesson': return mountLesson(el, it, block, ctx);
    case 'keyquiz': return mountKeyQuiz(el, it, block, ctx);
    case 'readquiz': return mountReadQuiz(el, it, block, ctx);
    case 'rhythm': return mountRhythm(el, it, block, ctx);
    case 'ear': return mountEar(el, it, block, ctx);
    case 'improv': return mountImprov(el, it, block, ctx);
    case 'piano': return mountPiano(el, it, block, ctx);
    case 'checkpoint': return mountCheckpoint(el, it, block, ctx);
    case 'chordquiz': return mountChordQuiz(el, it, block, ctx);
    case 'choice': return mountChoice(el, it, block, ctx);
    case 'echo': return mountEcho(el, it, block, ctx);
    case 'cues': return mountCues(el, it, block, ctx);
    case 'sight': return mountSight(el, it, block, ctx);
    default: el.innerHTML = '<p>Unknown block</p>'; return () => {};
  }
}

export function volSlider(p) {
  return `<label class="vol">🔊 Backing <input type="range" min="0" max="200" step="10" value="${Math.round((p.backingVol ?? 1) * 100)}" data-vol aria-label="Backing volume"></label>`;
}
function bindVol(el, ctx) {
  el.addEventListener('input', e => { if (e.target.matches('[data-vol]')) { ctx.player.backingVol = +e.target.value / 100; setBackingVolume(ctx.player.backingVol); } });
  el.addEventListener('change', e => { if (e.target.matches('[data-vol]')) ctx.save(); });
}

function header(it, sub) {
  return `<div class="blk-h"><h2>${esc(it.title)}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}</div>`;
}

// ---------- Warm-up ----------
function mountWarmup(el, ctx) {
  const p = ctx.player;
  const quick = p.sessions.length >= 5;
  const list = quick ? POSTURE.slice(2) : POSTURE;
  const tip = TIPS[p.sessions.length % TIPS.length];
  el.innerHTML = `
    <div class="blk-h"><h2>Warm-up</h2><p class="muted">${quick ? 'Quick body check' : 'Set up like a pro. Tap each one as you do it.'}</p></div>
    <ul class="checks">${list.map((t, i) => `<li><button class="chk" data-i="${i}" aria-pressed="false"><span class="box" aria-hidden="true"></span>${esc(t)}</button></li>`).join('')}</ul>
    <div class="tip"><strong>Conductor's tip:</strong> ${esc(tip)}</div>
    <button class="btn primary big" data-go>All aboard</button>`;
  el.addEventListener('click', e => {
    const c = e.target.closest('.chk');
    if (c) { c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); return; }
    if (e.target.closest('[data-go]')) { unlockAudio(); ctx.done({ miles: 2, skill: 'technique', xp: 2 }); }
  });
  return () => {};
}

// ---------- Lesson ----------
function mountLesson(el, it, block, ctx) {
  let i = 0;
  const show = () => {
    const sl = it.slides[i];
    let vis = '';
    if (sl.kb) vis = `<div class="kbwrap">${renderKeyboard(sl.kb.lo, sl.kb.hi, { marks: sl.kb.marks || {}, labels: sl.kb.labels || 'c', fingers: sl.kb.fingers || {} })}</div>`;
    if (sl.staff) vis = `<div class="staffwrap">${renderScore([{ notes: parse(sl.staff.notes), clef: sl.staff.clef || 'treble' }], { letters: sl.staff.letters, barsPerLine: barsPerLine(), keySig: sl.staff.keySig ? { sharps: sl.staff.keySig } : null, beatsPerBar: sl.staff.bpb || 4 })}</div>`;
    el.innerHTML = `${header(it, `Mini-lesson · ${i + 1} of ${it.slides.length}`)}
      <p class="lesson-text">${esc(sl.text)}</p>${vis}
      <div class="row">
        ${i > 0 ? '<button class="btn" data-back>Back</button>' : '<button class="btn ghost" data-skip>I know this. Skip</button>'}
        <button class="btn primary" data-next>${i < it.slides.length - 1 ? 'Next' : 'Got it'}</button>
      </div>`;
    const kb = $(el, '.kbwrap'); if (kb) bindKeyboard(kb, m => playNote(m));
  };
  el.onclick = e => {
    if (e.target.closest('[data-next]')) { if (i < it.slides.length - 1) { i++; show(); } else finish(); }
    else if (e.target.closest('[data-back]')) { i--; show(); }
    else if (e.target.closest('[data-skip]')) finish();
  };
  const finish = () => { recordRating(ctx.player, block.id, 'clean'); ctx.done({ miles: 5, skill: it.skill, xp: 4 }); };
  show();
  return () => { el.onclick = null; };
}

// ---------- Quizzes (objective, touch) ----------
function quizShell(el, it, block, ctx, { prompt, kb, check, next, total }) {
  let n = 0, right = 0, firstTry = true;
  const render = q => {
    el.innerHTML = `${header(it, `Question ${n + 1} of ${total}`)}
      <div class="qprompt" aria-live="polite">${q.html}</div>
      <div class="kbwrap tall">${renderKeyboard(kb.lo, kb.hi, { labels: kb.labels })}</div>
      <p class="fb" aria-live="polite"></p>`;
    const wrap = $(el, '.kbwrap');
    const off = bindKeyboard(wrap, m => {
      playNote(m, { dur: 0.5 });
      const ok = check(q, m);
      const fb = $(el, '.fb');
      const g = wrap.querySelector(`[data-midi="${m}"]`);
      if (ok === true) {
        if (firstTry) right++;
        g && g.classList.add('k-hit');
        fb.innerHTML = '<span class="ok">✓ Yes!</span> ' + (q.after || '');
        off();
        setTimeout(() => { n++; firstTry = true; if (n >= total) end(); else render(next(n)); }, 750);
      } else {
        firstTry = false;
        g && g.classList.add('k-wrong'); setTimeout(() => g && g.classList.remove('k-wrong'), 600);
        fb.innerHTML = '<span class="no">✕ Not that one.</span> ' + (typeof ok === 'string' ? ok : (q.hint || 'Try again.'));
      }
    });
  };
  const end = () => {
    const score = right / total;
    const rating = ratingFromScore(score);
    recordRating(ctx.player, block.id, rating);
    ctx.done({ rating, score, miles: milesFor(rating), skill: it.skill, xp: Math.round(6 * score) + 2, summary: `${right} of ${total} on the first try` });
  };
  render(next(0));
  return () => {};
}

function mountKeyQuiz(el, it, block, ctx) {
  const kb = { lo: 48, hi: 71, labels: 'none' };
  let qs = [];
  if (it.quiz === 'groups') {
    for (let i = 0; i < it.count; i++) qs.push(i % 2 ? 3 : 2);
    qs = shuffle(qs);
    return quizShell(el, it, block, ctx, {
      kb, total: it.count,
      next: n => ({ g: qs[n], html: `Tap a black key in a group of <strong>${qs[n] === 2 ? 'TWO' : 'THREE'}</strong>.`, hint: 'Look for the black keys that sit together in twos or threes.' }),
      check: (q, m) => {
        const pc = m % 12;
        if (![1, 3, 6, 8, 10].includes(pc)) return 'That one is white. Find a black key.';
        return (q.g === 2 ? [1, 3] : [6, 8, 10]).includes(pc) ? true : `That black key is in a group of ${q.g === 2 ? 'three' : 'two'}.`;
      },
    });
  }
  const letters = it.letters;
  for (let i = 0; i < it.count; i++) qs.push(letters[i % letters.length]);
  qs = shuffle(qs);
  const hints = { C: 'C is just left of the TWO black keys.', D: 'D is in the middle of the TWO black keys.', E: 'E is just right of the TWO black keys.', F: 'F is just left of the THREE black keys.', G: 'G is between the first two of the THREE black keys.' };
  return quizShell(el, it, block, ctx, {
    kb, total: it.count,
    next: n => ({ l: qs[n], html: `Tap <strong>any ${qs[n]}</strong>.`, hint: hints[qs[n]] }),
    check: (q, m) => letterOf(m) === q.l ? true : `That's ${letterOf(m)}. ${hints[q.l] || ''}`,
  });
}

function mountReadQuiz(el, it, block, ctx) {
  const pool = it.pool.map(n => parse(n + ':4')[0].midi);
  const qs = []; for (let i = 0; i < it.count; i++) qs.push(pool[Math.floor(Math.random() * pool.length)]);
  return quizShell(el, it, block, ctx, {
    kb: { lo: 57, hi: 72, labels: 'c' }, total: it.count,
    next: n => ({ m: qs[n], html: `<div class="staffwrap small">${renderStaff([{ midi: qs[n], beat: 0, dur: 4 }], { beatsPerBar: 4, barsPerLine: 1, timeSig: false })}</div><span>Tap this note.</span>`, hint: 'Start from Middle C (on its own little line) and count up by steps.' }),
    check: (q, m) => m === q.m ? true : (letterOf(m) === letterOf(q.m) ? 'Right letter! Use the one nearest Middle C.' : `That's ${letterOf(m)}. Count steps from Middle C.`),
  });
}

// ---------- Rhythm tapping (objective, touch) ----------
function mountRhythm(el, it, block, ctx) {
  const c = audio();
  const onsets = []; let b = 0; it.pattern.forEach(d => { onsets.push(b); b += d; });
  if (it.swing) for (let k = 0; k < onsets.length; k++) if (Math.abs((onsets[k] % 1) - 0.5) < 1e-6) onsets[k] += 1 / 6; // long-short
  const notes = it.pattern.map((d, i) => ({ midi: 71, beat: onsets[i], dur: d }));
  let tries = 0, best = 0, ctl = null, taps = [], musicStart = 0, listening = false;
  const spb = 60 / it.bpm;
  el.innerHTML = `${header(it, esc(it.intro))}
    <div class="staffwrap">${renderStaff(notes, { barsPerLine: barsPerLine() })}</div>
    <div class="count" aria-live="polite">&nbsp;</div>
    <button class="tap-pad" aria-label="Tap pad" disabled>TAP</button>
    <p class="fb" aria-live="polite"></p>
    <div class="row"><button class="btn primary" data-start>Start</button><button class="btn" data-skip hidden>Next</button></div>`;
  const pad = $(el, '.tap-pad'), count = $(el, '.count'), fb = $(el, '.fb');
  const lat = () => (c.outputLatency || c.baseLatency || 0);
  pad.addEventListener('pointerdown', e => {
    e.preventDefault(); if (!listening) return;
    taps.push(c.currentTime - lat());
    pad.classList.add('hit'); setTimeout(() => pad.classList.remove('hit'), 90);
  });
  const start = async () => {
    await unlockAudio();
    taps = []; listening = false; fb.textContent = '';
    $(el, '[data-start]').disabled = true; pad.disabled = false;
    ctl = schedulePlayback({ events: notes, bpm: it.bpm, countIn: 1, playNotes: !!it.swing, swing: !!it.swing, metronome: true,
      onBeat: (bi) => { count.textContent = bi < 0 ? `Count-in: ${bi + 5}` : `Beat ${(bi % 4) + 1}`; if (bi === -1) listening = true; },
      onEnd: () => { listening = false; finishTry(); } });
    musicStart = ctl.musicStart;
  };
  const finishTry = () => {
    tries++;
    pad.disabled = true; $(el, '[data-start]').disabled = false;
    const expected = onsets.map(o => musicStart + o * spb);
    const used = new Set(); const errs = [];
    expected.forEach(t => {
      let bi = -1, bd = 0.45 * spb + 0.15;
      taps.forEach((x, i) => { if (!used.has(i) && Math.abs(x - t) < bd) { bd = Math.abs(x - t); bi = i; } });
      if (bi >= 0) { used.add(bi); errs.push(taps[bi] - t); } else errs.push(null);
    });
    const got = errs.filter(e => e !== null);
    const med = got.length ? got.slice().sort((a, b2) => a - b2)[Math.floor(got.length / 2)] : 0;
    let score = 0; let early = 0, late = 0;
    errs.forEach(e => { if (e === null) return; const a = Math.abs(e - med); score += a < 0.08 ? 1 : a < 0.15 ? 0.6 : 0.2; if (e - med < -0.08) early++; if (e - med > 0.08) late++; });
    const extra = Math.max(0, taps.length - used.size);
    score = Math.max(0, (score - extra * 0.5) / onsets.length);
    best = Math.max(best, score);
    const missed = errs.filter(e => e === null).length;
    let msg = score >= 0.85 ? '<span class="ok">✓ Rock steady!</span>' : score >= 0.6 ? '<span class="ok">Nearly!</span>' : '<span class="no">Keep going.</span>';
    if (missed) msg += ` You missed ${missed} tap${missed > 1 ? 's' : ''}.`;
    if (extra) msg += ' A few extra taps: tap once per note, then keep counting through long notes.';
    if (early > late + 1) msg += ' You tended to rush. Let each note take its full time.';
    else if (late > early + 1) msg += ' You tended to drag a little. Feel the click coming.';
    fb.innerHTML = msg;
    $(el, '[data-start]').textContent = 'Try again';
    const skip = $(el, '[data-skip]'); skip.hidden = false; skip.textContent = best >= 0.85 || tries >= 3 ? 'Next' : 'Move on';
    $(el, '[data-start]').classList.toggle('primary', !(best >= 0.85)); skip.classList.toggle('ghost', !(best >= 0.85)); skip.classList.toggle('primary', best >= 0.85);
  };
  el.addEventListener('click', e => {
    if (e.target.closest('[data-start]')) start();
    if (e.target.closest('[data-skip]')) {
      const rating = ratingFromScore(best);
      recordRating(ctx.player, block.id, rating);
      ctx.done({ rating, score: best, miles: milesFor(rating), skill: 'rhythm', xp: Math.round(8 * best) + 2, summary: `Best: ${Math.round(best * 100)}% steady` });
    }
  });
  return () => { ctl && ctl.stop(); };
}

// ---------- Ear training (objective) ----------
function mountEar(el, it, block, ctx) {
  let n = 0, right = 0, q = null, answered = false;
  const make = () => {
    if (it.ear === 'updown') {
      const a = 60 + Math.floor(Math.random() * 8); let d = 2 + Math.floor(Math.random() * 6); if (Math.random() < 0.5) d = -d;
      return { a, b: a + d, ans: d > 0 ? 'up' : 'down' };
    }
    if (it.ear === 'majmin') { const r = 55 + Math.floor(Math.random() * 8); const minor = Math.random() < 0.5; return { chord: [r, r + (minor ? 3 : 4), r + 7], ans: minor ? 'min' : 'maj' }; }
    const base = [60, 62, 64, 65, 67]; const m = [0, 1, 2].map(() => base[Math.floor(Math.random() * 5)]);
    const same = Math.random() < 0.5; const m2 = m.slice();
    if (!same) { const i = Math.floor(Math.random() * 3); m2[i] += (Math.random() < 0.5 ? -2 : 2); }
    return { m, m2, ans: same ? 'same' : 'diff' };
  };
  const playQ = async () => {
    await unlockAudio();
    const t = audio().currentTime + 0.05;
    if (it.ear === 'majmin') { q.chord.forEach((m, i) => playNote(m, { when: t + i * 0.25, dur: 1.6 })); q.chord.forEach(m => playNote(m, { when: t + 1.1, dur: 1.2 })); }
    else if (it.ear === 'updown') { playNote(q.a, { when: t, dur: 0.7 }); playNote(q.b, { when: t + 0.8, dur: 0.9 }); }
    else { q.m.forEach((x, i) => playNote(x, { when: t + i * 0.4, dur: 0.38 })); q.m2.forEach((x, i) => playNote(x, { when: t + 1.6 + i * 0.4, dur: 0.38 })); }
  };
  const opts = it.ear === 'updown' ? [['up', 'Higher ↑'], ['down', 'Lower ↓']] : it.ear === 'majmin' ? [['maj', 'Major ☀︎ (bright)'], ['min', 'Minor ☾ (dark)']] : [['same', 'Same ='], ['diff', 'Different ≠']];
  const render = () => {
    q = make(); answered = false;
    el.innerHTML = `${header(it, `Question ${n + 1} of ${it.count}`)}
      <p class="lesson-text">${it.ear === 'updown' ? 'Listen to two notes. Is the second one higher or lower? Try humming them first.' : it.ear === 'majmin' ? 'Listen to the chord. Major sounds bright and settled; minor sounds darker or sadder.' : 'Listen to two short tunes. Are they the same, or different?'}</p>
      <button class="btn big" data-play>▶ Play</button>
      <div class="row">${opts.map(([v, l]) => `<button class="btn big" data-ans="${v}">${l}</button>`).join('')}</div>
      <p class="fb" aria-live="polite"></p>`;
    playQ();
  };
  el.onclick = e => {
    if (e.target.closest('[data-play]')) playQ();
    const a = e.target.closest('[data-ans]');
    if (a && !answered) {
      answered = true;
      const ok = a.dataset.ans === q.ans; if (ok) right++;
      $(el, '.fb').innerHTML = ok ? '<span class="ok">✓ Yes!</span>' : `<span class="no">✕ It was ${opts.find(o => o[0] === q.ans)[1]}.</span> Listen once more.`;
      if (!ok) playQ();
      setTimeout(() => { n++; if (n >= it.count) end(); else render(); }, ok ? 800 : 2600);
    }
  };
  const end = () => {
    const score = right / it.count; const rating = ratingFromScore(score);
    recordRating(ctx.player, block.id, rating);
    ctx.done({ rating, score, miles: milesFor(rating), skill: 'ear', xp: Math.round(6 * score) + 2, summary: `${right} of ${it.count} right` });
  };
  render();
  return () => { el.onclick = null; };
}

// ---------- Creativity ----------
function mountImprov(el, it, block, ctx) {
  let ctl = null; let stopFlag = false; let route = null;
  const newRoute = () => { route && route.stop(); route = makeRoute(); return route; };
  const p = ctx.player;
  let body = '';
  if (it.compose) body = `<div class="kbwrap tall">${renderKeyboard(60, 67, { labels: 'all' })}</div>
      <p class="tune" aria-live="polite">Your tune: <strong class="tn">(tap keys)</strong></p>
      <div class="row"><button class="btn" data-playback>▶ Play it back</button><button class="btn ghost" data-clear>Clear</button></div>`;
  else if (it.callResponse) body = `<div class="cr" aria-live="polite">Press start. Listen, then answer.</div>
      <div class="row"><button class="btn primary big" data-start>Start</button><button class="btn" data-stop>Stop</button></div>`;
  else if (it.dorian || it.pentatonic) body = `<div class="kbwrap">${renderKeyboard(50, 74, { labels: 'all', marks: Object.fromEntries((it.dorian ? [50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74] : [55, 57, 60, 62, 64, 67, 69, 72, 74]).map(m => [m, 'target'])) })}</div>
      <div class="row"><button class="btn primary big" data-start>▶ Start the band</button><button class="btn" data-stop>Stop</button></div>${volSlider(p)}`;
  else if (it.blues) body = `<div class="kbwrap">${renderKeyboard(48, 72, { labels: 'c', marks: Object.fromEntries([48, 51, 53, 54, 55, 58, 60, 63, 65, 66, 67, 70, 72].map(m => [m, 'target'])) })}</div>
      <div class="row"><button class="btn primary big" data-start>▶ Start the band</button><button class="btn" data-stop>Stop</button></div>${volSlider(p)}`;
  else body = `<div class="kbwrap">${renderKeyboard(54, 70, { labels: 'none', marks: Object.fromEntries([54, 56, 58, 61, 63, 66, 68, 70].map(m => [m, 'target'])) })}</div>
      <div class="row"><button class="btn primary big" data-start>▶ Start backing</button><button class="btn" data-stop>Stop</button></div>${volSlider(p)}`;
  el.innerHTML = `${header(it, 'Play for fun. No wrong answers.')}<p class="lesson-text">${esc(it.howto)}</p>${body}
    <button class="btn primary" data-done>I made some music ✓</button>`;
  bindVol(el, ctx);
  const tune = [];
  if (it.compose) {
    bindKeyboard($(el, '.kbwrap'), m => { if (tune.length < 8) { tune.push(m); playNote(m, { dur: 0.5 }); $(el, '.tn').textContent = tune.map(letterOf).join(' '); } });
  }
  const runBacking = async () => {
    await unlockAudio(); stopFlag = false;
    if (it.band) { ctl && ctl.stop(); ctl = schedulePlayback({ events: [], band: it.band, bandStyle: it.bandStyle, bpm: it.bpm, countIn: 1, metronome: false, loop: true }); return; }
    const spb = 60 / it.bpm; const c = audio(); let t = c.currentTime + 0.1;
    for (let bar = 0; bar < it.bars && !stopFlag; bar++) {
      const ch = it.chords[bar % it.chords.length];
      const r = bar === 0 ? newRoute() : route;
      r.run(() => { pad(ch, t, spb * 4); pad([ch[0] - 12], t, spb * 4); });
      t += spb * 4; await sleep(spb * 4000);
    }
  };
  const runCR = async () => {
    await unlockAudio(); stopFlag = false;
    const box = $(el, '.cr'); const spb = 60 / it.bpm;
    const calls = [[1, 1, 2], [0.5, 0.5, 1, 2], [1, 0.5, 0.5, 2], [2, 1, 1]];
    for (let r = 0; r < 4 && !stopFlag; r++) {
      const call = calls[r]; const c = audio(); let t = c.currentTime + 0.1;
      box.innerHTML = '<strong>Listen…</strong>';
      const rt = newRoute();
      rt.run(() => { for (let k = 0; k < 4; k++) click(t + k * spb, k === 0); let bt = t; call.forEach(d => { playNote(60, { when: bt, dur: d * spb * 0.9 }); bt += d * spb; }); });
      await sleep(spb * 4000); if (stopFlag) break;
      box.innerHTML = '<strong>Your turn!</strong> Answer on C, D, or E.';
      t = audio().currentTime + 0.02; route.run(() => { for (let k = 0; k < 4; k++) click(t + k * spb, k === 0); });
      await sleep(spb * 4000);
    }
    if (!stopFlag) box.textContent = 'Nice conversation! Press start for another round.';
  };
  el.onclick = e => {
    if (e.target.closest('[data-start]')) { it.callResponse ? runCR() : runBacking(); }
    if (e.target.closest('[data-stop]')) { stopFlag = true; ctl && ctl.stop(); ctl = null; route && route.stop(); route = null; }
    if (e.target.closest('[data-clear]')) { tune.length = 0; $(el, '.tn').textContent = '(tap keys)'; }
    if (e.target.closest('[data-playback]')) { const t = audio().currentTime + 0.05; tune.forEach((m, i) => playNote(m, { when: t + i * 0.45, dur: 0.42 })); }
    if (e.target.closest('[data-done]')) {
      stopFlag = true; ctl && ctl.stop(); route && route.stop();
      if (it.compose && tune.length) { p.compositions = p.compositions || []; p.compositions.push({ notes: tune.slice(), at: Date.now() }); }
      recordRating(p, block.id, 'clean');
      ctx.done({ miles: 8, skill: it.skill, xp: 5, summary: it.compose && tune.length ? `Saved your tune: ${tune.map(letterOf).join(' ')}` : 'Created something new' });
    }
  };
  return () => { stopFlag = true; el.onclick = null; ctl && ctl.stop(); route && route.stop(); };
}

// ---------- Piece helpers (shared with the app's mic check) ----------
// Which staff/notes the player sees for a view: 'rh' | 'lh' | 'ht' | duet part id
export function pieceView(piece, view) {
  const bpb = piece.beatsPerBar || 4;
  const base = { beatsPerBar: bpb, keySig: piece.keySig || null, timeBottom: piece.timeBottom || 4 };
  if (piece.duet) {
    const part = piece.duet.parts.find(x => x.id === view) || piece.duet.parts[0];
    const others = piece.duet.parts.filter(x => x !== part && !(part.id !== 'melody' && x.id !== 'melody'));
    return { ...base, staves: [{ notes: part.notes, clef: part.clef }], events: part.notes, accompany: others.length ? others[others.length - 1].notes : null, clef: part.clef };
  }
  if (piece.grand) {
    // one line of music shared between the hands: split each event onto treble (>= middle C) and bass staves
    const up = [], down = [];
    piece.notes.forEach((n, i) => {
      const ms = Array.isArray(n.midi) ? n.midi : [n.midi];
      const hi = ms.filter(m => m >= 60), lo = ms.filter(m => m < 60);
      if (hi.length) up.push({ ...n, midi: hi.length > 1 ? hi : hi[0], ix: i });
      if (lo.length) down.push({ ...n, midi: lo.length > 1 ? lo : lo[0], ix: i, finger: undefined });
    });
    return { ...base, staves: [{ notes: up, clef: 'treble' }, { notes: down, clef: 'bass' }], events: piece.notes, clef: 'treble', grand: true };
  }
  if (view === 'lh' && piece.lh) return { ...base, staves: [{ notes: piece.lh, clef: 'bass' }], events: piece.lh, clef: 'bass' };
  if (view === 'ht' && piece.lh) {
    const rh = piece.notes, lh = piece.lh;
    return { ...base, staves: [{ notes: rh, clef: piece.clef || 'treble' }, { notes: lh, clef: 'bass', idxBase: rh.length }], events: rh.concat(lh), clef: 'treble', together: true };
  }
  return { ...base, staves: [{ notes: piece.notes, clef: piece.clef || 'treble' }], events: piece.notes, clef: piece.clef || 'treble' };
}
// The notes a ticket inspection judges: the main part (right hand, or the chords / shells).
export function judgedNotes(piece) { return piece.duet ? piece.duet.parts[0].notes : piece.notes; }
export function pieceScore(piece, opts = {}) {
  const v = pieceView(piece, opts.view || 'rh');
  return renderScore(v.staves, { ...v, ...opts, barsPerLine: opts.barsPerLine || barsPerLine() });
}

// ---------- Piano practice (the core loop) ----------
function mountPiano(el, it, block, ctx) {
  const p = ctx.player;
  const st = itemState(p, block.id);
  const piece = it.piece ? PIECES[it.piece] : null;
  let repsHere = 0; let ctl = null; let falling = null; let phrase = null; let current = -1; let showGuide = true; let useBand = true;
  let view = piece && piece.duet ? (st.part || 'melody') : 'rh';
  let partner = true; let midiRec = null; let midiHeard = []; let take = null; let recRunning = false;

  if (!piece) {
    el.innerHTML = `${header(it, 'At the piano')}
      <p class="lesson-text">${esc(it.howto)}</p>
      <ul class="checks">${(it.selfCheck || []).map((t, i) => `<li><button class="chk" data-i="${i}" aria-pressed="false"><span class="box" aria-hidden="true"></span>${esc(t)}</button></li>`).join('')}</ul>
      ${rateRow()}<p class="fb" aria-live="polite"></p>`;
    el.onclick = e => {
      const c = e.target.closest('.chk'); if (c) c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      const r = e.target.closest('[data-rate]'); if (r) { const rating = r.dataset.rate; recordRating(p, block.id, rating); ctx.done({ rating, miles: milesFor(rating), skill: it.skill, xp: 5 }); }
    };
    return () => { el.onclick = null; };
  }

  if (st.reps === 0 && st.tempoPct == null && st.tempoStep === 0 && paceFast(p)) st.tempoStep = 2; // fast learners start at 80%
  const hp = hardestPhrase(p, block.id);
  if (hp !== null) phrase = hp;
  const level = () => p.readingLevel ?? (p.readsTreble ? 3 : 0);
  const hasChords = () => pieceView(piece, view).events.some(n => Array.isArray(n.midi) && new Set(n.midi.map(x => x % 12)).size > 1);

  // events for the current view + phrase, re-based so the phrase starts at bar 1
  const current_view = () => {
    const v = pieceView(piece, view);
    let ev = v.events.map((n, i) => ({ ...n, i }));
    let acc = v.accompany ? v.accompany.map(n => ({ ...n })) : null;
    let band = piece.band ? piece.band.map(c => ({ ...c })) : null;
    const bpb = v.beatsPerBar;
    if (phrase !== null && piece.phrases && (view === 'rh' || view === 'melody' || view === 'ht')) {
      const [a, b] = piece.phrases[phrase];
      const rhSel = (v.together ? piece.notes : v.events).slice(a, b + 1);
      const from = Math.floor(rhSel[0].beat / bpb) * bpb; const to = rhSel[rhSel.length - 1].beat + rhSel[rhSel.length - 1].dur;
      const inRange = n => n.beat >= from - 1e-6 && n.beat < to - 1e-6;
      ev = ev.filter(inRange); if (acc) acc = acc.filter(inRange); if (band) band = band.filter(inRange);
      const sh = n => ({ ...n, beat: n.beat - from });
      ev = ev.map(sh); if (acc) acc = acc.map(sh); if (band) band = band.map(sh);
    }
    return { ...v, ev, acc, band };
  };
  const pct = () => st.tempoPct ?? TEMPO_LADDER[st.tempoStep];
  const bpm = () => Math.round(piece.bpm * pct());

  const viewChoices = () => {
    if (piece.duet) return piece.duet.parts.map(x => [x.id, x.name]);
    if (piece.lh) return [['rh', 'Right hand'], ['lh', 'Left hand'], ['ht', 'Hands together']];
    return null;
  };
  const staffHtml = (cv) => renderScore(cv.grand ? grandStaves(cv) : cv.ev.length && cv.together ? splitStaves(cv) : [{ notes: cv.ev, clef: cv.clef }],
    { beatsPerBar: cv.beatsPerBar, keySig: cv.keySig, timeBottom: cv.timeBottom, letters: level() <= 2 && !hasChords() && !cv.grand, barsPerLine: barsPerLine(), current, fingers: level() <= 1 });
  const grandStaves = cv => {
    const up = [], down = [];
    cv.ev.forEach((n, k) => {
      const ms = Array.isArray(n.midi) ? n.midi : [n.midi];
      const hi = ms.filter(m => m >= 60), lo = ms.filter(m => m < 60);
      if (hi.length) up.push({ ...n, midi: hi.length > 1 ? hi : hi[0], ix: k });
      if (lo.length) down.push({ ...n, midi: lo.length > 1 ? lo : lo[0], ix: k, finger: undefined });
    });
    return [{ notes: up, clef: 'treble' }, { notes: down, clef: 'bass' }];
  };
  const splitStaves = cv => {
    const rh = cv.ev.filter(n => n.i < piece.notes.length); const lh = cv.ev.filter(n => n.i >= piece.notes.length);
    return [{ notes: rh, clef: piece.clef || 'treble' }, { notes: lh, clef: 'bass', idxBase: rh.length }];
  };

  const render = () => {
    const L = level();
    const cv = current_view();
    const evs = cv.ev;
    const fingers = {}; evs.forEach(n => { if (n.finger && !Array.isArray(n.midi) && fingers[n.midi] === undefined) fingers[n.midi] = n.finger; });
    const showStaff = L >= 1 || hasChords();
    const showFalling = L <= 1;
    const kbLabels = L <= 1 ? 'all' : 'c';
    const vc = viewChoices();
    const lo = piece.range[0], hi = piece.range[1];
    el.innerHTML = `${header(it, esc(piece.credit || (piece.hand === 'LH' ? 'Left hand' : piece.hand === 'RH' ? 'Right hand' : '')))}
      <p class="lesson-text small">${esc(it.howto)}${piece.lhNote && view !== 'rh' ? ' ' + esc(piece.lhNote) : ''}</p>
      <div class="pv"><div class="pv-music">
      ${vc ? `<div class="seg" role="group" aria-label="${piece.duet ? 'Your part' : 'Hands'}">${vc.map(([id, name]) => `<button class="${view === id ? 'on' : ''}" data-view="${id}">${esc(name)}</button>`).join('')}</div>` : ''}
      ${piece.phrases && view !== 'lh' && !(piece.duet && view !== 'melody') ? `<div class="seg" role="group" aria-label="Choose section">
        <button class="${phrase === null ? 'on' : ''}" data-ph="all">Whole</button>
        ${piece.phrases.map((_, i) => `<button class="${phrase === i ? 'on' : ''}" data-ph="${i}">Phrase ${i + 1}${hp === i ? ' ★' : ''}</button>`).join('')}
      </div>` : ''}
      ${showStaff ? `<div class="staffwrap">${staffHtml(cv)}</div>` : ''}
      ${showFalling ? '<canvas class="falling" aria-hidden="true"></canvas>' : ''}
      ${L <= 2 || hasChords() ? `<div class="kbwrap">${renderKeyboard(lo, hi, { labels: kbLabels, fingers: L <= 1 ? fingers : {} })}</div>` : ''}
      </div><div class="pv-ctl">
      <div class="chips">
        <button class="chip" data-level title="Change reading help">👁 ${READING_LEVELS[L].name}</button>
        <span class="chip static" aria-label="Clean in a row">${'●'.repeat(st.cleanStreak)}${'○'.repeat(3 - st.cleanStreak)} clean in a row</span>
        ${midiConnected() ? '<span class="chip static">🎹 Keyboard: auto-check on</span>' : ''}
      </div>
      <label class="tempo">Tempo <strong data-tv>${Math.round(pct() * 100)}% · ${bpm()} bpm</strong>
        <input type="range" min="40" max="140" step="5" value="${Math.round(pct() * 100)}" data-tempo aria-label="Tempo percent">
        <small class="muted">Suggested: ${Math.round(TEMPO_LADDER[st.tempoStep] * 100)}%. Three clean tries in a row moves it up.</small></label>
      <div class="row ctl">
        <button class="btn" data-listen>▶ Listen</button>
        <button class="btn primary" data-along>Play along</button>
        <button class="btn" data-stop aria-label="Stop">■</button>
      </div>
      <label class="tog"><input type="checkbox" data-guide ${showGuide ? 'checked' : ''}> Guide notes play with me</label>
      ${piece.duet ? `<label class="tog"><input type="checkbox" data-partner ${partner ? 'checked' : ''}> Virtual partner plays the other part</label>` : ''}
      ${piece.band ? `<label class="tog"><input type="checkbox" data-band ${useBand ? 'checked' : ''}> Band plays along</label>${volSlider(p)}` : ''}
      <p class="muted small">After each try, rate it honestly:</p>
      ${rateRow()}
      <p class="fb" aria-live="polite"></p>
      ${recSupported() ? `<div class="take">${take ? `<p class="small"><strong>Your take</strong> (${take.when}). Listen for evenness and steady beat.</p>
        <audio controls src="${take.url}"></audio>
        <div class="row"><button class="btn sm" data-compare>▶ Target, then me</button><button class="btn sm" data-share>Save / share</button><button class="btn sm ghost" data-rec>⏺ Record again</button></div>`
        : '<button class="btn ghost" data-rec>⏺ Record a take</button>'}</div>` : ''}
      <div class="row"><button class="btn ghost" data-quick>${midiConnected() ? '🎹' : '🎤'} Quick listen</button><button class="btn ghost" data-next>${repsHere >= 3 ? 'Next ›' : 'Done with this'}</button></div>
      </div></div>`;
    if (showFalling) {
      const cvs = $(el, 'canvas.falling');
      falling && falling.stop();
      const fe = evs.concat(cv.acc && partner && piece.duet ? cv.acc.map(n => ({ ...n, other: true })) : []);
      falling = fallingNotes(cvs, { events: fe, lo, hi, getBeat: () => { if (!ctl) return -0.5; let b = (audio().currentTime - ctl.musicStart) / ctl.spb; if (ctl.loop && b >= 0) b %= ctl.lengthBeats; return b; }, lookahead: 4 });
    }
    const kb = $(el, '.kbwrap'); if (kb) bindKeyboard(kb, m => playNote(m, { dur: 0.6 }));
  };
  const stop = () => { ctl && ctl.stop(); ctl = null; current = -1; if (midiRec) { midiRec.stop(); midiRec = null; } if (recRunning) finishRec(); };
  const finishRec = async () => {
    recRunning = false;
    const blob = await stopRec();
    if (!blob) { ctx.toast('Recording did not work on this device.'); return; }
    if (take) URL.revokeObjectURL(take.url);
    take = { blob, url: URL.createObjectURL(blob), when: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) };
    render(); ctx.toast('Take recorded. Listen back, then rate it.');
  };
  const record = async () => {
    stop();
    try { await unlockAudio(); await startRec(); } catch { ctx.toast('Microphone blocked, so recording is not available.'); return; }
    recRunning = true;
    const g = showGuide; showGuide = false;
    await run('along', true);
    showGuide = g;
    const b = $(el, '[data-rec]'); if (b) { b.textContent = '⏺ Recording… tap ■ to stop'; b.classList.add('recording'); }
  };
  const run = async (mode, keepRec = false) => {
    await unlockAudio();
    if (!keepRec) stop(); else { ctl && ctl.stop(); ctl = null; }
    const cv = current_view();
    const ev = cv.ev;
    const playNotes = mode === 'listen' || showGuide;
    const accompany = piece.duet && partner ? cv.acc : null;
    const band = piece.band && useBand ? cv.band : null;
    const autoCheck = mode === 'along' && midiConnected() && !keepRec;
    if (autoCheck) { midiHeard = []; midiRec = listenMIDI(e => midiHeard.push(e)); }
    ctl = schedulePlayback({ events: ev, bpm: bpm(), beatsPerBar: cv.beatsPerBar, countIn: mode === 'listen' ? 0 : 1, metronome: mode !== 'listen' && !band, playNotes,
      loop: phrase !== null && mode === 'along' && !autoCheck && !keepRec, accompany, band, bandStyle: piece.bandStyle, swing: !!piece.swing,
      onNote: i => { current = i; updateCursor(); },
      onEnd: () => {
        current = -1; updateCursor(); ctl = null;
        if (recRunning) setTimeout(() => { if (recRunning) finishRec(); }, 900);
        if (autoCheck && midiRec) {
          midiRec.stop(); midiRec = null;
          const r = judge(ev, midiHeard);
          if (r.verdict !== 'unclear') { rate(r.verdict, true); $(el, '.fb').innerHTML += '<br>' + r.messages.map(esc).join(' '); }
        }
      } });
  };
  const updateCursor = () => {
    const sw = $(el, '.staffwrap'); if (!sw) return;
    sw.innerHTML = staffHtml(current_view());
  };
  el.onclick = e => {
    const t = e.target;
    if (t.closest('[data-listen]')) run('listen');
    else if (t.closest('[data-along]')) run('along');
    else if (t.closest('[data-stop]')) stop();
    else if (t.closest('[data-level]')) { stop(); p.readingLevel = (level() + 1) % 4; ctx.save(); render(); ctx.toast(`Reading help: ${READING_LEVELS[level()].name}`); }
    else if (t.closest('[data-ph]')) { stop(); const v = t.closest('[data-ph]').dataset.ph; phrase = v === 'all' ? null : +v; render(); }
    else if (t.closest('[data-view]')) { stop(); view = t.closest('[data-view]').dataset.view; if (piece.duet) { st.part = view; ctx.save(); } render(); }
    else if (t.closest('[data-rate]')) rate(t.closest('[data-rate]').dataset.rate);
    else if (t.closest('[data-next]')) { stop(); finish(); }
    else if (t.closest('[data-rec]')) { if (!recRunning) record(); }
    else if (t.closest('[data-share]')) { if (take) shareTake(take.blob, `${p.name} - ${piece.title}`).catch(() => {}); }
    else if (t.closest('[data-compare]')) {
      if (!take) return;
      run('listen');
      const ms = (Math.max(...current_view().ev.map(n => n.beat + n.dur)) * 60 / bpm() + 0.8) * 1000;
      setTimeout(() => { const a = $(el, '.take audio'); if (a) { a.currentTime = 0; a.play(); } }, ms);
    }
    else if (t.closest('[data-quick]')) { stop(); ctx.openMicCheck({ pieceId: it.piece, itemId: block.id, quick: true, onResult: r => { if (r && r.verdict !== 'unclear') rate(r.verdict, true); } }); }
  };
  el.onchange = e => {
    if (e.target.matches('[data-guide]')) showGuide = e.target.checked;
    if (e.target.matches('[data-partner]')) { partner = e.target.checked; render(); }
    if (e.target.matches('[data-band]')) useBand = e.target.checked;
    if (e.target.matches('[data-tempo]')) { stop(); st.tempoPct = +e.target.value / 100; ctx.save(); }
  };
  el.oninput = e => { if (e.target.matches('[data-tempo]')) { const v = +e.target.value; $(el, '[data-tv]').textContent = `${v}% · ${Math.round(piece.bpm * v / 100)} bpm`; } };
  bindVol(el, ctx);
  let ratings = [];
  const rate = (rating, fromMic = false) => {
    stop();
    const L = level();
    const { tempoUp } = recordRating(p, block.id, rating, Date.now(), { tempoBased: true });
    if (phrase !== null && rating !== 'clean') { st.phraseRatings = st.phraseRatings || {}; st.phraseRatings[phrase] = (st.phraseRatings[phrase] || 0) + (rating === 'notyet' ? 2 : 1); }
    if (rating === 'clean') { p.readingStats = p.readingStats || {}; p.readingStats[L] = (p.readingStats[L] || 0) + 1; }
    if (!fromMic) p.honesty.selfClean += rating === 'clean' ? 1 : 0;
    repsHere++; ratings.push(rating);
    ctx.save();
    let msg = rating === 'clean' ? '<span class="ok">✓ Clean!</span>' : rating === 'nearly' ? '<span class="ok">Nearly. Partial credit.</span>' : '<span class="no">Not yet, and that is normal.</span>';
    if (fromMic && midiConnected()) msg = '🎹 ' + msg;
    if (tempoUp) msg += ' Three clean in a row: <strong>tempo up!</strong> 🚂';
    else if (rating === 'notyet') msg += piece.phrases && phrase === null ? ' Try looping just one phrase, or slow down.' : piece.lh && view === 'ht' ? ' Go back to hands separate for a few tries, then rejoin.' : ' Slow it down and keep it smooth. Speed comes later.';
    else if (rating === 'nearly') msg += ' Same speed again. Aim for smooth.';
    if (rating === 'clean' && piece.lh && view !== 'ht' && st.cleanStreak >= 2) msg += ' Ready to try <strong>hands together</strong> (slowly)?';
    if (rating === 'clean' && L <= 1 && !hasChords() && (p.readingStats[L] || 0) >= 3) msg += ' You are ready for less help. Tap 👁 to read more of the music yourself.';
    render();
    $(el, '.fb').innerHTML = msg;
  };
  const finish = () => {
    const order = { clean: 2, nearly: 1, notyet: 0 };
    const best = ratings.slice().sort((a, b) => order[b] - order[a])[0] || null;
    ctx.done({ rating: best, miles: ratings.reduce((s2, r) => s2 + milesFor(r), 0) || 3, skill: it.skill, xp: 3 + ratings.length * 2, summary: ratings.length ? `${ratings.length} tries · tempo ${Math.round(pct() * 100)}%` : 'Looked it over' });
  };
  render();
  if (hp !== null) $(el, '.fb').innerHTML = `Start with <strong>Phrase ${hp + 1}</strong>. It has been the trickiest spot.`;
  return () => { stop(); falling && falling.stop(); if (take) URL.revokeObjectURL(take.url); el.onclick = null; el.onchange = null; el.oninput = null; };
}

// ---------- Chord building (touch, objective) ----------
const NOTE_PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
function mountChordQuiz(el, it, block, ctx) {
  let n = 0, right = 0; let picked = new Set(); let firstTry = true;
  const qs = shuffle(it.chords).slice(0, it.count);
  while (qs.length < it.count) qs.push(it.chords[qs.length % it.chords.length]);
  const render = () => {
    const name = qs[n]; const need = CHORD_SPELL[name];
    el.innerHTML = `${header(it, `Chord ${n + 1} of ${it.count}`)}
      <div class="qprompt">Tap the ${need.length} notes of <strong>${esc(name)}</strong> (any order, any octave).</div>
      <div class="kbwrap tall">${renderKeyboard(48, 71, { labels: n === 0 && !firstTry ? 'all' : 'c' })}</div>
      <p class="picked" aria-live="polite">Picked: <strong>${[...picked].map(pc => letterOf(pc + 60)).join(' ') || '—'}</strong></p>
      <div class="row"><button class="btn" data-clear>Clear</button><button class="btn" data-hear>▶ Hear it</button><button class="btn primary" data-check ${picked.size === need.length ? '' : 'disabled'}>Check</button></div>
      <p class="fb" aria-live="polite"></p>`;
    bindKeyboard($(el, '.kbwrap'), m => {
      const pc = m % 12; playNote(m, { dur: 0.5 });
      if (picked.has(pc)) picked.delete(pc); else if (picked.size < need.length) picked.add(pc);
      $(el, '.picked strong').textContent = [...picked].map(x => letterOf(x + 60)).join(' ') || '—';
      $(el, '[data-check]').disabled = picked.size !== need.length;
    });
  };
  el.onclick = e => {
    const name = qs[n]; const need = CHORD_SPELL[name];
    if (e.target.closest('[data-clear]')) { picked = new Set(); render(); }
    if (e.target.closest('[data-hear]')) { const root = 48 + need[0] + (need[0] < 5 ? 12 : 0); const t = audio().currentTime + 0.05; need.forEach((pc, i) => playNote(root + ((pc - need[0] + 12) % 12), { when: t, dur: 1.5 })); }
    if (e.target.closest('[data-check]')) {
      const ok = need.every(pc => picked.has(pc));
      const fb = $(el, '.fb');
      if (ok) {
        if (firstTry) right++;
        fb.innerHTML = `<span class="ok">✓ ${esc(name)} = ${need.map(pc => letterOf(pc + 60)).join(' ')}</span>`;
        setTimeout(() => { n++; picked = new Set(); firstTry = true; if (n >= it.count) end(); else render(); }, 1100);
      } else {
        firstTry = false;
        const missing = need.filter(pc => !picked.has(pc)).length;
        fb.innerHTML = `<span class="no">✕ Not quite.</span> ${missing} note${missing > 1 ? 's are' : ' is'} off. ` + (name.includes('rootless')
          ? `No root here: start on ${letterOf(need[0] + 60)} and stack the chord's 3rd, 5th or 13th, 7th and 9th.`
          : `Start on ${letterOf(need[0] + 60)} and skip every other key${need.length === 4 ? ', four notes' : ''}. ${name.includes('m') && !name.includes('maj') ? 'Minor: the middle note is one key lower.' : ''}`);
      }
    }
  };
  const end = () => {
    const score = right / it.count; const rating = ratingFromScore(score);
    recordRating(ctx.player, block.id, rating);
    ctx.done({ rating, score, miles: milesFor(rating), skill: it.skill, xp: Math.round(6 * score) + 2, summary: `${right} of ${it.count} on the first try` });
  };
  render();
  return () => { el.onclick = null; };
}
void NOTE_PC;

// ---------- Multiple choice (Nashville numbers) ----------
function mountChoice(el, it, block, ctx) {
  let n = 0, right = 0;
  const make = () => {
    const keys = Object.keys(KEYS_NASHVILLE); const key = keys[Math.floor(Math.random() * keys.length)];
    const nums = ['1', '2m', '3m', '4', '5', '6m']; const i = [0, 3, 4, 5][Math.floor(Math.random() * 4)];
    const ans = KEYS_NASHVILLE[key][i];
    if (Math.random() < 0.5) return { q: `In the key of <strong>${key}</strong>, what is the <strong>${nums[i]}</strong> chord?`, ans, opts: shuffle([ans, ...shuffle(KEYS_NASHVILLE[key].filter(c => c !== ans)).slice(0, 3)]) };
    return { q: `In the key of <strong>${key}</strong>, <strong>${ans}</strong> is which number?`, ans: nums[i], opts: shuffle([nums[i], ...shuffle(nums.filter(x => x !== nums[i])).slice(0, 3)]) };
  };
  let q = null;
  const render = () => {
    q = make();
    el.innerHTML = `${header(it, `Question ${n + 1} of ${it.count}`)}<div class="qprompt">${q.q}</div>
      <div class="opts letters">${q.opts.map(o => `<button class="opt" data-a="${esc(o)}">${esc(o)}</button>`).join('')}</div><p class="fb" aria-live="polite"></p>
      <p class="muted small">Tip: count up the scale. In G: G(1) A(2) B(3) C(4) D(5) E(6).</p>`;
  };
  el.onclick = e => {
    const a = e.target.closest('[data-a]'); if (!a || a.disabled) return;
    el.querySelectorAll('[data-a]').forEach(b => { b.disabled = true; });
    const ok = a.dataset.a === q.ans; if (ok) right++;
    $(el, '.fb').innerHTML = ok ? '<span class="ok">✓ Yes!</span>' : `<span class="no">✕ It's ${esc(q.ans)}.</span>`;
    setTimeout(() => { n++; if (n >= it.count) end(); else render(); }, ok ? 800 : 1800);
  };
  const end = () => {
    const score = right / it.count; const rating = ratingFromScore(score);
    recordRating(ctx.player, block.id, rating);
    ctx.done({ rating, score, miles: milesFor(rating), skill: it.skill, xp: Math.round(6 * score) + 2, summary: `${right} of ${it.count} right` });
  };
  render();
  return () => { el.onclick = null; };
}

// ---------- Sight-reading ----------
// Fresh music every time. Look first, then play once without hearing it, then compare.
function mountSight(el, it, block, ctx) {
  const p = ctx.player;
  p.sight = p.sight || { level: p.readsTreble ? 3 : 1, streak: 0, misses: 0 };
  let n = 0, results = [], piece = null, timer = null, ctl = null;
  const newPiece = () => { piece = generateSight(p.sight.level); PIECES['sight:cur'] = piece; };
  const render = () => {
    const L = SIGHT_LEVELS[p.sight.level];
    el.innerHTML = `${header(it, `${L.name}: ${esc(L.desc)} · ${n + 1} of ${it.count}`)}
      <p class="lesson-text small">Look before you play: the key signature, the time signature, the rhythm, the highest and lowest notes. Then play it once, steadily, without stopping, even if you miss a note.</p>
      <div class="staffwrap">${renderScore([{ notes: piece.notes, clef: 'treble' }], { beatsPerBar: piece.beatsPerBar, keySig: piece.keySig, barsPerLine: barsPerLine(), letters: p.sight.level === 1 && (p.readingLevel ?? 0) <= 1 })}</div>
      <div class="count" aria-live="polite">Study it: <span data-cd>20</span>s</div>
      <div class="row"><button class="btn primary" data-mic>🎤 Play it for the conductor</button><button class="btn" data-clicks>Count-in only</button></div>
      <p class="muted small">Or rate yourself after playing:</p>${rateRow()}
      <p class="fb" aria-live="polite"></p>
      <div class="row"><button class="btn ghost" data-hear>▶ Hear it (after you play)</button></div>`;
    let left = 20; clearInterval(timer);
    timer = setInterval(() => { left--; const cd = $(el, '[data-cd]'); if (cd) cd.textContent = Math.max(0, left); if (left <= 0) { clearInterval(timer); const c = $(el, '.count'); if (c) c.textContent = 'Ready when you are.'; } }, 1000);
  };
  const rate = (rating) => {
    clearInterval(timer); ctl && ctl.stop();
    results.push(rating);
    const S0 = p.sight;
    if (rating === 'clean') { S0.streak++; S0.misses = 0; if (S0.streak >= 3 && S0.level < 4) { S0.level++; S0.streak = 0; ctx.toast(`📖 Sight-reading ${SIGHT_LEVELS[S0.level].name} unlocked!`); } }
    else if (rating === 'notyet') { S0.streak = 0; S0.misses++; if (S0.misses >= 2 && S0.level > 1) { S0.level--; S0.misses = 0; } }
    else S0.streak = 0;
    recordRating(p, block.id, rating); ctx.save();
    $(el, '.fb').innerHTML = rating === 'clean' ? '<span class="ok">✓ Read it cleanly!</span>' : rating === 'nearly' ? '<span class="ok">Nearly.</span> Tap ▶ Hear it to compare.' : '<span class="no">Tough one.</span> Hear it, then try the next.';
    el.querySelectorAll('[data-rate],[data-mic]').forEach(b => { b.disabled = true; });
    const next = document.createElement('button'); next.className = 'btn primary big'; next.textContent = n + 1 >= it.count ? 'Finish' : 'Next piece ›';
    next.onclick = () => { n++; if (n >= it.count) finish(); else { newPiece(); render(); } };
    $(el, '.fb').after(next);
  };
  const finish = () => {
    const order = { clean: 2, nearly: 1, notyet: 0 };
    const avg = results.reduce((s, r) => s + order[r], 0) / Math.max(1, results.length);
    const rating = avg >= 1.6 ? 'clean' : avg >= 0.8 ? 'nearly' : 'notyet';
    ctx.done({ rating, miles: results.reduce((s, r) => s + milesFor(r), 0), skill: 'reading', xp: 4 + results.length * 3, summary: `${SIGHT_LEVELS[p.sight.level].name} · ${results.filter(r => r === 'clean').length} of ${results.length} clean` });
  };
  el.onclick = async e => {
    if (e.target.closest('[data-mic]')) { clearInterval(timer); ctx.openMicCheck({ pieceId: 'sight:cur', quick: true, onResult: r => { if (r && r.verdict !== 'unclear') rate(r.verdict); } }); }
    if (e.target.closest('[data-clicks]')) { await unlockAudio(); ctl && ctl.stop(); ctl = schedulePlayback({ events: piece.notes, bpm: piece.bpm, beatsPerBar: piece.beatsPerBar, countIn: 1, metronome: true, playNotes: false }); }
    if (e.target.closest('[data-hear]')) { await unlockAudio(); ctl && ctl.stop(); ctl = schedulePlayback({ events: piece.notes, bpm: piece.bpm, beatsPerBar: piece.beatsPerBar, countIn: 0, metronome: false, playNotes: true }); }
    const r = e.target.closest('[data-rate]'); if (r && !r.disabled) rate(r.dataset.rate);
  };
  newPiece(); render();
  return () => { clearInterval(timer); ctl && ctl.stop(); el.onclick = null; };
}

// ---------- Follow the leader (live chord cues over a band) ----------
// The band plays; every two bars the "leader" calls the next chord one bar ahead, like a worship leader would.
function mountCues(el, it, block, ctx) {
  const p = ctx.player;
  let route = null, timers = [], running = false;
  const CALLS = ['To the {n}!', 'Go to {n}', '{n} chord!', 'Next: {n}'];
  el.innerHTML = `${header(it, 'Play along and follow the calls')}
    <p class="lesson-text small">The band starts on the 1. Every two bars the leader calls the next chord a bar early. Switch right on beat 1. Hold the chord (or pulse it) with the band.</p>
    <div class="cuebox" aria-live="assertive"><div class="cue-now">Ready</div><div class="cue-name">&nbsp;</div><div class="cue-next">&nbsp;</div><div class="cue-beat">&nbsp;</div></div>
    <div class="row"><button class="btn primary big" data-go>▶ Start the band</button><button class="btn" data-stop>■ Stop</button></div>
    ${volSlider(p)}
    <div class="cue-key muted small">Key of ${esc(it.key)}: ${it.chords.map(c => `<strong>${esc(c.num)}</strong> = ${esc(c.name)}`).join(' · ')}</div>
    <div class="after" hidden><p class="muted small">How did you follow?</p>${rateRow()}</div>`;
  bindVol(el, ctx);
  const box = { now: $(el, '.cue-now'), name: $(el, '.cue-name'), next: $(el, '.cue-next'), beat: $(el, '.cue-beat') };
  const stopAll = () => { running = false; route && route.stop(); route = null; timers.forEach(clearTimeout); timers = []; };
  const start = async () => {
    await unlockAudio(); stopAll(); running = true; $(el, '.after').hidden = true;
    const c = audio(); const spb = 60 / it.bpm; const t0 = c.currentTime + 0.3; route = makeRoute();
    // count-in
    route.run(() => { for (let k = 0; k < 4; k++) click(t0 + k * spb, k === 0); });
    const at = (t, fn) => timers.push(setTimeout(() => running && fn(), Math.max(0, (t - c.currentTime) * 1000)));
    at(t0, () => { box.now.textContent = 'Count-in…'; box.name.textContent = ''; box.next.textContent = ''; });
    const start1 = t0 + 4 * spb;
    let cur = it.chords[0];
    const plan = [cur];
    for (let i = 1; i < it.segments; i++) {
      if (i === it.segments - 1) { plan.push(it.chords[0]); break; }
      const opts = it.chords.filter(ch => ch !== plan[plan.length - 1]);
      plan.push(Math.random() < 0.15 ? plan[plan.length - 1] : opts[Math.floor(Math.random() * opts.length)]);
    }
    plan.forEach((ch, i) => {
      const segStart = start1 + i * 8 * spb;
      const root = toMidi(ch.root);
      route.run(() => scheduleBand([{ beat: 0, dur: 8, root, minor: !!ch.minor }], { start: segStart, spb, style: it.style, beatsPerBar: 4, lengthBeats: i === plan.length - 1 ? 4 : 8 }));
      at(segStart, () => { box.now.textContent = ch.num; box.name.textContent = ch.name; box.next.textContent = i === plan.length - 1 ? 'Hold it… and end.' : ''; box.now.parentElement.classList.add('flash'); setTimeout(() => box.now.parentElement.classList.remove('flash'), 300); });
      for (let b = 0; b < 8; b++) at(segStart + b * spb, () => { box.beat.textContent = `bar ${Math.floor(b / 4) + 1} · beat ${(b % 4) + 1}`; });
      const nx = plan[i + 1];
      if (nx) at(segStart + 4 * spb, () => {
        const last = i + 1 === plan.length - 1;
        box.next.textContent = last ? 'Last time… end on 1!' : nx === ch ? 'Again!' : CALLS[Math.floor(Math.random() * CALLS.length)].replace('{n}', nx.num);
      });
    });
    at(start1 + ((plan.length - 1) * 8 + 4) * spb + 0.5, () => { running = false; box.now.textContent = '✓'; box.name.textContent = 'Nice playing!'; box.next.textContent = ''; box.beat.textContent = ''; $(el, '.after').hidden = false; });
  };
  el.onclick = e => {
    if (e.target.closest('[data-go]')) start();
    if (e.target.closest('[data-stop]')) { stopAll(); box.now.textContent = 'Stopped'; $(el, '.after').hidden = false; }
    const r = e.target.closest('[data-rate]');
    if (r) { stopAll(); const rating = r.dataset.rate; recordRating(p, block.id, rating); ctx.done({ rating, miles: milesFor(rating) + 4, skill: it.skill, xp: 7, summary: 'Followed the leader' }); }
  };
  return () => { stopAll(); el.onclick = null; };
}

// ---------- Play it by ear (echo) ----------
// The app plays a short melody; the player finds it on the keyboard (screen or real piano, then taps it here).
function mountEcho(el, it, block, ctx) {
  const pool = [60, 62, 64, 67, 69, 72]; // C pentatonic: always sounds musical
  let n = 0, right = 0, tune = [], got = [], tries = 0;
  const make = () => {
    const len = Math.min(6, (it.start || 3) + Math.floor(n / 2));
    let m = 60; const t = [60];
    for (let k = 1; k < len; k++) { const i = Math.max(0, Math.min(pool.length - 1, pool.indexOf(m) + [-2, -1, 1, 1, 2][Math.floor(Math.random() * 5)])); m = pool[i]; t.push(m); }
    return t;
  };
  const play = async () => { await unlockAudio(); const t0 = audio().currentTime + 0.05; tune.forEach((m, i) => playNote(m, { when: t0 + i * 0.5, dur: 0.45 })); };
  const render = () => {
    el.innerHTML = `${header(it, `Melody ${n + 1} of ${it.count} · ${tune.length} notes`)}
      <p class="lesson-text">Listen, sing it back, then find it. It always starts on <strong>C</strong>. Try it on the real piano first, then tap it here.</p>
      <button class="btn big" data-play>▶ Play the melody</button>
      <div class="kbwrap tall">${renderKeyboard(57, 74, { labels: 'c' })}</div>
      <p class="picked" aria-live="polite">${got.map((m, i) => `<span class="${m === tune[i] ? 'ok' : 'no'}">${m === tune[i] ? '✓' : '✕'} ${esc(letterOf(m))}</span>`).join(' ') || '&nbsp;'}</p>
      <p class="fb" aria-live="polite"></p>`;
    bindKeyboard($(el, '.kbwrap'), m => {
      playNote(m, { dur: 0.45 });
      if (got.length >= tune.length) return;
      got.push(m);
      const i = got.length - 1;
      if (m !== tune[i]) {
        tries++;
        $(el, '.fb').innerHTML = `<span class="no">✕ Not that one.</span> ${tune[i] > (got[i - 1] ?? 60) ? 'It goes up.' : tune[i] < (got[i - 1] ?? 60) ? 'It goes down.' : 'It repeats.'} Listen again and start over.`;
        setTimeout(() => { got = []; render(); }, 1200);
        return;
      }
      $(el, '.picked').innerHTML = got.map(x => `<span class="ok">✓ ${esc(letterOf(x))}</span>`).join(' ');
      if (got.length === tune.length) {
        if (tries === 0) right++;
        $(el, '.fb').innerHTML = '<span class="ok">✓ You played it by ear!</span>';
        setTimeout(() => { n++; if (n >= it.count) end(); else { tune = make(); got = []; tries = 0; render(); play(); } }, 1100);
      }
    });
  };
  el.onclick = e => { if (e.target.closest('[data-play]')) play(); };
  const end = () => {
    const score = right / it.count; const rating = ratingFromScore(score);
    recordRating(ctx.player, block.id, rating);
    ctx.done({ rating, score, miles: milesFor(rating), skill: 'ear', xp: Math.round(8 * score) + 3, summary: `${right} of ${it.count} on the first try` });
  };
  tune = make(); render(); play();
  return () => { el.onclick = null; };
}

function rateRow() {
  return `<div class="rate" role="group" aria-label="Rate your try">
    <button class="btn r-clean" data-rate="clean">✓ Clean</button>
    <button class="btn r-nearly" data-rate="nearly">≈ Nearly</button>
    <button class="btn r-notyet" data-rate="notyet">↻ Not yet</button></div>`;
}

// ---------- Ticket inspection ----------
function mountCheckpoint(el, it, block, ctx) {
  const piece = PIECES[it.piece];
  el.innerHTML = `${header(it, piece.lh ? 'The conductor listens once to the right hand. Read it from the music.' : 'The conductor listens once. Read it from the music.')}
    <div class="staffwrap">${pieceScore(piece, { letters: (ctx.player.readingLevel ?? 0) <= 2 && !piece.grand && !judgedNotes(piece).some(n => Array.isArray(n.midi)) })}</div>
    <p class="lesson-text small">Put your phone on the music stand. Play at any comfortable, steady speed. Clean, steady notes matter more than speed.</p>
    <button class="btn primary big" data-mic>🎤 Start inspection</button>
    <button class="btn ghost" data-paper>No mic right now: use a paper ticket</button>`;
  el.onclick = e => {
    if (e.target.closest('[data-mic]')) ctx.openMicCheck({ pieceId: it.piece, itemId: block.id, checkpoint: true, onResult: r => { if (r) ctx.done({ checkpoint: true, verdict: r.verdict, result: r }); } });
    if (e.target.closest('[data-paper]')) {
      el.innerHTML = `${header(it, 'Paper ticket')}
        <p class="lesson-text">Play it once, as if the conductor were listening. Then rate it honestly. The conductor will listen in next time.</p>
        ${rateRow()}`;
      el.onclick = ev => { const r = ev.target.closest('[data-rate]'); if (r) ctx.done({ checkpoint: true, verdict: r.dataset.rate, paper: true }); };
    }
  };
  return () => { el.onclick = null; };
}
