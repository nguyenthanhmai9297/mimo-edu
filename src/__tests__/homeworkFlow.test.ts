import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearLocalDraft,
  gameReadiness,
  homeworkPath,
  listLocalDraftKeys,
  parseHomeworkPath,
  readLocalDraft,
  writeLocalDraft,
} from '../features/homework/homeworkFlow';
import { createRichTextFromPlain } from '../utils/gradingEngine';
import type { HomeworkQuestion } from '../types/domain';

const text = createRichTextFromPlain;
const choice = (id: string, withKey = true): HomeworkQuestion => ({
  id,
  order: 1,
  type: 'single_choice',
  prompt: text('1 + 1 = ?'),
  points: 1,
  options: [
    { id: `${id}a`, label: 'A', content: text('2') },
    { id: `${id}b`, label: 'B', content: text('3') },
  ],
  ...(withKey ? { correctOptionId: `${id}a` } : {}),
});

describe('Soạn bài tập – đường dẫn Word / Game', () => {
  it('tạo và đọc đường dẫn', () => {
    expect(homeworkPath()).toBe('/admin/homework');
    expect(homeworkPath('word')).toBe('/admin/homework/word');
    expect(homeworkPath('game', 'new')).toBe('/admin/homework/game/new');
    expect(parseHomeworkPath('word/hw_1_abc')).toEqual({ format: 'word', target: 'hw_1_abc' });
    expect(parseHomeworkPath('game')).toEqual({ format: 'game', target: null });
    expect(parseHomeworkPath('')).toEqual({ format: null, target: null });
    expect(parseHomeworkPath('pdf/hw_1')).toEqual({ format: null, target: null });
  });

  it('đếm câu chơi được trong trò chơi', () => {
    const essay: HomeworkQuestion = { id: 'e', order: 2, type: 'essay', prompt: text('Giải bài toán'), points: 2 };
    expect(gameReadiness([choice('q1'), choice('q2', false), essay])).toEqual({ playable: 1, gameQuestions: 1, notPlayable: 2 });
  });
});

describe('Soạn bài tập – giữ tạm phần chưa lưu trên máy', () => {
  // Like the browser's localStorage: stored entries are its own keys, methods are not
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    const methods = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => void (store[k] = v),
      removeItem: (k: string) => void delete store[k],
    };
    for (const [name, fn] of Object.entries(methods)) Object.defineProperty(store, name, { value: fn, enumerable: false });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: store });
  });

  it('ghi, đọc lại và xóa bản tạm', () => {
    const draft = {
      title: 'Phiếu tuần 8',
      description: '',
      grade: 'Khối 3',
      answerSource: 'teacher' as const,
      aiSolverEnabled: false,
      questions: [choice('q1')],
      missingQuestionsWarning: null,
      savedAt: '2026-10-26T08:00:00.000Z',
    };
    expect(writeLocalDraft('co.lan@truong.vn', 'new', draft)).toBe(true);
    expect(readLocalDraft('co.lan@truong.vn', 'new')).toEqual(draft);
    expect(listLocalDraftKeys('co.lan@truong.vn')).toEqual(['new']);
    // Another teacher on the same computer never sees it
    expect(readLocalDraft('thay.minh@truong.vn', 'new')).toBeNull();
    expect(listLocalDraftKeys('thay.minh@truong.vn')).toEqual([]);
    clearLocalDraft('co.lan@truong.vn', 'new');
    expect(readLocalDraft('co.lan@truong.vn', 'new')).toBeNull();
  });

  it('bỏ qua dữ liệu hỏng và báo khi máy không cho lưu', () => {
    store['mimoedu.homeworkDraft.co.lan@truong.vn/hw_x'] = '{hỏng';
    expect(readLocalDraft('co.lan@truong.vn', 'hw_x')).toBeNull();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      },
    });
    expect(writeLocalDraft('co.lan@truong.vn', 'new', { title: '', description: '', grade: '', answerSource: 'teacher', aiSolverEnabled: false, questions: [], missingQuestionsWarning: null, savedAt: '' })).toBe(false);
    expect(listLocalDraftKeys('co.lan@truong.vn')).toEqual([]);
  });
});
