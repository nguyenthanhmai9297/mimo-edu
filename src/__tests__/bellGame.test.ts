import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createBellGameRouter } from '../../api/bellGame';
import { createMemoryBellStore } from '../../api/bellGameStore';
import { createRichTextFromPlain } from '../utils/gradingEngine';
import { checkAnswer, rescue, validateBellQuestions, winners, type BellHostView, type BellPlayView } from '../features/games/bell/bellEngine';

const rt = createRichTextFromPlain;
const QUESTIONS = [
  { prompt: rt('2 + 3 = ?'), kind: 'choice', options: [rt('4'), rt('5'), rt('6')], correct: [1] },
  { prompt: rt('Viết số: một nghìn'), kind: 'short', answers: ['1000'] },
  { prompt: rt('Số chẵn?'), kind: 'choice', options: [rt('2'), rt('3'), rt('4')], correct: [0, 2] },
  { prompt: rt('10 - 4 = ?'), kind: 'short', answers: ['6'] },
];

describe('Rung chuông vàng – luật chơi', () => {
  it('chấm trắc nghiệm, nhiều đáp án và trả lời ngắn', () => {
    const qs = validateBellQuestions(QUESTIONS);
    if (typeof qs === 'string') throw new Error(qs);
    expect(checkAnswer(qs[0], '1')).toBe(true);
    expect(checkAnswer(qs[0], '0')).toBe(false);
    expect(checkAnswer(qs[1], '1 000')).toBe(true);
    expect(checkAnswer(qs[2], '2,0')).toBe(true);
    expect(checkAnswer(qs[2], '0')).toBe(false);
  });

  it('câu không có đáp án đã duyệt thì không được nhận', () => {
    expect(validateBellQuestions([{ prompt: rt('?'), kind: 'short', answers: [] }])).toMatch(/thiếu đáp án/);
    expect(validateBellQuestions([{ prompt: rt('?'), kind: 'choice', options: [rt('a'), rt('b')], correct: [] }])).toMatch(/thiếu đáp án/);
  });
});

const fakeTeacher = (req: Request, res: Response, next: NextFunction) => {
  const email = req.header('x-test-teacher');
  if (!email) return void res.status(401).json({ error: 'teacher only' });
  (req as Request & { teacherEmail?: string }).teacherEmail = email;
  next();
};

let clock = 5_000_000;
let url = '';
let server: Server;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/bell',
    createBellGameRouter({
      getStore: (() => {
        const s = createMemoryBellStore();
        return () => s;
      })(),
      requireTeacher: fakeTeacher,
      sign: (d) => crypto.createHmac('sha256', 'test').update(d).digest('base64url'),
      now: () => clock,
    })
  );
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/bell`;
});
afterAll(() => server.close());

const call = async <T,>(path: string, opts: { teacher?: string; token?: string; body?: unknown } = {}) => {
  const res = await fetch(url + path, {
    method: opts.body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.teacher ? { 'x-test-teacher': opts.teacher } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, data: (await res.json()) as T & { error?: string } };
};
const T = 'co@truong.vn';

describe('Rung chuông vàng – Online (điện thoại học sinh)', () => {
  let id = '';
  let code = '';
  const tok: Record<string, string> = {};
  const play = async (name: string) => (await call<BellPlayView>('/play', { token: tok[name] })).data;
  const host = async () => (await call<BellHostView>(`/games/${id}`, { teacher: T })).data;
  const act = (a: string, body: unknown = {}) => call<BellHostView>(`/games/${id}/${a}`, { teacher: T, body });

  it('giáo viên tạo phòng mã 6 số; 3 học sinh vào không cần tài khoản', async () => {
    const r = await call<BellHostView>('/games', { teacher: T, body: { title: 'Ôn tập', mode: 'online', perQuestionSec: 20, questions: QUESTIONS } });
    expect(r.status).toBe(201);
    id = r.data.id;
    code = r.data.code;
    expect(code).toMatch(/^\d{6}$/);
    expect((r.data as unknown as { questions: unknown[] }).questions).toHaveLength(4);
    for (const name of ['An', 'Bình', 'Chi']) {
      const j = await call<{ token: string }>('/join', { body: { code, name } });
      expect(j.status).toBe(201);
      tok[name] = j.data.token;
    }
    expect((await call('/join', { body: { code: '000000', name: 'X' } })).status).toBe(404);
    const h = await host();
    expect(h.players.map((p) => [p.seat, p.name, p.alive])).toEqual([[1, 'An', true], [2, 'Bình', true], [3, 'Chi', true]]);
    expect((await call('/play', { token: tok.An.replace(/.$/, 'x') })).status).toBe(401);
  });

  it('câu 1: không lộ đáp án; An đúng, Bình sai, Chi hết giờ → Bình, Chi bị loại', async () => {
    await act('start');
    const v = await play('An');
    expect(v.question?.options).toHaveLength(3);
    expect(JSON.stringify(v)).not.toContain('correct":[');
    expect((await call('/play/answer', { token: tok.An, body: { index: 0, chosen: [1] } })).status).toBe(201);
    expect((await call('/play/answer', { token: tok.An, body: { index: 0, chosen: [0] } })).status).toBe(409);
    expect((await call('/play/answer', { token: tok['Bình'], body: { index: 0, chosen: [2] } })).status).toBe(201);
    expect((await host()).answeredIds).toHaveLength(2);
    clock += 25_000; // time is up: the next poll closes the question
    const h = await host();
    expect(h.status).toBe('reveal');
    expect(h.players.map((p) => [p.name, p.alive, p.outAt, p.score])).toEqual([['An', true, null, 10], ['Bình', false, 0, 0], ['Chi', false, 0, 0]]);
    const b = await play('Bình');
    expect(b.result).toEqual({ ok: false, rightAnswer: 'B' });
    expect(b.me?.alive).toBe(false);
  });

  it('người bị loại không trả lời được; tạm dừng thì không ai trả lời được', async () => {
    await act('start');
    expect((await play('Bình')).question).toBeNull();
    expect((await call('/play/answer', { token: tok['Bình'], body: { index: 1, text: '1000' } })).status).toBe(409);
    await act('pause');
    expect((await call('/play/answer', { token: tok.An, body: { index: 1, text: '1000' } })).status).toBe(409);
    clock += 60_000; // paused: the clock does not run
    expect((await host()).status).toBe('paused');
    await act('resume');
    expect((await call('/play/answer', { token: tok.An, body: { index: 1, text: '1 000' } })).status).toBe(201);
    const h = (await act('close')).data;
    expect(h.players.find((p) => p.name === 'An')?.correct).toBe(2);
  });

  it('cứu trợ: đưa một nhóm trở lại sân; tối đa 2 lượt', async () => {
    const ids = (await host()).players.filter((p) => !p.alive).map((p) => p.id);
    const r = await act('rescue', { playerIds: [ids[0]] });
    expect(r.data.rescuesUsed).toBe(1);
    expect(r.data.players.filter((p) => p.alive).map((p) => p.name)).toEqual(['An', 'Bình']);
    expect(r.data.players.find((p) => p.name === 'Bình')?.rescued).toBe(1);
    await act('rescue', { playerIds: [ids[1]] });
    const third = await act('rescue', { playerIds: ids });
    expect(third.status).toBe(409);
    expect(third.data.error).toMatch(/hết 2 lượt/);
  });

  it('giáo viên loại / khôi phục từng bạn; kết thúc công bố người thắng và lưu kết quả', async () => {
    await act('start'); // câu 3: An sai, Bình đúng, Chi không trả lời
    await call('/play/answer', { token: tok.An, body: { index: 2, chosen: [0] } });
    await call('/play/answer', { token: tok['Bình'], body: { index: 2, chosen: [2, 0] } });
    const h = (await act('close')).data;
    expect(h.players.map((p) => [p.name, p.alive])).toEqual([['An', false], ['Bình', true], ['Chi', false]]);
    const an = h.players.find((p) => p.name === 'An')!;
    expect(an.outAt).toBe(2);
    expect(an.history.map((t) => [t.q, t.answer, t.ok])).toEqual([[0, '1', true], [1, '1 000', true], [2, '0', false]]);
    const back = (await act('field', { playerId: an.id, onField: true })).data;
    expect(back.players.find((p) => p.name === 'An')?.alive).toBe(true);
    await act('field', { playerId: an.id, onField: false });
    const ended = (await act('end')).data;
    expect(ended.status).toBe('ended');
    expect((await play('Chi')).winners).toEqual(['2. Bình']);
    const list = (await call<{ id: string; winners: string[]; status: string }[]>('/games', { teacher: T })).data;
    expect(list[0]).toMatchObject({ id, status: 'ended', winners: ['2. Bình'] });
    expect((await call('/join', { body: { code, name: 'Muộn' } })).status).toBe(404);
  });

  it('giáo viên khác không xem được trận này', async () => {
    expect((await call(`/games/${id}`, { teacher: 'khac@truong.vn' })).status).toBe(404);
  });
});

describe('Rung chuông vàng – danh sách lớp', () => {
  it('Offline: giữ số thứ tự trong lớp, tên trùng vẫn là hai bạn', async () => {
    const players = [{ seat: 1, name: 'Nguyễn An' }, { seat: 3, name: 'Lê Chi' }, { seat: 4, name: 'Nguyễn An' }];
    const r = await call<BellHostView>('/games', { teacher: T, body: { title: 'Lớp', mode: 'offline', perQuestionSec: 15, questions: QUESTIONS, players } });
    expect(r.status).toBe(201);
    expect(r.data.players.map((p) => [p.seat, p.name])).toEqual([[1, 'Nguyễn An'], [3, 'Lê Chi'], [4, 'Nguyễn An']]);
    const dup = await call('/games', { teacher: T, body: { title: 'Lớp', mode: 'offline', perQuestionSec: 15, questions: QUESTIONS, players: [{ seat: 2, name: 'A' }, { seat: 2, name: 'B' }] } });
    expect(dup.status).toBe(400);
  });

  it('Online: học sinh chọn đúng tên mình; mỗi tên chỉ vào một lần; phòng không có danh sách vẫn gõ tên', async () => {
    const roster = [{ seat: 1, name: 'Nguyễn An' }, { seat: 2, name: 'Trần Bình' }];
    const r = await call<BellHostView>('/games', { teacher: T, body: { title: 'Lớp', mode: 'online', perQuestionSec: 15, questions: QUESTIONS, roster } });
    expect(r.status).toBe(201);
    expect(r.data.players).toEqual([]);
    const code = r.data.code;
    const list = (await call<{ roster: { seat: number; name: string; taken: boolean }[] }>(`/roster?code=${code}`)).data.roster;
    expect(list).toEqual([{ seat: 1, name: 'Nguyễn An', taken: false }, { seat: 2, name: 'Trần Bình', taken: false }]);
    expect((await call('/join', { body: { code, name: 'Ai đó' } })).status).toBe(409);
    expect((await call('/join', { body: { code, seat: 2, name: 'Tên khác' } })).status).toBe(201);
    const again = await call('/join', { body: { code, seat: 2 } });
    expect(again.status).toBe(409);
    expect(again.data.error).toContain('đã vào phòng');
    expect((await call<{ roster: { taken: boolean }[] }>(`/roster?code=${code}`)).data.roster.map((e) => e.taken)).toEqual([false, true]);
    const h = (await call<BellHostView>(`/games/${r.data.id}`, { teacher: T })).data;
    expect(h.players.map((p) => [p.seat, p.name])).toEqual([[2, 'Trần Bình']]);
    expect((await call('/roster?code=000000')).status).toBe(404);
    const open = await call<BellHostView>('/games', { teacher: T, body: { title: 'Tự do', mode: 'online', perQuestionSec: 15, questions: QUESTIONS } });
    expect((await call<{ roster: null }>(`/roster?code=${open.data.code}`)).data.roster).toBeNull();
  });
});

describe('Rung chuông vàng – Offline (bảng con)', () => {
  it('giáo viên chấm từng ô; thiếu ô chưa chấm thì không chốt', async () => {
    const r = await call<BellHostView>('/games', { teacher: T, body: { title: 'Bảng con', mode: 'offline', perQuestionSec: 15, questions: QUESTIONS, players: ['An', 'Bình', 'Chi'] } });
    expect(r.status).toBe(201);
    const id = r.data.id;
    const [a, b, c] = r.data.players.map((p) => p.id);
    expect((await call('/join', { body: { code: r.data.code, name: 'X' } })).status).toBe(404);
    await call(`/games/${id}/start`, { teacher: T, body: {} });
    const judging = (await call<BellHostView>(`/games/${id}/close`, { teacher: T, body: {} })).data;
    expect(judging.status).toBe('judging');
    const partial = await call(`/games/${id}/judge`, { teacher: T, body: { marks: { [a]: true } } });
    expect(partial.status).toBe(409);
    const done = (await call<BellHostView>(`/games/${id}/judge`, { teacher: T, body: { marks: { [a]: true, [b]: false, [c]: true } } })).data;
    expect(done.status).toBe('reveal');
    expect(done.players.map((p) => p.alive)).toEqual([true, false, true]);
  });

  it('không ai còn trên sân thì người thắng là điểm cao nhất', () => {
    const g = { players: [{ alive: false, score: 20, seat: 1 }, { alive: false, score: 30, seat: 2 }] } as never;
    expect(winners(g).map((p: { seat: number }) => p.seat)).toEqual([2]);
    expect(typeof rescue({ status: 'question' } as never, [])).toBe('string');
  });
});
