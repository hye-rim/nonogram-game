'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

test('clueOf and runs', () => {
  assert.deepStrictEqual(L.clueOf([1, 1, 0, 1, 0, 0, 1, 1, 1]), [2, 1, 3]);
  assert.deepStrictEqual(L.clueOf([0, 0, 0]), [0]);
  assert.deepStrictEqual(L.clueOf([1, 1, 1]), [3]);
  assert.deepStrictEqual(L.runs([1, 2, 1]), [1, 1]);          // a cross counts as empty and splits a run
});

test('clues of a picture', () => {
  const c = L.clues(L.fromArt(['#.#', '###', '...']), 3);
  assert.deepStrictEqual(c.rows, [[1, 1], [3], [0]]);
  assert.deepStrictEqual(c.cols, [[2], [1], [2]]);
});

// brute force: every line of length n that matches the clue
function allLines(clue, n) {
  const out = [];
  for (let m = 0; m < (1 << n); m++) {
    const line = [];
    for (let i = 0; i < n; i++) line.push((m >> i) & 1);
    if (L.clueOf(line).join() === clue.join()) out.push(line);
  }
  return out;
}

test('solveLine agrees with brute force on every clue and many partial lines', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const clues = new Set();
    for (let m = 0; m < (1 << n); m++) { const line = []; for (let i = 0; i < n; i++) line.push((m >> i) & 1); clues.add(L.clueOf(line).join()); }
    for (const key of clues) {
      const clue = key.split(',').map(Number);
      const lines = allLines(clue, n);
      for (let t = 0; t < 6; t++) {
        const base = lines[Math.floor(rnd() * lines.length)];
        const part = base.map((v) => (rnd() < 0.4 ? v : -1));
        const consistent = lines.filter((l) => l.every((v, i) => part[i] < 0 || part[i] === v));
        const want = part.map((_, i) => (consistent.every((l) => l[i] === 1) ? 1 : consistent.every((l) => l[i] === 0) ? 0 : -1));
        assert.deepStrictEqual(L.solveLine(clue, part), want, `n=${n} clue=${key} part=${part}`);
      }
    }
  }
});

test('solveLine detects contradictions', () => {
  assert.strictEqual(L.solveLine([3], [0, 0, 0, 0]), null);
  assert.strictEqual(L.solveLine([2, 2], [-1, -1, -1, -1]), null);
  assert.strictEqual(L.solveLine([0], [-1, 1, -1]), null);
  assert.deepStrictEqual(L.solveLine([2, 1], [-1, -1, -1, -1]), [1, 1, 0, 1]);
});

test('solveByLines solves a picture and countSolutions sees an ambiguous one', () => {
  const cells = L.fromArt(['..#..', '..#..', '#####', '..#..', '..#..']);
  const { rows, cols } = L.clues(cells, 5);
  const r = L.solveByLines(rows, cols, 5);
  assert.ok(r.ok && r.solved);
  assert.deepStrictEqual(r.cells, cells);
  assert.strictEqual(L.countSolutions(rows, cols, 5), 1);
  const amb = L.clues(L.fromArt(['#.', '.#']), 2);                // the diagonal picture has two answers
  assert.strictEqual(L.solveByLines(amb.rows, amb.cols, 2).solved, false);
  assert.strictEqual(L.countSolutions(amb.rows, amb.cols, 2), 2);
});

test('every puzzle has the right size, is unique and solves by lines alone', () => {
  const P = require('../puzzles.js');
  assert.ok(P.length >= 20);
  const ids = new Set();
  for (const p of P) {
    assert.ok(!ids.has(p.id), 'duplicate id ' + p.id); ids.add(p.id);
    assert.ok([5, 10, 15].includes(p.n), p.id);
    assert.strictEqual(p.art.length, p.n);
    assert.ok(p.art.every((l) => l.length === p.n && /^[.#]+$/.test(l)), p.id);
    const cells = L.fromArt(p.art);
    assert.ok(cells.some((v) => v) && cells.some((v) => !v), p.id + ' is empty or full');
    const { rows, cols } = L.clues(cells, p.n);
    const r = L.solveByLines(rows, cols, p.n);
    assert.ok(r.ok && r.solved, p.id + ' needs guessing');
    assert.deepStrictEqual(r.cells, cells, p.id);
    assert.strictEqual(L.countSolutions(rows, cols, p.n), 1, p.id);
  }
  for (const n of [5, 10, 15]) assert.ok(P.filter((p) => p.n === n).length >= 4, 'few puzzles of size ' + n);
});

test('apply and undo work per stroke', () => {
  const st = L.newGame(5);
  assert.strictEqual(L.apply(st, [[0, 1], [1, 1], [2, 2]]), 3);
  assert.strictEqual(L.apply(st, [[0, 1]]), 0);                    // no change, no history entry
  assert.strictEqual(st.history.length, 1);
  assert.strictEqual(L.apply(st, [[1, 0], [99, 1], [3, 5], [-1, 1]]), 1);   // bad cells and values are ignored
  assert.deepStrictEqual(st.cells.slice(0, 4), [1, 0, 2, 0]);
  assert.ok(L.undo(st));
  assert.deepStrictEqual(st.cells.slice(0, 4), [1, 1, 2, 0]);
  assert.ok(L.undo(st));
  assert.ok(st.cells.every((v) => v === 0));
  assert.strictEqual(L.undo(st), false);
});

test('isSolved ignores crosses and accepts any picture that fits the clues', () => {
  const sol = L.fromArt(['..#..', '..#..', '#####', '..#..', '..#..']);
  const { rows, cols } = L.clues(sol, 5);
  const st = L.newGame(5);
  assert.strictEqual(L.isSolved(st, rows, cols), false);
  L.apply(st, sol.map((v, i) => [i, v ? 1 : 2]));                 // mark everything: filled and crossed
  assert.strictEqual(L.isSolved(st, rows, cols), true);
  L.apply(st, [[0, 1]]);
  assert.strictEqual(L.isSolved(st, rows, cols), false);
  const blank = L.fromArt(['...', '...', '...']);
  const bc = L.clues(blank, 3);
  assert.strictEqual(L.isSolved(L.newGame(3), bc.rows, bc.cols), true);
});

test('lineDone dims a clue only when the marks match it', () => {
  assert.strictEqual(L.lineDone([2, 1], [1, 1, 0, 1, 0]), true);
  assert.strictEqual(L.lineDone([2, 1], [1, 1, 0, 0, 0]), false);
  assert.strictEqual(L.lineDone([2, 1], [1, 1, 1, 1, 0]), false);
  assert.strictEqual(L.lineDone([0], [0, 2, 0]), true);
});

test('wrongCells, hint and progress', () => {
  const sol = L.fromArt(['#.', '##']);
  const st = L.newGame(2);
  assert.strictEqual(L.progress(st, sol), 0);
  L.apply(st, [[1, 1], [0, 2]]);                                   // wrong fill at 1, wrong cross at 0
  assert.deepStrictEqual(L.wrongCells(st, sol).sort(), [0, 1]);
  const h = L.hint(st, sol, () => 0);                              // fixes a wrong cell first
  assert.ok(h === 0 || h === 1);
  assert.strictEqual(L.wrongCells(st, sol).length, 1);
  L.hint(st, sol, () => 0);
  assert.strictEqual(L.wrongCells(st, sol).length, 0);
  const h2 = L.hint(st, sol, () => 0);                             // then fills a missing cell
  assert.ok(h2 === 2 || h2 === 3 || h2 === 0);
  while (L.hint(st, sol) >= 0);
  assert.strictEqual(L.progress(st, sol), 1);
  assert.strictEqual(L.hint(st, sol), -1);
});
