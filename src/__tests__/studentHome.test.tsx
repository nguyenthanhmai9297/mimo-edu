import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatDate, homeworkStatus, NO_CLASS_MESSAGE, StudentHome } from '../features/student-portal/StudentHome';
import type { Assignment, ClassRoom, StudentAssignment } from '../types/domain';

const asg = (id: string, dueAt: string): Assignment =>
  ({ id, homeworkId: 'h', title: `Bài ${id}`, targetType: 'class', assignedAt: '2026-10-01', dueAt, status: 'active' }) as Assignment;
const sa = (id: string, status: StudentAssignment['status'], extra: Partial<StudentAssignment> = {}): StudentAssignment => ({
  id: `${id}_s`,
  assignmentId: id,
  studentId: 's',
  status,
  maxScore: 10,
  isScorePublished: false,
  updatedAt: '',
  ...extra,
});
const cls: ClassRoom = { id: 'c', name: '3A', grade: 'Khối 3', schoolYear: '2026-2027', status: 'active', createdAt: '', updatedAt: '' };

const render = (patch: Partial<React.ComponentProps<typeof StudentHome>> = {}) =>
  renderToStaticMarkup(
    <StudentHome
      name="An"
      accessCode="ABC123"
      classes={[]}
      pending={[]}
      scored={[]}
      assignmentsMap={{}}
      practiceCount={0}
      practiceLimit={20}
      openTopics={35}
      totalTopics={35}
      comments={[]}
      gamesCount={0}
      onNavigate={() => undefined}
      onOpenAssignment={() => undefined}
      {...patch}
    />
  );

describe('Cổng học sinh – trang chủ', () => {
  it('works for a student without a class (học sinh tự do)', () => {
    const html = render();
    expect(html).toContain('Chào con, An!');
    expect(html).toContain(NO_CLASS_MESSAGE);
    expect(html).toContain('35/35 chuyên đề đã mở');
    expect(html).toContain('Luyện Toán ngay');
    expect(html).not.toContain('Lớp 3A');
  });

  it('shows class, homework to do, scores and caps the practice counter', () => {
    const map = { a: asg('a', '2999-01-01'), b: asg('b', '2999-01-01') };
    const html = render({
      classes: [cls],
      pending: [sa('a', 'in_progress')],
      scored: [sa('b', 'graded', { isScorePublished: true, score: 9 })],
      assignmentsMap: map,
      practiceCount: 20,
    });
    expect(html).toContain('Lớp 3A');
    expect(html).not.toContain(NO_CLASS_MESSAGE);
    expect(html).toContain('Bài a');
    expect(html).toContain('Đang làm');
    expect(html).toContain('9/10');
    expect(html).toContain('20+');
  });

  it('shows friendly empty states when there is nothing yet', () => {
    const html = render({ classes: [cls], openTopics: null, practiceCount: null });
    expect(html).toContain('Con đã làm hết bài tập');
    expect(html).toContain('Chưa có điểm mới');
    expect(html).toContain('Cô chưa gửi nhận xét');
  });
});

describe('Cổng học sinh – trạng thái bài tập', () => {
  it('tells overdue, returned, in progress, submitted and graded apart', () => {
    const past = asg('p', '2000-01-01');
    const future = asg('f', '2999-12-31');
    expect(homeworkStatus(sa('p', 'assigned'), past)).toBe('overdue');
    expect(homeworkStatus(sa('p', 'in_progress'), past)).toBe('overdue');
    expect(homeworkStatus(sa('p', 'submitted'), past)).toBe('submitted');
    expect(homeworkStatus(sa('p', 'graded'), past)).toBe('graded');
    expect(homeworkStatus(sa('f', 'assigned'), future)).toBe('todo');
    expect(homeworkStatus(sa('f', 'in_progress'), future)).toBe('in_progress');
    expect(homeworkStatus(sa('f', 'returned'), future)).toBe('returned');
  });

  it('formats due dates the Vietnamese way', () => {
    expect(formatDate('2026-10-30')).toBe('30/10/2026');
    expect(formatDate('thứ Năm')).toBe('thứ Năm');
    expect(formatDate(undefined)).toBe('—');
  });
});
