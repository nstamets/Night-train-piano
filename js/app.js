// Night Train: app shell, screens, and flow.
import * as store from './storage.js';
import { THEMES, LINES, STATIONS, ITEMS, PIECES, READING_LEVELS, parse } from './content.js';
import { buildSession, stationStatus, stationProgress, currentStation, passStation, stationReady, sessionsThisWeek, addSkill, skillLevel, recordRating } from './engine.js';
import { mountBlock } from './blocks.js';
import { renderStaff, renderKeyboard, bindKeyboard, letterOf } from './notation.js';
import { unlockAudio, playNote, click, audio } from './audio.js';
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
  const views = { players: viewPlayers, onboard: viewOnboard, home: viewHome, station: viewStation, session: viewSession, item: viewItem, backup: viewBackup, settings: viewSettings, summary: viewSummary, restore: viewRestore };
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
  setTheme(p.theme);
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
    <div class="row center"><button class="btn ghost" data-nav="restore">Restore from a backup</button></div>
    <p class="muted small center">v${store.APP_VERSION}</p>
  </main>`;
  app.querySelectorAll('[data-pid]').forEach(b => b.onclick = () => selectPlayer(b.dataset.pid));
  $('[data-add]').onclick = async () => {
    const name = (prompt('Player name?') || '').trim();
    if (!name) return;
    const p = store.newPlayer(name.slice(0, 24));
    S.meta.players.push({ id: p.id, name: p.name, theme: p.theme }); S.meta.lastPlayer = p.id;
    await store.savePlayer(p); await store.saveMeta(S.meta);
    S.player = p; S.ob = null; go('onboard');
  };
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
  const finish = async () => { p.onboarded = true; S.ob = null; await save(); syncMeta(); go('home'); };
  app.onclick = async e => {
    const t = e.target;
    if (t.closest('[data-next]')) { await save(); next(); }
    const th = t.closest('[data-theme]'); if (th) { p.theme = th.dataset.theme; setTheme(p.theme); viewOnboard(); }
    const ln = t.closest('[data-line]'); if (ln) { const id = ln.dataset.line; p.lines = p.lines.includes(id) ? p.lines.filter(x => x !== id) : [...p.lines, id]; viewOnboard(); }
    const mn = t.closest('[data-min]'); if (mn) { p.sessionMinutes = +mn.dataset.min; viewOnboard(); }
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
    </section>` : `<section class="card station-card"><h2>End of the line… for now!</h2><p>You've finished every station in this version. New lines are being laid for the next update. Keep reviewing to stay sharp.</p></section>`}
    <section class="start">
      <div class="seg" role="group" aria-label="Session length">${[10, 15, 25].map(m => `<button class="${p.sessionMinutes === m ? 'on' : ''}" data-min="${m}">${m} min</button>`).join('')}</div>
      <button class="btn primary huge" data-startsession>▶ Start today's practice</button>
    </section>
    <section class="card week"><div><strong>This week</strong> <span class="muted">${wk} of ${goal} sessions</span></div><div class="ring" aria-hidden="true">${ring}</div>
      <p class="muted small">${wk >= goal ? 'Weekly goal reached! Anything more is a bonus.' : 'Any days you like. No streak to break.'}</p></section>
    <h2 class="sec">Foundations Local</h2>
    <ol class="route">${STATIONS.filter(s => s.line === 'foundations').map(s => {
      const ss = stationStatus(p, s); const rec = p.stations[s.id] || {};
      const icon = ss === 'passed' ? (rec.grade === 'gold' ? '🥇' : '✓') : ss === 'placed' ? '⏩' : ss === 'locked' ? '🔒' : ss === 'ready' ? '🎫' : '🚉';
      const label = { passed: rec.grade === 'gold' ? 'Gold stamp' : 'Passed', placed: 'Express pass', locked: 'Locked', ready: 'Inspection ready', open: 'Current stop' }[ss];
      return `<li><button class="stop s-${ss}" data-nav="station" data-arg="${s.id}" ${ss === 'locked' ? 'disabled' : ''}><span class="ic" aria-hidden="true">${icon}</span><span><strong>${esc(s.name)}</strong><small>${label}</small></span></button></li>`;
    }).join('')}</ol>
    ${myLines.filter(l => !l.ready).length ? `<h2 class="sec">Your other lines</h2>${myLines.filter(l => !l.ready).map(l => `<div class="card dim"><strong>${l.name}</strong><p class="muted small">Track being laid. Arrives in an upcoming update.</p></div>`).join('')}` : ''}
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
    ${ss === 'ready' || ss === 'passed' || ss === 'placed' ? `<button class="btn primary big" data-item="${st.checkpoint}">🎫 ${ss === 'ready' ? 'Ticket inspection' : 'Retake inspection'}</button>` : `<p class="muted small center">Practice the starred work a couple of times to unlock the ticket inspection.</p>`}
  </main>`;
  app.querySelectorAll('[data-item]').forEach(b => b.onclick = () => { unlockAudio(); go('item', { id: b.dataset.item, station: st.id }); });
}

function viewItem({ id, station }) {
  const p = S.player;
  app.innerHTML = `${topbar('Practice')}<main class="wrap"><button class="btn ghost back" data-back>‹ ${esc(STATIONS.find(s => s.id === station).name)}</button><div class="block"></div></main>`;
  $('[data-back]').onclick = () => go('station', station);
  const el = $('.block');
  const block = { kind: 'free', id, label: 'Practice' };
  const stop = mountBlock(el, block, blockCtx(async res => {
    applyResult(res, block);
    if (res.checkpoint) { await handleCheckpoint(res, ITEMS[id], station); return; }
    await save();
    toast(`+${res.miles || 0} miles`);
    go('station', station);
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

  if (!micSupported()) { sh.innerHTML = `<h2>No microphone here</h2><p>This browser can't use the microphone. Use a paper ticket for now, or open Night Train in Safari/Chrome over HTTPS.</p>${cancelBtn}`; return; }

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
      <div class="staffwrap">${renderStaff(piece.notes, { letters: (p.readingLevel ?? 0) <= 2, barsPerLine: 2 })}</div>
      <p>Tap Start. After 4 clicks, play. Any steady speed is fine.</p>
      <div class="meter" aria-hidden="true"><span></span></div><p class="heard" aria-live="polite">&nbsp;</p>
      <div class="row"><button class="btn primary big" data-start>Start</button><button class="btn" data-done hidden>I'm done</button></div>${cancelBtn}`;
    sh.querySelector('[data-start]').onclick = () => run(bpm);
  };

  const run = async (bpm) => {
    const startBtn = sh.querySelector('[data-start]'); startBtn.disabled = true;
    const doneBtn = sh.querySelector('[data-done]'); doneBtn.hidden = false;
    const heardEl = sh.querySelector('.heard'); const meter = sh.querySelector('.meter span');
    const c = audio(); const spb = 60 / bpm; const t0 = c.currentTime + 0.2;
    for (let k = 0; k < 4; k++) { click(t0 + k * spb, k === 0); timers.push(setTimeout(() => { heardEl.textContent = `Count-in: ${k + 1}`; }, (t0 + k * spb - c.currentTime) * 1000)); }
    const musicStart = t0 + 4 * spb;
    timers.push(setTimeout(() => { heardEl.textContent = 'Play now!'; }, (musicStart - c.currentTime) * 1000));
    const heard = []; let lastAt = 0;
    const cal = p.calibration || { noiseFloor: 0.004, centsOffset: 0 };
    listener = listen({ noiseFloor: cal.noiseFloor, centsOffset: cal.centsOffset,
      onLevel: (r, gate) => { meter.style.width = Math.min(100, r / (gate * 6) * 100) + '%'; },
      onNote: ev => { if (ev.t < musicStart - 0.3) return; heard.push(ev); lastAt = Date.now(); heardEl.textContent = 'Heard: ' + heard.slice(-6).map(h => noteName(h.midi)).join(' '); } });
    const total = Math.max(...piece.notes.map(n => n.beat + n.dur));
    const maxMs = ((musicStart - c.currentTime) + total * spb * 2.2 + 3) * 1000;
    const tStart = Date.now();
    const finish = () => {
      listener && listener.stop(); listener = null;
      const r = judge(piece.notes, heard.map(h => ({ t: h.t, midi: h.midi })));
      showResult(r);
    };
    doneBtn.onclick = finish;
    const iv = setInterval(() => {
      if (closed) { clearInterval(iv); return; }
      const enough = heard.length >= piece.notes.length && Date.now() - lastAt > 1500;
      if (enough || Date.now() - tStart > maxMs) { clearInterval(iv); finish(); }
    }, 200);
    timers.push(iv);
  };

  const showResult = (r) => {
    const marks = {}; r.per.forEach((x, i) => { marks[i] = x.status === 'hit' ? 'hit' : x.status; });
    const title = { clean: '✓ Clean!', nearly: '≈ Nearly!', notyet: '↻ Not yet', unclear: "🤔 I couldn't hear that clearly" }[r.verdict];
    sh.innerHTML = `<h2>${title}</h2>
      ${r.verdict !== 'unclear' ? `<div class="staffwrap">${renderStaff(piece.notes, { marks, barsPerLine: 2 })}</div>` : ''}
      <ul class="msgs">${r.messages.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
      <div class="row"><button class="btn" data-retry>Try again</button>
      ${r.verdict === 'unclear' ? '<button class="btn" data-recal>Redo setup</button>' : '<button class="btn primary" data-accept>Continue</button>'}</div>${cancelBtn}`;
    sh.querySelector('[data-retry]').onclick = ready;
    const rc = sh.querySelector('[data-recal]'); if (rc) rc.onclick = calibrate;
    const ac = sh.querySelector('[data-accept]'); if (ac) ac.onclick = () => close(r);
  };
  askMic();
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

// ---------- Settings ----------
function viewSettings() {
  const p = S.player;
  app.innerHTML = `${topbar('Settings')}<main class="wrap">
    <button class="btn ghost back" data-nav="home">‹ Train</button>
    <section class="card"><label class="field">Name<input type="text" data-name maxlength="24" value="${esc(p.name)}"></label></section>
    <section class="card"><h2>Carriage theme</h2><div class="themes">${THEMES.map(t => `<button class="theme th-${t.id} ${p.theme === t.id ? 'on' : ''}" data-theme="${t.id}" aria-pressed="${p.theme === t.id}"><strong>${t.name}</strong><span>${t.desc}</span></button>`).join('')}</div></section>
    <section class="card"><label class="field">Sessions per week: <strong data-wg>${p.weeklyGoal}</strong><input type="range" min="1" max="7" value="${p.weeklyGoal}" data-weekly></label></section>
    <section class="card"><h2>Reading help</h2><div class="opts">${READING_LEVELS.map(l => `<button class="opt ${(p.readingLevel ?? 0) === l.id ? 'on' : ''}" data-rl="${l.id}"><strong>${l.name}</strong><br><small>${l.desc}</small></button>`).join('')}</div></section>
    <section class="card"><h2>Lines</h2><div class="lines">${LINES.map(l => `<button class="line ${p.lines.includes(l.id) ? 'on' : ''}" data-line="${l.id}" ${l.id === 'foundations' ? 'disabled' : ''} aria-pressed="${p.lines.includes(l.id)}"><strong>${l.name}</strong><span>${l.who}</span></button>`).join('')}</div></section>
    <section class="card"><h2>Microphone</h2><p class="muted small">${p.calibration ? `Set up ${ago(p.calibration.at)}.` : 'Not set up yet. It will set up at your first ticket inspection.'}</p><button class="btn" data-recal>Redo listening setup</button></section>
    <section class="card danger"><h2>Remove player</h2><p class="muted small">This deletes ${esc(p.name)}'s progress from this device. Make a backup first.</p><button class="btn" data-del>Remove ${esc(p.name)}…</button></section>
  </main>`;
  $('[data-name]').onchange = async e => { const v = e.target.value.trim(); if (v) { p.name = v.slice(0, 24); await save(); syncMeta(); viewSettings(); } };
  app.querySelectorAll('[data-theme]').forEach(b => b.onclick = async () => { p.theme = b.dataset.theme; setTheme(p.theme); await save(); syncMeta(); viewSettings(); });
  const wk = $('[data-weekly]'); wk.oninput = () => { $('[data-wg]').textContent = wk.value; }; wk.onchange = async () => { p.weeklyGoal = +wk.value; await save(); };
  app.querySelectorAll('[data-rl]').forEach(b => b.onclick = async () => { p.readingLevel = +b.dataset.rl; await save(); viewSettings(); });
  app.querySelectorAll('[data-line]').forEach(b => b.onclick = async () => { const id = b.dataset.line; p.lines = p.lines.includes(id) ? p.lines.filter(x => x !== id) : [...p.lines, id]; await save(); viewSettings(); });
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
