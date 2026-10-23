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
  Send,
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
        <div className="h-32 animate-pulse rounded-2xl bg-[#EAF5FF]" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="studio-card h-32 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const recentSubmissions = studentAssignments.filter(
    (sa) => sa.status === 'submitted' || sa.status === 'graded'
  );

  const kpis = [
    {
      label: 'Lớp đang hoạt động',
      value: activeClasses.length,
      note: `Tổng số lớp: ${classes.length} lớp`,
      icon: School,
      tone: 'bg-[#EAF5FF] text-[#1267E9]',
    },
    {
      label: 'Tổng số học sinh',
      value: activeStudents.length,
      note: `Đã cấp ${students.length} mã 6 ký tự`,
      icon: GraduationCap,
      tone: 'bg-[#E7F7F0] text-[#1F9D6B]',
    },
    {
      label: 'Đợt BTVN đã giao',
      value: activeAssignments.length,
      note: `Chưa hoàn thành: ${notStartedCount} lượt`,
      icon: CalendarClock,
      tone: 'bg-[#FFF6DC] text-[#B7790A]',
    },
    {
      label: 'Bài nộp & Chấm điểm',
      value: pendingGradingList.length,
      note: `Đang chờ chấm · Đã chấm: ${gradedCount}`,
      icon: CheckCircle2,
      tone: 'bg-[#FFEDF6] text-[#D9468C]',
    },
  ];

  return (
    <div className="studio-skin space-y-6">
      {/* Welcome & quick actions */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#1267E9] via-[#2E86F0] to-[#54C8FF] p-6 text-white shadow-[0_18px_40px_-24px_rgba(18,103,233,0.8)] sm:p-7">
        <div className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 right-1/3 h-40 w-40 rounded-full bg-[#FFD34E]/20 blur-2xl" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Bảng điều khiển lớp học</h1>
            <p className="mt-1.5 text-sm text-white/90 sm:text-base">
              Quản lý lớp học, giao bài và theo dõi tiến bộ của học sinh.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => navigate('/admin/classes')} className="studio-btn studio-btn-secondary border-white/0">
              <Plus className="h-4 w-4 text-[#1267E9]" />
              Tạo lớp
            </button>
            <button type="button" onClick={() => navigate('/admin/students')} className="studio-btn studio-btn-secondary border-white/0">
              <Plus className="h-4 w-4 text-[#1F9D6B]" />
              Thêm học sinh
            </button>
            <button type="button" onClick={() => navigate('/admin/homework')} className="studio-btn studio-btn-navy">
              <BookOpen className="h-4 w-4" />
              Soạn BTVN
            </button>
            <button type="button" onClick={() => navigate('/admin/assignments')} className="studio-btn studio-btn-accent">
              <Send className="h-4 w-4" />
              Giao bài tập
            </button>
          </div>
        </div>
      </section>

      {/* Empty-database helper (unchanged behaviour) */}
      {classes.length === 0 && (
        <section className="studio-card flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-sm font-extrabold text-[#172B4D]">Cơ sở dữ liệu lớp học đang trống</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#5E6C84]">
              Bạn có thể tự tạo từng lớp/học sinh mới hoặc nhấn nút bên cạnh để khởi tạo bộ dữ liệu mẫu thật vào
              Firestore (gồm Lớp 5A, 2 học sinh có mã 6 ký tự, đề Toán đủ 5 loại câu hỏi có hình học, đợt giao bài,
              nhận xét tháng và 4 trò chơi tương tác).
            </p>
          </div>
          <button type="button" onClick={handleSeedDemoData} disabled={seeding} className="studio-btn studio-btn-primary shrink-0">
            <Sparkles className="h-4 w-4" />
            {seeding ? 'Đang khởi tạo vào Firestore...' : 'Khởi tạo Dữ liệu Mẫu Thật'}
          </button>
        </section>
      )}

      {seededInfo && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#BFE8D4] bg-[#E7F7F0] p-4">
          <div className="text-sm text-[#172B4D]">
            Đã tạo dữ liệu mẫu trên Firestore! Học sinh <strong>{seededInfo.studentName}</strong> có mã truy cập cổng học
            sinh là: <span className="font-mono text-base font-black text-[#1267E9]">{seededInfo.studentCode}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => handleCopyCode(seededInfo.studentCode)} className="studio-btn studio-btn-secondary">
              <Copy className="h-3.5 w-3.5" />
              {copiedCode ? 'Đã sao chép!' : 'Sao chép mã'}
            </button>
            <button type="button" onClick={() => navigate('/portal')} className="studio-btn studio-btn-accent">
              Thử Cổng Học Sinh →
            </button>
          </div>
        </section>
      )}

      {/* KPI cards */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="studio-card p-4 transition hover:shadow-[var(--studio-shadow-hover)] sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-semibold text-[#5E6C84] sm:text-sm">{k.label}</span>
                <span className={`flex h-9 w-9 shrink-0 sm:h-10 sm:w-10 items-center justify-center rounded-xl ${k.tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-2 font-display text-3xl font-extrabold text-[#172B4D] [font-variant-numeric:tabular-nums]">{k.value}</div>
              <div className="mt-1 text-xs text-[#5E6C84]">{k.note}</div>
            </div>
          );
        })}
      </section>

      {/* Upcoming assignments & recent submissions */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="studio-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[#DCE7F3] px-5 py-4">
            <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-[#172B4D]">
              <CalendarClock className="h-5 w-5 text-[#1267E9]" />
              Bài tập đang giao & sắp đến hạn
            </h2>
            <button type="button" onClick={() => navigate('/admin/assignments')} className="text-xs font-bold text-[#1267E9] hover:underline">
              Xem tất cả →
            </button>
          </div>

          {upcomingAssignments.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EAF5FF] text-[#1267E9]">
                <CalendarClock className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm text-[#5E6C84]">Chưa có đợt bài tập nào đang giao.</p>
              <button type="button" onClick={() => navigate('/admin/assignments')} className="studio-btn studio-btn-accent mt-4">
                Giao BTVN đầu tiên
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-[#EEF3F9]">
              {upcomingAssignments.map((asg) => {
                const relatedSA = studentAssignments.filter((sa) => sa.assignmentId === asg.id);
                const doneCount = relatedSA.filter((sa) => sa.status === 'submitted' || sa.status === 'graded').length;
                const ratio = relatedSA.length ? doneCount / relatedSA.length : 0;
                return (
                  <li key={asg.id} className="px-5 py-3.5 transition-colors hover:bg-[#F6FAFF]">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-[#172B4D]">{asg.title}</h3>
                        <p className="mt-0.5 text-xs text-[#5E6C84]">
                          Hạn nộp: <span className="font-mono font-semibold text-[#172B4D]">{asg.dueAt}</span> · Thang
                          điểm: <span className="font-mono">{asg.maxScore}đ</span>
                        </p>
                      </div>
                      <span className="studio-badge studio-badge-info shrink-0">
                        Đã nộp {doneCount}/{relatedSA.length}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EAF5FF]">
                      <div className="h-full rounded-full bg-[#1267E9]" style={{ width: `${Math.round(ratio * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="studio-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[#DCE7F3] px-5 py-4">
            <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-[#172B4D]">
              <CheckCircle2 className="h-5 w-5 text-[#FF76B5]" />
              Bài nộp gần đây cần xử lý
            </h2>
            <button type="button" onClick={() => navigate('/admin/grading')} className="text-xs font-bold text-[#1267E9] hover:underline">
              Mở bàn chấm bài →
            </button>
          </div>

          {recentSubmissions.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFEDF6] text-[#D9468C]">
                <Clock className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm text-[#5E6C84]">Hiện chưa có bài nộp mới từ học sinh.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#EEF3F9]">
              {recentSubmissions.slice(0, 6).map((sa) => {
                const stu = students.find((s) => s.id === sa.studentId);
                const asg = assignments.find((a) => a.id === sa.assignmentId);
                const waiting = sa.status === 'submitted';
                return (
                  <li key={sa.id} className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-[#F6FAFF]">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAF5FF] text-sm font-extrabold text-[#1267E9]">
                        {(stu?.fullName || 'H').slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-[#172B4D]">{stu?.fullName || 'Học sinh'}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[#5E6C84]">
                          <span className="truncate">{asg?.title || 'Bài tập'}</span>
                          <span className={`studio-badge ${waiting ? 'studio-badge-warning' : 'studio-badge-success'}`}>
                            {waiting ? 'Đang chờ chấm tự luận' : `Đã chấm (${sa.score ?? 0}/${sa.maxScore}đ)`}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button type="button" onClick={() => navigate('/admin/grading')} className="studio-btn studio-btn-secondary shrink-0 px-3 text-xs">
                      Chấm / Xem
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
};
