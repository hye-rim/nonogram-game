'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (arcade/public/tutorial.js 가 듣는다. 튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 노노그램: 화면·입력·소리. 규칙과 풀이는 logic.js (LOGIC_NONO), 퍼즐은 puzzles.js (PUZZLES)
(() => {
const L = LOGIC_NONO;
const $ = (id) => document.getElementById(id);
const DONE_KEY = 'nonoDone', LAST_KEY = 'nonoLast', SAVE_KEY = 'nonoSave_';
const HINT_PENALTY = 30;                                  // 힌트를 쓸 때마다 기록 시간에 더하는 초
const SIZES = [5, 10, 15];

// ---------- 저장소 ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
const loadDone = () => { try { return JSON.parse(store.get(DONE_KEY)) || {}; } catch (_) { return {}; } };
let done = loadDone();                                    // { 퍼즐 id: { t: 가장 빠른 시간(초), hints } }
const clearedCount = () => PUZZLES.filter((p) => done[p.id]).length;
let lastId = store.get(LAST_KEY);
if (!PUZZLES.some((p) => p.id === lastId)) lastId = PUZZLES[0].id;
function loadSave(id) {
  try { const s = JSON.parse(store.get(SAVE_KEY + id)); return s && Array.isArray(s.cells) ? s : null; } catch (_) { return null; }
}
const clearSave = (id) => store.set(SAVE_KEY + id, '');

// ---------- 소리 ----------
let audio = null;
let muted = store.get('nonoMuted') === '1';
function tone(freq, dur, type = 'sine', vol = 0.09, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur);
  } catch (_) {}
}
const seq = (notes, step, type = 'triangle', vol = 0.09) => notes.forEach((f, i) => setTimeout(() => tone(f, step * 0.0009, type, vol), i * step));
const sfx = {
  fill: () => tone(420, 0.05, 'triangle', 0.07),
  cross: () => tone(300, 0.05, 'square', 0.04),
  erase: () => tone(360, 0.05, 'triangle', 0.05, -120),
  undo: () => tone(500, 0.08, 'triangle', 0.07, -150),
  hint: () => tone(880, 0.12, 'sine', 0.07, 260),
  line: () => tone(660, 0.08, 'sine', 0.06),
  bad: () => seq([220, 180], 90, 'square', 0.05),
  good: () => seq([660, 880], 90, 'triangle', 0.07),
  win: () => seq([523, 659, 784, 1047, 1319], 100, 'triangle', 0.1),
};
function toggleMute() { muted = !muted; store.set('nonoMuted', muted ? '1' : '0'); $('muteBtn').textContent = muted ? '🔇' : '🔊'; }
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('muteBtn').textContent = muted ? '🔇' : '🔊';

// ---------- 상태 ----------
let P = null, sol = null, cl = null, st = null;           // 퍼즐 · 정답 · 숫자 · 내 표시
let t = 0, hints = 0, playing = false, solvedShown = false;
let mode = 'fill';                                         // 'fill' (칠하기) · 'cross' (✕ 표시)
let wrong = new Set(), wrongUntil = 0, hintCell = -1, hintUntil = 0;
let stroke = null;
let doneLines = '';                                        // 마지막으로 소리 낸 '다 채운 줄' 표시
let colorOf = '#3a2a78';
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const hueOf = (id) => [...id].reduce((a, ch) => a + ch.charCodeAt(0) * 47, 0) % 360;

// ---------- 그리기 ----------
const canvas = $('board'), ctx = canvas.getContext('2d');
let cell = 20, rowU = 3, colU = 3, cssW = 100, cssH = 100, dpr = 1;
function layout() {
  const n = P.n;
  const maxR = Math.max(...cl.rows.map((c) => c.length)), maxC = Math.max(...cl.cols.map((c) => c.length));
  rowU = maxR * 0.62 + 0.4; colU = maxC * 0.72 + 0.3;
  const availW = Math.max(120, Math.min($('boardBox').clientWidth || 340, 420) - 8);
  const availH = Math.max(150, innerHeight - 262);
  cell = Math.max(10, Math.floor(Math.min(availW / (n + rowU), availH / (n + colU)) * 2) / 2);
  cssW = Math.round(cell * (n + rowU)); cssH = Math.round(cell * (n + colU));
  dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
}
function draw() {
  if (!P) return;
  const n = P.n, x0 = rowU * cell, y0 = colU * cell;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const rowDone = [], colDone = [];
  for (let i = 0; i < n; i++) { rowDone.push(L.lineDone(cl.rows[i], L.row(st.cells, n, i))); colDone.push(L.lineDone(cl.cols[i], L.col(st.cells, n, i))); }
  // 숫자 칸 배경 (번갈아 옅게)
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) { ctx.fillStyle = 'rgba(58,42,120,.07)'; ctx.fillRect(x0 + i * cell, 0, cell, y0); ctx.fillRect(0, y0 + i * cell, x0, cell); }
  }
  // 숫자
  ctx.font = `bold ${Math.round(cell * 0.56)}px Jua, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let c = 0; c < n; c++) {
    const a = cl.cols[c];
    ctx.fillStyle = colDone[c] ? '#b6aed3' : '#2b1d52';
    for (let k = 0; k < a.length; k++) ctx.fillText(String(a[a.length - 1 - k]), x0 + (c + 0.5) * cell, y0 - (k + 0.5) * cell * 0.72 - cell * 0.05);
  }
  for (let r = 0; r < n; r++) {
    const a = cl.rows[r];
    ctx.fillStyle = rowDone[r] ? '#b6aed3' : '#2b1d52';
    for (let k = 0; k < a.length; k++) ctx.fillText(String(a[a.length - 1 - k]), x0 - (k + 0.5) * cell * 0.62 - cell * 0.12, y0 + (r + 0.5) * cell + 1);
  }
  // 칸
  const now = performance.now();
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const i = r * n + c, v = st.cells[i], x = x0 + c * cell, y = y0 + r * cell;
    ctx.fillStyle = '#fffdf5'; ctx.fillRect(x, y, cell, cell);
    if (v === 1) { ctx.fillStyle = colorOf; ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1); }
    else if (v === 2) {
      ctx.strokeStyle = '#a99fc9'; ctx.lineWidth = Math.max(1.5, cell * 0.09); ctx.lineCap = 'round';
      const m = cell * 0.28;
      ctx.beginPath(); ctx.moveTo(x + m, y + m); ctx.lineTo(x + cell - m, y + cell - m); ctx.moveTo(x + cell - m, y + m); ctx.lineTo(x + m, y + cell - m); ctx.stroke();
    }
    if (wrong.has(i) && now < wrongUntil) { ctx.fillStyle = 'rgba(255,60,80,.55)'; ctx.fillRect(x, y, cell, cell); }
  }
  // 줄
  for (let k = 0; k <= n; k++) {
    const thick = k % 5 === 0;
    ctx.strokeStyle = thick ? '#2b1d52' : '#cfc7e6'; ctx.lineWidth = thick ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x0 + k * cell, y0); ctx.lineTo(x0 + k * cell, y0 + n * cell); ctx.moveTo(x0, y0 + k * cell); ctx.lineTo(x0 + n * cell, y0 + k * cell); ctx.stroke();
  }
  // 누르고 있는 줄 표시
  if (stroke) {
    ctx.fillStyle = 'rgba(255,210,63,.22)';
    ctx.fillRect(x0, y0 + stroke.last.r * cell, n * cell, cell); ctx.fillRect(x0 + stroke.last.c * cell, y0, cell, n * cell);
  }
  if (hintCell >= 0 && now < hintUntil) {
    const r = Math.floor(hintCell / n), c = hintCell % n;
    ctx.strokeStyle = '#ff5fa2'; ctx.lineWidth = 3; ctx.strokeRect(x0 + c * cell + 1.5, y0 + r * cell + 1.5, cell - 3, cell - 3);
  }
}
function render() {
  if (!P) return;
  draw();
  $('lvl').textContent = `${P.n}×${P.n} · ${solvedShown ? P.name : '?'}`;
  $('time').textContent = fmt(t);
  $('fillBtn').classList.toggle('on', mode === 'fill');
  $('crossBtn').classList.toggle('on', mode === 'cross');
  $('undoBtn').disabled = !st.history.length || solvedShown;
}
function say(text) { $('msg').textContent = text; }
const filled = () => st.cells.filter((v) => v === 1).length;
const defaultMsg = () => `칠한 칸 ${filled()}개 · 숫자만큼 이어서 칠해요`;

// 미리보기 그림 (칠한 칸만 색으로)
function drawArt(cv, art, color, size) {
  const n = art.length, s = Math.max(1, Math.floor(size / n));
  cv.width = n * s; cv.height = n * s;
  const g = cv.getContext('2d');
  g.fillStyle = '#fffdf5'; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = color;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (art[r][c] === '#') g.fillRect(c * s, r * s, s, s);
}

// ---------- 창 ----------
const overlayOpen = () => !$('overlay').classList.contains('hidden');
function showOverlay(html) { $('overlay').innerHTML = html; $('overlay').classList.remove('hidden'); }
function hideOverlay() { $('overlay').classList.add('hidden'); }

// ---------- 행동 ----------
function loadPuzzle(id) {
  P = PUZZLES.find((p) => p.id === id) || PUZZLES[0];
  lastId = P.id; store.set(LAST_KEY, lastId);
  sol = L.fromArt(P.art); cl = L.clues(sol, P.n); st = L.newGame(P.n);
  t = 0; hints = 0; solvedShown = false; playing = true; stroke = null; wrong = new Set(); hintCell = -1; doneLines = '';
  colorOf = '#3a2a78';
  const sv = loadSave(P.id);
  if (sv && sv.cells.length === st.cells.length && sv.cells.every((v) => [0, 1, 2].includes(v))) { st.cells = sv.cells.slice(); t = Number(sv.t) || 0; hints = Number(sv.hints) || 0; }
  doneLines = lineKey();
  hideOverlay(); layout(); render();
  say(sv && (t > 0 || filled() > 0) ? '이어서 해요! ' + defaultMsg() : defaultMsg());
}
function save() { if (P && playing && !solvedShown) store.set(SAVE_KEY + P.id, JSON.stringify({ cells: st.cells, t: Math.round(t), hints })); }
const lineKey = () => {
  const n = P.n, a = [];
  for (let i = 0; i < n; i++) { if (L.lineDone(cl.rows[i], L.row(st.cells, n, i)) && st.cells.slice(i * n, i * n + n).includes(1)) a.push('r' + i); if (L.lineDone(cl.cols[i], L.col(st.cells, n, i)) && L.col(st.cells, n, i).includes(1)) a.push('c' + i); }
  return a.join();
};

function cellAt(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * cssW - rowU * cell, y = (e.clientY - rect.top) / rect.height * cssH - colU * cell;
  const c = Math.floor(x / cell), r = Math.floor(y / cell);
  if (c < 0 || r < 0 || c >= P.n || r >= P.n) return null;
  return { r, c };
}
function paint(r, c) {
  const i = r * P.n + c, cur = st.cells[i];
  if (cur === stroke.target) return;
  if (stroke.target === 0) { if (cur !== stroke.first) return; }          // 지울 때는 처음 누른 칸과 같은 표시만 지운다
  else if (cur !== 0 && !(r === stroke.start.r && c === stroke.start.c)) return;   // 칠할 때는 빈 칸만 (첫 칸은 무조건)
  stroke.undo.push([i, cur]);
  st.cells[i] = stroke.target;
  stroke.changed.add(stroke.target);
}
canvas.addEventListener('pointerdown', (e) => {
  if (!playing || solvedShown || overlayOpen()) return;
  const p = cellAt(e);
  if (!p) return;
  e.preventDefault();
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  const useCross = mode === 'cross' || e.button === 2;
  const first = st.cells[p.r * P.n + p.c];
  const target = useCross ? (first === 2 ? 0 : 2) : (first === 1 ? 0 : 1);
  stroke = { start: p, last: p, axis: null, target, first, undo: [], changed: new Set() };
  wrong = new Set();
  paint(p.r, p.c);
  render();
});
canvas.addEventListener('pointermove', (e) => {
  if (!stroke) return;
  const raw = cellAt(e);
  if (!raw) return;
  let { r, c } = raw;
  if (!stroke.axis && (r !== stroke.start.r || c !== stroke.start.c)) stroke.axis = Math.abs(r - stroke.start.r) >= Math.abs(c - stroke.start.c) ? 'col' : 'row';
  if (stroke.axis === 'row') r = stroke.start.r; else if (stroke.axis === 'col') c = stroke.start.c;
  if (r === stroke.last.r && c === stroke.last.c) return;
  // 손가락이 빨리 움직여도 건너뛰지 않게 지나간 칸을 모두 칠한다
  const dr = Math.sign(r - stroke.last.r), dc = Math.sign(c - stroke.last.c);
  let cr = stroke.last.r, cc = stroke.last.c;
  while (cr !== r || cc !== c) { if (cr !== r) cr += dr; if (cc !== c) cc += dc; paint(cr, cc); }
  stroke.last = { r, c };
  render();
});
function endStroke() {
  if (!stroke) return;
  const s = stroke; stroke = null;
  if (!s.undo.length) { render(); return; }
  st.history.push(s.undo);
  if (s.target === 1) { sfx.fill(); tutorialSignal('fill'); }
  else if (s.target === 2) { sfx.cross(); tutorialSignal('cross'); }
  else sfx.erase();
  const key = lineKey();
  if (key !== doneLines) { const before = doneLines.split(',').filter(Boolean).length; doneLines = key; if (key.split(',').filter(Boolean).length > before) setTimeout(sfx.line, 90); }
  say(defaultMsg()); save(); render();
  if (L.isSolved(st, cl.rows, cl.cols)) onClear();
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function undo() {
  if (!playing || solvedShown || stroke || !L.undo(st)) return;
  sfx.undo(); tutorialSignal('undo'); wrong = new Set(); doneLines = lineKey(); say(defaultMsg()); save(); render();
}
function restart() {
  if (!playing || solvedShown) return;
  clearSave(P.id); loadPuzzle(P.id); tutorialSignal('restart');
}
function check() {
  if (!playing || solvedShown) return;
  const bad = L.wrongCells(st, sol);
  tutorialSignal('check');
  if (!bad.length) { sfx.good(); say('지금까지 모두 맞아요! 👍'); return; }
  wrong = new Set(bad); wrongUntil = performance.now() + 2200;
  sfx.bad(); say(`틀린 칸이 ${bad.length}개 있어요 (빨간 칸)`); render();
  setTimeout(() => { if (!stroke) render(); }, 2300);
}
function hint() {
  if (!playing || solvedShown) return;
  const i = L.hint(st, sol);
  if (i < 0) return;
  hints++; t += HINT_PENALTY; hintCell = i; hintUntil = performance.now() + 2200;
  sfx.hint(); tutorialSignal('hint'); say(`💡 한 칸을 알려 줬어요 (+${HINT_PENALTY}초)`); doneLines = lineKey(); save(); render();
  setTimeout(() => { if (!stroke) render(); }, 2300);
  if (L.isSolved(st, cl.rows, cl.cols)) onClear();
}
function onClear() {
  if (solvedShown) return;
  solvedShown = true; playing = false; wrong = new Set(); hintCell = -1;
  colorOf = `hsl(${hueOf(P.id)} 68% 50%)`;
  sfx.win(); tutorialSignal('done');
  const secs = Math.round(t);
  const prev = done[P.id];
  const best = !prev || secs < prev.t;
  if (best) { done[P.id] = { t: secs, hints }; store.set(DONE_KEY, JSON.stringify(done)); }
  store.set('nonogramCleared', String(clearedCount()));
  clearSave(P.id);
  say(`🎉 ${P.name} 완성!`); render();
  setTimeout(() => {
    const idx = PUZZLES.findIndex((p) => p.id === P.id), nextP = PUZZLES.slice(idx + 1).concat(PUZZLES.slice(0, idx)).find((p) => !done[p.id]);
    showOverlay(`
      <h2>완성! 🎉</h2>
      <canvas class="prev" id="prev"></canvas>
      <p><b>${P.name}</b> (${P.n}×${P.n})</p>
      <p>걸린 시간 <b>${fmt(secs)}</b>${hints ? ` · 힌트 ${hints}번` : ''}${best && prev ? '<br>🏆 내 최고 기록!' : ''}</p>
      <p style="font-size:12.5px">깬 퍼즐 ${clearedCount()} / ${PUZZLES.length}</p>
      <div class="col">${nextP ? '<button id="nextBtn">다음 퍼즐 ▶</button>' : '<p>모든 퍼즐을 깼어요! 🏆</p>'}<button id="viewBtn" class="sub">그림 보기</button><button id="listBtn" class="sub">퍼즐 선택</button></div>`);
    drawArt($('prev'), P.art, colorOf, 132);
    $('nextBtn') && ($('nextBtn').onclick = () => loadPuzzle(nextP.id));
    $('viewBtn').onclick = hideOverlay;
    $('listBtn').onclick = () => showList(P.n);
  }, 700);
}
let listSize = 5;
function showList(size = listSize) {
  listSize = size;
  playing = false; stroke = null;
  const items = PUZZLES.filter((p) => p.n === size);
  showOverlay(`
    <h2>퍼즐 선택</h2>
    <p>깬 퍼즐 <b>${clearedCount()}</b> / ${PUZZLES.length}</p>
    <div class="tabs">${SIZES.map((s) => `<button data-size="${s}" class="${s === size ? 'on' : ''}">${s}×${s}</button>`).join('')}</div>
    <div class="scroll"><div class="pzs">${items.map((p, i) => `<button data-id="${p.id}" class="${done[p.id] ? 'done' : ''}${P && p.id === P.id ? ' cur' : ''}"><canvas></canvas><span>${i + 1}</span><small>${done[p.id] ? esc(p.name) : (loadSave(p.id) ? '하는 중' : fmt0(p.n))}</small></button>`).join('')}</div></div>
    <button id="backBtn" class="sub">닫기</button>`);
  document.querySelectorAll('#overlay .pzs button').forEach((b, i) => {
    const p = items[i];
    drawArt(b.querySelector('canvas'), done[p.id] ? p.art : Array(p.n).fill('.'.repeat(p.n)), `hsl(${hueOf(p.id)} 68% 50%)`, 40);
    b.onclick = () => loadPuzzle(p.id);
  });
  document.querySelectorAll('#overlay .tabs button').forEach((b) => { b.onclick = () => showList(Number(b.dataset.size)); });
  $('backBtn').onclick = () => { if (st) { playing = !solvedShown; hideOverlay(); } };
}
const fmt0 = (n) => (n === 5 ? '쉬움' : n === 10 ? '보통' : '어려움');
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
function showTitle() {
  playing = false;
  const next = PUZZLES.find((p) => p.id === lastId && !done[p.id]) || PUZZLES.find((p) => !done[p.id]) || PUZZLES[0];
  const started = clearedCount() > 0 || !!loadSave(next.id);
  showOverlay(`
    <h1>노노그램</h1>
    <p>숫자를 보고 <b>숨은 그림</b>을 찾아요!</p>
    <div class="card2" style="font-size:13px">🔢 줄 옆 숫자는 그 줄에서 <b>이어서 칠할 칸 수</b>예요<br>예) <b>3 1</b> → 3칸을 칠하고, 한 칸 이상 띄우고, 1칸<br>⬛ 칠하고 ✕ 로 "여긴 아니야" 표시해요<br>✅ 가로·세로 숫자를 모두 맞추면 그림 완성!</div>
    <div class="col"><button id="startBtn">${started ? '이어서 하기' : '시작하기'}<small>${next.n}×${next.n} · 깬 퍼즐 ${clearedCount()}/${PUZZLES.length}</small></button><button id="listBtn" class="sub">퍼즐 선택</button></div>`);
  $('startBtn').onclick = () => loadPuzzle(next.id);
  $('listBtn').onclick = () => showList(next.n);
}

// ---------- 입력 ----------
function setMode(m) { mode = m; render(); }
$('fillBtn').onclick = (e) => { e.currentTarget.blur(); setMode('fill'); };
$('crossBtn').onclick = (e) => { e.currentTarget.blur(); setMode('cross'); tutorialSignal('mode'); };
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'z' || e.key === 'Z') undo();
  else if (e.key === 'x' || e.key === 'X') { setMode(mode === 'fill' ? 'cross' : 'fill'); }
  else if (e.key === 'h' || e.key === 'H') hint();
  else if (e.key === 'c' || e.key === 'C') check();
  else if (e.key === 'r' || e.key === 'R') restart();
  else if (e.key === 'm' || e.key === 'M') toggleMute();
});
$('undoBtn').onclick = (e) => { e.currentTarget.blur(); undo(); };
$('checkBtn').onclick = (e) => { e.currentTarget.blur(); check(); };
$('hintBtn').onclick = (e) => { e.currentTarget.blur(); hint(); };
$('restartBtn').onclick = (e) => { e.currentTarget.blur(); restart(); };
$('menuBtn').onclick = (e) => { e.currentTarget.blur(); if (!overlayOpen()) { save(); showList(P ? P.n : listSize); } };
addEventListener('resize', () => { if (P) { layout(); render(); } });

// 시간: 창이 보이고 퍼즐을 푸는 중일 때만 흐른다
let lastTick = performance.now();
setInterval(() => {
  const now = performance.now(), dt = (now - lastTick) / 1000; lastTick = now;
  if (!P || !playing || solvedShown || document.hidden || overlayOpen()) return;
  t += Math.min(dt, 1);
  $('time').textContent = fmt(t);
  if (Math.round(t) % 5 === 0) save();
}, 250);
addEventListener('pagehide', save);

P = PUZZLES.find((p) => p.id === lastId) || PUZZLES[0];
sol = L.fromArt(P.art); cl = L.clues(sol, P.n); st = L.newGame(P.n);
layout(); render();
showTitle();

/* @test-hooks:start */
window.__ng = { get st() { return st; }, get P() { return P; }, get sol() { return sol; }, get cl() { return cl; }, get playing() { return playing; }, get done() { return done; }, get mode() { return mode; }, get cell() { return cell; }, get rowU() { return rowU; }, get colU() { return colU; }, loadPuzzle, undo, hint, check, restart, showList, PUZZLES };
/* @test-hooks:end */
})();
