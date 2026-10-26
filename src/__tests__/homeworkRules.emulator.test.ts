import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import fs from 'fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

/**
 * Who may read and write Soạn bài tập data (homework holds the answer keys).
 * Runs against the Firestore emulator only (`npm run test:emulator`).
 */
const PROJECT_ID = 'demo-lop-chung-minh';
const TEACHER = 'teacher@demo.test';
const OWNER = 'nguyenthanhmai9297@gmail.com';
const now = '2026-10-26T00:00:00.000Z';

const homework = (extra: Record<string, unknown> = {}) => ({
  title: 'Phiếu BTVN tuần 8',
  subject: 'Toán',
  grade: 'Khối 3',
  questions: [
    {
      id: 'q1', order: 1, type: 'single_choice', points: 10,
      prompt: { version: 1, blocks: [{ type: 'math', inline: false, latex: '\\frac{3}{4}' }] },
      options: [{ id: 'a', label: 'A', content: { version: 1, blocks: [{ type: 'paragraph', text: '3' }] } }],
      correctOptionId: 'a',
    },
  ],
  answerSource: 'teacher',
  aiSolverEnabled: false,
  totalPoints: 10,
  status: 'draft',
  createdAt: now,
  updatedAt: now,
  ...extra,
});

describe('firestore.rules – Soạn bài tập (homework)', () => {
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
      await db.doc('homework/hw_draft').set(homework());
      await db.doc('homework/hw_published').set(homework({ status: 'published' }));
    });
  });

  const teacher = () => env.authenticatedContext('teacher', { email: TEACHER, email_verified: true }).firestore();
  const owner = () => env.authenticatedContext('owner', { email: OWNER, email_verified: true }).firestore();
  // Students sign in with a 6-character code, never with Firebase Auth
  const student = () => env.unauthenticatedContext().firestore();
  const stranger = () => env.authenticatedContext('g', { email: 'la@gmail.com', email_verified: true }).firestore();
  const unverifiedTeacher = () => env.authenticatedContext('t2', { email: TEACHER, email_verified: false }).firestore();

  it('học sinh, tài khoản lạ và email chưa xác minh không đọc được đề (đề chứa đáp án)', async () => {
    for (const db of [student(), stranger(), unverifiedTeacher()]) {
      await assertFails(getDoc(doc(db, 'homework/hw_draft')));
      await assertFails(getDocs(collection(db, 'homework')));
    }
  });

  it('học sinh, tài khoản lạ và email chưa xác minh không tạo, sửa, xóa được đề', async () => {
    for (const db of [student(), stranger(), unverifiedTeacher()]) {
      await assertFails(setDoc(doc(db, 'homework/hw_new'), homework()));
      await assertFails(setDoc(doc(db, 'homework/hw_draft'), homework({ title: 'Sửa trộm' })));
      await assertFails(deleteDoc(doc(db, 'homework/hw_draft')));
    }
  });

  it('giáo viên được cấp quyền và chủ hệ thống: lưu nháp, mở lại, lưu tiếp, xuất bản', async () => {
    for (const db of [teacher(), owner()]) {
      await assertSucceeds(setDoc(doc(db, 'homework/hw_new'), homework()));
      await assertSucceeds(getDoc(doc(db, 'homework/hw_new')));
      await assertSucceeds(getDocs(collection(db, 'homework')));
      await assertSucceeds(setDoc(doc(db, 'homework/hw_new'), homework({ title: 'Đã sửa', updatedAt: '2026-10-26T01:00:00.000Z' })));
      await assertSucceeds(setDoc(doc(db, 'homework/hw_new'), homework({ status: 'published' })));
      await assertSucceeds(deleteDoc(doc(db, 'homework/hw_draft')));
      await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('homework/hw_draft').set(homework()));
    }
  });

  it('không xóa được đề đã xuất bản, không đổi ngày tạo, không thêm trường lạ', async () => {
    const db = teacher();
    await assertFails(deleteDoc(doc(db, 'homework/hw_published')));
    await assertFails(setDoc(doc(db, 'homework/hw_draft'), homework({ createdAt: '2020-01-01T00:00:00.000Z' })));
    await assertFails(setDoc(doc(db, 'homework/hw_x'), homework({ isPublic: true })));
    await assertFails(setDoc(doc(db, 'homework/hw_x'), homework({ status: 'shared' })));
    await assertFails(setDoc(doc(db, 'homework/hw_x'), homework({ title: '' })));
    await assertFails(setDoc(doc(db, 'homework/bad id!'), homework()));
  });
});
