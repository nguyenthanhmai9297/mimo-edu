import { describe, it, expect } from 'vitest';
import { createRng } from '../utils/practiceEngine';
import {
  buildPuzzles,
  checkRound,
  customPuzzleProblem,
  DEFAULT_ORDER_SETTINGS,
  formatNumber,
  fromCustomPuzzle,
  hintRound,
  makeTemplatePuzzle,
  nextOrderRound,
  orderTurn,
  placeCar,
  removeCar,
  revealRound,
  roundPoints,
  startOrderGame,
  startRound,
  TRAIN_TEMPLATES,
  TrainPuzzle,
  TrainRound,
  updateOrderRound,
} from '../features/tools/knowledgeTrain';

const puzzle: TrainPuzzle = { id: 'p', title: 'Xếp', cars: ['1', '2', '3', '4'] };
/** Places every car at its right position. */
const solve = (r: TrainRound) => r.puzzle.cars.reduce((acc, _, i) => placeCar(acc, i, i), r);

describe('Đoàn tàu kiến thức – mẫu đề', () => {
  it('formats numbers like the textbook', () => {
    expect(formatNumber(987)).toBe('987');
    expect(formatNumber(1205)).toBe('1 205');
    expect(formatNumber(100000)).toBe('100 000');
  });

  it('every template makes distinct cars in the right order', () => {
    const rng = createRng(7);
    for (const t of TRAIN_TEMPLATES) {
      for (let i = 0; i < 30; i++) {
        const p = makeTemplatePuzzle(t.id, { cars: 6, range: 10000 }, rng);
        expect(p.cars).toHaveLength(6);
        expect(new Set(p.cars).size).toBe(6);
        if (t.id === 'tang-dan' || t.id === 'giam-dan') {
          const nums = p.cars.map((c) => Number(c.replace(/\s/g, '')));
          expect(nums.every((n) => n >= 1000 && n < 10000)).toBe(true);
          const sorted = [...nums].sort((a, b) => (t.id === 'tang-dan' ? a - b : b - a));
          expect(nums).toEqual(sorted);
        }
        if (t.id === 'phep-tinh') {
          const value = (c: string) => {
            const [a, op, b] = c.split(' ');
            return op === '×' ? Number(a) * Number(b) : Number(a) / Number(b);
          };
          const values = p.cars.map(value);
          expect(values.every(Number.isInteger)).toBe(true);
          expect(values).toEqual([...values].sort((a, b) => a - b));
        }
      }
    }
  });

  it('keeps months and days inside the year / week', () => {
    const rng = createRng(3);
    for (let i = 0; i < 30; i++) {
      expect(makeTemplatePuzzle('thang', { cars: 8, range: 1000 }, rng).cars.at(-1)).toMatch(/^Tháng ([1-9]|1[0-2])$/);
      expect(makeTemplatePuzzle('thu', { cars: 8, range: 1000 }, rng).cars).toHaveLength(7);
    }
  });

  it('validates teacher-typed puzzles', () => {
    const base = { id: 'a', title: 'Xếp từ bé đến lớn', text: 'một\nhai\nba' };
    expect(customPuzzleProblem(base)).toBeNull();
    expect(fromCustomPuzzle({ ...base, text: '  một \n\n hai\nba  ' })?.cars).toEqual(['một', 'hai', 'ba']);
    expect(customPuzzleProblem({ ...base, title: ' ' })).toMatch(/yêu cầu/);
    expect(customPuzzleProblem({ ...base, text: 'một\nhai' })).toMatch(/ít nhất/);
    expect(customPuzzleProblem({ ...base, text: 'a\nb\nc\nd\ne\nf\ng\nh\ni' })).toMatch(/Tối đa/);
    expect(customPuzzleProblem({ ...base, text: 'một\nMột\nba' })).toMatch(/giống nhau/);
  });
});

describe('Đoàn tàu kiến thức – xếp toa', () => {
  it('never deals the cars already in order', () => {
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) {
      const r = startRound(puzzle, rng);
      expect(r.yard.every((c, pos) => c === pos)).toBe(false);
      expect([...r.yard].sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it('places, swaps and removes cars', () => {
    let r = startRound(puzzle, createRng(2));
    r = placeCar(r, 2); // first empty position
    expect(r.slots).toEqual([2, null, null, null]);
    r = placeCar(r, 0, 0); // replaces car 2, which goes back to the station
    expect(r.slots[0]).toBe(0);
    expect(r.yard).toContain(2);
    r = placeCar(r, 2, 3);
    r = placeCar(r, 0, 3); // car moved between positions swaps with the occupant
    expect(r.slots).toEqual([2, null, null, 0]);
    r = removeCar(r, 3);
    expect(r.slots[3]).toBeNull();
    expect(r.yard).toContain(0);
    expect(r.yard.length + r.slots.filter((s) => s !== null).length).toBe(4);
  });

  it('checks only a full train and marks each position', () => {
    let r = startRound(puzzle, createRng(4));
    r = placeCar(r, 1, 0);
    expect(checkRound(r)).toBe(r);
    r = placeCar(placeCar(placeCar(r, 0, 1), 2, 2), 3, 3);
    r = checkRound(r);
    expect(r.marks).toEqual([false, false, true, true]);
    expect(r.solved).toBe(false);
    r = placeCar(r, 0, 0); // a move clears the marks
    expect(r.marks.every((m) => m === null)).toBe(true);
    r = checkRound(r);
    expect(r.solved).toBe(true);
    expect(r.checks).toBe(2);
    expect(roundPoints(r)).toBe(2);
    expect(placeCar(r, 1, 0)).toBe(r); // solved trains can't change
  });

  it('a hint locks the right car in the first wrong place', () => {
    let r = startRound(puzzle, createRng(5));
    r = placeCar(placeCar(r, 3, 0), 1, 1);
    r = hintRound(r);
    expect(r.slots[0]).toBe(0);
    expect(r.locked[0]).toBe(true);
    expect(r.hints).toBe(1);
    expect(removeCar(r, 0)).toBe(r);
    expect(placeCar(r, 2, 0)).toBe(r);
    r = checkRound(solve(r));
    expect(r.solved).toBe(true);
    expect(roundPoints(r)).toBe(2);
  });

  it('scores 3 for a first-try solve and nothing after a reveal', () => {
    const solved = checkRound(solve(startRound(puzzle, createRng(6))));
    expect(roundPoints(solved)).toBe(3);
    const revealed = revealRound(startRound(puzzle, createRng(6)));
    expect(revealed.slots).toEqual([0, 1, 2, 3]);
    expect(revealed.solved).toBe(false);
    expect(roundPoints(revealed)).toBe(0);
  });
});

describe('Đoàn tàu kiến thức – cả lượt chơi', () => {
  it('uses each typed puzzle once and fills the rest from templates', () => {
    const custom: TrainPuzzle[] = [puzzle, { ...puzzle, id: 'q' }];
    const list = buildPuzzles({ ...DEFAULT_ORDER_SETTINGS, rounds: 5 }, custom, createRng(8));
    expect(list).toHaveLength(5);
    expect(list.filter((p) => p.id === 'p' || p.id === 'q')).toHaveLength(2);
    expect(buildPuzzles({ ...DEFAULT_ORDER_SETTINGS, rounds: 5, templates: [] }, custom)).toHaveLength(2);
  });

  it('two teams alternate and collect their points', () => {
    const settings = { ...DEFAULT_ORDER_SETTINGS, teams: 2 as const };
    let g = startOrderGame([puzzle, puzzle, puzzle], createRng(9));
    expect(orderTurn(g, settings)).toBe(0);
    g = updateOrderRound(g, (r) => checkRound(solve(r)));
    g = nextOrderRound(g, settings, createRng(9));
    expect(g.scores).toEqual([3, 0]);
    expect(orderTurn(g, settings)).toBe(1);
    g = nextOrderRound(g, settings); // skipped round: no points
    g = updateOrderRound(g, (r) => checkRound(solve(r)));
    g = nextOrderRound(g, settings);
    expect(g.finished).toBe(true);
    expect(g.scores).toEqual([6, 0]);
    expect(g.results.map((x) => x.solved)).toEqual([true, false, true]);
  });
});
