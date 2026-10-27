'use strict';

// 노노그램: 규칙과 풀이만 모아 둔 파일 (그리기·입력 없음). 브라우저·시험(Node)이 같이 쓴다.
//
// - n x n 칸. 각 줄 옆의 숫자는 그 줄에서 칠해야 하는 칸이 연속으로 몇 개씩 있는지(왼쪽/위부터 순서대로)를 말한다.
//   예) [3,1] 은 연속 3칸을 칠하고 한 칸 이상 띄운 뒤 1칸. 칠할 칸이 없는 줄은 [0]
// - 내가 남기는 표시는 칸마다 0 (비움) · 1 (칠함) · 2 (✕, 칠하지 않을 칸). ✕ 는 풀이에서 비움과 같다
// - 모든 줄의 숫자를 만족하면 그림 완성. 이 게임의 퍼즐은 줄 하나만 보고 알아내는 추리만으로 끝까지 풀린다(찍을 필요가 없다)
const LOGIC_NONO = (() => {

// 칠해진 칸 연속 묶음의 길이들
function runs(line) {
  const out = [];
  let c = 0;
  for (const v of line) {
    if (v === 1) c++;
    else if (c) { out.push(c); c = 0; }
  }
  if (c) out.push(c);
  return out;
}
const clueOf = (line) => { const r = runs(line); return r.length ? r : [0]; };

function row(cells, n, r) { return cells.slice(r * n, r * n + n); }
function col(cells, n, c) { const o = []; for (let r = 0; r < n; r++) o.push(cells[r * n + c]); return o; }

// 그림(0/1 칸 배열)에서 가로·세로 숫자를 뽑는다
function clues(cells, n) {
  const rows = [], cols = [];
  for (let i = 0; i < n; i++) { rows.push(clueOf(row(cells, n, i))); cols.push(clueOf(col(cells, n, i))); }
  return { rows, cols };
}

// 문자열 그림(['.#.', ...], # 이 칠함) → 칸 배열
function fromArt(art) {
  const n = art.length;
  const cells = [];
  for (const line of art) {
    if (line.length !== n) throw new Error('not square');
    for (const ch of line) cells.push(ch === '#' ? 1 : 0);
  }
  return cells;
}

// 한 줄 풀이: line 은 -1 (모름) · 0 (빔) · 1 (칠함). 숫자에 맞는 배치를 모두 따져서 모든 배치에서 같은 칸을 확정한다.
// 모순이면 null, 아니면 새 줄을 돌려준다.
function solveLine(clue, line) {
  const n = line.length;
  const blocks = clue[0] === 0 ? [] : clue;
  const k = blocks.length;
  const can0 = new Uint8Array(n), can1 = new Uint8Array(n);
  const cur = new Int8Array(n);
  let any = false;
  const suffix = new Array(k + 1).fill(0);                      // suffix[i]: i 번째 이후 묶음이 차지하는 최소 길이(칸 + 사이 틈)
  for (let i = k - 1; i >= 0; i--) suffix[i] = blocks[i] + (i < k - 1 ? 1 : 0) + suffix[i + 1];
  function rec(bi, pos) {
    if (bi === k) {
      for (let i = pos; i < n; i++) if (line[i] === 1) return;
      for (let i = pos; i < n; i++) cur[i] = 0;
      any = true;
      for (let i = 0; i < n; i++) { if (cur[i]) can1[i] = 1; else can0[i] = 1; }
      return;
    }
    const len = blocks[bi];
    for (let start = pos; start + suffix[bi] <= n; start++) {
      let ok = true;
      for (let i = start; i < start + len; i++) if (line[i] === 0) { ok = false; break; }
      if (ok) {
        for (let i = pos; i < start; i++) cur[i] = 0;
        for (let i = start; i < start + len; i++) cur[i] = 1;
        let next = start + len;
        if (bi < k - 1) { if (line[next] === 1) ok = false; else { cur[next] = 0; next++; } }
        if (ok) rec(bi + 1, next);
      }
      if (line[start] === 1) break;                              // 이 칸이 칠해져 있으면 더 오른쪽에서 시작할 수 없다 (이 칸을 비울 수 없으므로)
    }
  }
  rec(0, 0);
  if (!any) return null;
  const out = line.slice();
  for (let i = 0; i < n; i++) {
    if (can1[i] && !can0[i]) out[i] = 1;
    else if (can0[i] && !can1[i]) out[i] = 0;
  }
  return out;
}

// 줄 풀이만 되풀이해서 푼다. { ok: 모순 없음, solved: 모두 확정, cells: -1/0/1, rounds }
function solveByLines(rows, cols, n, start) {
  const cells = start ? start.slice() : new Array(n * n).fill(-1);
  let rounds = 0, changed = true;
  while (changed) {
    changed = false; rounds++;
    for (let r = 0; r < n; r++) {
      const nl = solveLine(rows[r], row(cells, n, r));
      if (!nl) return { ok: false, solved: false, cells, rounds };
      for (let c = 0; c < n; c++) if (nl[c] !== cells[r * n + c]) { cells[r * n + c] = nl[c]; changed = true; }
    }
    for (let c = 0; c < n; c++) {
      const nl = solveLine(cols[c], col(cells, n, c));
      if (!nl) return { ok: false, solved: false, cells, rounds };
      for (let r = 0; r < n; r++) if (nl[r] !== cells[r * n + c]) { cells[r * n + c] = nl[r]; changed = true; }
    }
  }
  return { ok: true, solved: !cells.includes(-1), cells, rounds };
}

// 해가 몇 개인지 (limit 개까지만 센다). 줄 풀이 + 가정(찍어 보기)
function countSolutions(rows, cols, n, limit = 2, start) {
  const res = solveByLines(rows, cols, n, start);
  if (!res.ok) return 0;
  const i = res.cells.indexOf(-1);
  if (i < 0) return 1;
  let total = 0;
  for (const v of [0, 1]) {
    const next = res.cells.slice(); next[i] = v;
    total += countSolutions(rows, cols, n, limit - total, next);
    if (total >= limit) break;
  }
  return total;
}

// ---------- 게임 상태 ----------
function newGame(n) { return { n, cells: new Array(n * n).fill(0), history: [] }; }

// changes: [[칸, 값], ...] 를 한 번의 동작으로 적용한다 (되돌리기는 이 동작 단위). 실제로 바뀐 칸 수를 돌려준다
function apply(st, changes) {
  const undo = [];
  for (const [i, v] of changes) {
    if (!Number.isInteger(i) || i < 0 || i >= st.cells.length || ![0, 1, 2].includes(v) || st.cells[i] === v) continue;
    undo.push([i, st.cells[i]]);
    st.cells[i] = v;
  }
  if (undo.length) st.history.push(undo);
  return undo.length;
}
function undo(st) {
  const u = st.history.pop();
  if (!u) return false;
  for (let k = u.length - 1; k >= 0; k--) st.cells[u[k][0]] = u[k][1];
  return true;
}

// 내 표시가 모든 줄 숫자를 만족하는가 (✕ 는 빔)
function isSolved(st, rows, cols) {
  const n = st.n;
  for (let i = 0; i < n; i++) {
    if (!sameRuns(runs(row(st.cells, n, i)), rows[i]) || !sameRuns(runs(col(st.cells, n, i)), cols[i])) return false;
  }
  return true;
}
function sameRuns(a, b) {
  const bb = b[0] === 0 ? [] : b;
  return a.length === bb.length && a.every((v, i) => v === bb[i]);
}
// 한 줄의 숫자를 지금 표시가 이미 만족하는가 (숫자를 흐리게 보여 줄 때)
const lineDone = (clue, line) => sameRuns(runs(line), clue);

// 정답과 다른 칸 (칠했는데 정답이 빔 / ✕ 했는데 정답이 칠함)
function wrongCells(st, solution) {
  const out = [];
  for (let i = 0; i < st.cells.length; i++) {
    if ((st.cells[i] === 1 && !solution[i]) || (st.cells[i] === 2 && solution[i])) out.push(i);
  }
  return out;
}

// 힌트: 정답과 다른 칸 하나를 정답대로 고쳐 주고 그 칸 번호를 돌려준다 (이미 다 맞으면 -1).
// 틀린 칠함·✕ 를 먼저, 없으면 아직 비어 있는 칠할 칸 하나
function hint(st, solution, rand = Math.random) {
  let pool = wrongCells(st, solution);
  if (!pool.length) {
    for (let i = 0; i < st.cells.length; i++) if (solution[i] && st.cells[i] !== 1) pool.push(i);
  }
  if (!pool.length) return -1;
  const i = pool[Math.floor(rand() * pool.length)];
  apply(st, [[i, solution[i] ? 1 : 2]]);
  return i;
}

// 얼마나 채웠나: 칠할 칸 중 맞게 칠한 비율 (0~1)
function progress(st, solution) {
  let need = 0, got = 0;
  for (let i = 0; i < solution.length; i++) if (solution[i]) { need++; if (st.cells[i] === 1) got++; }
  return need ? got / need : 1;
}

return { runs, clueOf, clues, fromArt, solveLine, solveByLines, countSolutions, newGame, apply, undo, isSolved, lineDone, wrongCells, hint, progress, row, col };
})();
if (typeof module !== 'undefined') module.exports = LOGIC_NONO;
