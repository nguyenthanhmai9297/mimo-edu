import { randomIndex, shuffleList, type Random } from './toolUtils';

/**
 * Rules of "Đoàn tàu kiến thức – Xếp toa": cars must be put behind the
 * locomotive in the right order. Kept pure so they can be unit-tested.
 * A car is identified by its index in `puzzle.cars`, which is also its
 * correct position.
 */

export interface TrainPuzzle {
  id: string;
  title: string;
  cars: string[];
}

export type TrainTemplateId = 'tang-dan' | 'giam-dan' | 'dem-them' | 'phep-tinh' | 'thang' | 'thu';

export const TRAIN_TEMPLATES: { id: TrainTemplateId; name: string; example: string; usesRange: boolean }[] = [
  { id: 'tang-dan', name: 'Số từ bé đến lớn', example: '1 205 → 2 150 → 2 510', usesRange: true },
  { id: 'giam-dan', name: 'Số từ lớn đến bé', example: '9 870 → 9 087 → 8 790', usesRange: true },
  { id: 'dem-them', name: 'Đếm thêm (bảng nhân)', example: '6 → 12 → 18 → 24', usesRange: false },
  { id: 'phep-tinh', name: 'Phép tính theo kết quả tăng dần', example: '3 × 4 → 2 × 7 → 5 × 3', usesRange: false },
  { id: 'thang', name: 'Các tháng trong năm', example: 'Tháng 3 → Tháng 4 → Tháng 5', usesRange: false },
  { id: 'thu', name: 'Các ngày trong tuần', example: 'Thứ Hai → Thứ Ba → Thứ Tư', usesRange: false },
];

/** Largest number used by the number templates (Toán 3 goes up to 100 000). */
export type TrainRange = 1000 | 10000 | 100000;

export const MIN_CARS = 3;
export const MAX_CARS = 8;
const DAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];

/** Vietnamese textbook grouping: 12 345 (a space every three digits from 1 000 up). */
export function formatNumber(n: number): string {
  return n >= 1000 ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : String(n);
}

const between = (lo: number, hi: number, random?: Random) => lo + randomIndex(hi - lo + 1, random);

function distinctNumbers(count: number, lo: number, hi: number, random?: Random): number[] {
  const set = new Set<number>();
  while (set.size < count) set.add(between(lo, hi, random));
  return [...set];
}

/**
 * Numbers close enough to be worth comparing: mostly the same number of
 * digits, sometimes sharing the leading digits (e.g. 4 503, 4 530, 4 350).
 */
function comparableNumbers(count: number, max: TrainRange, random?: Random): number[] {
  const lo = max / 10;
  if (randomIndex(2, random) === 0) return distinctNumbers(count, lo, max - 1, random);
  const head = between(1, 9, random) * (max / 10);
  return distinctNumbers(count, head, head + max / 10 - 1, random);
}

export function makeTemplatePuzzle(
  template: TrainTemplateId,
  options: { cars: number; range: TrainRange },
  random?: Random
): TrainPuzzle {
  const count = Math.max(MIN_CARS, Math.min(MAX_CARS, Math.floor(options.cars)));
  const id = `${template}-${Date.now().toString(36)}-${randomIndex(1e6, random)}`;
  switch (template) {
    case 'tang-dan':
    case 'giam-dan': {
      const nums = comparableNumbers(count, options.range, random).sort((a, b) => a - b);
      if (template === 'giam-dan') nums.reverse();
      return {
        id,
        title: template === 'tang-dan' ? 'Xếp các số theo thứ tự từ bé đến lớn' : 'Xếp các số theo thứ tự từ lớn đến bé',
        cars: nums.map(formatNumber),
      };
    }
    case 'dem-them': {
      const n = between(2, 9, random);
      const start = between(1, 11 - count, random);
      return {
        id,
        title: `Đếm thêm ${n}: xếp các toa theo thứ tự`,
        cars: Array.from({ length: count }, (_, i) => String(n * (start + i))),
      };
    }
    case 'phep-tinh': {
      // Distinct results, mixing × and : from the multiplication tables 2–9
      const byResult = new Map<number, string>();
      while (byResult.size < count) {
        const a = between(2, 9, random);
        const b = between(2, 9, random);
        if (randomIndex(2, random) === 0) {
          if (!byResult.has(a * b)) byResult.set(a * b, `${a} × ${b}`);
        } else if (!byResult.has(b)) {
          byResult.set(b, `${a * b} : ${a}`);
        }
      }
      return {
        id,
        title: 'Xếp các phép tính theo kết quả từ bé đến lớn',
        cars: [...byResult.entries()].sort((x, y) => x[0] - y[0]).map(([, text]) => text),
      };
    }
    case 'thang': {
      const start = between(1, 13 - count, random);
      return { id, title: 'Xếp các tháng theo thứ tự trong năm', cars: Array.from({ length: count }, (_, i) => `Tháng ${start + i}`) };
    }
    case 'thu': {
      const len = Math.min(count, DAYS.length);
      const start = between(0, DAYS.length - len, random);
      return { id, title: 'Xếp các ngày theo thứ tự trong tuần', cars: DAYS.slice(start, start + len) };
    }
  }
}

/** Teacher-typed puzzle: one car per line, already in the right order. */
export interface CustomTrainPuzzle {
  id: string;
  title: string;
  text: string;
}

export function customPuzzleCars(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

/** Returns a message when the puzzle can't be played. */
export function customPuzzleProblem(p: CustomTrainPuzzle): string | null {
  const cars = customPuzzleCars(p.text);
  if (!p.title.trim()) return 'Chưa có yêu cầu (ví dụ: Xếp các số từ bé đến lớn).';
  if (cars.length < MIN_CARS) return `Cần ít nhất ${MIN_CARS} toa (mỗi dòng một toa).`;
  if (cars.length > MAX_CARS) return `Tối đa ${MAX_CARS} toa.`;
  if (cars.some((c) => c.length > 40)) return 'Mỗi toa tối đa 40 ký tự.';
  if (new Set(cars.map((c) => c.toLowerCase())).size !== cars.length) return 'Có hai toa giống nhau.';
  return null;
}

export function fromCustomPuzzle(p: CustomTrainPuzzle): TrainPuzzle | null {
  if (customPuzzleProblem(p)) return null;
  return { id: `custom-${p.id}`, title: p.title.trim(), cars: customPuzzleCars(p.text) };
}

// ------------------------------------------------------------------ a round

export interface TrainRound {
  puzzle: TrainPuzzle;
  /** Cars waiting at the station, in display order. */
  yard: number[];
  /** Car placed in each position behind the locomotive (null = empty). */
  slots: (number | null)[];
  /** Positions filled by a hint; they can't be moved. */
  locked: boolean[];
  /** Result of the last "Kiểm tra" per position (null = not checked since the last move). */
  marks: (boolean | null)[];
  checks: number;
  hints: number;
  solved: boolean;
  /** The teacher showed the answer: the round counts as not solved. */
  revealed: boolean;
}

// Cars are always distinct (templates make them so, custom puzzles are checked)
const isCorrectAt = (round: TrainRound, pos: number) => round.slots[pos] === pos;

export function startRound(puzzle: TrainPuzzle, random?: Random): TrainRound {
  const order = puzzle.cars.map((_, i) => i);
  let yard = shuffleList(order, random);
  // Never hand out cars that are already in order
  for (let i = 0; i < 5 && yard.every((c, pos) => c === pos); i++) yard = shuffleList(order, random);
  if (yard.every((c, pos) => c === pos)) yard = [...order].reverse();
  return {
    puzzle,
    yard,
    slots: puzzle.cars.map(() => null),
    locked: puzzle.cars.map(() => false),
    marks: puzzle.cars.map(() => null),
    checks: 0,
    hints: 0,
    solved: false,
    revealed: false,
  };
}

function editable(round: TrainRound): TrainRound | null {
  if (round.solved || round.revealed) return null;
  return { ...round, yard: [...round.yard], slots: [...round.slots], locked: [...round.locked], marks: round.marks.map(() => null) };
}

/**
 * Puts a car (from the station or another position) at `pos`. A car already
 * there swaps places with it. Without `pos` the car goes to the first empty
 * position. Locked positions never change.
 */
export function placeCar(prev: TrainRound, car: number, pos?: number): TrainRound {
  const r = editable(prev);
  if (!r) return prev;
  const target = pos ?? r.slots.findIndex((s) => s === null);
  if (target < 0 || target >= r.slots.length || r.locked[target]) return prev;
  const from = r.slots.indexOf(car);
  if (from >= 0 && r.locked[from]) return prev;
  if (from === target) return prev;
  const occupant = r.slots[target];
  if (from >= 0) {
    r.slots[from] = occupant;
  } else {
    r.yard = r.yard.filter((c) => c !== car);
    if (occupant !== null) r.yard.push(occupant);
  }
  r.slots[target] = car;
  return r;
}

/** Sends the car at `pos` back to the station. */
export function removeCar(prev: TrainRound, pos: number): TrainRound {
  const r = editable(prev);
  const car = prev.slots[pos];
  if (!r || car === null || car === undefined || r.locked[pos]) return prev;
  r.slots[pos] = null;
  r.yard.push(car);
  return r;
}

/** Marks every position right or wrong; solved when all cars are in place. */
export function checkRound(prev: TrainRound): TrainRound {
  if (prev.solved || prev.revealed || prev.slots.some((s) => s === null)) return prev;
  const marks = prev.slots.map((_, pos) => isCorrectAt(prev, pos));
  return { ...prev, marks, checks: prev.checks + 1, solved: marks.every(Boolean) };
}

/** Puts the right car into the first wrong or empty position and locks it. */
export function hintRound(prev: TrainRound): TrainRound {
  if (prev.solved || prev.revealed) return prev;
  const pos = prev.slots.findIndex((_, i) => !isCorrectAt(prev, i));
  if (pos < 0) return prev;
  // Locked positions always hold their right car, so car `pos` is free to move
  const moved = placeCar(prev, pos, pos);
  const locked = [...moved.locked];
  locked[pos] = true;
  return { ...moved, locked, hints: prev.hints + 1 };
}

export function revealRound(prev: TrainRound): TrainRound {
  if (prev.solved || prev.revealed) return prev;
  return {
    ...prev,
    yard: [],
    slots: prev.puzzle.cars.map((_, i) => i),
    marks: prev.puzzle.cars.map(() => true),
    revealed: true,
  };
}

export function roundFilled(round: TrainRound): boolean {
  return round.slots.every((s) => s !== null);
}

/** Points for a solved round: 3 on the first check without hints, then 2, then 1. */
export function roundPoints(round: TrainRound): number {
  if (!round.solved) return 0;
  return Math.max(1, 3 - (round.checks - 1) - round.hints);
}

// ------------------------------------------------------------------ a game

export interface OrderGameSettings {
  /** 1 = the whole class plays together · 2 = two teams take turns. */
  teams: 1 | 2;
  teamNames: [string, string];
  rounds: number;
  cars: number;
  range: TrainRange;
  templates: TrainTemplateId[];
}

export const DEFAULT_ORDER_SETTINGS: OrderGameSettings = {
  teams: 1,
  teamNames: ['Đội Xanh', 'Đội Đỏ'],
  rounds: 5,
  cars: 5,
  range: 10000,
  templates: ['tang-dan', 'phep-tinh'],
};

export interface OrderGame {
  puzzles: TrainPuzzle[];
  index: number;
  round: TrainRound;
  scores: [number, number];
  /** One entry per finished round. */
  results: { team: 0 | 1; points: number; solved: boolean }[];
  finished: boolean;
}

/**
 * The puzzles of one game: teacher-typed ones are each used once, the
 * templates fill the remaining rounds in turn with freshly generated cars.
 */
export function buildPuzzles(
  settings: OrderGameSettings,
  custom: TrainPuzzle[],
  random?: Random
): TrainPuzzle[] {
  const rounds = Math.max(1, Math.floor(settings.rounds));
  const picked = shuffleList(custom, random).slice(0, rounds);
  const templates = settings.templates;
  for (let i = 0; picked.length < rounds && templates.length > 0; i++) {
    picked.push(makeTemplatePuzzle(templates[i % templates.length], settings, random));
  }
  return shuffleList(picked, random);
}

export function startOrderGame(puzzles: TrainPuzzle[], random?: Random): OrderGame {
  return { puzzles, index: 0, round: startRound(puzzles[0], random), scores: [0, 0], results: [], finished: false };
}

/** Team playing the current round. */
export function orderTurn(game: OrderGame, settings: OrderGameSettings): 0 | 1 {
  return settings.teams === 2 ? ((game.index % 2) as 0 | 1) : 0;
}

/** Records the current round (solved, revealed or skipped) and deals the next one. */
export function nextOrderRound(prev: OrderGame, settings: OrderGameSettings, random?: Random): OrderGame {
  if (prev.finished) return prev;
  const team = orderTurn(prev, settings);
  const points = roundPoints(prev.round);
  const scores = [...prev.scores] as [number, number];
  scores[team] += points;
  const results = [...prev.results, { team, points, solved: prev.round.solved }];
  const index = prev.index + 1;
  if (index >= prev.puzzles.length) return { ...prev, scores, results, finished: true };
  return { ...prev, index, round: startRound(prev.puzzles[index], random), scores, results };
}

export function updateOrderRound(game: OrderGame, update: (round: TrainRound) => TrainRound): OrderGame {
  const round = update(game.round);
  return round === game.round ? game : { ...game, round };
}
