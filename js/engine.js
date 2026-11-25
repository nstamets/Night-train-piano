// Practice engine: spaced review, tempo ladder, station readiness, and session plans.
import { ITEMS, STATIONS, TEMPO_LADDER, PIECES } from './content.js';

const DAY = 86400000;
const STEPS_DAYS = [0.5, 1, 2, 4, 7, 14, 30, 60];

// Spacing tuned to practice frequency: 2-3x/week players get proportionally longer gaps,
// so reviews land on days they actually practice and don't pile up.
export function freqFactor(p) { return Math.min(2.5, Math.max(1, 5 / Math.max(1, p.weeklyGoal || 3))); }

export function itemState(p, id) {
  if (!p.items[id]) p.items[id] = { reps: 0, step: 0, due: 0, last: null, history: [], tempoStep: 0, cleanStreak: 0, best: null };
  return p.items[id];
}

// rating: 'clean' | 'nearly' | 'notyet'  (quizzes map score -> rating)
export function recordRating(p, id, rating, now = Date.now(), { tempoBased = false } = {}) {
  const s = itemState(p, id);
  s.reps++; s.last = rating; s.lastAt = now;
  s.history.push({ t: now, r: rating, ts: s.tempoStep });
  if (s.history.length > 40) s.history = s.history.slice(-40);
  if (rating === 'clean') s.step = Math.min(STEPS_DAYS.length - 1, s.step + 1);
  else if (rating === 'notyet') s.step = Math.max(0, s.step - 2);
  s.due = now + STEPS_DAYS[s.step] * freqFactor(p) * DAY;
  let tempoUp = false;
  if (tempoBased) {
    s.cleanStreak = rating === 'clean' ? s.cleanStreak + 1 : 0;
    if (s.cleanStreak >= 3 && s.tempoStep < TEMPO_LADDER.length - 1) { s.tempoStep++; s.cleanStreak = 0; tempoUp = true; }
  }
  if (rating === 'clean') s.best = Math.max(s.best || 0, TEMPO_LADDER[s.tempoStep]);
  return { tempoUp, state: s };
}

export function ratingFromScore(score) { return score >= 0.85 ? 'clean' : score >= 0.6 ? 'nearly' : 'notyet'; }

export function stationStatus(p, st) {
  const rec = p.stations[st.id] || {};
  if (rec.status === 'passed' || rec.status === 'placed') return rec.status;
  const idx = STATIONS.indexOf(st);
  if (idx > 0) {
    const prev = p.stations[STATIONS[idx - 1].id];
    if (!prev || (prev.status !== 'passed' && prev.status !== 'placed')) return 'locked';
  }
  return stationReady(p, st) ? 'ready' : 'open';
}

// Forgiving early gate: every core item practiced at least twice and the latest try not "not yet".
export function stationReady(p, st) {
  return st.items.filter(id => ITEMS[id].core).every(id => {
    const s = p.items[id];
    return s && s.last !== 'notyet' && (s.reps >= 2 || s.last === 'clean');
  });
}

export function stationProgress(p, st) {
  const core = st.items.filter(id => ITEMS[id].core);
  let pts = 0;
  core.forEach(id => { const s = p.items[id]; if (s) pts += Math.min(2, s.reps) / 2 * (s.last === 'notyet' ? 0.5 : 1); });
  return core.length ? pts / core.length : 1;
}

export function currentStation(p) {
  for (const st of STATIONS) {
    const s = stationStatus(p, st);
    if (s === 'open' || s === 'ready') return st;
  }
  return null; // all done (for now)
}

export function passStation(p, stId, how = 'passed', detail = {}) {
  p.stations[stId] = { ...(p.stations[stId] || {}), status: how, at: Date.now(), ...detail };
  const st = STATIONS.find(s => s.id === stId);
  if (how === 'passed' && st && !p.postcards.includes(stId)) p.postcards.push(stId);
}

// ---------- Session plans ----------
// A plan mirrors a good lesson: warm-up, technique, new material, review (interleaved), skill work, play-for-fun.
export function buildSession(p, minutes = 15, now = Date.now(), rand = Math.random) {
  const st = currentStation(p);
  const blocks = [];
  const used = new Set();
  const add = (kind, id, label) => { if (!id || used.has(id)) return; used.add(id); blocks.push({ kind, id, label }); };

  blocks.push({ kind: 'warmup', id: 'warmup', label: 'Warm-up' });

  const seen = id => p.items[id] && p.items[id].reps > 0;
  const allUnlocked = STATIONS.filter(s => { const x = stationStatus(p, s); return x !== 'locked'; });
  const pool = allUnlocked.flatMap(s => s.items);

  // New material: first unseen items in current station (lesson + its follow-up), blocked practice for first exposure
  const fresh = st ? st.items.filter(id => !seen(id)) : [];
  const newBudget = minutes * 0.55;
  const newItems = []; let nb = 0;
  for (const id of fresh) {
    const m = ITEMS[id].minutes + 0.5;
    if (newItems.length && nb + m > newBudget) break;
    newItems.push(id); nb += m;
  }
  // Make sure a beginner plays real music at the piano in every session that has new material.
  const playable = fresh.find(id => ITEMS[id].type === 'piano' && ITEMS[id].piece);
  if (playable && !newItems.includes(playable) && !newItems.some(id => ITEMS[id].type === 'piano' && ITEMS[id].piece)) {
    const drop = newItems.map(id => ITEMS[id].type).lastIndexOf('keyquiz');
    if (drop > 0) newItems.splice(drop, 1);
    newItems.push(playable);
  }

  // Technique: a piano technique item already seen (or the station's if none)
  const tech = pool.filter(id => ITEMS[id].type === 'piano' && ITEMS[id].skill === 'technique' && seen(id))
    .sort((a, b) => (p.items[a].due || 0) - (p.items[b].due || 0))[0];
  if (tech) add('technique', tech, 'Technique');

  newItems.forEach(id => add('new', id, 'New'));

  // Review: due items first, then weakest, interleaved across skills/stations
  const reviewable = pool.filter(id => seen(id) && ITEMS[id].type !== 'lesson' && ITEMS[id].type !== 'checkpoint' && !used.has(id));
  const due = reviewable.filter(id => (p.items[id].due || 0) <= now)
    .sort((a, b) => (p.items[a].due || 0) - (p.items[b].due || 0));
  const weak = reviewable.filter(id => p.items[id].last !== 'clean');
  const reviewCount = minutes <= 10 ? 1 : minutes <= 15 ? 2 : 4;
  const reviewPick = interleave(uniq([...due, ...shuffle(weak, rand), ...shuffle(reviewable, rand)]), reviewCount);
  reviewPick.forEach(id => add('review', id, 'Review'));

  // Skill work: reading / ear / rhythm, pick the weakest skill that has an item available
  const skillOrder = ['reading', 'ear', 'rhythm'].sort((a, b) => (p.skills[a] || 0) - (p.skills[b] || 0));
  for (const sk of skillOrder) {
    const cand = shuffle(pool.filter(id => ['readquiz', 'ear', 'rhythm', 'keyquiz'].includes(ITEMS[id].type) && ITEMS[id].skill === sk && !used.has(id)), rand);
    if (cand[0]) { add('skill', cand[0], 'Ear & reading'); break; }
  }

  // Station readiness may be reached during this session; the UI re-checks and appends the inspection.
  // Play-for-fun: improv / compose, or a favorite piece
  const fun = shuffle(pool.filter(id => ITEMS[id].type === 'improv' && !used.has(id)), rand)[0]
    || shuffle(pool.filter(id => ITEMS[id].type === 'piano' && ITEMS[id].piece && seen(id)), rand)[0];
  if (fun) add('fun', fun, 'Play for fun');

  // Trim to time budget (keep warm-up, new, and fun)
  const budget = minutes;
  const cost = b => b.kind === 'warmup' ? 1 : (ITEMS[b.id] ? ITEMS[b.id].minutes : 2) + 0.5;
  let total = blocks.reduce((s, b) => s + cost(b), 0);
  const dropOrder = ['skill', 'review', 'technique'];
  for (const k of dropOrder) {
    while (total > budget + 1) {
      const i = blocks.map(b => b.kind).lastIndexOf(k);
      if (i < 0 || blocks.filter(b => b.kind === k).length <= (k === 'review' ? 1 : 0)) break;
      total -= cost(blocks[i]); blocks.splice(i, 1);
    }
  }
  // Fill spare time with more review
  const extra = reviewable.filter(id => !used.has(id));
  while (total < budget - 2 && extra.length) {
    const id = extra.shift(); used.add(id);
    blocks.splice(blocks.length - 1, 0, { kind: 'review', id, label: 'Review' }); total += cost({ id });
  }
  // If station ready already, add the inspection
  if (st && stationReady(p, st)) blocks.push({ kind: 'checkpoint', id: st.checkpoint, label: 'Ticket inspection' });
  return { station: st ? st.id : null, blocks, minutes: Math.round(total) };
}

function uniq(a) { return [...new Set(a)]; }
export function shuffle(a, rand = Math.random) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// Avoid two items of the same type back to back
function interleave(ids, n) {
  const out = []; const rest = ids.slice();
  while (out.length < n && rest.length) {
    const lastType = out.length ? ITEMS[out[out.length - 1]].type : null;
    const i = rest.findIndex(id => ITEMS[id].type !== lastType);
    out.push(rest.splice(i < 0 ? 0 : i, 1)[0]);
  }
  return out;
}

// Which phrase is hardest (most not-yet/nearly ratings while looping)? Used to suggest a loop.
export function hardestPhrase(p, itemId) {
  const it = ITEMS[itemId]; const piece = it && PIECES[it.piece];
  if (!piece || !piece.phrases) return null;
  const s = p.items[itemId]; const pr = (s && s.phraseRatings) || {};
  let worst = null, wv = -1;
  piece.phrases.forEach((ph, i) => { const v = pr[i] || 0; if (v > wv) { wv = v; worst = i; } });
  return wv > 0 ? worst : null;
}

// Weekly goal: sessions in the current week (Mon-Sun).
export function weekStart(now = Date.now()) {
  const d = new Date(now); const day = (d.getDay() + 6) % 7; d.setHours(0, 0, 0, 0); return d.getTime() - day * DAY;
}
export function sessionsThisWeek(p, now = Date.now()) { const ws = weekStart(now); return p.sessions.filter(s => s.date >= ws).length; }

export function milesFor(rating) { return rating === 'clean' ? 10 : rating === 'nearly' ? 7 : 4; }

export function addSkill(p, skill, amount) { p.skills[skill] = (p.skills[skill] || 0) + amount; }
export function skillLevel(xp) { return Math.min(10, Math.floor(Math.sqrt(xp / 12)) + 1); }
