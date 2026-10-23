import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getAdminDb } from '../../api/firebaseAdmin';
import { createFirestorePracticeStore } from '../../api/practiceStore';
import type { PracticeAttempt, PracticeQuestion } from '../types/practice';

/**
 * Runs against the Firestore emulator only (`npm run test:emulator`).
 * The project id is demo-*, so nothing here can reach a real database.
 */
const PROJECT_ID = 'demo-lop-chung-minh';
const TEACHER = 'teacher@demo.test';
const now = '2026-10-23T00:00:00.000Z';

const validSet = {
  topicId: 'N01', title: 'Số tự nhiên trong phạm vi 100 000', schemaVersion: '1.0', questionCount: 1,
  status: 'draft', importedAt: now, importedBy: TEACHER, updatedAt: now,
};
const validQuestion = {
  datasetId: 'set-n01', topicId: 'N01', skillId: 'N01.compare', level: 'nhan_biet', type: 'single_choice',
  prompt: 'Số nào lớn nhất?', options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }],
  correctAnswers: ['B'], explanation: '2 > 1', status: 'draft', order: 1, updatedAt: now,
};

describe('firestore.rules – practice collections', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });
  afterAll(() => env.cleanup());
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc(`adminAllowlist/${TEACHER}`).set({ email: TEACHER, role: 'admin', addedBy: 'seed', createdAt: now });
      await db.doc('practiceSets/set-n01').set(validSet);
      await db.doc('practiceQuestions/M3-N01-001').set(validQuestion);
      await db.doc('practiceAttempts/a1').set({ studentId: 's1', status: 'submitted' });
      await db.doc('homework/h1').set({ title: 'BTVN' });
    });
  });

  const anon = () => env.unauthenticatedContext().firestore();
  const student = () => env.authenticatedContext('s1', { email: 'hocsinh@demo.test', email_verified: true }).firestore();
  const teacher = () => env.authenticatedContext('t1', { email: TEACHER, email_verified: true }).firestore();

  it('denies every read of answer keys to anonymous users and non-teachers', async () => {
    for (const db of [anon(), student()]) {
      await assertFails(db.doc('practiceQuestions/M3-N01-001').get());
      await assertFails(db.collection('practiceQuestions').get());
      await assertFails(db.doc('practiceSets/set-n01').get());
      await assertFails(db.collection('practiceAttempts').where('studentId', '==', 's1').get());
    }
  });

  it('denies writes to anonymous users and non-teachers', async () => {
    for (const db of [anon(), student()]) {
      await assertFails(db.doc('practiceQuestions/M3-N01-002').set(validQuestion));
      await assertFails(db.doc('practiceSets/set-n01').update({ status: 'published' }));
    }
  });

  it('lets teachers read, import, edit, approve and publish', async () => {
    const db = teacher();
    await assertSucceeds(db.collection('practiceQuestions').where('datasetId', '==', 'set-n01').get());
    await assertSucceeds(db.doc('practiceQuestions/M3-N01-002').set({ ...validQuestion, order: 2 }));
    await assertSucceeds(db.doc('practiceQuestions/M3-N01-001').update({ status: 'approved', prompt: 'Sửa' }));
    await assertSucceeds(db.doc('practiceSets/set-n01').update({ status: 'published', publishedAt: now }));
    await assertSucceeds(db.collection('practiceAttempts').get());
  });

  it('rejects malformed questions and sets even from teachers', async () => {
    const db = teacher();
    const { correctAnswers: _omit, ...noAnswer } = validQuestion;
    await assertFails(db.doc('practiceQuestions/q-x').set(noAnswer));
    await assertFails(db.doc('practiceQuestions/q-x').set({ ...validQuestion, level: 'kho' }));
    await assertFails(db.doc('practiceQuestions/q-x').set({ ...validQuestion, options: [{ id: 'A', text: '1' }] }));
    await assertFails(db.doc('practiceQuestions/q-x').set({ ...validQuestion, secret: true }));
    await assertFails(db.doc('practiceQuestions/M3-N01-001').update({ topicId: 'N02' }));
    await assertFails(db.doc('practiceSets/set-x').set({ ...validSet, status: 'live' }));
  });

  it('never deletes practice data and keeps attempts server-only', async () => {
    const db = teacher();
    await assertFails(db.doc('practiceQuestions/M3-N01-001').delete());
    await assertFails(db.doc('practiceSets/set-n01').delete());
    await assertFails(db.doc('practiceAttempts/a2').set({ studentId: 's1' }));
    await assertFails(db.doc('practiceAttempts/a1').update({ score: 10 }));
  });

  it('leaves existing collections unchanged (homework still teacher-only)', async () => {
    await assertFails(anon().doc('homework/h1').get());
    await assertSucceeds(teacher().doc('homework/h1').get());
  });
});

describe('Firestore practice store (Admin SDK, emulator)', () => {
  const db = getAdminDb()!;
  const store = createFirestorePracticeStore(db);
  const question = (id: string, status: 'draft' | 'approved', level = 'nhan_biet'): Omit<PracticeQuestion, 'id'> => ({
    ...(validQuestion as Omit<PracticeQuestion, 'id'>),
    datasetId: 'store-set',
    status,
    level: level as PracticeQuestion['level'],
  });

  beforeAll(async () => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    const batch = db.batch();
    batch.set(db.doc('practiceSets/store-set'), { ...validSet, status: 'draft' });
    batch.set(db.doc('practiceQuestions/store-q1'), question('store-q1', 'approved'));
    batch.set(db.doc('practiceQuestions/store-q2'), question('store-q2', 'draft'));
    batch.set(db.doc('practiceQuestions/store-q3'), question('store-q3', 'approved', 'thu_thach'));
    await batch.commit();
  });

  it('serves nothing until the set is published, then only approved questions', async () => {
    expect(await store.listServableQuestions('N01')).toEqual([]);
    await db.doc('practiceSets/store-set').update({ status: 'published' });
    const ids = (await store.listServableQuestions('N01')).map((q) => q.id).sort();
    expect(ids).toEqual(['store-q1', 'store-q3']);
    expect((await store.listAllServableQuestions()).length).toBe(2);
  });

  it('completes an attempt exactly once and lists history newest first', async () => {
    const base: PracticeAttempt = {
      id: 'att-1', studentId: 'stu-1', topicId: 'N01', skillId: null, level: 'nhan_biet',
      questionIds: ['store-q1'], optionOrder: { 'store-q1': ['B', 'A'] }, status: 'in_progress',
      total: 1, startedAt: '2026-10-23T01:00:00.000Z',
    };
    await store.createAttempt(base);
    await store.createAttempt({ ...base, id: 'att-2', startedAt: '2026-10-23T02:00:00.000Z' });
    await expect(store.createAttempt(base)).rejects.toThrow(); // ids are never overwritten

    expect(await store.completeAttempt('att-1', { status: 'submitted', score: 1 })).toBe(true);
    expect(await store.completeAttempt('att-1', { status: 'submitted', score: 0 })).toBe(false);
    expect((await store.getAttempt('att-1'))?.score).toBe(1);

    const history = await store.listAttempts('stu-1', 10);
    expect(history.map((a) => a.id)).toEqual(['att-2', 'att-1']);
    expect(await store.getQuestions(['store-q1', 'missing'])).toHaveLength(1);
  });
});
