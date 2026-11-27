// Durable storage for Night Train.
// Primary: IndexedDB. Mirror: localStorage (second copy). Plus backup codes and file export.
// Every player record carries a schema version; migrate() upgrades old records safely.

export const APP_VERSION = '0.4.0';
export const SCHEMA_VERSION = 2;

const DB_NAME = 'nighttrain';
const STORE = 'kv';
const LS_PREFIX = 'nighttrain:';

let dbPromise = null;
let lastSavedAt = null;
let persisted = null;
let idbOk = true;
const listeners = new Set();

export function onStatusChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { const s = status(); listeners.forEach(fn => { try { fn(s); } catch (e) { console.error(e); } }); }

export function status() {
  return { lastSavedAt, persisted, idbOk };
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch(err => { idbOk = false; console.warn('IndexedDB unavailable, using localStorage only', err); return null; });
  return dbPromise;
}

async function idbGet(key) {
  const db = await openDB();
  if (!db) return undefined;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function idbDel(key) {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function lsGet(key) {
  try { const v = localStorage.getItem(LS_PREFIX + key); return v ? JSON.parse(v) : undefined; } catch { return undefined; }
}
function lsSet(key, value) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
}
function lsDel(key) { try { localStorage.removeItem(LS_PREFIX + key); } catch { /* ignore */ } }

// Read: prefer whichever copy is newer (savedAt), so a lost IndexedDB is healed from the mirror and vice versa.
async function read(key) {
  let a; try { a = await idbGet(key); } catch { a = undefined; }
  const b = lsGet(key);
  if (a && b) return (b.savedAt || 0) > (a.savedAt || 0) ? b : a;
  return a || b;
}

async function write(key, value) {
  value.savedAt = Date.now();
  let ok = false;
  try { ok = await idbSet(key, value); } catch (e) { console.warn('idb write failed', e); }
  const ok2 = lsSet(key, value);
  if (ok || ok2) { lastSavedAt = value.savedAt; emit(); }
  if (!ok && !ok2) throw new Error('Could not save progress');
  return true;
}

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persisted) {
      persisted = await navigator.storage.persisted();
      if (!persisted && navigator.storage.persist) persisted = await navigator.storage.persist();
    }
  } catch { persisted = false; }
  emit();
  return persisted;
}

// ---------- Meta (player list) ----------
export async function loadMeta() {
  const m = await read('meta');
  return m || { schema: SCHEMA_VERSION, players: [], lastPlayer: null };
}
export async function saveMeta(meta) { return write('meta', meta); }

// ---------- Players ----------
export function newPlayer(name) {
  const id = 'p' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  return {
    id, name, schema: SCHEMA_VERSION, createdAt: Date.now(), savedAt: 0,
    theme: 'midnight',
    onboarded: false,
    lines: ['foundations'],
    weeklyGoal: 3,
    sessionMinutes: 15,
    level: 'beginner',          // from placement
    readsTreble: false,
    sessions: [],               // {date, minutes, blocks, miles}
    skills: { technique: 0, reading: 0, rhythm: 0, theory: 0, ear: 0 },
    items: {},                  // itemId -> review state
    stations: {},               // stationId -> {status, checkpoint}
    miles: 0,
    postcards: [],
    calibration: null,
    honesty: { selfClean: 0, micChecks: 0, micAgree: 0 },
    lastBackup: null,
    sessionsSinceBackup: 0,
    goals: '',
    mainLine: null,
    backingVol: 1,
  };
}

export function migrate(p) {
  if (!p) return p;
  // Migrations, one step at a time. Never delete player data here.
  if ((p.schema || 0) < 2) {
    if (p.mainLine === undefined) p.mainLine = (p.lines || []).find(l => l !== 'foundations') || null;
    if (p.backingVol === undefined) p.backingVol = 1;
  }
  const fresh = newPlayer(p.name || 'Player');
  for (const k of Object.keys(fresh)) if (p[k] === undefined) p[k] = fresh[k];
  for (const k of Object.keys(fresh.skills)) if (p.skills[k] === undefined) p.skills[k] = 0;
  p.schema = SCHEMA_VERSION;
  return p;
}

export async function loadPlayer(id) { return migrate(await read('player:' + id)); }
export async function savePlayer(p) { return write('player:' + p.id, p); }

export async function deletePlayer(meta, id) {
  await idbDel('player:' + id); lsDel('player:' + id);
  meta.players = meta.players.filter(x => x.id !== id);
  if (meta.lastPlayer === id) meta.lastPlayer = null;
  await saveMeta(meta);
}

// ---------- Backup codes & files ----------
function b64urlEncode(bytes) {
  let s = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function pipe(bytes, stream) {
  const s = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// Simple checksum so a mistyped/truncated code is caught instead of half-imported.
function checksum(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h.toString(36).slice(-4).padStart(4, '0'); }

export async function makeBackupCode(player) {
  const json = JSON.stringify({ app: 'nighttrain', v: SCHEMA_VERSION, player });
  const raw = new TextEncoder().encode(json);
  let body, tag;
  if (typeof CompressionStream !== 'undefined') { body = b64urlEncode(await pipe(raw, new CompressionStream('deflate-raw'))); tag = 'NTz'; }
  else { body = b64urlEncode(raw); tag = 'NTp'; }
  return `${tag}.${checksum(body)}.${body}`;
}

export async function readBackupCode(code) {
  code = (code || '').replace(/\s+/g, '');
  const parts = code.split('.');
  if (parts.length !== 3 || !/^NT[zp]$/.test(parts[0])) throw new Error('That does not look like a Night Train backup code.');
  const [tag, sum, body] = parts;
  if (checksum(body) !== sum) throw new Error('The code seems incomplete or mistyped. Copy the whole code and try again.');
  let bytes = b64urlDecode(body);
  if (tag === 'NTz') {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed codes. Use the backup file instead.');
    bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  }
  return parseBackupJSON(new TextDecoder().decode(bytes));
}

export function parseBackupJSON(text) {
  let data; try { data = JSON.parse(text); } catch { throw new Error('The backup could not be read.'); }
  if (!data || data.app !== 'nighttrain' || !data.player || !data.player.id) throw new Error('This is not a Night Train backup.');
  return migrate(data.player);
}

export function backupFileText(player) {
  return JSON.stringify({ app: 'nighttrain', v: SCHEMA_VERSION, exportedAt: new Date().toISOString(), player }, null, 1);
}

// Restore: if the player already exists, keep whichever copy has more progress unless forced.
export async function restorePlayer(meta, incoming, { force = false } = {}) {
  const existing = meta.players.find(x => x.id === incoming.id);
  if (existing && !force) {
    const cur = await loadPlayer(incoming.id);
    if (cur && (cur.savedAt || 0) > (incoming.savedAt || 0)) {
      return { conflict: true, current: cur, incoming };
    }
  }
  await savePlayer(incoming);
  if (!existing) meta.players.push({ id: incoming.id, name: incoming.name, theme: incoming.theme });
  else { existing.name = incoming.name; existing.theme = incoming.theme; }
  await saveMeta(meta);
  return { conflict: false };
}
