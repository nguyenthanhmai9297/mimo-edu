import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

/**
 * Teacher accounts: any verified Google account is a teacher and sees only
 * what they made; the owner/allowlist admins keep everything (including the
 * data from before teacher accounts, which has no ownerUid). Pupils never sign
 * in to Firebase. Runs against the Firestore emulator (`npm run test:emulator`).
 */
const PROJECT_ID = 'demo-lop-chung-minh';
const OWNER = 'nguyenthanhmai9297@gmail.com';
const now = '2026-10-26T00:00:00.000Z';

const classRoom = (ownerUid?: string) => ({
  ...(ownerUid ? { ownerUid } : {}),
  name: '3A',
  grade: 'Khối 3',
  schoolYear: '2026-2027',
  status: 'active',
  createdAt: now,
  updatedAt: now,
});
const student = (ownerUid: string | undefined, code: string) => ({
  ...(ownerUid ? { ownerUid } : {}),
  fullName: 'Nguyễn An',
  grade: 'Khối 3',
  classIds: [],
  internalNotes: 'Ghi chú riêng của giáo viên',
  status: 'active',
  accessCode: code,
  createdAt: now,
  updatedAt: now,
});
const homework = (ownerUid?: string) => ({
  ...(ownerUid ? { ownerUid } : {}),
  title: 'Phiếu tuần 8',
  subject: 'Toán',
  questions: [],
  answerSource: 'teacher',
  aiSolverEnabled: false,
  totalPoints: 10,
  status: 'draft',
  createdAt: now,
  updatedAt: now,
});
const studentAssignment = (ownerUid: string | undefined, assignmentId: string, studentId: string) => ({
  ...(ownerUid ? { ownerUid } : {}),
  assignmentId,
  studentId,
  status: 'submitted',
  maxScore: 10,
  isScorePublished: false,
  updatedAt: now,
});

describe('firestore.rules – Admin, giáo viên A, giáo viên B', () => {
  let env: RulesTestEnvironment;
  const admin = () => env.authenticatedContext('uid-admin', { email: OWNER, email_verified: true }).firestore();
  const teacherA = () => env.authenticatedContext('uid-a', { email: 'gva@gmail.com', email_verified: true }).firestore();
  const teacherB = () => env.authenticatedContext('uid-b', { email: 'gvb@gmail.com', email_verified: true }).firestore();
  const unverified = () => env.authenticatedContext('uid-x', { email: 'x@gmail.com', email_verified: false }).firestore();
  const anon = () => env.unauthenticatedContext().firestore();

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
      // Data from before teacher accounts: no ownerUid
      await db.doc('classes/c_old').set(classRoom());
      await db.doc('students/s_old').set(student(undefined, 'OLD111'));
      await db.doc('studentCodeIndex/OLD111').set({ code: 'OLD111', studentId: 's_old', status: 'active', createdAt: now });
      // Teacher A's data
      await db.doc('classes/c_a').set(classRoom('uid-a'));
      await db.doc('students/s_a').set(student('uid-a', 'AAA111'));
      await db.doc('studentCodeIndex/AAA111').set({ code: 'AAA111', studentId: 's_a', status: 'active', createdAt: now });
      await db.doc('homework/hw_a').set(homework('uid-a'));
      await db.doc('studentAssignments/sa_a').set(studentAssignment('uid-a', 'as_a', 's_a'));
    });
  });

  it('a new teacher (not on the allowlist) creates and edits their own class, pupil and homework', async () => {
    const db = teacherB();
    await assertSucceeds(db.doc('classes/c_b').set(classRoom('uid-b')));
    await assertSucceeds(db.doc('classes/c_b').set({ ...classRoom('uid-b'), name: '3B' }));
    await assertSucceeds(db.doc('students/s_b').set(student('uid-b', 'BBB111')));
    await assertSucceeds(db.doc('studentCodeIndex/BBB111').set({ code: 'BBB111', studentId: 's_b', status: 'active', createdAt: now }));
    await assertSucceeds(db.doc('homework/hw_b').set(homework('uid-b')));
    await assertSucceeds(db.collection('classes').where('ownerUid', '==', 'uid-b').get());
    await assertSucceeds(db.collection('homework').where('ownerUid', '==', 'uid-b').get());
  });

  it("teacher B cannot see teacher A's data, nor the admin's older data", async () => {
    const db = teacherB();
    for (const path of ['classes/c_a', 'students/s_a', 'homework/hw_a', 'studentAssignments/sa_a', 'classes/c_old', 'students/s_old']) {
      await assertFails(db.doc(path).get());
    }
    // Listing without asking for their own documents is refused
    for (const path of ['classes', 'students', 'homework', 'assignments', 'studentAssignments', 'submissions', 'comments']) {
      await assertFails(db.collection(path).get());
      await assertFails(db.collection(path).where('ownerUid', '==', 'uid-a').get());
    }
    await assertFails(db.collection('studentCodeIndex').get());
  });

  it("teacher B cannot change teacher A's data or take it over", async () => {
    const db = teacherB();
    await assertFails(db.doc('classes/c_a').set({ ...classRoom('uid-a'), name: 'Đổi tên' }));
    await assertFails(db.doc('classes/c_a').set(classRoom('uid-b')));
    await assertFails(db.doc('students/s_a').set({ ...student('uid-a', 'AAA111'), fullName: 'Đổi tên' }));
    await assertFails(db.doc('homework/hw_a').delete());
    await assertFails(db.doc('studentAssignments/sa_a').set({ ...studentAssignment('uid-a', 'as_a', 's_a'), score: 10 }));
    await assertFails(db.doc('classes/c_old').set(classRoom('uid-b')));
    // A code cannot be pointed at someone else's pupil, and A's code cannot be switched off
    await assertFails(db.doc('studentCodeIndex/ZZZ111').set({ code: 'ZZZ111', studentId: 's_a', status: 'active', createdAt: now }));
    await assertFails(db.doc('studentCodeIndex/AAA111').set({ code: 'AAA111', studentId: 's_a', status: 'archived', createdAt: now }));
    // Nor create documents in A's name
    await assertFails(db.doc('classes/c_fake').set(classRoom('uid-a')));
    await assertFails(db.doc('classes/c_noowner').set(classRoom()));
  });

  it('teachers cannot make themselves Admin or open the admin-only collections', async () => {
    const db = teacherB();
    await assertFails(db.doc('adminAllowlist/gvb@gmail.com').set({ email: 'gvb@gmail.com', role: 'admin', addedBy: 'gvb@gmail.com', createdAt: now }));
    await assertFails(db.collection('adminAllowlist').get());
    await assertFails(db.collection('aiJobs').get());
    await assertFails(db.collection('practiceAttempts').get());
    await assertFails(db.doc('games/g1').set({ title: 'x' }));
  });

  it('the admin keeps everything: older data, other teachers\' data, and can take over older data', async () => {
    const db = admin();
    for (const path of ['classes', 'students', 'homework', 'studentAssignments', 'studentCodeIndex', 'adminAllowlist']) {
      await assertSucceeds(db.collection(path).get());
    }
    await assertSucceeds(db.doc('students/s_a').get());
    await assertSucceeds(db.doc('classes/c_old').set({ ...classRoom(), name: '3A cũ' }));
    await assertSucceeds(db.doc('classes/c_old').set(classRoom('uid-admin')));
    await assertSucceeds(db.doc('adminAllowlist/gvb@gmail.com').set({ email: 'gvb@gmail.com', role: 'admin', addedBy: OWNER, createdAt: now }));
  });

  it('a teacher added to the allowlist by the admin becomes Admin', async () => {
    await assertFails(teacherB().doc('students/s_a').get());
    await admin().doc('adminAllowlist/gvb@gmail.com').set({ email: 'gvb@gmail.com', role: 'admin', addedBy: OWNER, createdAt: now });
    await assertSucceeds(teacherB().doc('students/s_a').get());
  });

  it('pupils (no Firebase account) and unverified accounts reach nothing directly', async () => {
    for (const db of [anon(), unverified()]) {
      for (const path of ['classes/c_a', 'students/s_a', 'studentAssignments/sa_a', 'homework/hw_a', 'studentCodeIndex/AAA111']) {
        await assertFails(db.doc(path).get());
      }
      await assertFails(db.collection('studentAssignments').where('studentId', '==', 's_a').get());
      await assertFails(db.doc('studentAssignments/sa_a').update({ status: 'graded', score: 10 }));
      await assertFails(db.doc('classes/c_x').set(classRoom('uid-x')));
    }
  });

  it("teacher A still reads and grades A's own pupils", async () => {
    const db = teacherA();
    const snap = await assertSucceeds(db.collection('students').where('ownerUid', '==', 'uid-a').get());
    expect(snap.docs.map((d) => d.id)).toEqual(['s_a']);
    await assertSucceeds(db.doc('studentAssignments/sa_a').set({ ...studentAssignment('uid-a', 'as_a', 's_a'), status: 'graded', score: 9 }));
    await assertSucceeds(db.doc('studentCodeIndex/AAA111').set({ code: 'AAA111', studentId: 's_a', status: 'archived', createdAt: now }));
  });
});
