// Renderers for each kind of practice block. Each mount() returns a cleanup function.
// ctx: { player, done(result), save(), toast(msg), openMicCheck(opts) }
import { ITEMS, PIECES, POSTURE, TIPS, TEMPO_LADDER, READING_LEVELS, parse } from './content.js';
import { renderStaff, renderKeyboard, bindKeyboard, fallingNotes, letterOf } from './notation.js';
import { playNote, schedulePlayback, audio, pad, click, unlockAudio } from './audio.js';
import { recordRating, ratingFromScore, itemState, hardestPhrase, milesFor, shuffle } from './engine.js';

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
    default: el.innerHTML = '<p>Unknown block</p>'; return () => {};
  }
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
    if (sl.staff) vis = `<div class="staffwrap">${renderStaff(parse(sl.staff.notes), { letters: sl.staff.letters, barsPerLine: barsPerLine() })}</div>`;
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
  const notes = it.pattern.map((d, i) => ({ midi: 71, beat: onsets[i], dur: d }));
  let tries = 0, best = 0, ctl = null, taps = [], musicStart = 0, listening = false;
  const spb = 60 / it.bpm;
  el.innerHTML = `${header(it, esc(it.intro))}
    <div class="staffwrap">${renderStaff(notes, { barsPerLine: barsPerLine() })}</div>
    <div class="count" aria-live="polite">&nbsp;</div>
    <button class="tap-pad" aria-label="Tap pad" disabled>TAP</button>
    <p class="fb" aria-live="polite"></p>
    <div class="row"><button class="btn primary" data-start>Start</button><button class="btn ghost" data-skip hidden>Next</button></div>`;
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
    ctl = schedulePlayback({ events: notes, bpm: it.bpm, countIn: 1, playNotes: false, metronome: true,
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
    if (best >= 0.85 && tries >= 1) skip.classList.add('primary');
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
    const base = [60, 62, 64, 65, 67]; const m = [0, 1, 2].map(() => base[Math.floor(Math.random() * 5)]);
    const same = Math.random() < 0.5; const m2 = m.slice();
    if (!same) { const i = Math.floor(Math.random() * 3); m2[i] += (Math.random() < 0.5 ? -2 : 2); }
    return { m, m2, ans: same ? 'same' : 'diff' };
  };
  const playQ = async () => {
    await unlockAudio();
    const t = audio().currentTime + 0.05;
    if (it.ear === 'updown') { playNote(q.a, { when: t, dur: 0.7 }); playNote(q.b, { when: t + 0.8, dur: 0.9 }); }
    else { q.m.forEach((x, i) => playNote(x, { when: t + i * 0.4, dur: 0.38 })); q.m2.forEach((x, i) => playNote(x, { when: t + 1.6 + i * 0.4, dur: 0.38 })); }
  };
  const opts = it.ear === 'updown' ? [['up', 'Higher ↑'], ['down', 'Lower ↓']] : [['same', 'Same ='], ['diff', 'Different ≠']];
  const render = () => {
    q = make(); answered = false;
    el.innerHTML = `${header(it, `Question ${n + 1} of ${it.count}`)}
      <p class="lesson-text">${it.ear === 'updown' ? 'Listen to two notes. Is the second one higher or lower? Try humming them first.' : 'Listen to two short tunes. Are they the same, or different?'}</p>
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
  let ctl = null; let stopFlag = false;
  const p = ctx.player;
  let body = '';
  if (it.compose) body = `<div class="kbwrap tall">${renderKeyboard(60, 67, { labels: 'all' })}</div>
      <p class="tune" aria-live="polite">Your tune: <strong class="tn">(tap keys)</strong></p>
      <div class="row"><button class="btn" data-playback>▶ Play it back</button><button class="btn ghost" data-clear>Clear</button></div>`;
  else if (it.callResponse) body = `<div class="cr" aria-live="polite">Press start. Listen, then answer.</div>
      <div class="row"><button class="btn primary big" data-start>Start</button><button class="btn" data-stop>Stop</button></div>`;
  else body = `<div class="kbwrap">${renderKeyboard(54, 70, { labels: 'none', marks: Object.fromEntries([54, 56, 58, 61, 63, 66, 68, 70].map(m => [m, 'target'])) })}</div>
      <div class="row"><button class="btn primary big" data-start>▶ Start backing</button><button class="btn" data-stop>Stop</button></div>`;
  el.innerHTML = `${header(it, 'Play for fun. No wrong answers.')}<p class="lesson-text">${esc(it.howto)}</p>${body}
    <button class="btn primary" data-done>I made some music ✓</button>`;
  const tune = [];
  if (it.compose) {
    bindKeyboard($(el, '.kbwrap'), m => { if (tune.length < 8) { tune.push(m); playNote(m, { dur: 0.5 }); $(el, '.tn').textContent = tune.map(letterOf).join(' '); } });
  }
  const runBacking = async () => {
    await unlockAudio(); stopFlag = false;
    const spb = 60 / it.bpm; const c = audio(); let t = c.currentTime + 0.1;
    for (let bar = 0; bar < it.bars && !stopFlag; bar++) {
      const ch = it.chords[bar % it.chords.length];
      pad(ch, t, spb * 4); pad([ch[0] - 12], t, spb * 4);
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
      for (let k = 0; k < 4; k++) click(t + k * spb, k === 0);
      let bt = t; call.forEach(d => { playNote(60, { when: bt, dur: d * spb * 0.9 }); bt += d * spb; });
      await sleep(spb * 4000); if (stopFlag) break;
      box.innerHTML = '<strong>Your turn!</strong> Answer on C, D, or E.';
      t = audio().currentTime + 0.02; for (let k = 0; k < 4; k++) click(t + k * spb, k === 0);
      await sleep(spb * 4000);
    }
    if (!stopFlag) box.textContent = 'Nice conversation! Press start for another round.';
  };
  el.onclick = e => {
    if (e.target.closest('[data-start]')) { it.callResponse ? runCR() : runBacking(); }
    if (e.target.closest('[data-stop]')) stopFlag = true;
    if (e.target.closest('[data-clear]')) { tune.length = 0; $(el, '.tn').textContent = '(tap keys)'; }
    if (e.target.closest('[data-playback]')) { const t = audio().currentTime + 0.05; tune.forEach((m, i) => playNote(m, { when: t + i * 0.45, dur: 0.42 })); }
    if (e.target.closest('[data-done]')) {
      stopFlag = true;
      if (it.compose && tune.length) { p.compositions = p.compositions || []; p.compositions.push({ notes: tune.slice(), at: Date.now() }); }
      recordRating(p, block.id, 'clean');
      ctx.done({ miles: 8, skill: it.skill, xp: 5, summary: it.compose && tune.length ? `Saved your tune: ${tune.map(letterOf).join(' ')}` : 'Created something new' });
    }
  };
  return () => { stopFlag = true; el.onclick = null; ctl && ctl.stop(); };
}

// ---------- Piano practice (the core loop) ----------
function mountPiano(el, it, block, ctx) {
  const p = ctx.player;
  const st = itemState(p, block.id);
  const piece = it.piece ? PIECES[it.piece] : null;
  let repsHere = 0; let ctl = null; let falling = null; let phrase = null; let current = -1; let showGuide = true;

  if (!piece) {
    // Free exercise with self-check list
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

  const hp = hardestPhrase(p, block.id);
  if (hp !== null) phrase = hp;
  const level = () => p.readingLevel ?? (p.readsTreble ? 3 : 0);

  const events = () => {
    let ev = piece.notes.map((n, i) => ({ ...n, i }));
    if (phrase !== null && piece.phrases) { const [a, b] = piece.phrases[phrase]; ev = ev.filter(n => n.i >= a && n.i <= b); }
    const shift = Math.floor(ev[0].beat / 4) * 4;
    return ev.map(n => ({ ...n, beat: n.beat - shift }));
  };
  const bpm = () => Math.round(piece.bpm * TEMPO_LADDER[st.tempoStep]);

  const render = () => {
    const L = level();
    const ev = events();
    const fingers = {}; ev.forEach(n => { if (n.finger && fingers[n.midi] === undefined) fingers[n.midi] = n.finger; });
    const showStaff = L >= 1;
    const showFalling = L <= 1;
    const kbLabels = L === 0 ? 'all' : L === 1 ? 'all' : 'c';
    el.innerHTML = `${header(it, esc(piece.credit || (piece.hand === 'RH' ? 'Right hand' : '')))}
      <p class="lesson-text small">${esc(it.howto)}</p>
      <div class="chips">
        <button class="chip" data-level title="Change reading help">👁 ${READING_LEVELS[L].name}</button>
        <span class="chip static">Tempo ${Math.round(TEMPO_LADDER[st.tempoStep] * 100)}% · ${bpm()} bpm</span>
        <span class="chip static" aria-label="Clean in a row">${'●'.repeat(st.cleanStreak)}${'○'.repeat(3 - st.cleanStreak)} clean in a row</span>
      </div>
      ${piece.phrases ? `<div class="seg" role="group" aria-label="Choose section">
        <button class="${phrase === null ? 'on' : ''}" data-ph="all">Whole</button>
        ${piece.phrases.map((_, i) => `<button class="${phrase === i ? 'on' : ''}" data-ph="${i}">Phrase ${i + 1}${hp === i ? ' ★' : ''}</button>`).join('')}
      </div>` : ''}
      ${showStaff ? `<div class="staffwrap">${renderStaff(ev, { letters: L <= 2, barsPerLine: barsPerLine(), current, fingers: L <= 1 })}</div>` : ''}
      ${showFalling ? '<canvas class="falling" aria-hidden="true"></canvas>' : ''}
      ${L <= 2 ? `<div class="kbwrap">${renderKeyboard(piece.range[0], piece.range[1], { labels: kbLabels, fingers: L <= 1 ? fingers : {} })}</div>` : ''}
      <div class="row ctl">
        <button class="btn" data-listen>▶ Listen</button>
        <button class="btn primary" data-along>Play along</button>
        <button class="btn" data-stop>■</button>
      </div>
      <label class="tog"><input type="checkbox" data-guide ${showGuide ? 'checked' : ''}> Guide notes play with me</label>
      <p class="muted small">After each try, rate it honestly:</p>
      ${rateRow()}
      <p class="fb" aria-live="polite"></p>
      <div class="row"><button class="btn ghost" data-quick>🎤 Quick listen</button><button class="btn ghost" data-next>${repsHere >= 3 ? 'Next ›' : 'Done with this'}</button></div>`;
    if (showFalling) {
      const cv = $(el, 'canvas.falling');
      falling && falling.stop();
      falling = fallingNotes(cv, { events: ev, lo: piece.range[0], hi: piece.range[1], getBeat: () => { if (!ctl) return -0.5; let b = (audio().currentTime - ctl.musicStart) / ctl.spb; if (ctl.loop && b >= 0) b %= ctl.lengthBeats; return b; }, lookahead: 4 });
    }
    const kb = $(el, '.kbwrap'); if (kb) bindKeyboard(kb, m => playNote(m, { dur: 0.6 }));
  };
  const stop = () => { ctl && ctl.stop(); ctl = null; current = -1; };
  const run = async (mode) => {
    await unlockAudio(); stop();
    const ev = events();
    const playNotes = mode === 'listen' || showGuide;
    ctl = schedulePlayback({ events: ev, bpm: bpm(), countIn: mode === 'listen' ? 0 : 1, metronome: mode !== 'listen', playNotes, loop: phrase !== null && mode === 'along',
      onNote: i => { current = ev[i].i - (ev[0].i); updateCursor(); },
      onEnd: () => { current = -1; updateCursor(); ctl = null; } });
  };
  const updateCursor = () => {
    const sw = $(el, '.staffwrap'); if (!sw) return;
    sw.innerHTML = renderStaff(events(), { letters: level() <= 2, barsPerLine: barsPerLine(), current, fingers: level() <= 1 });
  };
  el.onclick = e => {
    const t = e.target;
    if (t.closest('[data-listen]')) run('listen');
    else if (t.closest('[data-along]')) run('along');
    else if (t.closest('[data-stop]')) stop();
    else if (t.closest('[data-level]')) { stop(); p.readingLevel = (level() + 1) % 4; ctx.save(); render(); ctx.toast(`Reading help: ${READING_LEVELS[level()].name}`); }
    else if (t.closest('[data-ph]')) { stop(); const v = t.closest('[data-ph]').dataset.ph; phrase = v === 'all' ? null : +v; render(); }
    else if (t.closest('[data-rate]')) rate(t.closest('[data-rate]').dataset.rate);
    else if (t.closest('[data-next]')) { stop(); finish(); }
    else if (t.closest('[data-quick]')) { stop(); ctx.openMicCheck({ pieceId: it.piece, itemId: block.id, quick: true, onResult: r => { if (r && r.verdict !== 'unclear') rate(r.verdict, true); } }); }
  };
  el.onchange = e => { if (e.target.matches('[data-guide]')) showGuide = e.target.checked; };
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
    if (tempoUp) msg += ' Three clean in a row: <strong>tempo up!</strong> 🚂';
    else if (rating === 'notyet') msg += piece.phrases && phrase === null ? ' Try looping just one phrase, or slow down.' : ' Slow it down and keep it smooth. Speed comes later.';
    else if (rating === 'nearly') msg += ' Same speed again. Aim for smooth.';
    if (rating === 'clean' && L <= 1 && (p.readingStats[L] || 0) >= 3) msg += ' You are ready for less help. Tap 👁 to read more of the music yourself.';
    render();
    $(el, '.fb').innerHTML = msg;
  };
  const finish = () => {
    const order = { clean: 2, nearly: 1, notyet: 0 };
    const best = ratings.sort((a, b) => order[b] - order[a])[0] || null;
    ctx.done({ rating: best, miles: ratings.reduce((s, r) => s + milesFor(r), 0) || 3, skill: it.skill, xp: 3 + ratings.length * 2, summary: ratings.length ? `${ratings.length} tries · tempo ${Math.round(TEMPO_LADDER[st.tempoStep] * 100)}%` : 'Looked it over' });
  };
  render();
  if (hp !== null) $(el, '.fb').innerHTML = `Start with <strong>Phrase ${hp + 1}</strong>. It has been the trickiest spot.`;
  return () => { stop(); falling && falling.stop(); el.onclick = null; el.onchange = null; };
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
  el.innerHTML = `${header(it, 'The conductor listens once. Read it from the music.')}
    <div class="staffwrap">${renderStaff(piece.notes, { letters: (ctx.player.readingLevel ?? 0) <= 2, barsPerLine: barsPerLine() })}</div>
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
