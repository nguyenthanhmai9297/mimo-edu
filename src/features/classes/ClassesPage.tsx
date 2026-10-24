import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  Eye,
  KeyRound,
  Plus,
  RotateCcw,
  School,
  Search,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAppContext } from '../../app/providers';
import {
  classFormSchema,
  ClassFormValues,
  studentFormSchema,
  StudentFormValues,
} from '../../schemas/validation';
import {
  createClassRoom,
  createStudent,
  toggleArchiveClassRoom,
  updateClassRoom,
  updateStudent,
} from '../../services/firestoreRepository';
import { ClassRoom, Student } from '../../types/domain';
import {
  EmptyState,
  FilterSelect,
  PageHeader,
  SectionHeading,
  SearchInput,
  SegmentedFilter,
  StatCard,
  StatusBadge,
  STUDIO_TONE,
  Toolbar,
} from '../../components/studio/StudioUi';

const GRADE_OPTIONS = [
  'Khối 1',
  'Khối 2',
  'Khối 3',
  'Khối 4',
  'Khối 5',
  'Khối 6',
  'Khối 7',
  'Khối 8',
  'Khối 9',
  'Khối 10',
  'Khối 11',
  'Khối 12',
];

export const ClassesPage: React.FC = () => {
  const { classes, students, assignments } = useAppContext();
  const { classId } = useParams<{ classId?: string }>();
  const navigate = useNavigate();

  // Class List Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>(
    'all'
  );
  const [gradeFilter, setGradeFilter] = useState('all');

  // Class Create / Edit Modal State
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRoom | null>(null);
  const [classFormValues, setClassFormValues] = useState<ClassFormValues>({
    name: '',
    grade: 'Khối 5',
    schoolYear: '2026-2027',
    description: '',
    status: 'active',
  });
  const [classFormError, setClassFormError] = useState<string | null>(null);
  const [savingClass, setSavingClass] = useState(false);

  // Class Detail Student CRUD State
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentStatusFilter, setStudentStatusFilter] = useState<
    'all' | 'active' | 'dropped' | 'archived'
  >('all');
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentFormValues, setStudentFormValues] = useState<StudentFormValues>({
    fullName: '',
    nickname: '',
    avatarUrl: '',
    grade: 'Khối 5',
    classIds: [],
    dob: '',
    internalNotes: '',
    status: 'active',
  });
  const [studentFormError, setStudentFormError] = useState<string | null>(null);
  const [savingStudent, setSavingStudent] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Add Existing Student to Class Modal State
  const [assignExistingModalOpen, setAssignExistingModalOpen] = useState(false);
  const [existingSearchQuery, setExistingSearchQuery] = useState('');
  const [assigningStudentId, setAssigningStudentId] = useState<string | null>(
    null
  );

  // Remove Student from Class Confirmation State
  const [removingStudent, setRemovingStudent] = useState<Student | null>(null);
  const [removingLoading, setRemovingLoading] = useState(false);

  const activeDetailClass = classId
    ? classes.find((c) => c.id === classId) || null
    : null;

  // ==========================================================================
  // CLASS CRUD HANDLERS
  // ==========================================================================
  const openCreateClassModal = () => {
    setEditingClass(null);
    setClassFormValues({
      name: '',
      grade: 'Khối 5',
      schoolYear: '2026-2027',
      description: '',
      status: 'active',
    });
    setClassFormError(null);
    setClassModalOpen(true);
  };

  const openEditClassModal = (cls: ClassRoom) => {
    setEditingClass(cls);
    setClassFormValues({
      name: cls.name,
      grade: cls.grade,
      schoolYear: cls.schoolYear,
      description: cls.description || '',
      status: cls.status,
    });
    setClassFormError(null);
    setClassModalOpen(true);
  };

  const handleClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClassFormError(null);
    const parsed = classFormSchema.safeParse(classFormValues);
    if (!parsed.success) {
      setClassFormError(
        parsed.error.issues[0]?.message || 'Dữ liệu lớp học không hợp lệ.'
      );
      return;
    }

    setSavingClass(true);
    try {
      if (editingClass) {
        await updateClassRoom(editingClass.id, editingClass, parsed.data);
      } else {
        await createClassRoom(parsed.data);
      }
      setClassModalOpen(false);
    } catch (err) {
      setClassFormError(
        err instanceof Error ? err.message : 'Không thể lưu thông tin lớp học.'
      );
    } finally {
      setSavingClass(false);
    }
  };

  // ==========================================================================
  // STUDENT CRUD HANDLERS (INSIDE CLASS DETAIL SCREEN)
  // ==========================================================================
  const openCreateStudentInClassModal = (cls: ClassRoom) => {
    setEditingStudent(null);
    setStudentFormValues({
      fullName: '',
      nickname: '',
      avatarUrl: '',
      grade: cls.grade || 'Khối 5',
      classIds: [cls.id],
      dob: '',
      internalNotes: '',
      status: 'active',
    });
    setStudentFormError(null);
    setStudentModalOpen(true);
  };

  const openEditStudentInClassModal = (st: Student) => {
    setEditingStudent(st);
    setStudentFormValues({
      fullName: st.fullName,
      nickname: st.nickname || '',
      avatarUrl: st.avatarUrl || '',
      grade: st.grade,
      classIds: st.classIds || [],
      dob: st.dob || '',
      internalNotes: st.internalNotes || '',
      status: st.status,
    });
    setStudentFormError(null);
    setStudentModalOpen(true);
  };

  const toggleStudentClassSelection = (targetClassId: string) => {
    setStudentFormValues((prev) => ({
      ...prev,
      classIds: prev.classIds.includes(targetClassId)
        ? prev.classIds.filter((id) => id !== targetClassId)
        : [...prev.classIds, targetClassId],
    }));
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudentFormError(null);
    const parsed = studentFormSchema.safeParse(studentFormValues);
    if (!parsed.success) {
      setStudentFormError(
        parsed.error.issues[0]?.message || 'Dữ liệu học sinh không hợp lệ.'
      );
      return;
    }

    setSavingStudent(true);
    try {
      if (editingStudent) {
        await updateStudent(editingStudent.id, editingStudent, parsed.data);
      } else {
        await createStudent(parsed.data);
      }
      setStudentModalOpen(false);
    } catch (err) {
      setStudentFormError(
        err instanceof Error ? err.message : 'Không thể lưu hồ sơ học sinh.'
      );
    } finally {
      setSavingStudent(false);
    }
  };

  const handleCopyAccessCode = (student: Student) => {
    navigator.clipboard.writeText(student.accessCode);
    setCopiedCodeId(student.id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const handleQuickToggleStudentArchive = async (st: Student) => {
    const nextStatus = st.status === 'archived' ? 'active' : 'archived';
    await updateStudent(st.id, st, {
      fullName: st.fullName,
      nickname: st.nickname || '',
      avatarUrl: st.avatarUrl || '',
      grade: st.grade,
      classIds: st.classIds || [],
      dob: st.dob || '',
      internalNotes: st.internalNotes || '',
      status: nextStatus,
    });
  };

  const handleConfirmRemoveFromClass = async () => {
    if (!removingStudent || !activeDetailClass) return;
    setRemovingLoading(true);
    try {
      const updatedClassIds = (removingStudent.classIds || []).filter(
        (id) => id !== activeDetailClass.id
      );
      await updateStudent(removingStudent.id, removingStudent, {
        fullName: removingStudent.fullName,
        nickname: removingStudent.nickname || '',
        avatarUrl: removingStudent.avatarUrl || '',
        grade: removingStudent.grade,
        classIds: updatedClassIds,
        dob: removingStudent.dob || '',
        internalNotes: removingStudent.internalNotes || '',
        status: removingStudent.status,
      });
      setRemovingStudent(null);
    } finally {
      setRemovingLoading(false);
    }
  };

  const handleAssignExistingStudentToClass = async (st: Student) => {
    if (!activeDetailClass) return;
    setAssigningStudentId(st.id);
    try {
      const updatedClassIds = Array.from(
        new Set([...(st.classIds || []), activeDetailClass.id])
      );
      await updateStudent(st.id, st, {
        fullName: st.fullName,
        nickname: st.nickname || '',
        avatarUrl: st.avatarUrl || '',
        grade: st.grade,
        classIds: updatedClassIds,
        dob: st.dob || '',
        internalNotes: st.internalNotes || '',
        status: st.status,
      });
    } finally {
      setAssigningStudentId(null);
    }
  };

  // ==========================================================================
  // VIEW 1: DEDICATED CLASS DETAIL SCREEN (/admin/classes/:classId)
  // ==========================================================================
  if (classId) {
    if (!activeDetailClass) {
      return (
        <div className="studio-skin space-y-4">
          <button type="button" onClick={() => navigate('/admin/classes')} className="studio-btn studio-btn-secondary">
            <ArrowLeft className="h-4 w-4" />
            Danh sách lớp học
          </button>
          <EmptyState icon={School} tone="gray" title="Không tìm thấy lớp học này" text="Lớp có thể không tồn tại hoặc dữ liệu đang được tải." />
        </div>
      );
    }

    const classStudentsAll = students.filter((s) =>
      s.classIds.includes(activeDetailClass.id)
    );
    const filteredClassStudents = classStudentsAll.filter((st) => {
      if (studentStatusFilter !== 'all' && st.status !== studentStatusFilter) {
        return false;
      }
      const q = studentSearchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        st.fullName.toLowerCase().includes(q) ||
        (st.nickname || '').toLowerCase().includes(q) ||
        st.accessCode.toLowerCase().includes(q)
      );
    });

    const unassignedStudents = students.filter(
      (s) =>
        !s.classIds.includes(activeDetailClass.id) &&
        (existingSearchQuery.trim() === '' ||
          s.fullName
            .toLowerCase()
            .includes(existingSearchQuery.trim().toLowerCase()) ||
          s.accessCode
            .toLowerCase()
            .includes(existingSearchQuery.trim().toLowerCase()))
    );

    const classAssignments = assignments.filter((a) =>
      (a.classIds || []).includes(activeDetailClass.id)
    );

    const archivedClass = activeDetailClass.status !== 'active';
    const studentCounts = {
      all: classStudentsAll.length,
      active: classStudentsAll.filter((s) => s.status === 'active').length,
      dropped: classStudentsAll.filter((s) => s.status === 'dropped').length,
      archived: classStudentsAll.filter((s) => s.status === 'archived').length,
    };

    return (
      <div className="studio-skin space-y-6">
        <button type="button" onClick={() => navigate('/admin/classes')} className="studio-btn studio-btn-secondary">
          <ArrowLeft className="h-4 w-4" />
          Danh sách lớp học
        </button>

        <PageHeader
          icon={School}
          tone={archivedClass ? 'gray' : 'blue'}
          eyebrow={
            <span className="flex flex-wrap items-center gap-2">
              {activeDetailClass.grade} · Năm học {activeDetailClass.schoolYear}
              <StatusBadge kind={archivedClass ? 'neutral' : 'success'}>{archivedClass ? 'Đã lưu trữ' : 'Đang hoạt động'}</StatusBadge>
            </span>
          }
          title={activeDetailClass.name}
          description={activeDetailClass.description}
          actions={
            <>
              <button type="button" onClick={() => openEditClassModal(activeDetailClass)} className="studio-btn studio-btn-secondary">
                <Edit3 className="h-4 w-4" />
                Sửa thông tin lớp
              </button>
              <button type="button" onClick={() => toggleArchiveClassRoom(activeDetailClass)} className="studio-btn studio-btn-secondary text-[#B7790A]">
                {archivedClass ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {archivedClass ? 'Khôi phục lớp' : 'Lưu trữ lớp'}
              </button>
            </>
          }
        />

        <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard icon={Users} tone="blue" label="Sĩ số đang học" value={studentCounts.active} note={`Tổng ${studentCounts.all} hồ sơ`} />
          <StatCard icon={BookOpen} tone="yellow" label="Đợt bài tập đã giao" value={classAssignments.length} />
          <StatCard icon={UserMinus} tone="pink" label="Nghỉ học" value={studentCounts.dropped} />
          <StatCard icon={Archive} tone="gray" label="Hồ sơ lưu trữ" value={studentCounts.archived} />
        </section>

        {/* ================================================================ */}
        {/* STUDENT CRUD SECTION INSIDE CLASS DETAIL                         */}
        {/* ================================================================ */}
        <div className="space-y-4">
          <SectionHeading
            icon={Users}
            title="Học sinh của lớp"
            note="Thêm mới, sửa hồ sơ, sao chép mã 6 ký tự hoặc gỡ học sinh khỏi lớp."
            actions={
              <>
                <button
                  type="button"
                  onClick={() => {
                    setExistingSearchQuery('');
                    setAssignExistingModalOpen(true);
                  }}
                  className="studio-btn studio-btn-secondary"
                >
                  <Users className="h-4 w-4 text-[#2563EB]" />
                  Gán học sinh đã có ({unassignedStudents.length})
                </button>
                <button type="button" onClick={() => openCreateStudentInClassModal(activeDetailClass)} className="studio-btn studio-btn-primary">
                  <UserPlus className="h-4 w-4" />
                  Thêm học sinh mới
                </button>
              </>
            }
          />

          {classStudentsAll.length > 0 && (
            <Toolbar>
              <SearchInput value={studentSearchQuery} onChange={setStudentSearchQuery} placeholder="Tìm theo họ tên, tên gọi hoặc mã 6 ký tự…" />
              <SegmentedFilter
                label="Trạng thái học sinh"
                value={studentStatusFilter}
                onChange={setStudentStatusFilter}
                options={[
                  { id: 'all', label: 'Tất cả', count: studentCounts.all },
                  { id: 'active', label: 'Đang học', count: studentCounts.active },
                  { id: 'dropped', label: 'Nghỉ học', count: studentCounts.dropped },
                  { id: 'archived', label: 'Lưu trữ', count: studentCounts.archived },
                ]}
              />
            </Toolbar>
          )}

          {/* Students Table */}
          {filteredClassStudents.length === 0 ? (
            classStudentsAll.length === 0 ? (
              <EmptyState
                icon={UserPlus}
                tone="green"
                title="Lớp chưa có học sinh"
                text="Thêm học sinh mới (mỗi em sẽ nhận một mã 6 ký tự để vào cổng học sinh) hoặc gán học sinh đã có vào lớp."
                action={
                  <button type="button" onClick={() => openCreateStudentInClassModal(activeDetailClass)} className="studio-btn studio-btn-primary">
                    <UserPlus className="h-4 w-4" />
                    Thêm học sinh đầu tiên
                  </button>
                }
              />
            ) : (
              <EmptyState icon={Search} tone="gray" title="Không có học sinh phù hợp" text="Thử từ khóa hoặc trạng thái khác." />
            )
          ) : (
            <div className="cartoon-card overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#DCE7F3] bg-[#F6FAFF] text-xs font-bold tracking-wide text-[#5E6C84] uppercase">
                      <th className="px-4 py-3.5">Học sinh</th>
                      <th className="px-4 py-3.5">Khối</th>
                      <th className="px-4 py-3.5">Mã truy cập (6 ký tự)</th>
                      <th className="px-4 py-3.5">Ghi chú nội bộ (GV)</th>
                      <th className="px-4 py-3.5">Trạng thái</th>
                      <th className="px-4 py-3.5 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF3F9]">
                    {filteredClassStudents.map((st) => {
                      const statusLabel =
                        st.status === 'active'
                          ? 'Đang học'
                          : st.status === 'dropped'
                          ? 'Nghỉ học'
                          : 'Lưu trữ';
                      const statusColor =
                        st.status === 'active'
                          ? 'text-[#1F9D6B]'
                          : st.status === 'dropped'
                          ? 'text-rose-700'
                          : 'text-amber-700';

                      return (
                        <tr
                          key={st.id}
                          className="transition-colors hover:bg-amber-50/40"
                        >
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#DCE7F3] bg-[#EAF5FF] font-display text-sm font-extrabold text-[#172B4D]">
                                {st.fullName.slice(0, 1).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-[#172B4D]">
                                  {st.fullName}
                                </div>
                                <div className="text-xs text-[#5E6C84]">
                                  {st.nickname
                                    ? `Biệt danh: ${st.nickname}`
                                    : st.dob
                                    ? `NS: ${st.dob}`
                                    : 'Học sinh'}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-xs font-semibold text-[#3B4A66]">
                            {st.grade}
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-lg border border-[#DCE7F3] bg-amber-200 px-2.5 py-1 font-mono text-xs font-black tracking-wider text-[#172B4D]">
                                <KeyRound className="h-3 w-3" />
                                {st.accessCode}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyAccessCode(st)}
                                className="cartoon-button flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-[#172B4D]"
                                title="Sao chép mã gửi phụ huynh"
                              >
                                {copiedCodeId === st.id ? (
                                  <>
                                    <Check className="h-3 w-3 text-[#1F9D6B]" />
                                    Đã chép
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" />
                                    Sao chép
                                  </>
                                )}
                              </button>
                            </div>
                          </td>

                          <td className="max-w-xs px-4 py-3.5 text-xs text-[#5E6C84]">
                            <span className="line-clamp-2">
                              {st.internalNotes || '—'}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 text-xs">
                            <span className={`font-bold ${statusColor}`}>
                              {statusLabel}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditStudentInClassModal(st)}
                                className="cartoon-button inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-[#172B4D]"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                Sửa
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuickToggleStudentArchive(st)
                                }
                                className="cartoon-button inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-amber-800"
                                title={
                                  st.status === 'archived'
                                    ? 'Khôi phục trạng thái đang học'
                                    : 'Lưu trữ hồ sơ học sinh'
                                }
                              >
                                {st.status === 'archived' ? (
                                  <>
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    Khôi phục
                                  </>
                                ) : (
                                  <>
                                    <Archive className="h-3.5 w-3.5" />
                                    Lưu trữ
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => setRemovingStudent(st)}
                                className="cartoon-button inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700"
                                title="Gỡ học sinh khỏi lớp này"
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                                Gỡ khỏi lớp
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ================================================================ */}
        {/* ASSIGNMENTS ASSIGNED TO THIS CLASS                               */}
        {/* ================================================================ */}
        <div className="cartoon-card bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[#2563EB]" />
              <h3 className="font-display text-base font-extrabold text-[#172B4D]">
                Bài tập đã giao cho lớp
              </h3>
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin/assignments')}
              className="text-xs font-bold text-[#2563EB] hover:underline"
            >
              Quản lý giao bài →
            </button>
          </div>

          {classAssignments.length === 0 ? (
            <p className="mt-3 text-xs text-[#5E6C84]">
              Chưa có đợt BTVN nào được giao cho lớp này.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {classAssignments.map((asg) => (
                <div
                  key={asg.id}
                  className="rounded-xl border border-[#DCE7F3] bg-[#F6FAFF] p-3.5 text-xs"
                >
                  <div className="font-bold text-[#172B4D]">{asg.title}</div>
                  <div className="mt-1 text-[#5E6C84]">
                    Ngày giao: {asg.assignedAt} · Hạn nộp: {asg.dueAt}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ================================================================ */}
        {/* MODAL: CREATE / EDIT STUDENT INSIDE CLASS                        */}
        {/* ================================================================ */}
        {studentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E3A8A]/40 backdrop-blur-[2px] p-4">
            <div className="cartoon-card max-h-[90vh] w-full max-w-xl overflow-y-auto bg-white p-6">
              <div className="flex items-center justify-between border-b border-[#EEF3F9] pb-3">
                <h2 className="font-display text-lg font-extrabold text-[#172B4D]">
                  {editingStudent
                    ? `Chỉnh Sửa Học Sinh (${editingStudent.accessCode})`
                    : `Thêm Học Sinh Vào Lớp ${activeDetailClass.name}`}
                </h2>
                <button
                  type="button"
                  onClick={() => setStudentModalOpen(false)}
                  className="rounded-lg border border-[#DCE7F3] p-1 hover:bg-[#F6FAFF]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleStudentSubmit} className="mt-4 space-y-4">
                {studentFormError && (
                  <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                    {studentFormError}
                  </div>
                )}

                {!editingStudent && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    Hệ thống sẽ tự động sinh <strong>Mã 6 ký tự duy nhất</strong>{' '}
                    phía máy chủ và gán học sinh vào lớp{' '}
                    <strong>{activeDetailClass.name}</strong>.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                      Họ và tên học sinh *
                    </label>
                    <input
                      type="text"
                      required
                      value={studentFormValues.fullName}
                      onChange={(e) =>
                        setStudentFormValues({
                          ...studentFormValues,
                          fullName: e.target.value,
                        })
                      }
                      placeholder="Ví dụ: Nguyễn Minh Khôi"
                      className="w-full rounded-xl border border-[#DCE7F3] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                      Biệt danh (Nickname)
                    </label>
                    <input
                      type="text"
                      value={studentFormValues.nickname || ''}
                      onChange={(e) =>
                        setStudentFormValues({
                          ...studentFormValues,
                          nickname: e.target.value,
                        })
                      }
                      placeholder="Ví dụ: Bé Khôi"
                      className="w-full rounded-xl border border-[#DCE7F3] px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                      Khối / Lớp *
                    </label>
                    <select
                      value={studentFormValues.grade}
                      onChange={(e) =>
                        setStudentFormValues({
                          ...studentFormValues,
                          grade: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border border-[#DCE7F3] bg-white px-3 py-2 text-sm"
                    >
                      {GRADE_OPTIONS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                      Ngày sinh
                    </label>
                    <input
                      type="date"
                      value={studentFormValues.dob || ''}
                      onChange={(e) =>
                        setStudentFormValues({
                          ...studentFormValues,
                          dob: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border border-[#DCE7F3] px-3 py-2 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                      Trạng thái
                    </label>
                    <select
                      value={studentFormValues.status}
                      onChange={(e) =>
                        setStudentFormValues({
                          ...studentFormValues,
                          status: e.target.value as
                            | 'active'
                            | 'dropped'
                            | 'archived',
                        })
                      }
                      className="w-full rounded-xl border border-[#DCE7F3] bg-white px-3 py-2 text-sm"
                    >
                      <option value="active">Đang theo học</option>
                      <option value="dropped">Đã nghỉ học</option>
                      <option value="archived">Đã lưu trữ</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-[#3B4A66]">
                    Các lớp đang tham gia
                  </label>
                  <div className="grid max-h-36 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-[#DCE7F3] bg-[#F6FAFF] p-3 sm:grid-cols-2">
                    {classes.map((cls) => {
                      const checked = studentFormValues.classIds.includes(
                        cls.id
                      );
                      return (
                        <label
                          key={cls.id}
                          className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#172B4D]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              toggleStudentClassSelection(cls.id)
                            }
                            className="h-4 w-4 rounded border-[#DCE7F3]"
                          />
                          <span>
                            {cls.name} ({cls.grade})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                    Ghi chú nội bộ của giáo viên (Phụ huynh/Học sinh KHÔNG nhìn
                    thấy)
                  </label>
                  <textarea
                    rows={3}
                    value={studentFormValues.internalNotes || ''}
                    onChange={(e) =>
                      setStudentFormValues({
                        ...studentFormValues,
                        internalNotes: e.target.value,
                      })
                    }
                    placeholder="Ghi chú riêng về lực học, tính cách hoặc lưu ý cần rèn thêm..."
                    className="w-full rounded-xl border border-[#DCE7F3] px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStudentModalOpen(false)}
                    className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#3B4A66]"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={savingStudent}
                    className="cartoon-button rounded-xl bg-[#1F9D6B] px-5 py-2 text-xs font-extrabold text-white"
                  >
                    {savingStudent
                      ? 'Đang xử lý...'
                      : editingStudent
                      ? 'Cập Nhật Hồ Sơ'
                      : 'Tạo Học Sinh & Cấp Mã'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* MODAL: ASSIGN EXISTING STUDENT TO THIS CLASS                     */}
        {/* ================================================================ */}
        {assignExistingModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E3A8A]/40 backdrop-blur-[2px] p-4">
            <div className="cartoon-card max-h-[85vh] w-full max-w-lg overflow-y-auto bg-white p-6">
              <div className="flex items-center justify-between border-b border-[#EEF3F9] pb-3">
                <h2 className="font-display text-lg font-extrabold text-[#172B4D]">
                  Gán Học Sinh Đã Có Vào Lớp {activeDetailClass.name}
                </h2>
                <button
                  type="button"
                  onClick={() => setAssignExistingModalOpen(false)}
                  className="rounded-lg border border-[#DCE7F3] p-1 hover:bg-[#F6FAFF]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4">
                <input
                  type="text"
                  value={existingSearchQuery}
                  onChange={(e) => setExistingSearchQuery(e.target.value)}
                  placeholder="Tìm học sinh theo tên hoặc mã 6 ký tự..."
                  className="w-full rounded-xl border border-[#DCE7F3] px-3 py-2 text-sm"
                />

                <div className="mt-3 max-h-72 divide-y divide-[#EEF3F9] overflow-y-auto rounded-xl border border-[#DCE7F3]">
                  {unassignedStudents.map((st) => (
                    <div
                      key={st.id}
                      className="flex items-center justify-between px-3.5 py-2.5 text-xs"
                    >
                      <div>
                        <div className="font-bold text-[#172B4D]">
                          {st.fullName}
                        </div>
                        <div className="text-[#5E6C84]">
                          {st.grade} · Mã:{' '}
                          <span className="font-mono font-bold">
                            {st.accessCode}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={assigningStudentId === st.id}
                        onClick={() => handleAssignExistingStudentToClass(st)}
                        className="cartoon-button rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-extrabold text-white"
                      >
                        {assigningStudentId === st.id
                          ? 'Đang thêm...'
                          : '+ Thêm vào lớp'}
                      </button>
                    </div>
                  ))}
                  {unassignedStudents.length === 0 && (
                    <div className="p-6 text-center text-xs text-[#5E6C84]">
                      Tất cả học sinh trong hệ thống đều đã có trong lớp này
                      (hoặc không khớp từ khóa tìm kiếm).
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* MODAL: CONFIRM REMOVE STUDENT FROM CLASS                         */}
        {/* ================================================================ */}
        {removingStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E3A8A]/40 backdrop-blur-[2px] p-4">
            <div className="cartoon-card w-full max-w-md bg-white p-6">
              <h3 className="font-display text-lg font-extrabold text-[#172B4D]">
                Gỡ học sinh khỏi lớp {activeDetailClass.name}?
              </h3>
              <p className="mt-2 text-xs text-[#5E6C84]">
                Học sinh <strong>{removingStudent.fullName}</strong> (Mã:{' '}
                <span className="font-mono font-bold">
                  {removingStudent.accessCode}
                </span>
                ) sẽ được gỡ khỏi danh sách lớp{' '}
                <strong>{activeDetailClass.name}</strong>. Hồ sơ gốc và lịch sử
                bài làm của học sinh vẫn được giữ nguyên trong hệ thống.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRemovingStudent(null)}
                  className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#3B4A66]"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={removingLoading}
                  onClick={handleConfirmRemoveFromClass}
                  className="cartoon-button rounded-xl bg-rose-600 px-4 py-2 text-xs font-extrabold text-white"
                >
                  {removingLoading ? 'Đang gỡ...' : 'Xác nhận gỡ khỏi lớp'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Class Edit Modal (reused when clicking "Sửa thông tin lớp" in Detail View) */}
        {classModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E3A8A]/40 backdrop-blur-[2px] p-4">
            <div className="cartoon-card max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-6">
              <div className="flex items-center justify-between border-b border-[#EEF3F9] pb-3">
                <h2 className="font-display text-lg font-extrabold text-[#172B4D]">
                  {editingClass ? 'Chỉnh Sửa Lớp Học' : 'Tạo Lớp Học Mới'}
                </h2>
                <button
                  type="button"
                  onClick={() => setClassModalOpen(false)}
                  className="rounded-lg border border-[#DCE7F3] p-1 hover:bg-[#F6FAFF]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleClassSubmit} className="mt-4 space-y-4">
                {classFormError && (
                  <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                    {classFormError}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                    Tên lớp học *
                  </label>
                  <input
                    type="text"
                    required
                    value={classFormValues.name}
                    onChange={(e) =>
                      setClassFormValues({
                        ...classFormValues,
                        name: e.target.value,
                      })
                    }
                    placeholder="Ví dụ: Toán Tư Duy 5A"
                    className="w-full rounded-xl border border-[#DCE7F3] px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                      Khối / Lớp *
                    </label>
                    <select
                      value={classFormValues.grade}
                      onChange={(e) =>
                        setClassFormValues({
                          ...classFormValues,
                          grade: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border border-[#DCE7F3] bg-white px-3 py-2 text-sm"
                    >
                      {GRADE_OPTIONS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                      Năm học *
                    </label>
                    <input
                      type="text"
                      required
                      value={classFormValues.schoolYear}
                      onChange={(e) =>
                        setClassFormValues({
                          ...classFormValues,
                          schoolYear: e.target.value,
                        })
                      }
                      placeholder="2026-2027"
                      className="w-full rounded-xl border border-[#DCE7F3] px-3 py-2 font-mono text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                    Mô tả lớp học
                  </label>
                  <textarea
                    rows={3}
                    value={classFormValues.description || ''}
                    onChange={(e) =>
                      setClassFormValues({
                        ...classFormValues,
                        description: e.target.value,
                      })
                    }
                    placeholder="Mục tiêu lớp học, giáo trình hoặc ghi chú chung..."
                    className="w-full rounded-xl border border-[#DCE7F3] px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setClassModalOpen(false)}
                    className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#3B4A66]"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={savingClass}
                    className="cartoon-button rounded-xl bg-[#2563EB] px-5 py-2 text-xs font-extrabold text-white"
                  >
                    {savingClass ? 'Đang lưu...' : 'Lưu Lớp Học'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================================================
  // VIEW 2: CLASSES LIST SCREEN (/admin/classes)
  // ==========================================================================
  const grades = Array.from(new Set(classes.map((c) => c.grade)));

  const filteredClasses = classes.filter((cls) => {
    if (statusFilter !== 'all' && cls.status !== statusFilter) return false;
    if (gradeFilter !== 'all' && cls.grade !== gradeFilter) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      cls.name.toLowerCase().includes(q) ||
      cls.grade.toLowerCase().includes(q) ||
      cls.schoolYear.toLowerCase().includes(q) ||
      (cls.description || '').toLowerCase().includes(q)
    );
  });

  const activeCount = classes.filter((c) => c.status === 'active').length;
  const filtersOn = searchQuery.trim() !== '' || statusFilter !== 'all' || gradeFilter !== 'all';

  return (
    <div className="studio-skin space-y-6">
      <PageHeader
        icon={School}
        title="Lớp học"
        description="Tạo lớp, theo dõi sĩ số và mở từng lớp để quản lý học sinh và bài tập đã giao."
        actions={
          <button type="button" onClick={openCreateClassModal} className="studio-btn studio-btn-primary">
            <Plus className="h-4 w-4" />
            Tạo lớp học
          </button>
        }
      />

      {classes.length > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard icon={School} tone="blue" label="Tổng số lớp" value={classes.length} note={`${grades.length} khối lớp`} />
          <StatCard icon={CheckCircle2} tone="green" label="Đang hoạt động" value={activeCount} note="Lớp đang dạy" />
          <StatCard icon={Users} tone="yellow" label="Học sinh trong lớp" value={students.filter((s) => s.classIds.length > 0).length} note={`Tổng ${students.length} học sinh`} />
          <StatCard icon={Archive} tone="gray" label="Đã lưu trữ" value={classes.length - activeCount} note="Giữ lại lịch sử học tập" />
        </section>
      )}

      {classes.length > 0 && (
        <Toolbar>
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Tìm theo tên lớp, khối, năm học hoặc mô tả…" />
          <div className="flex flex-wrap items-center gap-3">
            <FilterSelect label="Khối" value={gradeFilter} onChange={setGradeFilter}>
              <option value="all">Tất cả</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </FilterSelect>
            <SegmentedFilter
              label="Trạng thái lớp"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { id: 'all', label: 'Tất cả', count: classes.length },
                { id: 'active', label: 'Đang hoạt động', count: activeCount },
                { id: 'archived', label: 'Lưu trữ', count: classes.length - activeCount },
              ]}
            />
          </div>
        </Toolbar>
      )}

      {classes.length === 0 ? (
        <EmptyState
          icon={School}
          title="Chưa có lớp học nào"
          text="Bắt đầu bằng việc tạo lớp đầu tiên, ví dụ “Lớp 3A – 2026-2027”. Sau đó thêm học sinh để mỗi em nhận mã 6 ký tự vào cổng học sinh."
          action={
            <button type="button" onClick={openCreateClassModal} className="studio-btn studio-btn-primary">
              <Plus className="h-4 w-4" />
              Tạo lớp học đầu tiên
            </button>
          }
        />
      ) : filteredClasses.length === 0 ? (
        <EmptyState
          icon={Search}
          tone="gray"
          title="Không tìm thấy lớp phù hợp"
          text="Thử từ khóa khác hoặc bỏ bớt bộ lọc."
          action={
            filtersOn && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setGradeFilter('all');
                }}
                className="studio-btn studio-btn-secondary"
              >
                Xóa bộ lọc
              </button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredClasses.map((cls) => {
            const classStudents = students.filter((s) => s.classIds.includes(cls.id));
            const activeStudents = classStudents.filter((s) => s.status === 'active').length;
            const classAssignments = assignments.filter((a) => (a.classIds || []).includes(cls.id));
            const archived = cls.status === 'archived';
            return (
              <article
                key={cls.id}
                className={`studio-card group flex flex-col p-5 transition hover:shadow-[var(--studio-shadow-hover)] ${archived ? 'bg-[#FAFBFD]' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => navigate(`/admin/classes/${cls.id}`)} className="flex min-w-0 items-center gap-3 text-left">
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-display text-base font-extrabold ${
                        archived ? STUDIO_TONE.gray : STUDIO_TONE.blue
                      }`}
                    >
                      {cls.name.replace(/^(lớp|lop)\s*/i, '').slice(0, 3).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-display text-lg font-extrabold text-[#172B4D] group-hover:text-[#2563EB]">{cls.name}</span>
                      <span className="block text-xs text-[#5E6C84]">
                        {cls.grade} · Năm học {cls.schoolYear}
                      </span>
                    </span>
                  </button>
                  <StatusBadge kind={archived ? 'neutral' : 'success'}>{archived ? 'Lưu trữ' : 'Đang hoạt động'}</StatusBadge>
                </div>

                {cls.description ? (
                  <p className="mt-3 line-clamp-2 text-sm text-[#5E6C84]">{cls.description}</p>
                ) : (
                  <p className="mt-3 text-sm text-[#94A3B8] italic">Chưa có mô tả</p>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-[#F6FAFF] px-3 py-2">
                    <div className="font-display text-xl font-extrabold text-[#172B4D] [font-variant-numeric:tabular-nums]">{activeStudents}</div>
                    <div className="text-xs text-[#5E6C84]">
                      Sĩ số{classStudents.length > activeStudents ? ` (+${classStudents.length - activeStudents} lưu trữ)` : ''}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#FFF8E6] px-3 py-2">
                    <div className="font-display text-xl font-extrabold text-[#172B4D] [font-variant-numeric:tabular-nums]">{classAssignments.length}</div>
                    <div className="text-xs text-[#5E6C84]">Bài tập đã giao</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#EEF3F9] pt-4">
                  <button type="button" onClick={() => navigate(`/admin/classes/${cls.id}`)} className="studio-btn studio-btn-primary flex-1">
                    <Eye className="h-4 w-4" />
                    Quản lý lớp
                  </button>
                  <button type="button" onClick={() => openEditClassModal(cls)} className="studio-btn studio-btn-secondary px-3" title="Sửa thông tin lớp">
                    <Edit3 className="h-4 w-4" />
                    <span className="sr-only sm:not-sr-only">Sửa</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleArchiveClassRoom(cls)}
                    className="studio-btn studio-btn-secondary px-3 text-[#B7790A]"
                    title="Không xóa hẳn lớp học để giữ lịch sử học tập"
                  >
                    {archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                    <span className="sr-only sm:not-sr-only">{archived ? 'Khôi phục' : 'Lưu trữ'}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Create / Edit Class Modal */}
      {classModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E3A8A]/40 backdrop-blur-[2px] p-4">
          <div className="cartoon-card max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-6">
            <div className="flex items-center justify-between border-b border-[#EEF3F9] pb-3">
              <h2 className="font-display text-lg font-extrabold text-[#172B4D]">
                {editingClass ? 'Chỉnh Sửa Lớp Học' : 'Tạo Lớp Học Mới'}
              </h2>
              <button
                type="button"
                onClick={() => setClassModalOpen(false)}
                className="rounded-lg border border-[#DCE7F3] p-1 hover:bg-[#F6FAFF]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleClassSubmit} className="mt-4 space-y-4">
              {classFormError && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                  {classFormError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                  Tên lớp học *
                </label>
                <input
                  type="text"
                  required
                  value={classFormValues.name}
                  onChange={(e) =>
                    setClassFormValues({
                      ...classFormValues,
                      name: e.target.value,
                    })
                  }
                  placeholder="Ví dụ: Toán Tư Duy 5A"
                  className="w-full rounded-xl border border-[#DCE7F3] px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                    Khối / Lớp *
                  </label>
                  <select
                    value={classFormValues.grade}
                    onChange={(e) =>
                      setClassFormValues({
                        ...classFormValues,
                        grade: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-[#DCE7F3] bg-white px-3 py-2 text-sm"
                  >
                    {GRADE_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                    Năm học *
                  </label>
                  <input
                    type="text"
                    required
                    value={classFormValues.schoolYear}
                    onChange={(e) =>
                      setClassFormValues({
                        ...classFormValues,
                        schoolYear: e.target.value,
                      })
                    }
                    placeholder="2026-2027"
                    className="w-full rounded-xl border border-[#DCE7F3] px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                  Mô tả lớp học
                </label>
                <textarea
                  rows={3}
                  value={classFormValues.description || ''}
                  onChange={(e) =>
                    setClassFormValues({
                      ...classFormValues,
                      description: e.target.value,
                    })
                  }
                  placeholder="Mục tiêu lớp học, giáo trình hoặc ghi chú chung..."
                  className="w-full rounded-xl border border-[#DCE7F3] px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setClassModalOpen(false)}
                  className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#3B4A66]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingClass}
                  className="cartoon-button rounded-xl bg-[#2563EB] px-5 py-2 text-xs font-extrabold text-white"
                >
                  {savingClass ? 'Đang lưu...' : 'Lưu Lớp Học'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
