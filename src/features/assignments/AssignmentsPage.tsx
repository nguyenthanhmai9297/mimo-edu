import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Plus,
  RotateCcw,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { useAppContext } from '../../app/providers';
import {
  createAssignmentFromHomework,
  updateAssignmentStatus,
} from '../../services/firestoreRepository';
import { Assignment, StudentAssignment } from '../../types/domain';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FilterSelect,
  PageHeader,
  SearchInput,
  SegmentedFilter,
  StatCard,
  StatusBadge,
  STUDIO_INPUT,
  STUDIO_LABEL,
  STUDIO_TONE,
  StudioModal,
  Toolbar,
} from '../../components/studio/StudioUi';

const STEPS = ['Chọn bài', 'Chọn lớp / học sinh', 'Thiết lập thời hạn', 'Giao bài'] as const;

const PROGRESS: { key: StudentAssignment['status']; label: string; bar: string; text: string }[] = [
  { key: 'assigned', label: 'Chưa làm', bar: 'bg-[#DCE7F3]', text: 'text-[#5E6C84]' },
  { key: 'in_progress', label: 'Đang làm', bar: 'bg-[#FFD34E]', text: 'text-[#B7790A]' },
  { key: 'submitted', label: 'Đã nộp', bar: 'bg-[#54C8FF]', text: 'text-[#2563EB]' },
  { key: 'graded', label: 'Đã chấm', bar: 'bg-[#1F9D6B]', text: 'text-[#1F9D6B]' },
];

const SA_BADGE: Record<StudentAssignment['status'], { kind: 'neutral' | 'warning' | 'info' | 'success' | 'danger'; label: string }> = {
  assigned: { kind: 'neutral', label: 'Chưa làm' },
  in_progress: { kind: 'warning', label: 'Đang làm nháp' },
  submitted: { kind: 'info', label: 'Đã nộp · chờ chấm' },
  graded: { kind: 'success', label: 'Đã chấm' },
  returned: { kind: 'danger', label: 'Yêu cầu làm lại' },
};

/** 2026-10-30 → 30/10/2026 */
const vnDate = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).split('-').reverse().join('/') : d);
const today = () => new Date().toISOString().slice(0, 10);

export const AssignmentsPage: React.FC = () => {
  const {
    homeworkList,
    classes,
    students,
    assignments,
    studentAssignments,
  } = useAppContext();

  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedHwId, setSelectedHwId] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [targetType, setTargetType] = useState<'class' | 'students'>('class');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [assignedAt, setAssignedAt] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [dueAt, setDueAt] = useState(
    new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [publishSolutions, setPublishSolutions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [inspectingAssignment, setInspectingAssignment] =
    useState<Assignment | null>(null);
  const [revoking, setRevoking] = useState<Assignment | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked'>('all');
  const [classFilter, setClassFilter] = useState('all');

  const openAssignModal = () => {
    const firstHw = homeworkList[0];
    setSelectedHwId(firstHw?.id || '');
    setTitle(firstHw?.title || '');
    setInstructions(firstHw?.description || '');
    setTargetType('class');
    setSelectedClassIds(classes[0] ? [classes[0].id] : []);
    setSelectedStudentIds([]);
    setErrorMsg(null);
    setStep(0);
    setModalOpen(true);
  };

  /** Same checks as before, run when leaving the step they belong to. */
  const stepProblem = (s: number): string | null => {
    if (s === 0 && !homeworkList.some((h) => h.id === selectedHwId)) return 'Vui lòng chọn một bài tập để giao.';
    if (s === 1 && targetType === 'class' && selectedClassIds.length === 0) return 'Vui lòng chọn ít nhất một lớp học.';
    if (s === 1 && targetType === 'students' && selectedStudentIds.length === 0) return 'Vui lòng chọn ít nhất một học sinh.';
    if (s === 2 && !dueAt) return 'Vui lòng chọn hạn nộp.';
    return null;
  };
  const goNext = () => {
    const problem = stepProblem(step);
    setErrorMsg(problem);
    if (!problem) setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const handleCreateAssignment = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErrorMsg(null);
    const hw = homeworkList.find((h) => h.id === selectedHwId);
    if (!hw) {
      setErrorMsg('Vui lòng chọn một bài tập để giao.');
      return;
    }
    if (targetType === 'class' && selectedClassIds.length === 0) {
      setErrorMsg('Vui lòng chọn ít nhất một lớp học.');
      return;
    }
    if (targetType === 'students' && selectedStudentIds.length === 0) {
      setErrorMsg('Vui lòng chọn ít nhất một học sinh.');
      return;
    }

    setSaving(true);
    try {
      await createAssignmentFromHomework({
        homework: hw,
        title: title.trim() || hw.title,
        instructions,
        targetType,
        classIds: selectedClassIds,
        studentIds: selectedStudentIds,
        allStudents: students,
        assignedAt,
        dueAt,
        publishSolutions,
      });
      setModalOpen(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể giao bài tập.'
      );
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------- derived
  const saOf = (id: string) => studentAssignments.filter((sa) => sa.assignmentId === id);
  const activeCount = assignments.filter((a) => a.status === 'active').length;
  const waiting = studentAssignments.filter((sa) => sa.status === 'submitted').length;
  const finished = studentAssignments.filter((sa) => sa.status === 'submitted' || sa.status === 'graded').length;
  const shown = assignments
    .filter((a) => statusFilter === 'all' || (statusFilter === 'active' ? a.status === 'active' : a.status !== 'active'))
    .filter((a) => classFilter === 'all' || (a.classIds || []).includes(classFilter))
    .filter((a) => {
      const q = search.trim().toLowerCase();
      return !q || a.title.toLowerCase().includes(q) || (a.instructions || '').toLowerCase().includes(q);
    })
    .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt));
  const targetLabel = (a: Assignment) => {
    if (a.targetType === 'class') {
      const names = (a.classIds || []).map((id) => classes.find((c) => c.id === id)?.name).filter(Boolean);
      return names.length ? `Lớp ${names.join(', ')}` : 'Theo lớp';
    }
    return `${a.studentIds?.length ?? 0} học sinh`;
  };

  const selectedHw = homeworkList.find((h) => h.id === selectedHwId);
  const receivers =
    targetType === 'class'
      ? students.filter((s) => s.status === 'active' && s.classIds.some((id) => selectedClassIds.includes(id))).length
      : selectedStudentIds.length;

  return (
    <div className="studio-skin space-y-6">
      <PageHeader
        icon={CalendarCheck}
        tone="yellow"
        title="Giao bài tập"
        description="Giao bài đã soạn cho lớp hoặc nhóm học sinh và theo dõi tiến độ. Mỗi đợt giao lưu một bản sao câu hỏi, nên sửa bài gốc về sau không làm thay đổi bài học sinh đã nhận."
        actions={
          <button type="button" onClick={openAssignModal} className="studio-btn studio-btn-accent">
            <Plus className="h-4 w-4" />
            Giao bài mới
          </button>
        }
      />

      {/* How it works */}
      <ol className="studio-card grid grid-cols-2 gap-3 p-4 sm:p-5 lg:grid-cols-4">
        {STEPS.map((label, i) => {
          const Icon = [BookOpen, Users, CalendarClock, Send][i];
          return (
            <li key={label} className="flex items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${STUDIO_TONE[(['blue', 'green', 'yellow', 'pink'] as const)[i]]}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-bold text-[#5E6C84]">Bước {i + 1}</span>
                <span className="block text-sm font-extrabold text-[#172B4D]">{label}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {assignments.length > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard icon={CalendarCheck} tone="blue" label="Đợt đang mở" value={activeCount} note={`Tổng ${assignments.length} đợt`} />
          <StatCard icon={ClipboardCheck} tone="pink" label="Bài chờ chấm" value={waiting} note="Học sinh đã nộp" />
          <StatCard icon={CheckCircle2} tone="green" label="Lượt đã nộp" value={finished} note={`Trên ${studentAssignments.length} lượt được giao`} />
          <StatCard icon={Ban} tone="gray" label="Đã thu hồi" value={assignments.length - activeCount} />
        </section>
      )}

      {assignments.length > 0 && (
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Tìm theo tên đợt giao bài hoặc hướng dẫn…" />
          <div className="flex flex-wrap items-center gap-3">
            <FilterSelect label="Lớp" value={classFilter} onChange={setClassFilter}>
              <option value="all">Tất cả</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </FilterSelect>
            <SegmentedFilter
              label="Trạng thái đợt giao"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { id: 'all', label: 'Tất cả', count: assignments.length },
                { id: 'active', label: 'Đang mở', count: activeCount },
                { id: 'revoked', label: 'Đã thu hồi', count: assignments.length - activeCount },
              ]}
            />
          </div>
        </Toolbar>
      )}

      {assignments.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          tone="yellow"
          title="Chưa có đợt giao bài nào"
          text={
            homeworkList.length === 0
              ? 'Hãy soạn một bài tập ở mục Soạn bài tập trước, rồi quay lại đây để giao cho lớp.'
              : 'Chọn một bài tập đã soạn để giao cho lớp hoặc nhóm học sinh.'
          }
          action={
            homeworkList.length > 0 && (
              <button type="button" onClick={openAssignModal} className="studio-btn studio-btn-accent">
                <Plus className="h-4 w-4" />
                Giao bài đầu tiên
              </button>
            )
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={Search} tone="gray" title="Không có đợt giao bài phù hợp" text="Thử từ khóa hoặc bộ lọc khác." />
      ) : (
        <div className="space-y-4">
          {shown.map((asg) => {
            const saList = saOf(asg.id);
            const total = saList.length;
            const counts = PROGRESS.map((p) => saList.filter((sa) => sa.status === p.key).length);
            const active = asg.status === 'active';
            const overdue = active && asg.dueAt < today();
            return (
              <article key={asg.id} className="studio-card p-5 transition hover:shadow-[var(--studio-shadow-hover)]">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge kind={active ? 'success' : 'neutral'}>{active ? 'Đang mở nhận bài' : 'Đã thu hồi'}</StatusBadge>
                      {overdue && <StatusBadge kind="danger">Đã quá hạn</StatusBadge>}
                      <StatusBadge kind="info">{targetLabel(asg)}</StatusBadge>
                    </div>
                    <h3 className="font-display text-lg font-extrabold text-[#172B4D]">{asg.title}</h3>
                    {asg.instructions && <p className="line-clamp-2 text-sm text-[#5E6C84]">{asg.instructions}</p>}
                    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#5E6C84]">
                      <span>Giao {vnDate(asg.assignedAt)}</span>
                      <span className={overdue ? 'font-bold text-[#D93B5B]' : 'font-bold text-[#172B4D]'}>Hạn nộp {vnDate(asg.dueAt)}</span>
                      <span>
                        {asg.publicQuestionsSnapshot?.length || 0} câu · {asg.maxScore} điểm
                      </span>
                      <span>{asg.publishSolutions ? 'Cho xem lời giải sau khi chấm' : 'Không cho xem lời giải'}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setInspectingAssignment(asg)} className="studio-btn studio-btn-secondary">
                      <Eye className="h-4 w-4" />
                      Tiến độ học sinh
                    </button>
                    {active ? (
                      <button type="button" onClick={() => setRevoking(asg)} className="studio-btn studio-btn-danger">
                        <Ban className="h-4 w-4" />
                        Thu hồi
                      </button>
                    ) : (
                      <button type="button" onClick={() => updateAssignmentStatus(asg, 'active')} className="studio-btn studio-btn-secondary text-[#1F9D6B]">
                        <RotateCcw className="h-4 w-4" />
                        Mở lại
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress of the students who received it */}
                <div className="mt-4 rounded-xl bg-[#F6FAFF] p-3">
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-white" role="img" aria-label="Tiến độ làm bài">
                    {total > 0 &&
                      PROGRESS.map((p, i) => (
                        <span key={p.key} className={p.bar} style={{ width: `${(counts[i] / total) * 100}%` }} />
                      ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                    <span className="font-bold text-[#172B4D]">{total} học sinh nhận bài</span>
                    {PROGRESS.map((p, i) => (
                      <span key={p.key} className="inline-flex items-center gap-1.5 text-[#5E6C84]">
                        <span className={`h-2 w-2 rounded-full ${p.bar}`} />
                        {p.label} <b className={p.text}>{counts[i]}</b>
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Assign homework: 4 steps */}
      <StudioModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Giao bài tập"
        icon={Send}
        tone="yellow"
        width="lg"
        footer={
          <>
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => s - 1)} className="studio-btn studio-btn-secondary mr-auto">
                <ArrowLeft className="h-4 w-4" />
                Quay lại
              </button>
            )}
            <button type="button" onClick={() => setModalOpen(false)} className="studio-btn studio-btn-secondary">
              Hủy
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={goNext} className="studio-btn studio-btn-primary">
                Tiếp tục
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" disabled={saving} onClick={() => void handleCreateAssignment()} className="studio-btn studio-btn-accent">
                <CheckCircle2 className="h-4 w-4" />
                {saving ? 'Đang giao bài…' : 'Xác nhận giao bài'}
              </button>
            )}
          </>
        }
      >
        <ol className="mb-5 grid grid-cols-4 gap-2" aria-label="Các bước giao bài">
          {STEPS.map((label, i) => (
            <li key={label} className="text-center">
              <span
                className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold ${
                  i < step ? 'bg-[#1F9D6B] text-white' : i === step ? 'bg-[#2563EB] text-white' : 'bg-[#F1F4F9] text-[#5E6C84]'
                }`}
              >
                {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`mt-1 block text-[11px] leading-tight font-bold ${i === step ? 'text-[#172B4D]' : 'text-[#5E6C84]'}`}>{label}</span>
            </li>
          ))}
        </ol>

        {errorMsg && (
          <div className="mb-4">
            <ErrorState message={errorMsg} />
          </div>
        )}

        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className={STUDIO_LABEL}>Bài tập đã soạn *</label>
              {homeworkList.length === 0 ? (
                <p className="rounded-xl bg-[#FFF6DC] p-3 text-sm text-[#7A5200]">Chưa có bài tập nào. Hãy soạn bài ở mục Soạn bài tập trước.</p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {homeworkList.map((h) => {
                    const on = h.id === selectedHwId;
                    return (
                      <label
                        key={h.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${on ? 'border-[#2563EB] bg-[#EAF5FF]' : 'border-[#DCE7F3] hover:bg-[#F6FAFF]'}`}
                      >
                        <input
                          type="radio"
                          name="homework"
                          checked={on}
                          onChange={() => {
                            setSelectedHwId(h.id);
                            setTitle(h.title);
                            setInstructions(h.description || '');
                          }}
                          className="h-4 w-4 accent-[#2563EB]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-[#172B4D]">{h.title}</span>
                          <span className="block text-xs text-[#5E6C84]">
                            {h.questions.length} câu · {h.totalPoints} điểm · {h.grade || 'Toán'}
                          </span>
                        </span>
                        <StatusBadge kind={h.status === 'published' ? 'success' : 'warning'}>{h.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}</StatusBadge>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <label className={STUDIO_LABEL}>Tên đợt giao bài</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={STUDIO_INPUT} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <SegmentedFilter
              label="Đối tượng nhận bài"
              value={targetType}
              onChange={setTargetType}
              options={[
                { id: 'class', label: 'Giao theo lớp' },
                { id: 'students', label: 'Giao cho học sinh cụ thể' },
              ]}
            />
            {targetType === 'class' ? (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {classes
                  .filter((c) => c.status === 'active')
                  .map((cls) => {
                    const on = selectedClassIds.includes(cls.id);
                    const size = students.filter((s) => s.status === 'active' && s.classIds.includes(cls.id)).length;
                    return (
                      <label
                        key={cls.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${on ? 'border-[#2563EB] bg-[#EAF5FF]' : 'border-[#DCE7F3] hover:bg-[#F6FAFF]'}`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setSelectedClassIds((prev) =>
                              prev.includes(cls.id)
                                ? prev.filter((id) => id !== cls.id)
                                : [...prev, cls.id]
                            )
                          }
                          className="h-4 w-4 accent-[#2563EB]"
                        />
                        <span className="flex-1 text-sm font-bold text-[#172B4D]">
                          {cls.name} <span className="font-normal text-[#5E6C84]">({cls.grade})</span>
                        </span>
                        <span className="text-xs text-[#5E6C84]">{size} học sinh</span>
                      </label>
                    );
                  })}
                {classes.filter((c) => c.status === 'active').length === 0 && (
                  <p className="rounded-xl bg-[#FFF6DC] p-3 text-sm text-[#7A5200]">Chưa có lớp nào đang hoạt động.</p>
                )}
              </div>
            ) : (
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {students
                  .filter((s) => s.status === 'active')
                  .map((st) => {
                    const on = selectedStudentIds.includes(st.id);
                    return (
                      <label
                        key={st.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition ${on ? 'border-[#2563EB] bg-[#EAF5FF]' : 'border-[#DCE7F3] hover:bg-[#F6FAFF]'}`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setSelectedStudentIds((prev) =>
                              prev.includes(st.id)
                                ? prev.filter((id) => id !== st.id)
                                : [...prev, st.id]
                            )
                          }
                          className="h-4 w-4 accent-[#2563EB]"
                        />
                        <span className="flex-1 text-sm font-bold text-[#172B4D]">{st.fullName}</span>
                        <span className="font-mono text-xs text-[#2563EB]">{st.accessCode}</span>
                      </label>
                    );
                  })}
              </div>
            )}
            <p className="text-xs text-[#5E6C84]">
              Giao theo lớp: chỉ những học sinh <b>đang trong lớp lúc giao</b> nhận được bài. Học sinh được ghép vào lớp sau sẽ không tự nhận bài cũ.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={STUDIO_LABEL}>Ngày giao</label>
                <input type="date" value={assignedAt} onChange={(e) => setAssignedAt(e.target.value)} className={`${STUDIO_INPUT} font-mono`} />
              </div>
              <div>
                <label className={STUDIO_LABEL}>Hạn nộp *</label>
                <input type="date" required value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={`${STUDIO_INPUT} font-mono`} />
              </div>
            </div>
            <div>
              <label className={STUDIO_LABEL}>Hướng dẫn làm bài</label>
              <textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} className={`${STUDIO_INPUT} py-2`} />
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[#DCE7F3] p-3 text-sm text-[#172B4D]">
              <input
                type="checkbox"
                checked={publishSolutions}
                onChange={(e) => setPublishSolutions(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#2563EB]"
              />
              Cho học sinh xem đáp án và lời giải sau khi bài được chấm và công bố điểm
            </label>
          </div>
        )}

        {step === 3 && (
          <dl className="divide-y divide-[#EEF3F9] rounded-xl border border-[#DCE7F3] text-sm">
            {(
              [
                ['Bài tập', selectedHw ? `${selectedHw.title} (${selectedHw.questions.length} câu · ${selectedHw.totalPoints} điểm)` : '—'],
                ['Tên đợt giao', title.trim() || selectedHw?.title || '—'],
                [
                  'Giao cho',
                  targetType === 'class'
                    ? `${selectedClassIds.map((id) => classes.find((c) => c.id === id)?.name).filter(Boolean).join(', ')} · ${receivers} học sinh`
                    : `${receivers} học sinh`,
                ],
                ['Thời gian', `${vnDate(assignedAt)} → hạn nộp ${vnDate(dueAt)}`],
                ['Lời giải', publishSolutions ? 'Cho xem sau khi chấm' : 'Không cho xem'],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 px-4 py-2.5">
                <dt className="font-bold text-[#5E6C84]">{k}</dt>
                <dd className="text-[#172B4D]">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </StudioModal>

      {/* Student progress of one assignment */}
      <StudioModal
        open={inspectingAssignment !== null}
        onClose={() => setInspectingAssignment(null)}
        title={inspectingAssignment ? `Tiến độ: ${inspectingAssignment.title}` : ''}
        icon={Users}
        width="lg"
      >
        {inspectingAssignment && (
          <>
            <p className="mb-3 text-xs text-[#5E6C84]">
              Hạn nộp {vnDate(inspectingAssignment.dueAt)} · Điểm tối đa {inspectingAssignment.maxScore}
            </p>
            {saOf(inspectingAssignment.id).length === 0 ? (
              <EmptyState bare icon={Users} tone="gray" title="Chưa có học sinh nào nhận bài này" />
            ) : (
              <ul className="divide-y divide-[#EEF3F9]">
                {saOf(inspectingAssignment.id).map((sa) => {
                  const st = students.find((s) => s.id === sa.studentId);
                  const b = SA_BADGE[sa.status];
                  return (
                    <li key={sa.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${STUDIO_TONE.blue}`}>
                          {(st?.fullName || '?').slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-[#172B4D]">{st?.fullName || sa.studentId}</div>
                          <div className="font-mono text-xs text-[#5E6C84]">{st?.accessCode || '—'}</div>
                        </div>
                      </div>
                      <StatusBadge kind={b.kind}>
                        {sa.status === 'graded' ? `${b.label}: ${sa.score ?? 0}/${sa.maxScore}` : b.label}
                      </StatusBadge>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </StudioModal>

      <ConfirmDialog
        open={revoking !== null}
        danger
        title="Thu hồi đợt giao bài?"
        message={
          <>
            Học sinh sẽ không còn thấy <b className="text-[#172B4D]">{revoking?.title}</b> trong cổng học sinh. Bài đã nộp vẫn được giữ, và cô có thể mở lại bất cứ lúc nào.
          </>
        }
        confirmLabel="Thu hồi"
        onCancel={() => setRevoking(null)}
        onConfirm={() => {
          if (revoking) void updateAssignmentStatus(revoking, 'revoked');
          setRevoking(null);
        }}
      />
    </div>
  );
};
