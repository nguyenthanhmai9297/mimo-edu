import { describe, it, expect } from 'vitest';
import { createRng } from '../utils/practiceEngine';
import {
  formatClock,
  groupCountForSize,
  parseNameList,
  pickName,
  shuffleList,
  splitIntoGroups,
} from '../features/tools/toolUtils';

const NAMES = ['An', 'Bình', 'Chi', 'Dũng', 'Em', 'Giang', 'Hà'];

describe('pickName', () => {
  it('calls everyone once before repeating when avoiding repeats', () => {
    const rng = createRng(3);
    let called: string[] = [];
    const seen: string[] = [];
    for (let i = 0; i < NAMES.length; i++) {
      const r = pickName(NAMES, called, true, rng)!;
      seen.push(r.name);
      called = r.called;
    }
    expect([...seen].sort()).toEqual([...NAMES].sort());
    const next = pickName(NAMES, called, true, rng)!;
    expect(next.roundReset).toBe(true);
    expect(next.called).toEqual([next.name]);
  });

  it('may repeat when repeats are allowed and handles an empty list', () => {
    expect(pickName([], [], true)).toBeNull();
    const r = pickName(['An'], ['An'], false)!;
    expect(r.name).toBe('An');
    expect(r.roundReset).toBe(false);
  });
});

describe('splitIntoGroups', () => {
  it('keeps everyone and balances group sizes', () => {
    const groups = splitIntoGroups(NAMES, 3, createRng(1));
    expect(groups).toHaveLength(3);
    expect(groups.flat().sort()).toEqual([...NAMES].sort());
    const sizes = groups.map((g) => g.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it('never creates more groups than people', () => {
    expect(splitIntoGroups(['An', 'Bình'], 5)).toHaveLength(2);
    expect(groupCountForSize(7, 3)).toBe(3);
    expect(groupCountForSize(0, 3)).toBe(1);
  });

  it('shuffles without losing items', () => {
    expect(shuffleList(NAMES, createRng(9)).sort()).toEqual([...NAMES].sort());
  });
});

describe('parseNameList and formatClock', () => {
  it('splits by line or comma, trims and removes duplicates', () => {
    expect(parseNameList(' An \nBình,  Chi ;an\n\n Dũng  Nam ')).toEqual(['An', 'Bình', 'Chi', 'Dũng Nam']);
  });

  it('formats seconds as mm:ss rounding up', () => {
    expect(formatClock(300)).toBe('05:00');
    expect(formatClock(59.2)).toBe('01:00');
    expect(formatClock(-3)).toBe('00:00');
  });
});
