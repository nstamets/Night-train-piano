// Notation (staff), keyboard, and falling-notes rendering. All SVG/canvas, no images.

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const PC_TO_STEP = { 0: [0, ''], 1: [0, '♯'], 2: [1, ''], 3: [2, '♭'], 4: [2, ''], 5: [3, ''], 6: [3, '♯'], 7: [4, ''], 8: [5, '♭'], 9: [5, ''], 10: [6, '♭'], 11: [6, ''] };

export const isBlack = m => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
export function letterOf(m) { const [s, acc] = PC_TO_STEP[((m % 12) + 12) % 12]; return LETTERS[s] + acc; }
export function nameWithOctave(m) { return letterOf(m) + (Math.floor(m / 12) - 1); }
function diatonicPos(m) { const [s] = PC_TO_STEP[((m % 12) + 12) % 12]; return (Math.floor(m / 12) - 1) * 7 + s; }

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TREBLE_PATH = 'M15 74 C7 76 5 66 12 65 C18 64 19 72 15 75 L19 -8 C27 -20 31 2 13 20 C0 32 3 46 15 46 C26 46 27 33 17 30 C9 28 7 38 14 39';
const CLEFS = { treble: { ref: 30 }, bass: { ref: 18 } }; // diatonic position of the bottom staff line (E4 / G2)
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
// key signature positions (diatonic) on each clef
const SIG_POS = { treble: { '♯': [38, 35, 39, 36, 33, 37, 34], '♭': [34, 37, 33, 36, 32, 35, 31] }, bass: { '♯': [24, 21, 25, 22, 19, 23, 20], '♭': [20, 23, 19, 22, 18, 21, 17] } };

// Single-staff convenience wrapper (keeps the old API).
export function renderStaff(notes, opts = {}) {
  return renderScore([{ notes, clef: opts.clef || 'treble' }], opts);
}

// staves: [{notes:[{midi|midi[], beat, dur, finger, sym}], clef}]
// opts: {beatsPerBar, barsPerLine, letters, current, marks, fingers, keySig:{sharps:n}|{flats:n}, timeSig}
export function renderScore(staves, opts = {}) {
  const bpb = opts.beatsPerBar || 4;
  const all = staves.flatMap(st => st.notes);
  const totalBeats = all.length ? Math.max(...all.map(n => n.beat + n.dur)) : bpb;
  const bars = Math.max(1, Math.ceil(totalBeats / bpb - 1e-9));
  const perLine = Math.max(1, Math.min(opts.barsPerLine || 2, bars));
  const lines = Math.ceil(bars / perLine);
  const s = 10;
  const ks = opts.keySig || {};
  const nAcc = ks.sharps || ks.flats || 0;
  const accSym = ks.sharps ? '♯' : '♭';
  const keyLetters = new Set((ks.sharps ? SHARP_ORDER : FLAT_ORDER).slice(0, nAcc));
  const hasSym = all.some(n => n.sym);
  const staffGap = 86; const sysH = staves.length * staffGap + 34 + (hasSym ? 14 : 0);
  const left = 46 + nAcc * 9; const barW = 150; const width = left + perLine * barW + 10;
  const height = lines * sysH + 6;
  let out = `<svg class="staff" viewBox="0 0 ${width} ${height}" role="img" aria-label="Music notation">`;
  const staffTop = (L, k) => 30 + (hasSym ? 14 : 0) + L * sysH + k * staffGap;
  for (let L = 0; L < lines; L++) {
    staves.forEach((st, k) => {
      const top = staffTop(L, k); const bottom = top + 4 * s;
      for (let j = 0; j < 5; j++) out += `<line x1="4" x2="${width - 6}" y1="${top + j * s}" y2="${top + j * s}" class="sl"/>`;
      if (st.clef === 'bass') out += `<g class="clef bassclef"><path d="M7 ${top + 9} C7 ${top - 2} 24 ${top - 3} 25 ${top + 10} C26 ${top + 24} 14 ${top + 33} 4 ${top + 38}"/><circle cx="9" cy="${top + 10}" r="3.2"/><circle cx="31" cy="${top + 5}" r="1.9"/><circle cx="31" cy="${top + 15}" r="1.9"/></g>`;
      else out += `<path d="${TREBLE_PATH}" transform="translate(6 ${top - 10}) scale(0.62)" class="clef"/>`;
      const ref = CLEFS[st.clef || 'treble'].ref;
      const sp = SIG_POS[st.clef || 'treble'][accSym];
      for (let a = 0; a < nAcc; a++) out += `<text x="${32 + a * 9}" y="${bottom - (sp[a] - ref) * s / 2 + 5}" class="acc">${accSym}</text>`;
      if (L === 0 && opts.timeSig !== false) out += `<text x="${left - 12}" y="${top + 17}" class="ts">${bpb}</text><text x="${left - 12}" y="${top + 37}" class="ts">4</text>`;
      for (let b = 1; b <= perLine; b++) {
        const barIndex = L * perLine + b; if (barIndex > bars) break;
        const x = left + b * barW;
        out += `<line x1="${x}" x2="${x}" y1="${top}" y2="${bottom}" class="bl${barIndex === bars ? ' end' : ''}"/>`;
      }
    });
    if (staves.length > 1) out += `<line x1="4" x2="4" y1="${staffTop(L, 0)}" y2="${staffTop(L, staves.length - 1) + 40}" class="bl"/>`;
  }
  let gi = 0;
  staves.forEach((st, k) => {
    const ref = CLEFS[st.clef || 'treble'].ref;
    st.notes.forEach((n) => {
      const i = gi++;
      const bar = Math.floor(n.beat / bpb + 1e-9);
      const L = Math.floor(bar / perLine);
      const inLine = bar - L * perLine;
      const top = staffTop(L, k); const bottomLine = top + 4 * s;
      const x = left + inLine * barW + 18 + ((n.beat - bar * bpb) / bpb) * (barW - 28);
      const pitches = (Array.isArray(n.midi) ? n.midi : [n.midi]).slice().sort((a, b) => a - b);
      const poss = pitches.map(diatonicPos);
      const ys = poss.map(pos => bottomLine - (pos - ref) * (s / 2));
      const idx = st.idxBase !== undefined ? st.idxBase + st.notes.indexOf(n) : i;
      const mark = opts.marks && opts.marks[idx];
      const cls = ['nt', idx === opts.current ? 'cur' : '', mark ? 'm-' + mark : ''].join(' ');
      let g = `<g class="${cls}" data-i="${idx}">`;
      const lo = Math.min(...poss), hi = Math.max(...poss);
      for (let p = ref - 2; p >= lo; p -= 2) g += `<line x1="${x - 9}" x2="${x + 9}" y1="${bottomLine - (p - ref) * s / 2}" y2="${bottomLine - (p - ref) * s / 2}" class="sl"/>`;
      for (let p = ref + 10; p <= hi; p += 2) g += `<line x1="${x - 9}" x2="${x + 9}" y1="${bottomLine - (p - ref) * s / 2}" y2="${bottomLine - (p - ref) * s / 2}" class="sl"/>`;
      const hollow = n.dur >= 2;
      pitches.forEach((m, j) => {
        const [stp, acc] = PC_TO_STEP[((m % 12) + 12) % 12];
        const letter = LETTERS[stp];
        const shiftX = j > 0 && poss[j] - poss[j - 1] === 1 ? 11 : 0;
        if (acc && !(keyLetters.has(letter) && acc === accSym)) g += `<text x="${x - 18}" y="${ys[j] + 5}" class="acc">${acc}</text>`;
        else if (!acc && keyLetters.has(letter)) g += `<text x="${x - 17}" y="${ys[j] + 5}" class="acc">♮</text>`;
        g += `<ellipse cx="${x + shiftX}" cy="${ys[j]}" rx="6.2" ry="4.6" transform="rotate(-20 ${x + shiftX} ${ys[j]})" class="${hollow ? 'hollow' : 'filled'}"/>`;
        if (n.dur === 1.5 || n.dur === 3) g += `<circle cx="${x + 12 + shiftX}" cy="${ys[j] - ((poss[j] - ref) % 2 === 0 ? 3 : 0)}" r="1.8" class="filled"/>`;
      });
      const base = Math.round(n.dur * 2) / 2;
      if (base !== 4 && base !== 3 && base !== 6) {
        const mid = (lo + hi) / 2;
        const up = mid < ref + 4;
        const sx = up ? x + 5.6 : x - 5.6;
        const yFrom = up ? Math.max(...ys) : Math.min(...ys);
        const yTo = up ? Math.min(...ys) - 34 : Math.max(...ys) + 34;
        g += `<line x1="${sx}" x2="${sx}" y1="${yFrom}" y2="${yTo}" class="stem"/>`;
        if (n.dur <= 0.5) g += `<path d="M${sx} ${yTo} q 10 ${up ? 10 : -10} 6 ${up ? 22 : -22}" class="flag"/>`;
      }
      if (n.sym) g += `<text x="${x}" y="${staffTop(L, 0) - (opts.fingers ? 26 : 14)}" class="sym">${esc(n.sym)}</text>`;
      if (opts.letters && pitches.length === 1) g += `<text x="${x}" y="${bottomLine + 34}" class="lt">${esc(letterOf(pitches[0]))}</text>`;
      if (opts.fingers && n.finger) g += `<text x="${x}" y="${top - 14}" class="fg">${n.finger}</text>`;
      if (idx === opts.current) g += `<path d="M${x - 5} ${top - 26} l5 7 l5 -7 z" class="curmark"/>`;
      if (mark === 'wrong' || mark === 'missed') g += `<text x="${x}" y="${bottomLine + 48}" class="mk">✕</text>`;
      if (mark === 'partial') g += `<text x="${x}" y="${bottomLine + 48}" class="mk">≈</text>`;
      if (mark === 'hit') g += `<text x="${x}" y="${bottomLine + 48}" class="mk ok">✓</text>`;
      g += '</g>';
      out += g;
    });
  });
  out += '</svg>';
  return out;
}

// ---------- Keyboard ----------
export function keyLayout(lo, hi) {
  // snap to white keys
  while (isBlack(lo)) lo--; while (isBlack(hi)) hi++;
  const keys = []; let wx = 0;
  for (let m = lo; m <= hi; m++) {
    if (isBlack(m)) keys.push({ midi: m, black: true, x: wx - 0.3, w: 0.6 });
    else { keys.push({ midi: m, black: false, x: wx, w: 1 }); wx++; }
  }
  return { keys, whiteCount: wx, lo, hi };
}

// marks: {midi: 'target'|'hit'|'wrong'|'ghost'}; labels: 'all'|'c'|'none'|{midi:text}
export function renderKeyboard(lo, hi, { marks = {}, labels = 'c', fingers = {} } = {}) {
  const L = keyLayout(lo, hi);
  const W = 30, H = 120, BH = 74;
  const width = L.whiteCount * W;
  let out = `<svg class="kbd" viewBox="0 0 ${width} ${H}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Piano keyboard">`;
  const label = m => {
    if (labels && typeof labels === 'object') return labels[m] || '';
    if (labels === 'all') return isBlack(m) ? '' : letterOf(m);
    if (labels === 'c') return m % 12 === 0 ? 'C' + (Math.floor(m / 12) - 1) : '';
    return '';
  };
  const draw = k => {
    const mk = marks[k.midi] || '';
    const x = k.x * W, w = k.w * W, h = k.black ? BH : H;
    let s = `<g class="key ${k.black ? 'blk' : 'wht'} ${mk ? 'k-' + mk : ''}" data-midi="${k.midi}" role="button" aria-label="${letterOf(k.midi)}">`;
    s += `<rect x="${x + 0.5}" y="0.5" width="${w - 1}" height="${h - 1}" rx="3"/>`;
    const t = label(k.midi);
    if (t && !k.black) s += `<text x="${x + w / 2}" y="${H - 9}" class="kl">${esc(t)}</text>`;
    if (fingers[k.midi]) s += `<circle cx="${x + w / 2}" cy="${(k.black ? BH : H) - 34}" r="9" class="fc"/><text x="${x + w / 2}" y="${(k.black ? BH : H) - 30}" class="fn">${fingers[k.midi]}</text>`;
    if (mk === 'target') s += `<text x="${x + w / 2}" y="${(k.black ? BH : H) - (fingers[k.midi] ? 52 : 34)}" class="tm">●</text>`;
    if (mk === 'hit') s += `<text x="${x + w / 2}" y="${(k.black ? BH : H) - 52}" class="tm">✓</text>`;
    if (mk === 'wrong') s += `<text x="${x + w / 2}" y="${(k.black ? BH : H) - 52}" class="tm">✕</text>`;
    return s + '</g>';
  };
  L.keys.filter(k => !k.black).forEach(k => { out += draw(k); });
  L.keys.filter(k => k.black).forEach(k => { out += draw(k); });
  return out + '</svg>';
}

// Attach touch handling to a keyboard container. Returns detach fn.
export function bindKeyboard(container, onKey) {
  const handler = e => {
    const g = e.target.closest('[data-midi]');
    if (!g) return;
    e.preventDefault();
    const m = +g.dataset.midi;
    g.classList.add('pressed'); setTimeout(() => g.classList.remove('pressed'), 180);
    onKey(m);
  };
  container.addEventListener('pointerdown', handler);
  return () => container.removeEventListener('pointerdown', handler);
}

// ---------- Falling notes ----------
// Draws notes falling onto a keyboard strip. Uses audio clock for sync.
export function fallingNotes(canvas, { events, lo, hi, getBeat, lookahead = 4, labels = true }) {
  const L = keyLayout(lo, hi);
  const ctx2 = canvas.getContext('2d');
  let raf = 0; let running = true;
  const css = getComputedStyle(document.documentElement);
  const col = { lane: css.getPropertyValue('--surface-2').trim() || '#223', note: css.getPropertyValue('--accent').trim() || '#f6b94a', other: css.getPropertyValue('--muted').trim() || '#889', text: css.getPropertyValue('--bg').trim() || '#111', line: css.getPropertyValue('--muted').trim() || '#889' };
  function frame() {
    if (!running) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2.clearRect(0, 0, w, h);
    const kw = w / L.whiteCount;
    // lanes for white keys
    ctx2.globalAlpha = 0.35; ctx2.fillStyle = col.lane;
    L.keys.filter(k => !k.black).forEach((k, i) => { if (i % 2) ctx2.fillRect(k.x * kw, 0, kw, h); });
    ctx2.globalAlpha = 1;
    const beat = getBeat();
    const pxPerBeat = h / lookahead;
    // hit line
    ctx2.strokeStyle = col.line; ctx2.lineWidth = 2; ctx2.beginPath(); ctx2.moveTo(0, h - 2); ctx2.lineTo(w, h - 2); ctx2.stroke();
    events.flatMap(e => Array.isArray(e.midi) ? e.midi.map(m => ({ ...e, midi: m })) : [e]).forEach(e => {
      const k = L.keys.find(k2 => k2.midi === e.midi); if (!k) return;
      const yBottom = h - (e.beat - beat) * pxPerBeat;
      const yTop = yBottom - e.dur * pxPerBeat + 3;
      if (yTop > h || yBottom < 0) return;
      const x = k.x * kw + 2, ww = k.w * kw - 4;
      ctx2.fillStyle = e.other ? col.other : col.note;
      roundRect(ctx2, x, yTop, ww, yBottom - yTop, 6); ctx2.fill();
      if (labels && yBottom - yTop > 16) {
        ctx2.fillStyle = col.text; ctx2.font = `bold ${Math.min(16, kw * 0.5)}px system-ui`; ctx2.textAlign = 'center';
        ctx2.fillText(letterOf(e.midi), x + ww / 2, yBottom - 6);
      }
    });
    raf = requestAnimationFrame(frame);
  }
  frame();
  return { stop() { running = false; cancelAnimationFrame(raf); } };
}

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
