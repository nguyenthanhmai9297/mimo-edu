import React, { useState } from 'react';
import {
  Ban,
  CalendarCheck,
  CheckCircle2,
  Eye,
  Plus,
  RotateCcw,
  Users,
  X,
} from 'lucide-react';
import { useAppContext } from '../../app/providers';
import {
  createAssignmentFromHomework,
  updateAssignmentStatus,
} from '../../services/firestoreRepository';
import { Assignment } from '../../types/domain';

export const AssignmentsPage: React.FC = () => {
  const {
    homeworkList,
    classes,
    students,
    assignments,
    studentAssignments,
  } = useAppContext();

  const [modalOpen, setModalOpen] = useState(false);
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

  const openAssignModal = () => {
    const firstHw = homeworkList[0];
    setSelectedHwId(firstHw?.id || '');
    setTitle(firstHw?.title || '');
    setInstructions(firstHw?.description || '');
    setTargetType('class');
    setSelectedClassIds(classes[0] ? [classes[0].id] : []);
    setSelectedStudentIds([]);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const hw = homeworkList.find((h) => h.id === selectedHwId);
    if (!hw) {
      setErrorMsg('Vui lòng chọn một đề BTVN để giao.');
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">
            Giao Bài Tập & Theo Dõi Tiến Độ Snapshot
          </h1>
          <p className="text-sm text-slate-600">
            Mỗi đợt giao bài tự động đóng băng bản sao câu hỏi (Snapshot) tại
            thời điểm giao để việc sửa đề gốc về sau không làm sai lệch bài học
            sinh đã nhận.
          </p>
        </div>

        <button
          type="button"
          onClick={openAssignModal}
          className="cartoon-button flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-extrabold text-slate-900 whitespace-nowrap self-start"
        >
          <Plus className="h-4 w-4" />
          Giao BTVN Mới
        </button>
      </div>

      {/* Assignments List */}
      {assignments.length === 0 ? (
        <div className="cartoon-card p-12 text-center">
          <CalendarCheck className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 font-display text-base font-bold text-slate-800">
            Chưa có đợt giao bài tập nào
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Hãy chọn một BTVN trong kho để giao cho lớp hoặc nhóm học sinh.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((asg) => {
            const saList = studentAssignments.filter(
              (sa) => sa.assignmentId === asg.id
            );
            const assignedCount = saList.filter(
              (s) => s.status === 'assigned'
            ).length;
            const inProgressCount = saList.filter(
              (s) => s.status === 'in_progress'
            ).length;
            const submittedCount = saList.filter(
              (s) => s.status === 'submitted'
            ).length;
            const gradedCount = saList.filter(
              (s) => s.status === 'graded'
            ).length;

            return (
              <div
                key={asg.id}
                className="cartoon-card flex flex-col justify-between gap-4 bg-white p-5 lg:flex-row lg:items-center"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-bold text-blue-700">
                      Giao ngày: {asg.assignedAt}
                    </span>
                    <span>·</span>
                    <span className="font-mono font-bold text-rose-700">
                      Hạn nộp: {asg.dueAt}
                    </span>
                    <span>·</span>
                    <span>
                      Snapshot:{' '}
                      <strong className="font-mono">
                        {asg.publicQuestionsSnapshot?.length || 0}
                      </strong>{' '}
                      câu ({asg.maxScore}đ)
                    </span>
                    <span>·</span>
                    <span
                      className={
                        asg.status === 'active'
                          ? 'font-bold text-emerald-700'
                          : 'font-bold text-rose-700'
                      }
                    >
                      {asg.status === 'active'
                        ? 'Đang mở nhận bài'
                        : 'Đã thu hồi / Đóng'}
                    </span>
                  </div>

                  <h3 className="font-display text-lg font-extrabold text-slate-900">
                    {asg.title}
                  </h3>
                  {asg.instructions && (
                    <p className="text-xs text-slate-600">{asg.instructions}</p>
                  )}
                </div>

                {/* Progress Counters */}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="grid grid-cols-4 gap-2 rounded-xl border-2 border-slate-800 bg-slate-50 px-3 py-2 text-center text-xs">
                    <div>
                      <div className="font-mono font-extrabold text-slate-800">
                        {assignedCount}
                      </div>
                      <div className="text-[10px] text-slate-500">Chưa làm</div>
                    </div>
                    <div>
                      <div className="font-mono font-extrabold text-amber-700">
                        {inProgressCount}
                      </div>
                      <div className="text-[10px] text-slate-500">Đang làm</div>
                    </div>
                    <div>
                      <div className="font-mono font-extrabold text-blue-700">
                        {submittedCount}
                      </div>
                      <div className="text-[10px] text-slate-500">Đã nộp</div>
                    </div>
                    <div>
                      <div className="font-mono font-extrabold text-emerald-700">
                        {gradedCount}
                      </div>
                      <div className="text-[10px] text-slate-500">Đã chấm</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInspectingAssignment(asg)}
                      className="cartoon-button flex items-center gap-1 rounded-xl bg-sky-100 px-3 py-2 text-xs font-bold text-slate-900"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Tiến độ học sinh
                    </button>

                    {asg.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => updateAssignmentStatus(asg, 'revoked')}
                        className="cartoon-button flex items-center gap-1 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Thu hồi
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateAssignmentStatus(asg, 'active')}
                        className="cartoon-button flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Mở lại
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assign Homework Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="cartoon-card max-h-[90vh] w-full max-w-xl overflow-y-auto bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="font-display text-lg font-extrabold text-slate-900">
                Giao Bài Tập Về Nhà Cho Học Sinh
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-300 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAssignment} className="mt-4 space-y-4">
              {errorMsg && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Chọn đề BTVN trong kho *
                </label>
                <select
                  value={selectedHwId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedHwId(id);
                    const found = homeworkList.find((h) => h.id === id);
                    if (found) {
                      setTitle(found.title);
                      setInstructions(found.description || '');
                    }
                  }}
                  className="w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-sm font-bold"
                >
                  <option value="">-- Chọn BTVN --</option>
                  {homeworkList.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.title} ({h.questions.length} câu · {h.totalPoints}đ)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Tiêu đề đợt giao bài
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Ngày giao
                  </label>
                  <input
                    type="date"
                    value={assignedAt}
                    onChange={(e) => setAssignedAt(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Hạn nộp *
                  </label>
                  <input
                    type="date"
                    required
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  Đối tượng nhận bài
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetType('class')}
                    className={`flex-1 rounded-xl border-2 border-slate-800 py-2 text-xs font-bold ${
                      targetType === 'class'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-slate-800'
                    }`}
                  >
                    Giao theo Lớp học
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetType('students')}
                    className={`flex-1 rounded-xl border-2 border-slate-800 py-2 text-xs font-bold ${
                      targetType === 'students'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-slate-800'
                    }`}
                  >
                    Giao cho Nhóm Học Sinh Cụ Thể
                  </button>
                </div>
              </div>

              {targetType === 'class' ? (
                <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-xl border-2 border-slate-800 bg-slate-50 p-3">
                  {classes
                    .filter((c) => c.status === 'active')
                    .map((cls) => (
                      <label
                        key={cls.id}
                        className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-800"
                      >
                        <input
                          type="checkbox"
                          checked={selectedClassIds.includes(cls.id)}
                          onChange={() =>
                            setSelectedClassIds((prev) =>
                              prev.includes(cls.id)
                                ? prev.filter((id) => id !== cls.id)
                                : [...prev, cls.id]
                            )
                          }
                          className="h-4 w-4"
                        />
                        <span>
                          {cls.name} ({cls.grade})
                        </span>
                      </label>
                    ))}
                </div>
              ) : (
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border-2 border-slate-800 bg-slate-50 p-3">
                  {students
                    .filter((s) => s.status === 'active')
                    .map((st) => (
                      <label
                        key={st.id}
                        className="flex cursor-pointer items-center justify-between text-xs font-bold text-slate-800"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.includes(st.id)}
                            onChange={() =>
                              setSelectedStudentIds((prev) =>
                                prev.includes(st.id)
                                  ? prev.filter((id) => id !== st.id)
                                  : [...prev, st.id]
                              )
                            }
                            className="h-4 w-4"
                          />
                          <span>{st.fullName}</span>
                        </span>
                        <span className="font-mono text-blue-700">
                          {st.accessCode}
                        </span>
                      </label>
                    ))}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Hướng dẫn làm bài
                </label>
                <textarea
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={publishSolutions}
                  onChange={(e) => setPublishSolutions(e.target.checked)}
                  className="h-4 w-4"
                />
                Cho phép học sinh xem đáp án & lời giải chuẩn sau khi bài được
                chấm và công bố điểm
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="cartoon-button flex items-center gap-1.5 rounded-xl bg-amber-400 px-5 py-2 text-xs font-extrabold text-slate-900"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {saving ? 'Đang tạo Snapshot...' : 'Xác Nhận Giao Bài'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Student Progress Modal */}
      {inspectingAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="cartoon-card max-h-[88vh] w-full max-w-2xl overflow-y-auto bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="font-display text-lg font-extrabold text-slate-900">
                  Tiến Độ Học Sinh: {inspectingAssignment.title}
                </h2>
                <p className="text-xs text-slate-500">
                  Hạn nộp: {inspectingAssignment.dueAt} · Điểm tối đa:{' '}
                  {inspectingAssignment.maxScore}đ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingAssignment(null)}
                className="rounded-lg border border-slate-300 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 divide-y divide-slate-200">
              {studentAssignments
                .filter((sa) => sa.assignmentId === inspectingAssignment.id)
                .map((sa) => {
                  const st = students.find((s) => s.id === sa.studentId);
                  return (
                    <div
                      key={sa.id}
                      className="flex items-center justify-between py-3 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <Users className="h-4 w-4 text-slate-400" />
                        <div>
                          <div className="font-bold text-slate-900">
                            {st?.fullName || sa.studentId}
                          </div>
                          <div className="font-mono text-slate-500">
                            Mã học sinh: {st?.accessCode || '—'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right font-bold">
                        {sa.status === 'assigned' && (
                          <span className="text-slate-600">Chưa làm</span>
                        )}
                        {sa.status === 'in_progress' && (
                          <span className="text-amber-700">Đang làm nháp</span>
                        )}
                        {sa.status === 'submitted' && (
                          <span className="text-blue-700">
                            Đã nộp (Chờ chấm)
                          </span>
                        )}
                        {sa.status === 'graded' && (
                          <span className="font-mono text-emerald-700">
                            Đã chấm: {sa.score ?? 0}/{sa.maxScore}đ
                          </span>
                        )}
                        {sa.status === 'returned' && (
                          <span className="text-rose-700">
                            Yêu cầu làm lại
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
