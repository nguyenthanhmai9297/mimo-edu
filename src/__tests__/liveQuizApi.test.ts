import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createLiveQuizRouter } from '../../api/liveQuiz';
import { createMemoryLiveQuizStore } from '../../api/liveQuizStore';
import { createRichTextFromPlain } from '../utils/gradingEngine';

const rt = createRichTextFromPlain;
const questions = [
  { prompt: rt('2 + 3 = ?'), options: [rt('4'), rt('5'), rt('6'), rt('7')], correct: [1], multi: false },
  { prompt: rt('Số chẵn?'), options: [rt('2'), rt('3'), rt('4'), rt('5')], correct: [0, 2], multi: true },
];

// Test doubles: identities come from headers instead of Firebase ID tokens / HMAC student tokens
const fakeTeacher = (req: Request, res: Response, next: NextFunction) => {
  const email = req.header('x-test-teacher');
  if (!email) return void res.status(401).json({ error: 'teacher only' });
  (req as Request & { teacherEmail?: string }).teacherEmail = email;
  next();
};
const fakeStudent = (req: Request, res: Response, next: NextFunction) => {
  const id = req.header('x-test-student');
  if (!id) return void res.status(401).json({ error: 'student only' });
  (req as Request & { studentSession?: { studentId: string } }).studentSession = { studentId: id };
  next();
};

let clock = 1_000_000;
const store = createMemoryLiveQuizStore();
let enabled = true;

function start(): Promise<{ url: string; server: Server }> {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/live-quiz',
    createLiveQuizRouter({
      getStore: () => store,
      enabled: () => enabled,
      requireTeacher: fakeTeacher,
      requireStudentAuth: fakeStudent,
      getStudentName: async (id) => `HS ${id}`,
      now: () => clock,
    })
  );
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/live-quiz`, server }));
  });
}

describe('Mimo Quiz – live API (học sinh tham gia)', () => {
  let url = '';
  let server: Server;
  let sessionId = '';
  let code = '';
  const call = async (path: string, who: { teacher?: string; student?: string }, body?: unknown) => {
    const res = await fetch(url + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        ...(who.teacher ? { 'x-test-teacher': who.teacher } : {}),
        ...(who.student ? { 'x-test-student': who.student } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const T = { teacher: 'gv@demo.test' };

  beforeAll(async () => ({ url, server } = await start()));
  afterAll(() => server.close());

  it('is switched off unless enabled (production stays untouched)', async () => {
    enabled = false;
    expect((await call('/sessions', T, { questions })).status).toBe(503);
    enabled = true;
  });

  it('only teachers create sessions; input is validated', async () => {
    expect((await call('/sessions', { student: 's1' }, { questions })).status).toBe(401);
    expect((await call('/sessions', T, { questions: [] })).status).toBe(400);
    expect((await call('/sessions', T, { questions: [{ ...questions[0], correct: [9] }] })).status).toBe(400);
    const r = await call('/sessions', T, { questions, perQuestionSec: 20, title: 'Ôn tập' });
    expect(r.status).toBe(201);
    expect(r.body.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(r.body.status).toBe('lobby');
    ({ sessionId, code } = r.body);
  });

  it('another teacher cannot see or control the session', async () => {
    expect((await call(`/sessions/${sessionId}`, { teacher: 'other@demo.test' })).status).toBe(404);
    expect((await call(`/sessions/${sessionId}/open`, { teacher: 'other@demo.test' }, { index: 0 })).status).toBe(404);
  });

  it('students join with the code; wrong codes are rejected', async () => {
    expect((await call('/join', { student: 's1' }, { code: 'ZZZZZZ' })).status).toBe(404);
    expect((await call('/join', { student: 's1' }, { code: code.toLowerCase() })).body.sessionId).toBe(sessionId);
    expect((await call('/join', { student: 's2' }, { code })).status).toBe(200);
    expect((await call(`/play/${sessionId}`, { student: 's3' })).status).toBe(404); // not joined
    const host = await call(`/sessions/${sessionId}`, T);
    expect(host.body.players.map((p: { name: string }) => p.name)).toEqual(['HS s1', 'HS s2']);
  });

  it('never sends the answer key while a question is open', async () => {
    await call(`/sessions/${sessionId}/open`, T, { index: 0 });
    const view = await call(`/play/${sessionId}`, { student: 's1' });
    expect(view.body.status).toBe('question');
    expect(view.body.correct).toBeNull();
    expect(JSON.stringify(view.body)).not.toContain('"correct":[');
    expect(view.body.question.options).toHaveLength(4);
    expect(view.body.questionEndsAt).toBe(clock + 20_000);
  });

  it('accepts one answer per student, without revealing correctness', async () => {
    const first = await call(`/play/${sessionId}/answer`, { student: 's1' }, { index: 0, chosen: [1] });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ ok: true });
    expect((await call(`/play/${sessionId}/answer`, { student: 's1' }, { index: 0, chosen: [2] })).status).toBe(409);
    expect((await call(`/play/${sessionId}/answer`, { student: 's2' }, { index: 0, chosen: [0, 1] })).status).toBe(400); // single answer
    expect((await call(`/play/${sessionId}/answer`, { student: 's2' }, { index: 1, chosen: [0] })).status).toBe(409); // not open yet
    const mid = await call(`/play/${sessionId}`, { student: 's1' });
    expect(mid.body.myAnswer).toEqual([1]);
    expect(mid.body.myScore).toBe(0); // score hidden until the question closes
    expect((await call(`/sessions/${sessionId}`, T)).body.answeredCount).toBe(1);
  });

  it('enforces time on the server and closes the question by itself', async () => {
    clock += 20_000 + 1_600;
    expect((await call(`/play/${sessionId}/answer`, { student: 's2' }, { index: 0, chosen: [0] })).status).toBe(409);
    const host = await call(`/sessions/${sessionId}`, T);
    expect(host.body.status).toBe('closed');
    expect(host.body.optionCounts).toEqual([0, 1, 0, 0]);
    expect(host.body.correctCount).toBe(1);
    const view = await call(`/play/${sessionId}`, { student: 's1' });
    expect(view.body).toMatchObject({ correct: [1], myResult: true, myScore: 1 });
  });

  it('multi-answer questions need exactly the right set; the teacher can close early', async () => {
    expect((await call(`/sessions/${sessionId}/open`, T, { index: 0 })).status).toBe(409); // cannot reopen
    await call(`/sessions/${sessionId}/open`, T, { index: 1 });
    await call(`/play/${sessionId}/answer`, { student: 's1' }, { index: 1, chosen: [0] });
    await call(`/play/${sessionId}/answer`, { student: 's2' }, { index: 1, chosen: [2, 0] });
    const closed = await call(`/sessions/${sessionId}/close`, T, {});
    expect(closed.body.correctCount).toBe(1);
    expect((await call(`/play/${sessionId}`, { student: 's2' })).body).toMatchObject({ myResult: true, myScore: 1 });
  });

  it('ending shows the scoreboard and stops new joins', async () => {
    const end = await call(`/sessions/${sessionId}/end`, T, {});
    expect(end.body.status).toBe('ended');
    expect(end.body.players.map((p: { score: number }) => p.score)).toEqual([1, 1]);
    expect(end.body.questionStats).toEqual([{ answered: 1, correct: 1 }, { answered: 2, correct: 1 }]);
    expect((await call('/join', { student: 's9' }, { code })).status).toBe(404);
    const view = await call(`/play/${sessionId}`, { student: 's1' });
    expect(view.body).toMatchObject({ status: 'ended', question: null, correct: null, myScore: 1 });
  });
});
