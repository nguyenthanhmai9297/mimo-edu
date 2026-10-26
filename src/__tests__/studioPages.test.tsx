import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Assignment, ClassRoom, CommentReport, Homework, MathGame, Student, StudentAssignment, Submission } from '../types/domain';

// Pages read everything from the app context; give them plain in-memory data
const ctx = {
  classes: [] as ClassRoom[],
  students: [] as Student[],
  assignments: [] as Assignment[],
  homeworkList: [] as Homework[],
  studentAssignments: [] as StudentAssignment[],
  submissions: [] as Submission[],
  comments: [] as CommentReport[],
  games: [] as MathGame[],
  gamesLoading: false,
  gamesError: null as string | null,
};
vi.mock('../app/providers', () => ({ useAppContext: () => ctx }));
vi.mock('../services/firestoreRepository', () => ({}));
// The math editor (MathLive) needs a real browser; list pages never render it
vi.mock('../components/editor/MathRichEditor', () => ({ MathRichEditor: () => null }));
vi.mock('../components/editor/MathField', () => ({ MathField: () => null }));

const { ClassesPage } = await import('../features/classes/ClassesPage');
const { StudentsPage } = await import('../features/students/StudentsPage');
const { HomeworkPage } = await import('../features/homework/HomeworkPage');
const { AssignmentsPage } = await import('../features/assignments/AssignmentsPage');
const { GradingPage } = await import('../features/grading/GradingPage');
const { CommentsPage } = await import('../features/comments/CommentsPage');
const { GamesAdminPage } = await import('../features/games/GamesAdminPage');

const at = (path: string, route: string, el: React.ReactElement) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={el} />
      </Routes>
    </MemoryRouter>
  );

const cls: ClassRoom = { id: 'c1', name: 'Lớp 3A', grade: 'Khối 3', schoolYear: '2026-2027', status: 'active', createdAt: '', updatedAt: '' };
const stu = (id: string, extra: Partial<Student> = {}): Student =>
  ({ id, fullName: `Học sinh ${id}`, grade: 'Khối 3', classIds: ['c1'], status: 'active', accessCode: `ABC12${id}`, createdAt: '', updatedAt: '', ...extra }) as Student;
const hw = (id: string, status: Homework['status']): Homework => ({
  id,
  title: `Bài ${id}`,
  subject: 'Toán',
  grade: 'Khối 3',
  questions: [],
  answerSource: 'teacher',
  aiSolverEnabled: false,
  totalPoints: 10,
  status,
  createdAt: '2026-10-20T00:00:00Z',
  updatedAt: '2026-10-21T00:00:00Z',
});

describe('MimoEDU Studio – các trang Giai đoạn 1', () => {
  beforeEach(() => {
    ctx.classes = [];
    ctx.students = [];
    ctx.assignments = [];
    ctx.homeworkList = [];
    ctx.studentAssignments = [];
    ctx.submissions = [];
    ctx.comments = [];
    ctx.games = [];
    ctx.gamesLoading = false;
    ctx.gamesError = null;
  });

  it('Lớp học: trống, có dữ liệu và chi tiết lớp', () => {
    expect(at('/admin/classes', '/admin/classes', <ClassesPage />)).toContain('Chưa có lớp học nào');
    ctx.classes = [cls];
    ctx.students = [stu('1'), stu('2', { status: 'dropped' })];
    const list = at('/admin/classes', '/admin/classes', <ClassesPage />);
    expect(list).toContain('Lớp 3A');
    expect(list).toContain('Quản lý lớp');
    const detail = at('/admin/classes/c1', '/admin/classes/:classId', <ClassesPage />);
    expect(detail).toContain('Học sinh của lớp');
    expect(detail).toContain('ABC121');
    expect(at('/admin/classes/zz', '/admin/classes/:classId', <ClassesPage />)).toContain('Không tìm thấy lớp học này');
  });

  it('Học sinh & Mã: trống và bảng có mã', () => {
    expect(at('/admin/students', '/admin/students', <StudentsPage />)).toContain('Chưa có học sinh nào');
    ctx.classes = [cls];
    ctx.students = [stu('1'), stu('2', { classIds: [] })];
    const html = at('/admin/students', '/admin/students', <StudentsPage />);
    expect(html).toContain('ABC121');
    expect(html).toContain('Chưa ghép lớp');
    expect(html).toContain('Khối');
  });

  it('Soạn bài tập: hai hình thức Word / Game, danh sách và trạng thái', () => {
    const empty = at('/admin/homework', '/admin/homework/*', <HomeworkPage />);
    expect(empty).toContain('Soạn bài tập');
    expect(empty).toContain('SOẠN BÀI TẬP WORD');
    expect(empty).toContain('SOẠN BÀI TẬP GAME');
    expect(empty).toContain('href="/admin/homework/word"');
    expect(empty).toContain('href="/admin/homework/game"');
    // The ways to create live inside a format, not on the chooser
    expect(empty).not.toContain('Tạo bài tập từ tệp');
    expect(empty).toContain('Chưa có bài tập nào');
    ctx.homeworkList = [hw('a', 'published'), hw('b', 'draft')];
    const html = at('/admin/homework', '/admin/homework/*', <HomeworkPage />);
    expect(html).toContain('Đã xuất bản');
    expect(html).toContain('Bản nháp');
    expect(html).toContain('21/10/2026');
  });

  it('Soạn bài tập Word / Game: một ô tạo từ tệp, soạn thủ công; Game nêu rõ phần đã có', () => {
    ctx.homeworkList = [hw('a', 'published')];
    const word = at('/admin/homework/word', '/admin/homework/*', <HomeworkPage />);
    expect(word).toContain('Tạo bài tập từ tệp');
    expect(word).toContain('Soạn bài tập thủ công');
    // AI and .json import are one entry point now
    expect(word).not.toContain('Tạo bài tập bằng AI');
    expect(word).not.toContain('Nhập bài tập từ tệp');
    // No "Đã dùng được" box on Word: the two ways to start come right under the banner
    expect(word).not.toContain('Đã dùng được');
    expect(word).not.toContain('Chức năng hiện có');
    expect(word.indexOf('Soạn bài tập Word')).toBeLessThan(word.indexOf('Tạo bài tập từ tệp'));
    expect(word).toContain('href="/admin/homework/game"');
    const game = at('/admin/homework/game', '/admin/homework/*', <HomeworkPage />);
    expect(game).toContain('Soạn bài tập Game');
    expect(game).toContain('href="/admin/tools/mimo-quiz"');
    expect(game).toContain('href="/admin/homework/game/rung-chuong-vang"');
    expect(game).toContain('data-testid="bell-game-card"');
    expect(game).toContain('🔔 Rung chuông vàng');
    expect(game).toContain('câu chơi được');
    expect(game).toContain('Chưa có trong phiên bản này');
    expect(game).toContain('Đã dùng được');
    expect(game).not.toContain('Tải Word (.docx)');
    // Unknown formats fall back to the chooser
    expect(at('/admin/homework/excel', '/admin/homework/*', <HomeworkPage />)).toContain('SOẠN BÀI TẬP WORD');
  });

  it('Giao bài tập: trống, danh sách có tiến độ và quá hạn', () => {
    ctx.homeworkList = [hw('a', 'published')];
    expect(at('/admin/assignments', '/admin/assignments', <AssignmentsPage />)).toContain('Chưa có đợt giao bài nào');
    ctx.classes = [cls];
    ctx.students = [stu('1'), stu('2')];
    ctx.assignments = [
      { id: 'as1', homeworkId: 'a', title: 'Đợt 1', targetType: 'class', classIds: ['c1'], studentIds: ['1', '2'], assignedAt: '2026-01-01', dueAt: '2026-01-05', maxScore: 10, status: 'active', publishSolutions: true, publicQuestionsSnapshot: [], createdAt: '', updatedAt: '' } as Assignment,
    ];
    ctx.studentAssignments = [
      { id: 'as1_1', assignmentId: 'as1', studentId: '1', status: 'submitted', maxScore: 10, isScorePublished: false, updatedAt: '' },
      { id: 'as1_2', assignmentId: 'as1', studentId: '2', status: 'assigned', maxScore: 10, isScorePublished: false, updatedAt: '' },
    ];
    const html = at('/admin/assignments', '/admin/assignments', <AssignmentsPage />);
    expect(html).toContain('Đợt 1');
    expect(html).toContain('Lớp Lớp 3A');
    expect(html).toContain('Đã quá hạn');
    expect(html).toContain('2 học sinh nhận bài');
    expect(html).toContain('Chọn bài');
  });

  it('Chấm bài nộp: trống và danh sách chờ chấm', () => {
    expect(at('/admin/grading', '/admin/grading', <GradingPage />)).toContain('Chưa có bài nộp nào');
    ctx.students = [stu('1')];
    ctx.assignments = [{ id: 'as1', title: 'Đợt 1', maxScore: 10 } as Assignment];
    ctx.submissions = [{ id: 's1', assignmentId: 'as1', studentId: '1', answers: [], maxScore: 10, status: 'submitted', isPublished: false, updatedAt: '' } as Submission];
    const html = at('/admin/grading', '/admin/grading', <GradingPage />);
    expect(html).toContain('Học sinh 1');
    expect(html).toContain('Chờ chấm');
    expect(html).toContain('Chọn một bài nộp để chấm');
  });

  it('Nhận xét tháng: trống, nháp và đã công bố', () => {
    ctx.students = [stu('1')];
    expect(at('/admin/comments', '/admin/comments', <CommentsPage />)).toContain('Chưa có nhận xét tháng nào');
    ctx.comments = [
      { id: 'c1', studentId: '1', type: 'monthly', month: 9, year: 2026, strengths: 'Tính nhanh', status: 'published', createdAt: '', updatedAt: '' } as CommentReport,
      { id: 'c2', studentId: '1', type: 'monthly', month: 10, year: 2026, strengths: 'Chăm chỉ', status: 'draft', createdAt: '', updatedAt: '' } as CommentReport,
    ];
    const html = at('/admin/comments', '/admin/comments', <CommentsPage />);
    expect(html).toContain('Tháng 10/2026');
    expect(html).toContain('Bản nháp');
    expect(html).toContain('Đã công bố');
    expect(html).toContain('Xóa nháp');
  });

  it('Kho trò chơi: đang tải, lỗi, trống và thẻ trò chơi', () => {
    const page = () => at('/admin/games', '/admin/games', <GamesAdminPage />);
    ctx.gamesLoading = true;
    expect(page()).toContain('Đang tải Kho trò chơi');
    ctx.gamesLoading = false;
    ctx.gamesError = 'permission-denied';
    expect(page()).toContain('Không tải được Kho trò chơi');
    ctx.gamesError = null;
    expect(page()).toContain('Kho trò chơi đang trống');
    ctx.games = [
      { id: 'g1', title: 'Khám phá phân số', embedUrl: 'https://phet.colorado.edu/x', category: 'Số học', order: 1, status: 'published', createdAt: '', updatedAt: '' },
      { id: 'g2', title: 'Tìm X', embedUrl: 'https://example.com/x', category: 'Tư duy logic', order: 2, status: 'draft', thumbnailUrl: 'https://example.com/a.png', createdAt: '', updatedAt: '' },
    ];
    const html = page();
    expect(html).toContain('Khám phá phân số');
    expect(html).toContain('Bản nháp');
    expect(html).toContain('https://example.com/a.png');
    expect(html).toContain('/game-covers/so-hoc-1.svg'); // category cover when a game has no picture
  });
});
