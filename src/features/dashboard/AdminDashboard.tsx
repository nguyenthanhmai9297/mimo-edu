import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  GraduationCap,
  Plus,
  School,
  Sparkles,
} from 'lucide-react';
import { useAppContext } from '../../app/providers';
import { seedSampleClassroomData } from '../../services/firestoreRepository';

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const {
    classes,
    students,
    assignments,
    studentAssignments,
    adminDataLoading,
  } = useAppContext();

  const [seeding, setSeeding] = useState(false);
  const [seededInfo, setSeededInfo] = useState<{
    studentCode: string;
    studentName: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const activeClasses = classes.filter((c) => c.status === 'active');
  const activeStudents = students.filter((s) => s.status === 'active');
  const activeAssignments = assignments.filter((a) => a.status === 'active');

  const notStartedCount = studentAssignments.filter(
    (sa) => sa.status === 'assigned' || sa.status === 'in_progress'
  ).length;
  const pendingGradingList = studentAssignments.filter(
    (sa) => sa.status === 'submitted'
  );
  const gradedCount = studentAssignments.filter(
    (sa) => sa.status === 'graded'
  ).length;

  // Upcoming assignments sorted by dueAt
  const upcomingAssignments = [...activeAssignments]
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 5);

  const handleSeedDemoData = async () => {
    setSeeding(true);
    try {
      const info = await seedSampleClassroomData();
      setSeededInfo(info);
    } catch (error) {
      console.error('Error seeding sample data:', error);
    } finally {
      setSeeding(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (adminDataLoading) {
    return (
      <div className="space-y-6">
        <div className="h-28 animate-pulse rounded-2xl border-2 border-slate-200 bg-white" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border-2 border-slate-200 bg-white"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome & Quick Actions Banner */}
      <div className="cartoon-card bg-gradient-to-r from-amber-100 via-white to-sky-100 p-6">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-slate-900 sm:text-3xl">
              Bảng Điều Khiển Lớp Học Toán
            </h1>
            <p className="mt-1 text-sm text-slate-700">
              Theo dõi tình hình lớp học, tiến độ làm BTVN và chấm bài tập trung
              theo thời gian thực từ Firestore.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate('/admin/classes')}
              className="cartoon-button flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-extrabold text-slate-900 whitespace-nowrap"
            >
              <Plus className="h-4 w-4 text-blue-600" />
              Tạo lớp
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/students')}
              className="cartoon-button flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-extrabold text-slate-900 whitespace-nowrap"
            >
              <Plus className="h-4 w-4 text-emerald-600" />
              Thêm học sinh
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/homework')}
              className="cartoon-button flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-extrabold text-white whitespace-nowrap"
            >
              <BookOpen className="h-4 w-4" />
              Soạn BTVN
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/assignments')}
              className="cartoon-button flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-extrabold text-slate-900 whitespace-nowrap"
            >
              Giao bài tập
            </button>
          </div>
        </div>

        {/* One-Click Real Firestore Seed Callout when database is empty */}
        {classes.length === 0 && (
          <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-2xl border-2 border-slate-900 bg-white p-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-display text-sm font-extrabold text-slate-900">
                Cơ sở dữ liệu lớp học đang trống
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Bạn có thể tự tạo từng lớp/học sinh mới hoặc nhấn nút bên cạnh
                để khởi tạo bộ dữ liệu mẫu thật vào Firestore (gồm Lớp 5A, 2 học
                sinh có mã 6 ký tự, đề Toán đủ 5 loại câu hỏi có hình học, đợt
                giao bài, nhận xét tháng và 4 trò chơi tương tác).
              </p>
            </div>
            <button
              type="button"
              onClick={handleSeedDemoData}
              disabled={seeding}
              className="cartoon-button flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-4 w-4" />
              {seeding
                ? 'Đang khởi tạo vào Firestore...'
                : 'Khởi tạo Dữ liệu Mẫu Thật'}
            </button>
          </div>
        )}

        {seededInfo && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-slate-900 bg-emerald-50 p-4">
            <div className="text-xs text-slate-800">
              Đã tạo dữ liệu mẫu trên Firestore! Học sinh{' '}
              <strong>{seededInfo.studentName}</strong> có mã truy cập cổng học
              sinh là:{' '}
              <span className="font-mono text-sm font-black text-blue-700">
                {seededInfo.studentCode}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopyCode(seededInfo.studentCode)}
                className="cartoon-button flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-900"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedCode ? 'Đã sao chép!' : 'Sao chép mã'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/portal')}
                className="cartoon-button rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-extrabold text-slate-900"
              >
                Thử Cổng Học Sinh →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4-Column KPI Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="cartoon-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">
              Lớp đang hoạt động
            </span>
            <School className="h-5 w-5 text-blue-600" />
          </div>
          <div className="mt-3 font-mono text-3xl font-extrabold text-slate-900 tabular-nums">
            {activeClasses.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Tổng số lớp: {classes.length} lớp
          </div>
        </div>

        <div className="cartoon-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">
              Tổng số học sinh
            </span>
            <GraduationCap className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="mt-3 font-mono text-3xl font-extrabold text-slate-900 tabular-nums">
            {activeStudents.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Đã cấp {students.length} mã 6 ký tự
          </div>
        </div>

        <div className="cartoon-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">
              Đợt BTVN đã giao
            </span>
            <CalendarClock className="h-5 w-5 text-amber-600" />
          </div>
          <div className="mt-3 font-mono text-3xl font-extrabold text-slate-900 tabular-nums">
            {activeAssignments.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Chưa hoàn thành: {notStartedCount} lượt
          </div>
        </div>

        <div className="cartoon-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">
              Bài nộp & Chấm điểm
            </span>
            <CheckCircle2 className="h-5 w-5 text-purple-600" />
          </div>
          <div className="mt-3 font-mono text-3xl font-extrabold text-slate-900 tabular-nums">
            {pendingGradingList.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Đang chờ chấm · Đã chấm: {gradedCount}
          </div>
        </div>
      </div>

      {/* 2-Column Operational Details: Upcoming Deadlines & Recent Submissions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Upcoming Assignments */}
        <div className="cartoon-card p-6 lg:col-span-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-extrabold text-slate-900">
              Bài Tập Đang Giao & Sắp Đến Hạn
            </h2>
            <button
              type="button"
              onClick={() => navigate('/admin/assignments')}
              className="text-xs font-bold text-blue-700 hover:underline"
            >
              Xem tất cả →
            </button>
          </div>

          {upcomingAssignments.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center">
              <p className="text-sm text-slate-600">
                Chưa có đợt bài tập nào đang giao.
              </p>
              <button
                type="button"
                onClick={() => navigate('/admin/assignments')}
                className="cartoon-button mt-3 rounded-xl bg-amber-300 px-4 py-2 text-xs font-extrabold text-slate-900"
              >
                Giao BTVN đầu tiên
              </button>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-200">
              {upcomingAssignments.map((asg) => {
                const relatedSA = studentAssignments.filter(
                  (sa) => sa.assignmentId === asg.id
                );
                const doneCount = relatedSA.filter(
                  (sa) => sa.status === 'submitted' || sa.status === 'graded'
                ).length;

                return (
                  <div
                    key={asg.id}
                    className="flex items-center justify-between gap-4 py-3.5"
                  >
                    <div>
                      <h3 className="font-display text-sm font-bold text-slate-900">
                        {asg.title}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Hạn nộp:{' '}
                        <span className="font-mono font-semibold text-slate-700">
                          {asg.dueAt}
                        </span>{' '}
                        · Thang điểm:{' '}
                        <span className="font-mono">{asg.maxScore}đ</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-xs font-bold text-slate-800">
                        Đã nộp {doneCount}/{relatedSA.length}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Submissions Needing Processing */}
        <div className="cartoon-card p-6 lg:col-span-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-extrabold text-slate-900">
              Bài Nộp Gần Đây Cần Xử Lý
            </h2>
            <button
              type="button"
              onClick={() => navigate('/admin/grading')}
              className="text-xs font-bold text-blue-700 hover:underline"
            >
              Mở bàn chấm bài →
            </button>
          </div>

          {studentAssignments.filter(
            (sa) => sa.status === 'submitted' || sa.status === 'graded'
          ).length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center">
              <Clock className="mx-auto h-6 w-6 text-slate-400" />
              <p className="mt-2 text-sm text-slate-600">
                Hiện chưa có bài nộp mới từ học sinh.
              </p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-200">
              {studentAssignments
                .filter(
                  (sa) => sa.status === 'submitted' || sa.status === 'graded'
                )
                .slice(0, 6)
                .map((sa) => {
                  const stu = students.find((s) => s.id === sa.studentId);
                  const asg = assignments.find((a) => a.id === sa.assignmentId);
                  return (
                    <div
                      key={sa.id}
                      className="flex items-center justify-between gap-4 py-3.5"
                    >
                      <div>
                        <div className="font-display text-sm font-bold text-slate-900">
                          {stu?.fullName || 'Học sinh'}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {asg?.title || 'Bài tập'} ·{' '}
                          {sa.status === 'submitted'
                            ? 'Đang chờ chấm tự luận'
                            : `Đã chấm (${sa.score ?? 0}/${sa.maxScore}đ)`}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate('/admin/grading')}
                        className="cartoon-button flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-900 whitespace-nowrap"
                      >
                        Chấm / Xem
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
