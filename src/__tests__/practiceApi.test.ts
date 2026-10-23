import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createPracticeRouter } from '../../api/practice';
import { createMemoryPracticeStore, PracticeStore } from '../../api/practiceStore';
import type { PracticeQuestion, PracticeSet } from '../types/practice';
import { createRng, validatePracticeImport } from '../utils/practiceEngine';

const N01 = JSON.parse(fs.readFileSync('question-bank/MimoEDU_Toan3_ChuyenDe01_40cau.json', 'utf8'));
const now = '2026-10-23T00:00:00.000Z';
const questions: PracticeQuestion[] = validatePracticeImport(N01).questions.map((q) => ({
  ...q,
  status: q.level === 'van_dung' ? 'draft' : 'approved', // one level left unreviewed
  updatedAt: now,
}));
const publishedSet: PracticeSet = {
  id: 'mimoedu-toan3-n01-v2', topicId: 'N01', title: 'N01', schemaVersion: '1.0', questionCount: 40,
  status: 'published', importedAt: now, importedBy: 'teacher', updatedAt: now,
};

// Test double for the HMAC student session: the student id comes from a header
const fakeStudentAuth = (req: Request, res: Response, next: NextFunction) => {
  const id = req.header('x-test-student');
  if (!id) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  (req as Request & { studentSession?: { studentId: string } }).studentSession = { studentId: id };
  next();
};

function startServer(store: PracticeStore | null): Promise<{ url: string; server: Server }> {
  const app = express();
  app.use(express.json());
  app.use('/api/practice', createPracticeRouter({ getStore: () => store, requireStudentAuth: fakeStudentAuth, rng: createRng(9) }));
  return new Promise((resolve) => {
    const server = app.listen(0, () =>
      resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/practice`, server })
    );
  });
}

describe('practice API', () => {
  const store = createMemoryPracticeStore({ sets: [publishedSet], questions });
  let url = '';
  let server: Server;
  const call = (path: string, student: string | null, body?: unknown) =>
    fetch(url + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', ...(student ? { 'x-test-student': student } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });

  beforeAll(async () => ({ url, server } = await startServer(store)));
  afterAll(() => server.close());

  it('requires a student session', async () => {
    expect((await call('/catalog', null)).status).toBe(401);
    expect((await call('/start', null, { topicId: 'N01', level: 'nhan_biet' })).status).toBe(401);
  });

  it('reports availability of approved, published questions only', async () => {
    const body = await (await call('/catalog', 's1')).json();
    expect(body.topics.N01.levels).toEqual({ nhan_biet: 10, thong_hieu: 10, van_dung: 0, thu_thach: 10 });
    expect(body.topics.N02).toBeUndefined();
  });

  it('validates the request', async () => {
    expect((await call('/start', 's1', { topicId: 'N99', level: 'nhan_biet' })).status).toBe(400);
    expect((await call('/start', 's1', { topicId: 'N01', level: 'kho' })).status).toBe(400);
    expect((await call('/start', 's1', { topicId: 'N01', level: 'nhan_biet', skillId: 'N02.x' })).status).toBe(400);
    expect((await call('/start', 's1', { topicId: 'N01', level: 'van_dung' })).status).toBe(404); // not approved
    expect((await call('/start', 's1', { topicId: 'N05', level: 'nhan_biet' })).status).toBe(404); // no data yet
  });

  it('never returns answers before submission, then grades and reveals them', async () => {
    const startRes = await call('/start', 's1', { topicId: 'N01', level: 'thu_thach' });
    const startText = await startRes.text();
    const start = JSON.parse(startText);
    expect(start.questions).toHaveLength(10);
    for (const q of questions) expect(startText).not.toContain(q.explanation);
    expect(startText).not.toMatch(/correct|explanation|optionOrder/);

    // Resuming the attempt does not leak either
    const resumeText = await (await call(`/attempts/${start.attemptId}`, 's1')).text();
    expect(resumeText).not.toMatch(/correct|explanation|optionOrder/);

    // Answer using the stored order (test-only knowledge of the server state)
    const attempt = store.attempts.get(start.attemptId)!;
    const answers: Record<string, number[]> = {};
    attempt.questionIds.forEach((qid, i) => {
      const q = questions.find((x) => x.id === qid)!;
      const pos = attempt.optionOrder[qid].indexOf(q.correctAnswers[0]);
      answers[qid] = [i < 7 ? pos : (pos + 1) % 4];
    });
    const result = await (await call('/submit', 's1', { attemptId: start.attemptId, answers })).json();
    expect(result.score).toBe(7);
    expect(result.total).toBe(10);
    expect(result.results[0].explanation).toBeTruthy();
    expect(result.results[9].correct).toBe(false);

    // Resubmitting cannot change the stored result
    const again = await (await call('/submit', 's1', { attemptId: start.attemptId, answers: {} })).json();
    expect(again.score).toBe(7);

    const history = await (await call('/attempts', 's1')).json();
    expect(history[0]).toMatchObject({ id: start.attemptId, status: 'submitted', score: 7, total: 10 });
  });

  it("hides other students' attempts", async () => {
    const start = await (await call('/start', 's1', { topicId: 'N01', level: 'nhan_biet' })).json();
    expect((await call('/submit', 's2', { attemptId: start.attemptId, answers: {} })).status).toBe(404);
    expect((await call(`/attempts/${start.attemptId}`, 's2')).status).toBe(404);
    expect(await (await call('/attempts', 's2')).json()).toEqual([]);
  });
});

describe('practice API without Admin credentials', () => {
  it('answers 503 instead of failing', async () => {
    const { url, server } = await startServer(null);
    const res = await fetch(`${url}/catalog`, { headers: { 'x-test-student': 's1' } });
    expect(res.status).toBe(503);
    server.close();
  });
});
