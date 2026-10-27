'use strict';
// 사용: node tools/build.js   → 초안(drafts.js)을 검사해 줄 풀이만으로 풀리는 퍼즐만 puzzles.js 로 쓴다.
// 줄 풀이로 안 풀리면(찍어야 하면) 칸을 한두 개 바꿔 풀리게 고치고, 어떻게 고쳤는지 출력한다.
const fs = require('fs');
const path = require('path');
const L = require('../logic.js');
const drafts = require('./drafts.js');

function solvable(cells, n) {
  const { rows, cols } = L.clues(cells, n);
  const r = L.solveByLines(rows, cols, n);
  return r.ok && r.solved;
}
const mirrorOf = (i, n) => Math.floor(i / n) * n + (n - 1 - (i % n));
const isSym = (cells, n) => cells.every((v, i) => v === cells[mirrorOf(i, n)]);
// 좌우 대칭 그림은 대칭으로 고친다(칸 쌍 하나를 한 번으로 센다)
function repairSym(cells, n, maxPairs) {
  const idx = [];
  for (let i = 0; i < cells.length; i++) if (i % n <= (n - 1) / 2) idx.push(i);
  const pick = (start, left, cur) => {
    if (!left) return solvable(cur, n) ? cur : null;
    for (let k = start; k < idx.length; k++) {
      const next = cur.slice(); const m = mirrorOf(idx[k], n);
      next[idx[k]] = 1 - next[idx[k]]; if (m !== idx[k]) next[m] = 1 - next[m];
      const got = pick(k + 1, left - 1, next);
      if (got) return got;
    }
    return null;
  };
  for (let f = 1; f <= maxPairs; f++) { const got = pick(0, f, cells); if (got) return got; }
  return null;
}
function repair(cells, n, maxFlips) {
  if (solvable(cells, n)) return cells;
  if (isSym(cells, n)) { const s = repairSym(cells, n, 2); if (s) return s; }
  const idx = cells.map((_, i) => i);
  for (let f = 1; f <= maxFlips; f++) {
    const pick = (start, left, cur) => {
      if (!left) return solvable(cur, n) ? cur : null;
      for (let k = start; k < idx.length; k++) {
        const next = cur.slice(); next[k] = 1 - next[k];
        const got = pick(k + 1, left - 1, next);
        if (got) return got;
      }
      return null;
    };
    const got = pick(0, f, cells);
    if (got) return got;
  }
  return null;
}
const out = [];
for (const d of drafts) {
  const n = d.art.length;
  const cells = L.fromArt(d.art);
  const fixed = repair(cells, n, n >= 15 ? 2 : 3);
  if (!fixed) { console.log('FAIL', d.id, d.name); continue; }
  const changed = cells.filter((v, i) => v !== fixed[i]).length;
  const art = [];
  for (let r = 0; r < n; r++) art.push(fixed.slice(r * n, r * n + n).map((v) => (v ? '#' : '.')).join(''));
  if (changed) { console.log('고침', d.id, d.name, changed + '칸'); art.forEach((l) => console.log('  ' + l)); }
  out.push({ id: d.id, n, name: d.name, art });
}
const body = '// 퍼즐 데이터 (tools/build.js 가 만든다). art 의 # 이 칠할 칸. 모두 줄 풀이만으로 풀린다.\nconst PUZZLES = ' + JSON.stringify(out, null, 1).replace(/\n\s+/g, ' ').replace(/\[ /g, '[').replace(/ \]/g, ']').replace(/\}, \{/g, '},\n  {').replace(/^\[ \{/, '[\n  {') + ';\nif (typeof module !== \'undefined\') module.exports = PUZZLES;\n';
fs.writeFileSync(path.join(__dirname, '..', 'puzzles.js'), body);
console.log('wrote', out.length, 'of', drafts.length);
