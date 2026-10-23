/**
 * Seeds the local Firebase emulators with test accounts for "Luyện Toán cùng Mimo":
 * one teacher (allowlisted admin), one class and one student with access code MIMO03.
 * With --with-n01 it also loads the curated N01 file from question-bank/ as an
 * approved, published set so students can practise immediately. It never
 * invents questions.
 *
 * Refuses to run unless FIRESTORE_EMULATOR_HOST is set (see `npm run seed:emulator`).
 */
import fs from 'fs';
import { getAdminDb, isUsingFirebaseEmulator, EMULATOR_PROJECT_ID } from '../api/firebaseAdmin';
import { validatePracticeImport } from '../src/utils/practiceEngine';

const N01_FILE = 'question-bank/MimoEDU_Toan3_ChuyenDe01_40cau.json';

const TEACHER_EMAIL = 'giaovien@demo.test';
const STUDENT_CODE = 'MIMO03';

async function main() {
  if (!isUsingFirebaseEmulator()) {
    throw new Error('Chỉ chạy được với Firebase Emulator (thiếu FIRESTORE_EMULATOR_HOST).');
  }
  const db = getAdminDb();
  if (!db) throw new Error('Không khởi tạo được Firestore emulator.');
  const now = new Date().toISOString();

  await db.doc(`adminAllowlist/${TEACHER_EMAIL}`).set({
    email: TEACHER_EMAIL, role: 'admin', addedBy: 'seed-emulator', createdAt: now,
  });
  await db.doc('classes/lop-3a-demo').set({
    name: 'Lớp 3A (thử nghiệm)', grade: 'Khối 3', schoolYear: '2025-2026', status: 'active',
    createdAt: now, updatedAt: now,
  });
  await db.doc('students/hs-demo-01').set({
    fullName: 'Học sinh Thử Nghiệm', nickname: 'Mimo', grade: 'Khối 3', classIds: ['lop-3a-demo'],
    status: 'active', accessCode: STUDENT_CODE, createdAt: now, updatedAt: now,
  });
  await db.doc(`studentCodeIndex/${STUDENT_CODE}`).set({
    code: STUDENT_CODE, studentId: 'hs-demo-01', status: 'active', createdAt: now,
  });

  // A fuller test class for the classroom tools (Gọi tên & Chia nhóm)
  const DEMO_NAMES = [
    'Nguyễn Minh An', 'Trần Bảo Ngọc', 'Lê Gia Huy', 'Phạm Khánh Linh', 'Hoàng Đức Minh',
    'Vũ Thảo Vy', 'Đặng Quốc Bảo', 'Bùi Ngọc Hân', 'Đỗ Tuấn Kiệt', 'Ngô Phương Anh',
    'Dương Hải Đăng', 'Lý Mai Chi', 'Phan Nhật Nam', 'Võ Tường Vi', 'Trịnh Gia Bảo',
  ];
  const batch = db.batch();
  DEMO_NAMES.forEach((fullName, i) => {
    const id = `hs-demo-${String(i + 2).padStart(2, '0')}`;
    const code = `MIMO${String(i + 10).padStart(2, '0')}`;
    batch.set(db.doc(`students/${id}`), {
      fullName, nickname: fullName.split(' ').pop(), grade: 'Khối 3', classIds: ['lop-3a-demo'],
      status: 'active', accessCode: code, createdAt: now, updatedAt: now,
    });
    batch.set(db.doc(`studentCodeIndex/${code}`), { code, studentId: id, status: 'active', createdAt: now });
  });
  await batch.commit();

  if (process.argv.includes('--with-n01')) {
    if (!fs.existsSync(N01_FILE)) throw new Error(`Thiếu tệp ${N01_FILE}.`);
    const v = validatePracticeImport(JSON.parse(fs.readFileSync(N01_FILE, 'utf8')));
    if (!v.dataset || v.errors.length > 0) {
      throw new Error(`Tệp N01 còn lỗi: ${v.errors.map((e) => e.message).join('; ')}`);
    }
    const batch = db.batch();
    batch.set(db.doc(`practiceSets/${v.dataset.id}`), {
      topicId: v.dataset.topicId, title: v.dataset.title, schemaVersion: v.dataset.schemaVersion,
      questionCount: v.questions.length, status: 'published', importedAt: now,
      importedBy: TEACHER_EMAIL, publishedAt: now, updatedAt: now,
    });
    for (const { id, ...q } of v.questions) {
      batch.set(db.doc(`practiceQuestions/${id}`), { ...q, status: 'approved', updatedAt: now, updatedBy: TEACHER_EMAIL });
    }
    await batch.commit();
    console.log(`- Bộ ${v.dataset.id}: ${v.questions.length} câu, đã duyệt và xuất bản (chỉ trong emulator)`);
  }

  console.log(`Đã nạp dữ liệu thử vào emulator (project ${EMULATOR_PROJECT_ID}):`);
  console.log(`- Giáo viên: đăng nhập Google giả lập với email ${TEACHER_EMAIL}`);
  console.log(`- Học sinh: mã truy cập ${STUDENT_CODE}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
