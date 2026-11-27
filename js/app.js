// Night Train: app shell, screens, and flow.
import * as store from './storage.js';
import { THEMES, LINES, STATIONS, ITEMS, PIECES, READING_LEVELS, parse } from './content.js';
import { buildSession, stationStatus, stationProgress, currentStation, passStation, stationReady, sessionsThisWeek, addSkill, skillLevel, recordRating, weekStart } from './engine.js';
import { mountBlock, pieceScore, judgedNotes, pieceView } from './blocks.js';
import { initMIDI, midiConnected, midiSupported, listenMIDI, midiName } from './midi.js';
import { buildSongPiece, KEYS, parseChart, displayName, numberOf } from './songs.js';
import { renderStaff, renderScore, renderKeyboard, bindKeyboard, letterOf } from './notation.js';
import { unlockAudio, playNote, click, audio, setBackingVolume } from './audio.js';
import { micSupported, openMic, closeMic, listen, measureNoise, judge, noteName } from './pitch.js';

const app = document.getElementById('app');
const S = { meta: null, player: null, view: 'boot', cleanup: [], session: null, ob: null };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = sel => app.querySelector(sel);
const DAY = 86400000;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

// ---------- utilities ----------
function cleanup() { S.cleanup.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); S.cleanup = []; }
function setTheme(t) { document.documentElement.dataset.theme = t || 'midnight'; }
export function toast(msg, ms = 2600) {
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.innerHTML = msg;
  document.body.appendChild(t); requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, ms);
}
async function save() {
  if (!S.player) return;
  try { await store.savePlayer(S.player); }
  catch (e) { toast('⚠️ Could not save. Please make a backup code now.', 5000); console.error(e); }
  renderSafe();
}
function ago(t) {
  if (!t) return 'never';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' hr ago'; return Math.floor(s / 86400) + ' days ago';
}
function backupDue(p) { return !p.lastBackup || (Date.now() - p.lastBackup > 7 * DAY && p.sessionsSinceBackup > 0); }

function safePill() {
  const p = S.player; if (!p) return '';
  const due = backupDue(p) && p.sessions.length > 0;
  return `<button class="safe ${due ? 'warn' : 'ok'}" data-nav="backup" aria-label="Progress safety">
    <span aria-hidden="true">${due ? '!' : '✓'}</span> ${due ? 'Back up' : 'Progress safe'}</button>`;
}
function renderSafe() { const el = document.querySelector('.safe'); if (el) el.outerHTML = safePill(); }

function topbar(title) {
  const p = S.player;
  return `<header class="top">
    <button class="who" data-nav="players" aria-label="Switch player"><span class="av">${esc((p.name || '?')[0].toUpperCase())}</span><span class="nm">${esc(p.name)}</span></button>
    <h1>${esc(title)}</h1>${safePill()}</header>`;
}

function go(view, arg) {
  cleanup();
  S.view = view;
  window.scrollTo(0, 0);
  const views = { songs: viewSongs, songedit: viewSongEdit, song: viewSong, duet: viewDuet, players: viewPlayers, onboard: viewOnboard, home: viewHome, station: viewStation, session: viewSession, item: viewItem, backup: viewBackup, settings: viewSettings, summary: viewSummary, restore: viewRestore };
  (views[view] || viewPlayers)(arg);
}

app.addEventListener('click', e => {
  const n = e.target.closest('[data-nav]');
  if (n && !n.disabled) { e.preventDefault(); navTo(n.dataset.nav, n.dataset.arg); }
});
function navTo(v, arg) {
  if (S.view === 'session' && S.session && !S.session.ended && v !== 'session') {
    if (!confirm('End this practice session? Everything so far is saved.')) return;
    endSession(false); return;
  }
  go(v, arg);
}

// ---------- Players ----------
async function selectPlayer(id) {
  const p = await store.loadPlayer(id);
  if (!p) { toast('Could not load that player. Try restoring a backup.'); return; }
  S.player = p; S.meta.lastPlayer = id; await store.saveMeta(S.meta);
  setTheme(p.theme); setBackingVolume(p.backingVol ?? 1);
  go(p.onboarded ? 'home' : 'onboard');
}

function viewPlayers() {
  setTheme(S.player ? S.player.theme : 'midnight');
  const list = S.meta.players;
  const installTip = isIOS && !standalone ? `<div class="card notice">
    <strong>Tip: install first.</strong> Tap Share ⬆︎ then "Add to Home Screen", and open Night Train from there. On iPhone, the Home Screen app keeps its own separate progress, so set up players inside the installed app. Already have progress here? Make a backup code and restore it in the installed app.</div>` : '';
  app.innerHTML = `<main class="wrap">
    <div class="brand"><div class="logo" aria-hidden="true">🚂</div><h1>Night Train</h1><p class="muted">Piano lessons that go somewhere</p></div>
    ${installTip}
    <h2 class="sec">Who's practicing?</h2>
    <div class="players">${list.map(x => `<button class="pcard th-${esc(x.theme)}" data-pid="${esc(x.id)}"><span class="av big">${esc(x.name[0].toUpperCase())}</span><span>${esc(x.name)}</span></button>`).join('')}
      <button class="pcard add" data-add><span class="av big">+</span><span>Add player</span></button></div>
    <div class="board" aria-live="polite"></div>
    <div class="row center"><button class="btn ghost" data-nav="restore">Restore from a backup</button></div>
    <p class="muted small center">v${store.APP_VERSION}</p>
  </main>`;
  app.querySelectorAll('[data-pid]').forEach(b => b.onclick = () => selectPlayer(b.dataset.pid));
  renderBoard(list);
  $('[data-add]').onclick = async () => {
    const name = (prompt('Player name?') || '').trim();
    if (!name) return;
    const p = store.newPlayer(name.slice(0, 24));
    S.meta.players.push({ id: p.id, name: p.name, theme: p.theme }); S.meta.lastPlayer = p.id;
    await store.savePlayer(p); await store.saveMeta(S.meta);
    S.player = p; S.ob = null; go('onboard');
  };
}

// ---------- Family board ----------
const CHALLENGES = [
  { title: 'Miles together', desc: 'Travel {t} miles as a family this week.', target: ps => 80 * ps.length, value: (ps, ws) => ps.reduce((a, p) => a + p.sessions.filter(x => x.date >= ws).reduce((b, x) => b + (x.miles || 0), 0), 0) },
  { title: 'Everyone on board', desc: 'Every player reaches their own weekly goal.', target: ps => ps.length, value: (ps) => ps.filter(p => sessionsThisWeek(p) >= p.weeklyGoal).length },
  { title: 'Duet week', desc: 'Play {t} family duets this week (each phone counts).', target: () => 4, value: (ps, ws) => ps.reduce((a, p) => a + (p.duetLog || []).filter(t => t >= ws).length, 0) },
  { title: 'Stamp collectors', desc: 'Earn {t} new ticket stamps as a family.', target: ps => Math.max(2, ps.length), value: (ps, ws) => ps.reduce((a, p) => a + Object.values(p.stations).filter(r => r.status === 'passed' && (r.at || 0) >= ws).length, 0) },
];
async function renderBoard(list) {
  const el = document.querySelector('.board'); if (!el || !list.length) return;
  const ps = (await Promise.all(list.map(x => store.loadPlayer(x.id)))).filter(Boolean);
  if (!ps.length || !document.body.contains(el)) return;
  const ws = weekStart(); const wk = Math.floor(ws / (7 * DAY));
  const ch = CHALLENGES[((wk % CHALLENGES.length) + CHALLENGES.length) % CHALLENGES.length];
  const target = ch.target(ps), value = Math.min(target, ch.value(ps, ws));
  el.innerHTML = `<h2 class="sec">Family board</h2>
    <section class="card"><p class="eyebrow">This week's challenge</p><strong>${esc(ch.title)}</strong><p class="small">${esc(ch.desc.replace('{t}', target))}</p>
      <div class="bar" role="progressbar" aria-valuenow="${value}" aria-valuemax="${target}"><span style="width:${Math.round(value / target * 100)}%"></span></div>
      <p class="muted small">${value} of ${target}${value >= target ? ' · 🎉 Done! The whole train cheers.' : ''}</p></section>
    <section class="card"><ul class="boardlist">${ps.map(p => { const w = sessionsThisWeek(p); const stamps = Object.values(p.stations).filter(r => r.status === 'passed').length;
      return `<li><span class="av th-${esc(p.theme)}"><b>${esc(p.name[0].toUpperCase())}</b></span><span class="bn"><strong>${esc(p.name)}</strong><small>${w}/${p.weeklyGoal} this week${w >= p.weeklyGoal ? ' ✓' : ''}</small></span><span class="bs">🎫 ${stamps}<br><small>${p.miles} mi</small></span></li>`; }).join('')}</ul></section>`;
}

// ---------- Restore ----------
function viewRestore() {
  app.innerHTML = `<main class="wrap">
    <button class="btn ghost back" data-nav="players">‹ Back</button>
    <h1>Restore progress</h1>
    <div class="card"><h2>From a backup code</h2>
      <textarea class="code" rows="5" placeholder="Paste a code that starts with NT…" aria-label="Backup code"></textarea>
      <button class="btn primary" data-code>Restore code</button></div>
    <div class="card"><h2>From a backup file</h2>
      <input type="file" accept=".json,application/json" aria-label="Backup file">
    </div>
    <p class="fb" aria-live="polite"></p></main>`;
  const fb = $('.fb');
  const doRestore = async (player) => {
    let r = await store.restorePlayer(S.meta, player);
    if (r.conflict) {
      if (!confirm(`This device has newer progress for ${player.name} than the backup. Replace it with the backup anyway?`)) { fb.textContent = 'Kept the newer progress on this device.'; return; }
      r = await store.restorePlayer(S.meta, player, { force: true });
    }
    toast(`✓ Restored ${esc(player.name)}`);
    selectPlayer(player.id);
  };
  $('[data-code]').onclick = async () => {
    try { await doRestore(await store.readBackupCode($('textarea').value)); } catch (e) { fb.textContent = e.message; }
  };
  $('input[type=file]').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { await doRestore(store.parseBackupJSON(await f.text())); } catch (err) { fb.textContent = err.message; }
  };
}

// ---------- Onboarding & placement ----------
function viewOnboard() {
  const p = S.player;
  const ob = S.ob || (S.ob = { step: 0, played: null, reads: null, readScore: null });
  const steps = ['welcome', 'theme', 'lines', 'rhythm', 'experience', 'reading', 'place'];
  const step = steps[ob.step];
  const next = () => { ob.step++; if (steps[ob.step] === 'reading' && !(ob.reads === 'yes' || ob.reads === 'some')) ob.step++; viewOnboard(); };
  let body = '';
  if (step === 'welcome') body = `<div class="story"><p>The station clock reads midnight. A long silver train hisses to a stop, and a conductor in a navy coat leans out.</p>
      <p>"Evening, ${esc(p.name)}! I'm Conductor Oona. This train goes anywhere music goes: carols, chapels, concert halls, smoky jazz clubs. Every stop you reach, you earn. Ready for your ticket?"</p></div>
      <button class="btn primary big" data-next>Take the ticket</button>`;
  if (step === 'theme') body = `<h2>Choose your carriage</h2><div class="themes">${THEMES.map(t => `<button class="theme th-${t.id} ${p.theme === t.id ? 'on' : ''}" data-theme="${t.id}" aria-pressed="${p.theme === t.id}"><strong>${t.name}</strong><span>${t.desc}</span></button>`).join('')}</div>
      <button class="btn primary big" data-next>Next</button>`;
  if (step === 'lines') body = `<h2>Where do you want to go?</h2><p class="muted">Pick any. Everyone starts on the Foundations Local, and you can change this later.</p>
      <div class="lines">${LINES.map(l => `<button class="line ${p.lines.includes(l.id) ? 'on' : ''}" data-line="${l.id}" ${l.id === 'foundations' ? 'disabled' : ''} aria-pressed="${p.lines.includes(l.id)}"><strong>${l.name}</strong><span>${l.who}</span></button>`).join('')}</div>
      ${mainLinePicker(p)}
      <label class="field">Dream goal (optional)<input type="text" data-goals maxlength="120" placeholder="e.g. play Silent Night for the family" value="${esc(p.goals)}"></label>
      <button class="btn primary big" data-next>Next</button>`;
  if (step === 'rhythm') body = `<h2>Your practice rhythm</h2>
      <p class="muted">A weekly goal, not a daily streak. Any days you like. Missing a day is fine.</p>
      <label class="field">Sessions per week: <strong data-wg>${p.weeklyGoal}</strong>
        <input type="range" min="1" max="7" value="${p.weeklyGoal}" data-weekly></label>
      <p class="muted">Usual session length</p>
      <div class="seg">${[10, 15, 25].map(m => `<button class="${p.sessionMinutes === m ? 'on' : ''}" data-min="${m}">${m} min</button>`).join('')}</div>
      <button class="btn primary big" data-next>Next</button>`;
  if (step === 'experience') body = `<h2>Quick placement</h2>
      <p>Have you played piano before?</p>
      <div class="opts">${[['never', 'Never'], ['kid', 'A little, long ago'], ['some', 'Some, by ear or videos'], ['comfortable', 'Yes, comfortably']].map(([v, l]) => `<button class="opt ${ob.played === v ? 'on' : ''}" data-played="${v}">${l}</button>`).join('')}</div>
      <p>Can you read treble-clef notes (from any instrument)?</p>
      <div class="opts">${[['no', 'Not really'], ['some', 'Slowly'], ['yes', 'Yes']].map(([v, l]) => `<button class="opt ${ob.reads === v ? 'on' : ''}" data-reads="${v}">${l}</button>`).join('')}</div>
      <button class="btn primary big" data-next ${ob.played && ob.reads ? '' : 'disabled'}>Next</button>`;
  if (step === 'reading') {
    if (!ob.rq) { const pool = [57, 60, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79]; ob.rq = Array.from({ length: 6 }, () => pool[Math.floor(Math.random() * pool.length)]); ob.ri = 0; ob.right = 0; }
    if (ob.ri < ob.rq.length) {
      const m = ob.rq[ob.ri];
      body = `<h2>Reading check ${ob.ri + 1} / ${ob.rq.length}</h2><p class="muted">Tap the letter name. Skip any you don't know.</p>
        <div class="staffwrap small">${renderStaff([{ midi: m, beat: 0, dur: 4 }], { barsPerLine: 1, timeSig: false })}</div>
        <div class="opts letters">${['C', 'D', 'E', 'F', 'G', 'A', 'B'].map(l => `<button class="opt" data-letter="${l}">${l}</button>`).join('')}<button class="opt ghost" data-letter="?">Not sure</button></div>`;
    } else { ob.readScore = ob.right / ob.rq.length; next(); return; }
  }
  if (step === 'place') {
    const experienced = (ob.played === 'comfortable' || ob.played === 'some') && (ob.readScore ?? 0) >= 0.8;
    p.readsTreble = (ob.readScore ?? 0) >= 0.8;
    p.readingLevel = p.readsTreble ? 3 : (ob.readScore ?? 0) >= 0.5 ? 2 : 0;
    p.level = experienced ? 'experienced' : ob.played === 'kid' || ob.played === 'some' ? 'returning' : 'beginner';
    body = `<h2>Your ticket</h2>
      ${ob.readScore !== null ? `<p>Reading check: <strong>${Math.round(ob.readScore * 100)}%</strong>. ${p.readsTreble ? 'You read well, so you will practice from real notation.' : 'We will start with falling notes and fade into real notation step by step.'}</p>` : '<p>We will start with falling notes on lit-up keys, then fade into real notation step by step.</p>'}
      ${experienced ? `<div class="card"><p><strong>Express option.</strong> The Foundations Local covers keyboard landmarks, steady beat, and C position. You can skip it, or ride it fast as review. You can always go back.</p>
        <button class="btn primary" data-express>Express pass: skip Foundations</button>
        <button class="btn" data-audition>🎤 Prove it: quick audition</button>
        <button class="btn ghost" data-start>Ride Foundations as review</button></div>`
        : `<p>First stop: <strong>Keyboard Junction</strong>. Your first session takes about ${p.sessionMinutes} minutes, and you will play real music today.</p>
        <button class="btn primary big" data-start>All aboard!</button>`}`;
  }
  app.innerHTML = `<main class="wrap ob">${body}<div class="dots" aria-hidden="true">${steps.map((s, i) => `<i class="${i === ob.step ? 'on' : ''}"></i>`).join('')}</div></main>`;
  const finish = async () => { p.onboarded = true; const retake = ob.retake; S.ob = null; await save(); syncMeta(); if (retake) toast('Placement updated.'); go('home'); };
  app.onclick = async e => {
    const t = e.target;
    if (t.closest('[data-next]')) { await save(); next(); }
    const th = t.closest('[data-theme]'); if (th) { p.theme = th.dataset.theme; setTheme(p.theme); viewOnboard(); }
    const ln = t.closest('[data-line]'); if (ln) { const id = ln.dataset.line; p.lines = p.lines.includes(id) ? p.lines.filter(x => x !== id) : [...p.lines, id]; viewOnboard(); }
    const mn = t.closest('[data-min]'); if (mn) { p.sessionMinutes = +mn.dataset.min; viewOnboard(); }
    const ml = t.closest('[data-main]'); if (ml) { p.mainLine = ml.dataset.main; viewOnboard(); }
    const pl = t.closest('[data-played]'); if (pl) { ob.played = pl.dataset.played; viewOnboard(); }
    const rd = t.closest('[data-reads]'); if (rd) { ob.reads = rd.dataset.reads; viewOnboard(); }
    const lt = t.closest('[data-letter]'); if (lt) { if (lt.dataset.letter === letterOf(ob.rq[ob.ri])) ob.right++; ob.ri++; viewOnboard(); }
    if (t.closest('[data-start]')) finish();
    if (t.closest('[data-express]')) { STATIONS.filter(s => s.line === 'foundations').forEach(s => passStation(p, s.id, 'placed')); toast('Express pass stamped. More lines arrive in the next update.'); finish(); }
    if (t.closest('[data-audition]')) {
      openMicCheck({ pieceId: 'odeToJoy', audition: true, onResult: r => {
        if (r && (r.verdict === 'clean' || r.verdict === 'nearly')) { STATIONS.filter(s => s.line === 'foundations').forEach(s => passStation(p, s.id, 'placed')); toast('Audition passed! Foundations stamped.'); finish(); }
        else if (r) toast('No problem. Ride Foundations as review, or take the express pass.');
      } });
    }
  };
  const gi = $('[data-goals]'); if (gi) gi.oninput = () => { p.goals = gi.value; };
  const wk = $('[data-weekly]'); if (wk) wk.oninput = () => { p.weeklyGoal = +wk.value; $('[data-wg]').textContent = wk.value; };
  S.cleanup.push(() => { app.onclick = null; });
}
function mainLinePicker(p) {
  const opts = LINES.filter(l => l.id !== 'foundations' && p.lines.includes(l.id));
  if (opts.length < 2) { p.mainLine = opts[0] ? opts[0].id : null; return ''; }
  if (!opts.some(l => l.id === p.mainLine)) p.mainLine = opts[0].id;
  return `<p><strong>★ Main line</strong> <span class="muted small">gets most of your practice time. The others get a little each week.</span></p>
    <div class="opts">${opts.map(l => `<button class="opt ${p.mainLine === l.id ? 'on' : ''}" data-main="${l.id}">${l.name}</button>`).join('')}</div>`;
}
function syncMeta() {
  const m = S.meta.players.find(x => x.id === S.player.id);
  if (m) { m.name = S.player.name; m.theme = S.player.theme; store.saveMeta(S.meta); }
}

// ---------- Home ----------
function viewHome() {
  const p = S.player; setTheme(p.theme);
  const st = currentStation(p);
  const wk = sessionsThisWeek(p);
  const goal = p.weeklyGoal;
  const ring = Array.from({ length: Math.max(goal, wk) }, (_, i) => `<i class="${i < wk ? 'on' : ''}"></i>`).join('');
  const stStatus = st ? stationStatus(p, st) : null;
  const prog = st ? Math.round(stationProgress(p, st) * 100) : 100;
  const canDo = [], shaky = [];
  Object.entries(p.items).forEach(([id, s]) => { const it = ITEMS[id]; if (!it || it.type === 'lesson' || it.type === 'checkpoint') return; (s.last === 'clean' ? canDo : shaky).push(it.title); });
  const myLines = LINES.filter(l => p.lines.includes(l.id));
  app.innerHTML = `${topbar('Night Train')}<main class="wrap">
    ${st ? `<section class="card station-card">
      <p class="eyebrow">Next stop</p><h2>${esc(st.name)}</h2>
      <p class="story-sm">${esc(st.passenger)}</p>
      <div class="bar" role="progressbar" aria-valuenow="${prog}" aria-valuemin="0" aria-valuemax="100"><span style="width:${prog}%"></span></div>
      <p class="muted small">${stStatus === 'ready' ? '🎫 Ready for ticket inspection!' : `${prog}% of the way there`}</p>
      <button class="btn ${stStatus === 'ready' ? 'primary' : 'ghost'} sm" data-testout="${st.id}">${stStatus === 'ready' ? '🎫 Take the ticket inspection' : '⏩ Already know this? Test out'}</button>
    </section>` : `<section class="card station-card"><h2>End of the line… for now!</h2><p>You've finished every station in this version. New lines are being laid for the next update. Keep reviewing to stay sharp.</p></section>`}
    <section class="start">
      <div class="seg" role="group" aria-label="Session length">${[10, 15, 25].map(m => `<button class="${p.sessionMinutes === m ? 'on' : ''}" data-min="${m}">${m} min</button>`).join('')}</div>
      <button class="btn primary huge" data-startsession>▶ Start today's practice</button>
    </section>
    <section class="card week"><div><strong>This week</strong> <span class="muted">${wk} of ${goal} sessions</span></div><div class="ring" aria-hidden="true">${ring}</div>
      <p class="muted small">${wk >= goal ? 'Weekly goal reached! Anything more is a bonus.' : 'Any days you like. No streak to break.'}</p></section>
    ${routeHtml(p)}
    <section class="card duetcard"><strong>📖 Sight-reading</strong><p class="muted small">Fresh music every time, at your level${p.sight ? ` (Level ${p.sight.level})` : ''}. It levels up as you read cleanly.</p>
      <button class="btn" data-sight>Read something new</button></section>
    <section class="card duetcard"><strong>🎵 My songs</strong><p class="muted small">Type a chord chart from a song you play (chord names or numbers). The app builds voicings, a band, and practice in any key.</p>
      <button class="btn" data-nav="songs">${(p.songs || []).length ? `Open my songs (${p.songs.length})` : 'Add a song'}</button></section>
    <section class="card duetcard"><strong>🎹 Family duet</strong><p class="muted small">Two players, one piano, two phones. Or play a duet with the virtual partner anytime from the Carol Line.</p>
      <button class="btn" data-nav="duet">Start a family duet</button></section>
    <h2 class="sec">Skill map</h2>
    <section class="card skills">${['technique', 'reading', 'rhythm', 'theory', 'ear'].map(k => { const lv = skillLevel(p.skills[k] || 0); return `<div class="sk"><span>${k[0].toUpperCase() + k.slice(1)}</span><div class="bar"><span style="width:${lv * 10}%"></span></div><span class="lv">Lv ${lv}</span></div>`; }).join('')}
      <div class="cando"><div><strong>✓ Can do</strong><p class="small">${canDo.length ? canDo.map(esc).join(', ') : 'Your first wins will show here.'}</p></div>
      <div><strong>≈ Still shaky</strong><p class="small">${shaky.length ? shaky.map(esc).join(', ') : 'Nothing yet.'}</p></div></div>
      <p class="muted small">Reading help: ${READING_LEVELS[p.readingLevel ?? 0].name}${p.goals ? ` · Dream goal: ${esc(p.goals)}` : ''}</p></section>
    <h2 class="sec">Postcards · ${p.miles} miles traveled</h2>
    <div class="postcards">${p.postcards.length ? p.postcards.map(id => { const s = STATIONS.find(x => x.id === id); return s ? `<div class="pc"><span aria-hidden="true">🖼️</span><strong>${esc(s.name)}</strong><small>${esc(s.postcard)}</small></div>` : ''; }).join('') : '<p class="muted small">Pass a ticket inspection to collect your first postcard.</p>'}</div>
    <div class="row center"><button class="btn ghost" data-nav="settings">⚙ Settings</button><button class="btn ghost" data-nav="backup">💾 Backup</button></div>
  </main>`;
  app.querySelectorAll('[data-min]').forEach(b => b.onclick = async () => { p.sessionMinutes = +b.dataset.min; await save(); viewHome(); });
  $('[data-startsession]').onclick = () => { unlockAudio(); startSession(); };
  $('[data-sight]').onclick = () => { unlockAudio(); go('item', { id: 'x.sight', station: null }); };
  const to = $('[data-testout]'); if (to) to.onclick = () => { unlockAudio(); const sx = STATIONS.find(x => x.id === to.dataset.testout); go('item', { id: sx.checkpoint, station: sx.id }); };
}

function routeHtml(p) {
  const lines = LINES.filter(l => l.id === 'foundations' || p.lines.includes(l.id));
  const order = ['foundations', p.mainLine, ...lines.map(l => l.id)].filter((x, i, a) => x && a.indexOf(x) === i && lines.some(l => l.id === x));
  return order.map(id => {
    const l = LINES.find(x => x.id === id);
    const sts = STATIONS.filter(x => x.line === id);
    return `<h2 class="sec">${esc(l.name)}${p.mainLine === id ? ' ★' : ''}</h2>
    <ol class="route">${sts.map(st2 => {
      const ss = stationStatus(p, st2); const rec = p.stations[st2.id] || {};
      const icon = ss === 'passed' ? (rec.grade === 'gold' ? '🥇' : '✓') : ss === 'placed' ? '⏩' : ss === 'locked' ? '🔒' : ss === 'ready' ? '🎫' : '🚉';
      const label = { passed: rec.grade === 'gold' ? 'Gold stamp' : 'Passed', placed: 'Express pass', locked: id !== 'foundations' && STATIONS.filter(x => x.line === id).indexOf(st2) === 0 ? 'Opens after Foundations' : 'Locked', ready: 'Inspection ready', open: 'Current stop' }[ss];
      return `<li><button class="stop s-${ss}" data-nav="station" data-arg="${st2.id}" ${ss === 'locked' ? 'disabled' : ''}><span class="ic" aria-hidden="true">${icon}</span><span><strong>${esc(st2.name)}</strong><small>${label}</small></span></button></li>`;
    }).join('')}<li class="more muted small">More stations being built…</li></ol>`;
  }).join('');
}

// ---------- Station detail (self-chosen practice) ----------
function viewStation(id) {
  const p = S.player; const st = STATIONS.find(s => s.id === id); if (!st) return go('home');
  const ss = stationStatus(p, st);
  app.innerHTML = `${topbar(st.name)}<main class="wrap">
    <button class="btn ghost back" data-nav="home">‹ Train</button>
    <div class="story"><p>${esc(st.story)}</p><p><em>${esc(st.passenger)}</em></p></div>
    <h2 class="sec">Practice anything here</h2>
    <ul class="items">${st.items.map(iid => { const it = ITEMS[iid]; const s = p.items[iid];
      const tag = !s ? 'New' : s.last === 'clean' ? '✓ Clean' : s.last === 'nearly' ? '≈ Nearly' : s.last === 'notyet' ? '↻ Not yet' : 'Done';
      return `<li><button class="item" data-item="${iid}"><span>${esc(it.title)}</span><small>${tag}</small></button></li>`; }).join('')}</ul>
    ${ss === 'open' ? `<p class="muted small center">Practice these until each is clean or nearly, and the ticket inspection unlocks. Already know this material?</p><button class="btn big" data-item="${st.checkpoint}">⏩ Test out: take the inspection now</button>` : `<button class="btn primary big" data-item="${st.checkpoint}">🎫 ${ss === 'ready' ? 'Ticket inspection' : 'Retake inspection'}</button>`}
  </main>`;
  app.querySelectorAll('[data-item]').forEach(b => b.onclick = () => { unlockAudio(); go('item', { id: b.dataset.item, station: st.id }); });
}

function viewItem({ id, station }) {
  const p = S.player;
  const stObj = STATIONS.find(s => s.id === station);
  app.innerHTML = `${topbar('Practice')}<main class="wrap"><button class="btn ghost back" data-back>‹ ${esc(stObj ? stObj.name : 'Train')}</button><div class="block"></div></main>`;
  $('[data-back]').onclick = () => stObj ? go('station', station) : go('home');
  const el = $('.block');
  const block = { kind: 'free', id, label: 'Practice' };
  const stop = mountBlock(el, block, blockCtx(async res => {
    applyResult(res, block);
    if (res.checkpoint) { await handleCheckpoint(res, ITEMS[id], station); return; }
    await save();
    toast(`+${res.miles || 0} miles`);
    stObj ? go('station', station) : go('home');
  }));
  S.cleanup.push(stop);
  void p;
}

// ---------- Session ----------
function startSession() {
  const p = S.player;
  const plan = buildSession(p, p.sessionMinutes);
  S.session = { plan, i: 0, startedAt: Date.now(), miles: 0, results: [], ended: false, breakShown: false };
  go('session');
}

function blockCtx(done) {
  return { player: S.player, done, save, toast, openMicCheck };
}

function applyResult(res, block) {
  const p = S.player;
  if (res.miles) p.miles += res.miles;
  if (res.skill) addSkill(p, res.skill, res.xp || 0);
  if (S.session && !S.session.ended && S.view === 'session') { S.session.miles += res.miles || 0; S.session.results.push({ id: block.id, ...res }); }
}

function viewSession() {
  const ss = S.session; const p = S.player;
  if (!ss) return go('home');
  const block = ss.plan.blocks[ss.i];
  if (!block) return endSession(true);
  const it = ITEMS[block.id];
  app.innerHTML = `<header class="top session-top">
      <span class="as">Practicing as <strong>${esc(p.name)}</strong></span>
      <span class="prog" aria-label="Block ${ss.i + 1} of ${ss.plan.blocks.length}">${ss.plan.blocks.map((b, i) => `<i class="${i < ss.i ? 'done' : i === ss.i ? 'on' : ''}"></i>`).join('')}</span>
      <button class="btn ghost sm" data-end>End</button></header>
    <main class="wrap"><p class="eyebrow">${esc(block.label)}${it ? ' · ' + esc(it.title) : ''}</p><div class="block"></div>
    <div class="row center"><button class="btn ghost sm" data-skipblock>Skip this ›</button></div></main>`;
  $('[data-end]').onclick = () => { if (confirm('End this session? Your progress so far is saved.')) endSession(true); };
  $('[data-skipblock]').onclick = () => nextBlock();
  const el = $('.block');
  const stop = mountBlock(el, block, blockCtx(async res => {
    applyResult(res, block);
    if (res.checkpoint) { await handleCheckpoint(res, it, ss.plan.station, true); return; }
    await save();
    if (res.miles) toast(`+${res.miles} miles${res.summary ? ' · ' + esc(res.summary) : ''}`);
    nextBlock();
  }));
  S.cleanup.push(stop);
  const timer = setInterval(() => {
    if (!ss.breakShown && Date.now() - ss.startedAt > 20 * 60000) { ss.breakShown = true; toast('🧘 20 minutes in. Stand up, shake out your hands, roll your shoulders. Then carry on.', 6000); }
  }, 15000);
  S.cleanup.push(() => clearInterval(timer));
}

function nextBlock() {
  const ss = S.session; const p = S.player;
  ss.i++;
  // Did the station just become ready? Add the inspection at the end.
  const st = STATIONS.find(s => s.id === ss.plan.station);
  if (st && stationReady(p, st) && stationStatus(p, st) === 'ready' && !ss.plan.blocks.some(b => b.kind === 'checkpoint')) {
    ss.plan.blocks.push({ kind: 'checkpoint', id: st.checkpoint, label: 'Ticket inspection' });
    toast('🎫 Ticket inspection unlocked! It is waiting at the end of this session.', 4000);
  }
  go('session');
}

async function endSession(showSummary) {
  const ss = S.session; const p = S.player;
  if (!ss || ss.ended) return;
  ss.ended = true;
  const minutes = Math.max(1, Math.round((Date.now() - ss.startedAt) / 60000));
  if (ss.results.length) {
    p.sessions.push({ date: ss.startedAt, minutes, blocks: ss.results.length, miles: ss.miles });
    if (p.sessions.length > 500) p.sessions = p.sessions.slice(-500);
    p.sessionsSinceBackup = (p.sessionsSinceBackup || 0) + 1;
  }
  await save();
  go(showSummary ? 'summary' : 'home');
}

function viewSummary() {
  const ss = S.session; const p = S.player;
  if (!ss) return go('home');
  const wk = sessionsThisWeek(p);
  const lines = ss.results.filter(r => r.summary || r.rating).map(r => { const it = ITEMS[r.id]; return `<li><span>${esc(it ? it.title : 'Warm-up')}</span><small>${esc(r.summary || '')}${r.rating ? ' · ' + ({ clean: '✓ clean', nearly: '≈ nearly', notyet: '↻ not yet' }[r.rating]) : ''}</small></li>`; }).join('');
  app.innerHTML = `${topbar('Arrived')}<main class="wrap">
    <div class="celebrate"><div class="big-emoji" aria-hidden="true">🚂💨</div><h1>+${ss.miles} miles</h1>
    <p>${wk >= p.weeklyGoal ? `Weekly goal reached: ${wk} of ${p.weeklyGoal}!` : `${wk} of ${p.weeklyGoal} sessions this week.`}</p></div>
    <ul class="items">${lines}</ul>
    ${backupDue(p) ? `<div class="card notice"><strong>Keep your progress safe.</strong> It's been a while since your last backup. It takes 30 seconds.<br><button class="btn primary" data-nav="backup">Back up now</button></div>` : ''}
    <button class="btn primary big" data-nav="home">Back to the train</button></main>`;
  S.session = null;
}

// ---------- Checkpoints ----------
async function handleCheckpoint(res, it, stationId, inSession = false) {
  const p = S.player; const st = STATIONS.find(s => s.id === stationId) || STATIONS.find(s => s.checkpoint === Object.keys(ITEMS).find(k => ITEMS[k] === it));
  const v = res.verdict;
  // Honesty check: compare mic verdict with the player's own recent ratings of this piece.
  let honestyNote = '';
  if (!res.paper && res.result) {
    const pianoItem = Object.keys(ITEMS).find(k => ITEMS[k].type === 'piano' && ITEMS[k].piece === it.piece);
    const s = pianoItem && p.items[pianoItem];
    p.honesty.micChecks++;
    if (s && s.last) {
      const agree = s.last === v || (s.last === 'nearly' && v === 'clean');
      if (agree) p.honesty.micAgree++;
      else if (s.last === 'clean' && v === 'notyet') honestyNote = 'The conductor heard a bit less than your practice ratings. That is very common. Try a slower tempo and listen closely to each note.';
    }
  }
  if (st) recordRating(p, st.checkpoint, v === 'unclear' ? 'notyet' : v);
  const passed = v === 'clean' || v === 'nearly';
  if (passed && st) {
    const grade = v === 'clean' && !res.paper ? 'gold' : 'silver';
    const prev = p.stations[st.id];
    const already = prev && (prev.status === 'passed' || prev.status === 'placed');
    if (!already || (grade === 'gold' && prev.grade !== 'gold')) passStation(p, st.id, 'passed', { grade, paper: !!res.paper });
    if (!already) { p.miles += 50; addSkill(p, it.skill, 15); }
    if (inSession && S.session) S.session.miles += already ? 0 : 50;
  }
  await save();
  const nextSt = st ? STATIONS[STATIONS.indexOf(st) + 1] : null;
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet">${passed
    ? `<div class="big-emoji" aria-hidden="true">${v === 'clean' && !res.paper ? '🥇' : '🎫'}</div><h2>${v === 'clean' && !res.paper ? 'Gold stamp!' : 'Ticket stamped!'}</h2>
       <p>${res.paper ? 'Paper ticket accepted. The conductor will listen in at a later stop.' : v === 'clean' ? 'Clean and steady. The whole carriage applauds.' : 'Nearly there, and that earns a silver stamp. You can retake it for gold any time.'}</p>
       ${st ? `<div class="pc big"><span aria-hidden="true">🖼️</span><strong>Postcard: ${esc(st.name)}</strong><small>${esc(st.postcard)}</small></div>` : ''}
       ${nextSt ? `<p class="story-sm">Next stop: <strong>${esc(nextSt.name)}</strong>. ${esc(nextSt.story)}</p>` : '<p>That is the end of the line in this version. More lines are coming!</p>'}`
    : `<div class="big-emoji" aria-hidden="true">🚉</div><h2>Not yet, and that's okay</h2><p>The train waits at this station as long as you need. Loop the trickiest phrase, slow the tempo, and try again next time. Every try counts as practice.</p>`}
    ${honestyNote ? `<p class="notice">${honestyNote}</p>` : ''}
    <button class="btn primary big" data-ok>Continue</button></div>`;
  document.body.appendChild(ov);
  ov.querySelector('[data-ok]').onclick = () => { ov.remove(); if (inSession) nextBlock(); else go('station', st ? st.id : 'f1'); };
}

// ---------- Mic check (inspection / quick listen / audition) ----------
function openMicCheck({ pieceId, onResult, quick = false, audition = false }) {
  const p = S.player; const piece = PIECES[pieceId];
  const target = judgedNotes(piece).map(n => piece.swing && Math.abs((n.beat % 1) - 0.5) < 1e-6 ? { ...n, beat: n.beat + 1 / 6 } : n);
  const chords = target.some(n => Array.isArray(n.midi) && new Set(n.midi.map(m => m % 12)).size > 1);
  const viaMidi = midiConnected();
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = '<div class="sheet mic"></div>'; document.body.appendChild(ov);
  const sh = ov.querySelector('.sheet');
  let listener = null, timers = [], closed = false;
  const close = (result) => {
    if (closed) return; closed = true;
    listener && listener.stop(); timers.forEach(clearTimeout); closeMic(); ov.remove();
    onResult && onResult(result);
  };
  const cancelBtn = '<button class="btn ghost" data-cancel>Cancel</button>';
  sh.onclick = e => { if (e.target.closest('[data-cancel]')) close(null); };

  if (viaMidi) { setTimeout(() => ready(), 0); }
  else if (!micSupported()) { sh.innerHTML = `<h2>No microphone here</h2><p>This browser can't use the microphone. Use a paper ticket for now, or open Night Train in Safari/Chrome over HTTPS.</p>${cancelBtn}`; return; }

  const askMic = async () => {
    sh.innerHTML = `<h2>${audition ? 'Quick audition' : quick ? 'Quick listen' : 'Ticket inspection'}</h2><p>Night Train needs to hear your piano. The sound stays on this phone and is never recorded or sent anywhere.</p><button class="btn primary big" data-allow>Allow microphone</button>${cancelBtn}`;
    sh.querySelector('[data-allow]').onclick = async () => {
      try { await unlockAudio(); await openMic(); p.calibration ? ready() : calibrate(); }
      catch (err) {
        console.warn(err);
        sh.innerHTML = `<h2>Microphone blocked</h2><p>${isIOS ? 'On iPhone: open Settings › Safari › Microphone and choose Allow (or Ask), then try again. If you installed Night Train to your Home Screen, close and reopen it.' : 'Allow microphone access in your browser settings for this site, then try again.'}</p><p>You can use a paper ticket instead for now.</p>${cancelBtn}`;
      }
    };
  };

  const calibrate = async () => {
    sh.innerHTML = `<h2>Set up listening (once)</h2><ol class="steps"><li class="on">Put the phone on the music stand, screen facing you.</li><li>Stay quiet for 2 seconds.</li><li>Play Middle C three times.</li></ol><button class="btn primary big" data-go>Ready</button>${cancelBtn}`;
    sh.querySelector('[data-go]').onclick = async () => {
      const lis = sh.querySelectorAll('.steps li'); lis[0].classList.remove('on'); lis[1].classList.add('on');
      sh.querySelector('[data-go]').disabled = true; sh.querySelector('[data-go]').textContent = 'Listening to the room…';
      const noise = await measureNoise(2000);
      if (closed) return;
      lis[1].classList.remove('on'); lis[2].classList.add('on');
      sh.querySelector('[data-go]').textContent = 'Play Middle C three times…';
      const heard = [];
      listener = listen({ noiseFloor: noise, onNote: ev => { heard.push(ev); sh.querySelector('[data-go]').textContent = `Heard ${noteName(ev.midi)} (${heard.length})`; } });
      await new Promise(r => { const t0 = Date.now(); const iv = setInterval(() => { if (heard.length >= 3 || Date.now() - t0 > 9000 || closed) { clearInterval(iv); r(); } }, 100); });
      listener.stop(); listener = null;
      if (closed) return;
      const cs = heard.filter(h => ((h.midi % 12) + 12) % 12 === 0);
      const cents = cs.length ? cs.map(h => (h.raw - Math.round(h.raw)) * 100).sort((a, b) => a - b)[Math.floor(cs.length / 2)] : 0;
      p.calibration = { noiseFloor: noise, centsOffset: Math.max(-45, Math.min(45, cents)), at: Date.now(), cHeard: cs.length };
      await save();
      let msg = cs.length >= 2 ? '✓ I can hear your piano clearly.' : heard.length ? 'I heard notes, but not clearly as C. That can happen with phone placement. We will try anyway.' : "I couldn't hear the piano. Try moving the phone closer or playing a little louder.";
      if (noise > 0.02) msg += ' The room is a bit noisy. A quieter room helps.';
      if (Math.abs(cents) > 20 && cs.length >= 2) msg += ` Your piano sounds about ${Math.abs(Math.round(cents))} cents ${cents < 0 ? 'flat' : 'sharp'}, so I will adjust for that. (A tuning may be due.)`;
      sh.innerHTML = `<h2>Setup done</h2><p>${msg}</p><div class="row"><button class="btn" data-again>Redo setup</button><button class="btn primary" data-ok>Continue</button></div>${cancelBtn}`;
      sh.querySelector('[data-again]').onclick = calibrate;
      sh.querySelector('[data-ok]').onclick = ready;
    };
  };

  const ready = () => {
    const bpm = Math.round(piece.bpm * 0.8);
    sh.innerHTML = `<h2>${audition ? 'Audition' : quick ? 'Quick listen' : 'Ticket inspection'}: ${esc(piece.title)}</h2>
      <div class="staffwrap">${pieceScore(piece, { letters: (p.readingLevel ?? 0) <= 2 && !chords && !piece.grand, barsPerLine: 2 })}</div>
      <p>${viaMidi ? `🎹 Listening to your keyboard (${esc(midiName())}). ` : ''}Tap Start. After ${(piece.beatsPerBar || 4)} clicks, play${piece.lh ? ' the right hand' : ''}. Any steady speed is fine.${chords && !viaMidi ? ' Play each chord firmly, all notes together.' : ''}</p>
      <div class="meter" aria-hidden="true"><span></span></div><p class="heard" aria-live="polite">&nbsp;</p>
      <div class="row"><button class="btn primary big" data-start>Start</button><button class="btn" data-done hidden>I'm done</button></div>${cancelBtn}`;
    sh.querySelector('[data-start]').onclick = () => run(bpm);
  };

  const run = async (bpm) => {
    const startBtn = sh.querySelector('[data-start]'); startBtn.disabled = true;
    const doneBtn = sh.querySelector('[data-done]'); doneBtn.hidden = false;
    const heardEl = sh.querySelector('.heard'); const meter = sh.querySelector('.meter span');
    const c = audio(); const spb = 60 / bpm; const t0 = c.currentTime + 0.2;
    const bpb = piece.beatsPerBar || 4;
    for (let k = 0; k < bpb; k++) { click(t0 + k * spb, k === 0); timers.push(setTimeout(() => { heardEl.textContent = `Count-in: ${k + 1}`; }, (t0 + k * spb - c.currentTime) * 1000)); }
    const musicStart = t0 + bpb * spb;
    timers.push(setTimeout(() => { heardEl.textContent = 'Play now!'; }, (musicStart - c.currentTime) * 1000));
    const heard = []; let lastAt = 0;
    const cal = p.calibration || { noiseFloor: 0.004, centsOffset: 0 };
    const onEv = ev => { if (ev.t < musicStart - 0.3) return; heard.push(ev); lastAt = Date.now(); heardEl.textContent = 'Heard: ' + heard.slice(-6).map(h => h.notes && h.notes.length > 1 ? h.notes.map(noteName).join('+') : h.midi !== null && h.midi !== undefined ? noteName(h.midi) : '♪').join(' '); };
    if (viaMidi) listener = listenMIDI(onEv);
    else listener = listen({ noiseFloor: cal.noiseFloor, centsOffset: cal.centsOffset, wantChroma: chords,
      onLevel: (r, gate) => { meter.style.width = Math.min(100, r / (gate * 6) * 100) + '%'; },
      onNote: onEv });
    const total = Math.max(...target.map(n => n.beat + n.dur));
    const maxMs = ((musicStart - c.currentTime) + total * spb * 2.2 + 3) * 1000;
    const tStart = Date.now();
    const finish = () => {
      listener && listener.stop(); listener = null;
      const r = judge(target, heard);
      p.micLog = (p.micLog || []).concat([{ at: Date.now(), piece: piece.title, v: r.verdict, ps: Math.round(r.pitchScore * 100), rs: r.rhythmScore === null ? null : Math.round(r.rhythmScore * 100), heard: heard.length, n: target.length, chords, via: viaMidi ? 'keyboard' : 'mic', bpm: Math.round(r.tempo || 0) }]).slice(-80);
      save();
      showResult(r);
    };
    doneBtn.onclick = finish;
    const iv = setInterval(() => {
      if (closed) { clearInterval(iv); return; }
      const enough = heard.length >= target.length && Date.now() - lastAt > 1500;
      if (enough || Date.now() - tStart > maxMs) { clearInterval(iv); finish(); }
    }, 200);
    timers.push(iv);
  };

  const showResult = (r) => {
    const marks = {}; r.per.forEach((x, i) => { marks[i] = x.status; });
    const title = { clean: '✓ Clean!', nearly: '≈ Nearly!', notyet: '↻ Not yet', unclear: "🤔 I couldn't hear that clearly" }[r.verdict];
    sh.innerHTML = `<h2>${title}</h2>
      ${r.verdict !== 'unclear' ? `<div class="staffwrap">${pieceScore(piece, { marks, barsPerLine: 2 })}</div>` : ''}
      <ul class="msgs">${r.messages.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
      <div class="row"><button class="btn" data-retry>Try again</button>
      ${r.verdict === 'unclear' ? '<button class="btn" data-recal>Redo setup</button>' : '<button class="btn primary" data-accept>Continue</button>'}</div>${cancelBtn}`;
    sh.querySelector('[data-retry]').onclick = ready;
    const rc = sh.querySelector('[data-recal]'); if (rc) rc.onclick = calibrate;
    const ac = sh.querySelector('[data-accept]'); if (ac) ac.onclick = () => close(r);
  };
  askMic();
}

// ---------- Family duet (two phones, one piano, no server) ----------
// The host's 6-character code carries the piece, both parts and the tempo. The host phone plays a loud
// count-in; the partner phone hears those clicks and lines its clock up with them. Each phone judges only
// its own player's notes (by pitch range), then the players swap 2-character result codes.
const DUET_PIECES = ['jingleDuet', 'odeDuet'];
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function duetCode(pi, hp, pp, pct) {
  const t = Math.round(pct * 100) - 40;
  const body = ALPH[pi] + ALPH[hp] + ALPH[pp] + ALPH[Math.floor(t / 32)] + ALPH[t % 32];
  const sum = [...body].reduce((a, ch) => a + ALPH.indexOf(ch), 0) % 32;
  return body + ALPH[sum];
}
function readDuetCode(code) {
  code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) return null;
  const v = [...code].map(ch => ALPH.indexOf(ch)); if (v.some(x => x < 0)) return null;
  if (v.slice(0, 5).reduce((a, b) => a + b, 0) % 32 !== v[5]) return null;
  if (!DUET_PIECES[v[0]]) return null;
  return { pi: v[0], hp: v[1], pp: v[2], pct: (v[3] * 32 + v[4] + 40) / 100 };
}
const resultCode = (ps, rs) => ALPH[Math.min(31, Math.round(ps * 31))] + ALPH[Math.min(31, Math.round((rs ?? 1) * 31))];
const readResult = c => { c = (c || '').toUpperCase().trim(); if (c.length !== 2) return null; const a = ALPH.indexOf(c[0]), b = ALPH.indexOf(c[1]); return a < 0 || b < 0 ? null : { ps: a / 31, rs: b / 31 }; };

function viewDuet() {
  const p = S.player;
  const st = S.duet || (S.duet = { pi: 0, hp: 0, pp: 1, pct: 0.8, role: null });
  const piece = PIECES[DUET_PIECES[st.pi]]; const parts = piece.duet.parts;
  let body = '';
  if (!st.role) {
    body = `<p class="lesson-text">One phone <strong>hosts</strong> and shows a code. The other phone <strong>joins</strong> with that code. Put both phones on the music stand.</p>
      <div class="row"><button class="btn primary big" data-host>Host a duet</button><button class="btn big" data-join>Join with a code</button></div>`;
  } else if (st.role === 'host' && !st.ready) {
    body = `<h2>Choose the duet</h2>
      <div class="seg">${DUET_PIECES.map((id, i) => `<button class="${st.pi === i ? 'on' : ''}" data-pi="${i}">${esc(PIECES[id].title.replace(' duet', ''))}</button>`).join('')}</div>
      <p><strong>${esc(p.name)} plays:</strong></p><div class="opts">${parts.map((x, i) => `<button class="opt ${st.hp === i ? 'on' : ''}" data-hp="${i}">${esc(x.name)}</button>`).join('')}</div>
      <p><strong>Partner plays:</strong></p><div class="opts">${parts.map((x, i) => i === st.hp || (st.hp !== 0 && i !== 0) ? '' : `<button class="opt ${st.pp === i ? 'on' : ''}" data-pp="${i}">${esc(x.name)}</button>`).join('')}</div>
      <label class="tempo">Tempo <strong data-tv>${Math.round(st.pct * 100)}%</strong><input type="range" min="40" max="120" step="5" value="${Math.round(st.pct * 100)}" data-dt></label>
      <button class="btn primary big" data-ready>Show the code</button>`;
  } else if (st.role === 'join' && !st.ready) {
    body = `<h2>Join a duet</h2><label class="field">Code from the host phone<input type="text" data-code maxlength="7" autocapitalize="characters" placeholder="e.g. AB3KQX"></label>
      <button class="btn primary big" data-joincode>Join</button><p class="fb" aria-live="polite"></p>`;
  } else {
    const mine = st.role === 'host' ? st.hp : st.pp; const theirs = st.role === 'host' ? st.pp : st.hp;
    const v = pieceView(piece, parts[mine].id);
    body = `${st.role === 'host' ? `<div class="card center"><p class="muted small">Partner: tap "Join with a code" and enter</p><p class="bigcode">${duetCode(st.pi, st.hp, st.pp, st.pct)}</p></div>` : ''}
      <p><strong>${esc(piece.title)}</strong> · you play <strong>${esc(parts[mine].name)}</strong>, partner plays ${esc(parts[theirs].name)} · ${Math.round(piece.bpm * st.pct)} bpm</p>
      <div class="staffwrap">${renderScore(v.staves, { beatsPerBar: v.beatsPerBar, barsPerLine: 2, letters: !v.events.some(n => Array.isArray(n.midi)) })}</div>
      <div class="count bigcount" aria-live="polite">${st.role === 'host' ? 'When you are both ready, tap Start.' : 'Tap "Listen for count-in", then wait for the host.'}</div>
      <div class="row">${st.role === 'host' ? '<button class="btn primary big" data-go>Start (loud count-in)</button>' : '<button class="btn primary big" data-listenci>Listen for count-in</button>'}</div>
      <label class="tog"><input type="checkbox" data-nomic ${st.nomic ? 'checked' : ''}> Play without the microphone (rate yourselves)</label>
      <div class="duetres"></div>`;
  }
  app.innerHTML = `${topbar('Family duet')}<main class="wrap"><button class="btn ghost back" data-nav="home">‹ Train</button>${body}</main>`;
  const rerender = () => viewDuet();
  app.onclick = async e => {
    const t = e.target;
    if (t.closest('[data-host]')) { st.role = 'host'; rerender(); }
    if (t.closest('[data-join]')) { st.role = 'join'; rerender(); }
    const pi = t.closest('[data-pi]'); if (pi) { st.pi = +pi.dataset.pi; rerender(); }
    const hp = t.closest('[data-hp]'); if (hp) { st.hp = +hp.dataset.hp; st.pp = st.hp === 0 ? 1 : 0; rerender(); }
    const pp = t.closest('[data-pp]'); if (pp) { st.pp = +pp.dataset.pp; rerender(); }
    if (t.closest('[data-ready]')) { st.ready = true; rerender(); }
    if (t.closest('[data-joincode]')) {
      const d = readDuetCode($('[data-code]').value);
      if (!d) { $('.fb').textContent = 'That code does not look right. Check the 6 characters on the host phone.'; return; }
      Object.assign(st, d, { ready: true }); rerender();
    }
    if (t.closest('[data-go]')) { await unlockAudio(); runDuet(true); }
    if (t.closest('[data-listenci]')) { await unlockAudio(); runDuet(false); }
  };
  app.onchange = e => {
    if (e.target.matches('[data-nomic]')) st.nomic = e.target.checked;
    if (e.target.matches('[data-dt]')) st.pct = +e.target.value / 100;
  };
  app.oninput = e => { if (e.target.matches('[data-dt]')) $('[data-tv]').textContent = e.target.value + '%'; };
  S.cleanup.push(() => { app.onclick = null; app.onchange = null; app.oninput = null; duetStop(); });
}

let duetCtl = { listener: null, timers: [] };
function duetStop() { duetCtl.listener && duetCtl.listener.stop(); duetCtl.timers.forEach(clearTimeout); duetCtl = { listener: null, timers: [] }; closeMic(); }

async function runDuet(isHost) {
  duetStop();
  const p = S.player; const st = S.duet;
  const piece = PIECES[DUET_PIECES[st.pi]]; const parts = piece.duet.parts;
  const mine = parts[isHost ? st.hp : st.pp];
  const target = mine.notes;
  const spb = 60 / (piece.bpm * st.pct); const bpb = piece.beatsPerBar || 4;
  const box = $('.bigcount'); const res = $('.duetres');
  const c = audio();
  const total = Math.max(...target.map(n => n.beat + n.dur));
  const chords = target.some(n => Array.isArray(n.midi));
  const pitches = target.flatMap(n => Array.isArray(n.midi) ? n.midi : [n.midi]);
  const lo = Math.min(...pitches) - 3, hi = Math.max(...pitches) + 3;
  let musicStart = null; const heard = [];
  const useMic = !st.nomic && micSupported();
  if (useMic) { try { await openMic(); } catch { toast('Microphone blocked. Playing without it.'); st.nomic = true; } }
  const cal = p.calibration || { noiseFloor: 0.004, centsOffset: 0 };
  const beginPlay = () => {
    box.textContent = 'Play!';
    for (let b = 0; b < total; b++) duetCtl.timers.push(setTimeout(() => { box.textContent = `Bar ${Math.floor(b / bpb) + 1} · beat ${(b % bpb) + 1}`; }, (musicStart + b * spb - c.currentTime) * 1000));
    duetCtl.timers.push(setTimeout(finish, (musicStart + total * spb + 1.5 - c.currentTime) * 1000));
  };
  const onNote = ev => {
    if (musicStart === null || ev.t < musicStart - 0.3) return;
    if (ev.midi !== null && ev.midi !== undefined && (ev.midi < lo || ev.midi > hi) && !chords) return; // the other player's notes
    heard.push(ev);
  };
  if (isHost) {
    const t0 = c.currentTime + 0.3;
    for (let k = 0; k < bpb; k++) { click(t0 + k * spb, k === 0, true); duetCtl.timers.push(setTimeout(() => { box.textContent = `Count-in: ${k + 1}`; }, (t0 + k * spb - c.currentTime) * 1000)); }
    musicStart = t0 + bpb * spb;
    if (!st.nomic) duetCtl.listener = listen({ noiseFloor: cal.noiseFloor, centsOffset: cal.centsOffset, wantChroma: chords, onNote });
    duetCtl.timers.push(setTimeout(beginPlay, (musicStart - c.currentTime) * 1000 - 30));
  } else {
    if (st.nomic) { box.textContent = 'No mic: start together when the host counts in. Tap here on beat 1.'; box.onclick = () => { musicStart = c.currentTime; box.onclick = null; beginPlay(); }; return; }
    box.textContent = 'Listening for the count-in…';
    const onsets = [];
    duetCtl.listener = listen({ noiseFloor: cal.noiseFloor, centsOffset: cal.centsOffset, wantChroma: chords, onNote,
      onOnset: o => {
        if (musicStart !== null) return;
        onsets.push(o.t);
        // look for bpb clicks evenly spaced at the agreed tempo
        const last = onsets.slice(-bpb);
        if (last.length === bpb) {
          const gaps = last.slice(1).map((x, i) => x - last[i]);
          if (gaps.every(g => Math.abs(g - spb) < spb * 0.22)) { musicStart = last[bpb - 1] + spb; beginPlay(); }
        }
      } });
    duetCtl.timers.push(setTimeout(() => { if (musicStart === null) box.textContent = "I didn't hear the count-in. Move closer to the host phone and try again."; }, 15000));
  }
  function finish() {
    duetCtl.listener && duetCtl.listener.stop(); duetCtl.listener = null; closeMic();
    box.textContent = 'Done!';
    if (st.nomic) {
      res.innerHTML = `<p>How did it go?</p><div class="rate"><button class="btn r-clean" data-dr="clean">✓ Together!</button><button class="btn r-nearly" data-dr="nearly">≈ Mostly</button><button class="btn r-notyet" data-dr="notyet">↻ Again</button></div>`;
      res.onclick = ev => { const b = ev.target.closest('[data-dr]'); if (b) { duetReward(b.dataset.dr); res.innerHTML = '<p>Saved. Play it again anytime!</p>'; } };
      return;
    }
    const r = judge(target, heard);
    const mineCode = resultCode(r.pitchScore, r.rhythmScore);
    res.innerHTML = `<h2>${{ clean: '✓ Clean!', nearly: '≈ Nearly!', notyet: '↻ Not yet', unclear: "🤔 Couldn't hear clearly" }[r.verdict]}</h2>
      <ul class="msgs">${r.messages.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
      <div class="card center"><p class="muted small">Your result code (tell your partner):</p><p class="bigcode">${mineCode}</p>
      <label class="field">Partner's result code<input type="text" maxlength="2" data-pr autocapitalize="characters"></label><button class="btn" data-combine>Combine</button><p class="combined" aria-live="polite"></p></div>
      <button class="btn" data-again>Play again</button>`;
    if (r.verdict !== 'unclear') duetReward(r.verdict);
    res.onclick = ev => {
      if (ev.target.closest('[data-again]')) { res.innerHTML = ''; runDuet(isHost); }
      if (ev.target.closest('[data-combine]')) {
        const o = readResult($('[data-pr]').value); if (!o) { $('.combined').textContent = 'Enter the 2-character code from the other phone.'; return; }
        const both = (r.pitchScore + o.ps) / 2 * 0.6 + (((r.rhythmScore ?? 1) + o.rs) / 2) * 0.4;
        const stars = both >= 0.9 ? 3 : both >= 0.7 ? 2 : both >= 0.4 ? 1 : 0;
        $('.combined').innerHTML = `<span class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span> Duet score ${Math.round(both * 100)}%`;
      }
    };
  }
}
async function duetReward(v) {
  const p = S.player;
  p.miles += v === 'clean' ? 20 : v === 'nearly' ? 14 : 8; addSkill(p, 'rhythm', 6);
  p.duets = (p.duets || 0) + 1; p.duetLog = (p.duetLog || []).concat([Date.now()]).slice(-100);
  await save(); toast(`+${v === 'clean' ? 20 : v === 'nearly' ? 14 : 8} miles · duet #${p.duets}`);
}

// ---------- My Own Song ----------
function viewSongs() {
  const p = S.player; const list = p.songs || [];
  app.innerHTML = `${topbar('My songs')}<main class="wrap"><button class="btn ghost back" data-nav="home">‹ Train</button>
    <p class="muted small">Chords only: type the chord chart, not the lyrics or melody. Great for songs from church or the radio.</p>
    <ul class="items">${list.map(sg => `<li><button class="item" data-song="${esc(sg.id)}"><span>${esc(sg.title)}</span><small>Key of ${esc(sg.key)}</small></button></li>`).join('') || '<li class="muted">No songs yet.</li>'}</ul>
    <button class="btn primary big" data-new>+ New song</button></main>`;
  app.querySelectorAll('[data-song]').forEach(b => b.onclick = () => go('song', b.dataset.song));
  $('[data-new]').onclick = () => go('songedit', null);
}
function viewSongEdit(id) {
  const p = S.player; p.songs = p.songs || [];
  const sg = p.songs.find(x => x.id === id) || { id: null, title: '', key: 'G', chart: '', bpm: 72, style: 'worship', rhythm: 'hold' };
  app.innerHTML = `${topbar(sg.id ? 'Edit song' : 'New song')}<main class="wrap"><button class="btn ghost back" data-nav="songs">‹ My songs</button>
    <label class="field">Title<input type="text" data-t maxlength="60" value="${esc(sg.title)}" placeholder="e.g. Sunday opener"></label>
    <label class="field">Key<select data-k>${KEYS.map(k => `<option ${k === sg.key ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
    <label class="field">Chord chart (one chord per bar)
      <textarea data-c rows="5" placeholder="G D Em C | G D/F# C G&#10;or numbers: 1 5 6m 4 | 1 5/7 4 1">${esc(sg.chart)}</textarea></label>
    <p class="muted small">Tips: "C:2 G:2" = two chords in one bar · "-" = hold the last chord another bar · sus4, sus2, add9, m7, maj7, 7, slash chords (G/B) all work.</p>
    <p class="fb" aria-live="polite"></p>
    <label class="field">Tempo: <strong data-bv>${sg.bpm}</strong> bpm<input type="range" min="50" max="140" value="${sg.bpm}" data-b></label>
    <p>Band style</p><div class="seg">${[['worship', 'Worship'], ['pop', 'Pop'], ['pad', 'Pad only']].map(([v, l]) => `<button class="${sg.style === v ? 'on' : ''}" data-style="${v}">${l}</button>`).join('')}</div>
    <p>Right-hand rhythm</p><div class="seg">${[['hold', 'Hold'], ['pulse', 'Quarter pulse'], ['332', '3 + 3 + 2']].map(([v, l]) => `<button class="${sg.rhythm === v ? 'on' : ''}" data-rhythm="${v}">${l}</button>`).join('')}</div>
    <button class="btn primary big" data-save>Save and practice</button>
    ${sg.id ? '<button class="btn ghost" data-del>Delete song</button>' : ''}</main>`;
  const check = () => { const r = parseChart($('[data-c]').value, $('[data-k]').value); $('.fb').innerHTML = r.bad.length ? `<span class="no">Not understood: ${esc(r.bad.join(', '))}</span>` : r.bars.length ? `<span class="ok">✓ ${r.bars.length} bars: ${r.bars.slice(0, 8).map(b => esc(displayName(b, $('[data-k]').value))).join(' ')}${r.bars.length > 8 ? ' …' : ''}</span>` : ''; return r; };
  $('[data-c]').oninput = check; $('[data-k]').onchange = check; check();
  $('[data-b]').oninput = e => { $('[data-bv]').textContent = e.target.value; };
  app.querySelectorAll('[data-style]').forEach(b => b.onclick = () => { sg.style = b.dataset.style; app.querySelectorAll('[data-style]').forEach(x => x.classList.toggle('on', x === b)); });
  app.querySelectorAll('[data-rhythm]').forEach(b => b.onclick = () => { sg.rhythm = b.dataset.rhythm; app.querySelectorAll('[data-rhythm]').forEach(x => x.classList.toggle('on', x === b)); });
  $('[data-save]').onclick = async () => {
    const r = check();
    if (!r.bars.length) { $('.fb').innerHTML = '<span class="no">Type at least one chord.</span>'; return; }
    Object.assign(sg, { title: $('[data-t]').value.trim() || 'My song', key: $('[data-k]').value, chart: $('[data-c]').value.trim(), bpm: +$('[data-b]').value, transpose: 0 });
    if (!sg.id) { sg.id = 's' + Date.now().toString(36); p.songs.push(sg); }
    await save(); go('song', sg.id);
  };
  const d = $('[data-del]'); if (d) d.onclick = async () => { if (!confirm(`Delete "${sg.title}"?`)) return; p.songs = p.songs.filter(x => x.id !== sg.id); await save(); go('songs'); };
}
function viewSong(id) {
  const p = S.player; const sg = (p.songs || []).find(x => x.id === id); if (!sg) return go('songs');
  const built = buildSongPiece(sg);
  const pid = 'song:' + sg.id;
  PIECES[pid] = built.piece;
  ITEMS[pid] = { type: 'piano', title: sg.title, piece: pid, skill: 'technique', minutes: 3,
    howto: 'Right hand: smooth chord voicings (the app chose the closest shapes). Left hand: the bass note. Start with the band and right hand only, then add the left hand.' };
  const { bars } = parseChart(sg.chart, sg.key);
  const nums = bars.map(b => numberOf(b, sg.key));
  app.innerHTML = `${topbar(sg.title)}<main class="wrap"><button class="btn ghost back" data-nav="songs">‹ My songs</button>
    <div class="card"><div class="row"><label class="field" style="flex:1">Play in key<select data-tk>${KEYS.map(k => `<option ${k === built.key ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <button class="btn sm ghost" data-edit>Edit chart</button></div>
      <p class="small"><strong>Numbers:</strong> ${nums.map(esc).join(' · ')}</p></div>
    <div class="block"></div></main>`;
  $('[data-tk]').onchange = async e => { sg.transpose = (KEYS.indexOf(e.target.value) - KEYS.indexOf(sg.key) + 12) % 12; await save(); viewSong(id); };
  $('[data-edit]').onclick = () => go('songedit', sg.id);
  const block = { kind: 'free', id: pid, label: 'My song' };
  const stop = mountBlock($('.block'), block, blockCtx(async res => { applyResult(res, block); await save(); toast(`+${res.miles || 0} miles`); go('songs'); }));
  S.cleanup.push(stop);
}

// ---------- Backup ----------
function viewBackup() {
  const p = S.player; const stt = store.status();
  app.innerHTML = `${topbar('Backup')}<main class="wrap">
    <button class="btn ghost back" data-nav="home">‹ Train</button>
    <section class="card"><h2>Is ${esc(p.name)}'s progress safe?</h2>
      <ul class="status">
        <li>${stt.lastSavedAt || p.savedAt ? '✓' : '•'} Saved on this device: ${ago(stt.lastSavedAt || p.savedAt)}</li>
        <li>${stt.persisted ? '✓ Protected storage is on' : '• Protected storage: not granted by the browser (backups matter more)'}</li>
        <li>${p.lastBackup ? '✓' : '!'} Last backup: ${ago(p.lastBackup)}</li>
        <li>✓ Two copies kept on this device (database + mirror)</li>
      </ul>
      <p class="muted small">Each player has their own backup. Keep it in Notes, email it to yourself, or save the file to iCloud Drive.</p></section>
    <section class="card"><h2>Backup code</h2>
      <button class="btn primary" data-code>Make backup code</button>
      <textarea class="code" rows="4" readonly hidden aria-label="Backup code"></textarea>
      <div class="row" data-coderow hidden><button class="btn" data-copy>Copy</button>${navigator.share ? '<button class="btn" data-share>Share…</button>' : ''}</div></section>
    <section class="card"><h2>Backup file</h2><button class="btn" data-file>Save backup file</button></section>
    <section class="card"><h2>Restore</h2><p class="muted small">To restore or move progress to another device, go to the player list and choose "Restore from a backup".</p>
      <button class="btn ghost" data-nav="restore">Restore…</button></section>
  </main>`;
  const mark = async () => { p.lastBackup = Date.now(); p.sessionsSinceBackup = 0; await save(); };
  $('[data-code]').onclick = async () => {
    const code = await store.makeBackupCode(p);
    const ta = $('textarea.code'); ta.value = code; ta.hidden = false; $('[data-coderow]').hidden = false; ta.select();
  };
  $('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText($('textarea.code').value); toast('✓ Copied. Paste it into Notes or an email.'); await mark(); } catch { $('textarea.code').select(); toast('Select the code and copy it.'); } };
  const sb = $('[data-share]'); if (sb) sb.onclick = async () => { try { await navigator.share({ title: `Night Train backup: ${p.name}`, text: $('textarea.code').value }); await mark(); toast('✓ Shared'); } catch { /* cancelled */ } };
  $('[data-file]').onclick = async () => {
    const text = store.backupFileText(p);
    const name = `nighttrain-${p.name.replace(/\W+/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([text], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); }
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
      await mark(); toast('✓ Backup file saved');
    } catch { /* cancelled */ }
  };
}

// ---------- Mic report ----------
function micStats(p) {
  const log = p.micLog || [];
  const by = v => log.filter(x => x.v === v).length;
  const ch = log.filter(x => x.chords), single = log.filter(x => !x.chords);
  const okRate = a => a.length ? Math.round(a.filter(x => x.v === 'clean' || x.v === 'nearly').length / a.length * 100) : null;
  return { n: log.length, clean: by('clean'), nearly: by('nearly'), notyet: by('notyet'), unclear: by('unclear'), chords: ch.length, chordOk: okRate(ch), singleOk: okRate(single), log };
}
function micReportHtml(p) {
  const s0 = micStats(p);
  if (!s0.n) return '<p class="muted small">No mic or keyboard checks yet. Every ticket inspection and quick listen will be logged here.</p>';
  const when = t => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `<p class="small">${s0.n} check${s0.n === 1 ? '' : 's'}: ✓ ${s0.clean} clean · ≈ ${s0.nearly} nearly · ↻ ${s0.notyet} not yet · 🤔 ${s0.unclear} couldn't hear</p>
    <p class="small">Single-note pieces passed: ${s0.singleOk === null ? 'none yet' : s0.singleOk + '%'} · Chord pieces passed: ${s0.chordOk === null ? 'none yet' : s0.chordOk + '%'}${s0.unclear / s0.n > 0.25 ? ' · <strong>Lots of "couldn\'t hear": try the phone closer or redo mic setup.</strong>' : ''}</p>
    <ul class="miclog">${s0.log.slice(-8).reverse().map(x => `<li><span>${when(x.at)} · ${esc(x.piece)}${x.chords ? ' (chords)' : ''}</span><small>${{ clean: '✓', nearly: '≈', notyet: '↻', unclear: '🤔' }[x.v]} notes ${x.ps}% · rhythm ${x.rs ?? '–'}% · heard ${x.heard}/${x.n}${x.via === 'keyboard' ? ' · 🎹' : ''}</small></li>`).join('')}</ul>`;
}
function micReportText(p) {
  const s0 = micStats(p);
  const lines = [`Night Train mic report for ${p.name} (v${store.APP_VERSION})`, `${s0.n} checks: ${s0.clean} clean, ${s0.nearly} nearly, ${s0.notyet} not yet, ${s0.unclear} couldn't hear`,
    `Single notes passed: ${s0.singleOk ?? '-'}%  Chords passed: ${s0.chordOk ?? '-'}%`, `Calibration: ${p.calibration ? `noise ${p.calibration.noiseFloor.toFixed(4)}, tuning ${Math.round(p.calibration.centsOffset)} cents, heard C ${p.calibration.cHeard}/3` : 'not set up'}`, ''];
  s0.log.slice(-30).forEach(x => lines.push(`${new Date(x.at).toLocaleString()} | ${x.piece}${x.chords ? ' [chords]' : ''} | ${x.v} | notes ${x.ps}% rhythm ${x.rs ?? '-'}% | heard ${x.heard}/${x.n} | ${x.via}${x.bpm ? ' | ~' + x.bpm + ' bpm' : ''}`));
  return lines.join('\n');
}

// ---------- Settings ----------
function viewSettings() {
  const p = S.player;
  app.innerHTML = `${topbar('Settings')}<main class="wrap">
    <button class="btn ghost back" data-nav="home">‹ Train</button>
    <section class="card"><label class="field">Name<input type="text" data-name maxlength="24" value="${esc(p.name)}"></label></section>
    <section class="card"><h2>Carriage theme</h2><div class="themes">${THEMES.map(t => `<button class="theme th-${t.id} ${p.theme === t.id ? 'on' : ''}" data-theme="${t.id}" aria-pressed="${p.theme === t.id}"><strong>${t.name}</strong><span>${t.desc}</span></button>`).join('')}</div></section>
    <section class="card"><label class="field">Sessions per week: <strong data-wg>${p.weeklyGoal}</strong><input type="range" min="1" max="7" value="${p.weeklyGoal}" data-weekly></label></section>
    <section class="card"><h2>Reading help</h2><div class="opts">${READING_LEVELS.map(l => `<button class="opt ${(p.readingLevel ?? 0) === l.id ? 'on' : ''}" data-rl="${l.id}"><strong>${l.name}</strong><br><small>${l.desc}</small></button>`).join('')}</div></section>
    <section class="card"><h2>Lines</h2><div class="lines">${LINES.map(l => `<button class="line ${p.lines.includes(l.id) ? 'on' : ''}" data-line="${l.id}" ${l.id === 'foundations' ? 'disabled' : ''} aria-pressed="${p.lines.includes(l.id)}"><strong>${l.name}</strong><span>${l.who}</span></button>`).join('')}</div>${mainLinePicker(p)}</section>
    <section class="card"><h2>Sound</h2><label class="vol">🔊 Backing volume <input type="range" min="0" max="200" step="10" value="${Math.round((p.backingVol ?? 1) * 100)}" data-bvol></label>
      <button class="btn sm" data-testvol>▶ Test backing</button></section>
    <section class="card"><h2>Keyboard (MIDI)</h2>${midiSupported()
      ? `<p class="muted small">${midiConnected() ? `🎹 Connected: ${esc(midiName())}. Inspections and play-along tries are checked automatically.` : 'Plug the keyboard in with a USB cable, then tap Connect.'}</p><button class="btn" data-midi>Connect keyboard</button>`
      : '<p class="muted small">Not available in this browser. MIDI works on the MacBook in Chrome or Edge with a USB cable (not on iPhone, iPad, or Safari). The microphone works everywhere.</p>'}</section>
    <section class="card"><h2>Placement</h2><p class="muted small">Placed too low or too high? Retake the placement questions. Your progress is kept.</p><button class="btn" data-retake>Retake placement</button></section>
    <section class="card"><h2>Microphone</h2><p class="muted small">${p.calibration ? `Set up ${ago(p.calibration.at)}.` : 'Not set up yet. It will set up at your first ticket inspection.'}</p><button class="btn" data-recal>Redo listening setup</button></section>
    <section class="card"><h2>Microphone report</h2>${micReportHtml(p)}
      <div class="row"><button class="btn sm" data-micshare>Share report</button></div></section>
    <section class="card"><h2>About</h2><p>Night Train <strong>v${store.APP_VERSION}</strong></p>
      <button class="btn sm" data-upd>Check for update</button> <span class="muted small" data-updmsg></span></section>
    <section class="card danger"><h2>Remove player</h2><p class="muted small">This deletes ${esc(p.name)}'s progress from this device. Make a backup first.</p><button class="btn" data-del>Remove ${esc(p.name)}…</button></section>
  </main>`;
  $('[data-name]').onchange = async e => { const v = e.target.value.trim(); if (v) { p.name = v.slice(0, 24); await save(); syncMeta(); viewSettings(); } };
  app.querySelectorAll('[data-theme]').forEach(b => b.onclick = async () => { p.theme = b.dataset.theme; setTheme(p.theme); await save(); syncMeta(); viewSettings(); });
  const wk = $('[data-weekly]'); wk.oninput = () => { $('[data-wg]').textContent = wk.value; }; wk.onchange = async () => { p.weeklyGoal = +wk.value; await save(); };
  app.querySelectorAll('[data-rl]').forEach(b => b.onclick = async () => { p.readingLevel = +b.dataset.rl; await save(); viewSettings(); });
  app.querySelectorAll('[data-line]').forEach(b => b.onclick = async () => { const id = b.dataset.line; p.lines = p.lines.includes(id) ? p.lines.filter(x => x !== id) : [...p.lines, id]; await save(); viewSettings(); });
  app.querySelectorAll('[data-main]').forEach(b => b.onclick = async () => { p.mainLine = b.dataset.main; await save(); viewSettings(); });
  const bv = $('[data-bvol]'); bv.oninput = () => { p.backingVol = +bv.value / 100; setBackingVolume(p.backingVol); }; bv.onchange = () => save();
  $('[data-testvol]').onclick = async () => { await unlockAudio(); const { pad } = await import('./audio.js'); pad([48, 55, 60, 64], audio().currentTime + 0.05, 2.5); };
  const mb = $('[data-midi]'); if (mb) mb.onclick = async () => { const ok = await initMIDI(); try { localStorage.setItem('nighttrain:midi', '1'); } catch { /* ignore */ } toast(ok ? `🎹 Connected: ${esc(midiName())}` : 'No keyboard found. Check the USB cable and that the keyboard is on.'); viewSettings(); };
  $('[data-micshare]').onclick = async () => {
    const text = micReportText(p);
    try { if (navigator.share) await navigator.share({ title: `Night Train mic report: ${p.name}`, text }); else { await navigator.clipboard.writeText(text); toast('✓ Report copied'); } } catch { /* cancelled */ }
  };
  $('[data-upd]').onclick = async () => {
    const msg = $('[data-updmsg]'); msg.textContent = 'Checking…';
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (!reg) { msg.textContent = 'Updates install automatically when you reopen the app.'; return; }
      await reg.update();
      setTimeout(() => {
        const w = reg.waiting || reg.installing;
        if (w) { msg.textContent = 'New version found. Updating…'; w.postMessage('skipWaiting'); }
        else msg.textContent = `You're on the latest version (v${store.APP_VERSION}).`;
      }, 2500);
    } catch { msg.textContent = 'Could not check (offline?). Try again later.'; }
  };
  $('[data-retake]').onclick = () => { S.ob = { step: 4, played: null, reads: null, readScore: null, retake: true }; go('onboard'); };
  $('[data-recal]').onclick = async () => { p.calibration = null; await save(); openMicCheck({ pieceId: 'cdeUpDown', quick: true, onResult: () => viewSettings() }); };
  $('[data-del]').onclick = async () => {
    const typed = prompt(`Type ${p.name} to remove this player from this device.`);
    if (typed !== p.name) { toast('Not removed.'); return; }
    await store.deletePlayer(S.meta, p.id); S.player = null; toast('Player removed.'); go('players');
  };
}

// ---------- Boot ----------
async function boot() {
  try {
    S.meta = await store.loadMeta();
    try { if (localStorage.getItem('nighttrain:midi') === '1' && midiSupported()) initMIDI(); } catch { /* ignore */ }
    store.requestPersistence();
    // Heal the player list if a player record exists but meta was lost (belt and braces)
    if (S.meta.lastPlayer && S.meta.players.some(x => x.id === S.meta.lastPlayer)) await selectPlayer(S.meta.lastPlayer);
    else go('players');
  } catch (e) {
    console.error(e);
    app.innerHTML = `<main class="wrap"><h1>Something went wrong starting up</h1><p>${esc(e.message)}</p><p>Your saved progress has not been touched. Try reloading.</p></main>`;
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('A new version is ready. <button class="btn sm" id="upd">Update</button>', 15000);
            setTimeout(() => { const b = document.getElementById('upd'); if (b) b.onclick = () => { nw.postMessage('skipWaiting'); }; }, 50);
          }
        });
      });
    }).catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }
  // Save when the app goes to the background (iOS may kill it without warning).
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
}

// expose for debugging in the console
window.__nt = S;
void bindKeyboard; void renderKeyboard; void playNote; void parse;
boot();
