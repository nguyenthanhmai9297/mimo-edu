import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  Edit3,
  Eye,
  KeyRound,
  Plus,
  RotateCcw,
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
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => navigate('/admin/classes')}
            className="cartoon-button inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Quay lại Danh sách Lớp học
          </button>
          <div className="cartoon-card bg-white p-12 text-center">
            <p className="font-display text-lg font-extrabold text-slate-900">
              Không tìm thấy lớp học này
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Lớp học có thể không tồn tại hoặc đang được tải.
            </p>
          </div>
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

    return (
      <div className="space-y-6">
        {/* Top Navigation & Class Info Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/classes')}
            className="cartoon-button inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Quay lại Danh sách Lớp học
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openEditClassModal(activeDetailClass)}
              className="cartoon-button inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-slate-800"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Sửa thông tin lớp
            </button>
            <button
              type="button"
              onClick={() => toggleArchiveClassRoom(activeDetailClass)}
              className="cartoon-button inline-flex items-center gap-1.5 rounded-xl bg-amber-100 px-3.5 py-2 text-xs font-bold text-amber-900"
            >
              {activeDetailClass.status === 'active' ? (
                <>
                  <Archive className="h-3.5 w-3.5" />
                  Lưu trữ lớp
                </>
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Khôi phục lớp
                </>
              )}
            </button>
          </div>
        </div>

        {/* Class Header Card */}
        <div className="cartoon-card bg-gradient-to-r from-sky-100 via-white to-amber-50 p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="font-bold text-blue-700">
                  {activeDetailClass.grade}
                </span>
                <span>·</span>
                <span className="font-mono">
                  Năm học {activeDetailClass.schoolYear}
                </span>
                <span>·</span>
                <span
                  className={
                    activeDetailClass.status === 'active'
                      ? 'font-bold text-emerald-700'
                      : 'font-bold text-amber-700'
                  }
                >
                  {activeDetailClass.status === 'active'
                    ? 'Đang hoạt động'
                    : 'Đã lưu trữ'}
                </span>
              </div>

              <h1 className="mt-1 font-display text-2xl font-extrabold text-slate-900 sm:text-3xl">
                {activeDetailClass.name}
              </h1>

              {activeDetailClass.description && (
                <p className="mt-2 max-w-3xl text-sm text-slate-700">
                  {activeDetailClass.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 self-start lg:self-center">
              <div className="rounded-2xl border-2 border-slate-900 bg-white px-4 py-3 text-center">
                <div className="font-mono text-2xl font-black text-slate-900 tabular-nums">
                  {classStudentsAll.length}
                </div>
                <div className="text-xs font-bold text-slate-600">
                  Học sinh trong lớp
                </div>
              </div>
              <div className="rounded-2xl border-2 border-slate-900 bg-white px-4 py-3 text-center">
                <div className="font-mono text-2xl font-black text-blue-700 tabular-nums">
                  {classAssignments.length}
                </div>
                <div className="text-xs font-bold text-slate-600">
                  Đợt BTVN đã giao
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/* STUDENT CRUD SECTION INSIDE CLASS DETAIL                         */}
        {/* ================================================================ */}
        <div className="space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-display text-xl font-extrabold text-slate-900">
                Danh Sách Học Sinh Lớp {activeDetailClass.name}
              </h2>
              <p className="text-xs text-slate-600">
                Thêm mới, chỉnh sửa hồ sơ, sao chép mã truy cập 6 ký tự hoặc gỡ
                học sinh khỏi lớp.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setExistingSearchQuery('');
                  setAssignExistingModalOpen(true);
                }}
                className="cartoon-button flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2.5 text-xs font-extrabold text-slate-800 whitespace-nowrap"
              >
                <Users className="h-4 w-4 text-blue-600" />
                Gán Học Sinh Đã Có ({unassignedStudents.length})
              </button>
              <button
                type="button"
                onClick={() => openCreateStudentInClassModal(activeDetailClass)}
                className="cartoon-button flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white whitespace-nowrap"
              >
                <UserPlus className="h-4 w-4" />
                Thêm Học Sinh Mới Vào Lớp
              </button>
            </div>
          </div>

          {/* Search & Status Filter for Students in Class */}
          <div className="cartoon-card flex flex-col justify-between gap-4 bg-white p-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={studentSearchQuery}
                onChange={(e) => setStudentSearchQuery(e.target.value)}
                placeholder="Tìm học sinh trong lớp theo họ tên, biệt danh hoặc mã 6 ký tự..."
                className="w-full rounded-xl border-2 border-slate-800 bg-white py-2 pr-4 pl-10 text-sm focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-xl border-2 border-slate-800 bg-slate-100 p-1">
              {(
                [
                  { id: 'all', label: 'Tất cả' },
                  { id: 'active', label: 'Đang theo học' },
                  { id: 'dropped', label: 'Nghỉ học' },
                  { id: 'archived', label: 'Đã lưu trữ' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStudentStatusFilter(tab.id)}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors whitespace-nowrap ${
                    studentStatusFilter === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Students Table */}
          {filteredClassStudents.length === 0 ? (
            <div className="cartoon-card bg-white p-10 text-center">
              <p className="font-display text-base font-bold text-slate-800">
                Chưa có học sinh nào trong danh sách này
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Nhấn &ldquo;Thêm Học Sinh Mới Vào Lớp&rdquo; hoặc &ldquo;Gán Học
                Sinh Đã Có&rdquo; để bắt đầu.
              </p>
            </div>
          ) : (
            <div className="cartoon-card overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-800 bg-amber-100/70 text-xs font-extrabold text-slate-800">
                      <th className="px-4 py-3.5">Học sinh</th>
                      <th className="px-4 py-3.5">Khối</th>
                      <th className="px-4 py-3.5">Mã truy cập (6 ký tự)</th>
                      <th className="px-4 py-3.5">Ghi chú nội bộ (GV)</th>
                      <th className="px-4 py-3.5">Trạng thái</th>
                      <th className="px-4 py-3.5 text-right">Thao tác CRUD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredClassStudents.map((st) => {
                      const statusLabel =
                        st.status === 'active'
                          ? 'Đang học'
                          : st.status === 'dropped'
                          ? 'Nghỉ học'
                          : 'Lưu trữ';
                      const statusColor =
                        st.status === 'active'
                          ? 'text-emerald-700'
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
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-slate-800 bg-sky-100 font-display text-sm font-extrabold text-slate-900">
                                {st.fullName.slice(0, 1).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900">
                                  {st.fullName}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {st.nickname
                                    ? `Biệt danh: ${st.nickname}`
                                    : st.dob
                                    ? `NS: ${st.dob}`
                                    : 'Học sinh'}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-xs font-semibold text-slate-700">
                            {st.grade}
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-lg border-2 border-slate-800 bg-amber-200 px-2.5 py-1 font-mono text-xs font-black tracking-wider text-slate-900">
                                <KeyRound className="h-3 w-3" />
                                {st.accessCode}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyAccessCode(st)}
                                className="cartoon-button flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-slate-800"
                                title="Sao chép mã gửi phụ huynh"
                              >
                                {copiedCodeId === st.id ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-600" />
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

                          <td className="max-w-xs px-4 py-3.5 text-xs text-slate-600">
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
                                className="cartoon-button inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800"
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
              <BookOpen className="h-4 w-4 text-blue-600" />
              <h3 className="font-display text-base font-extrabold text-slate-900">
                Các Đợt BTVN Đã Giao Cho Lớp {activeDetailClass.name}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin/assignments')}
              className="text-xs font-bold text-blue-700 hover:underline"
            >
              Quản lý giao bài →
            </button>
          </div>

          {classAssignments.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">
              Chưa có đợt BTVN nào được giao cho lớp này.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {classAssignments.map((asg) => (
                <div
                  key={asg.id}
                  className="rounded-xl border-2 border-slate-800 bg-slate-50 p-3.5 text-xs"
                >
                  <div className="font-bold text-slate-900">{asg.title}</div>
                  <div className="mt-1 text-slate-600">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="cartoon-card max-h-[90vh] w-full max-w-xl overflow-y-auto bg-white p-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h2 className="font-display text-lg font-extrabold text-slate-900">
                  {editingStudent
                    ? `Chỉnh Sửa Học Sinh (${editingStudent.accessCode})`
                    : `Thêm Học Sinh Vào Lớp ${activeDetailClass.name}`}
                </h2>
                <button
                  type="button"
                  onClick={() => setStudentModalOpen(false)}
                  className="rounded-lg border border-slate-300 p-1 hover:bg-slate-100"
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
                    <label className="mb-1 block text-xs font-bold text-slate-700">
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
                      className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
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
                      className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
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
                      className="w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-sm"
                    >
                      {GRADE_OPTIONS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
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
                      className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
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
                      className="w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-sm"
                    >
                      <option value="active">Đang theo học</option>
                      <option value="dropped">Đã nghỉ học</option>
                      <option value="archived">Đã lưu trữ</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">
                    Các lớp đang tham gia
                  </label>
                  <div className="grid max-h-36 grid-cols-1 gap-2 overflow-y-auto rounded-xl border-2 border-slate-800 bg-slate-50 p-3 sm:grid-cols-2">
                    {classes.map((cls) => {
                      const checked = studentFormValues.classIds.includes(
                        cls.id
                      );
                      return (
                        <label
                          key={cls.id}
                          className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-800"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              toggleStudentClassSelection(cls.id)
                            }
                            className="h-4 w-4 rounded border-slate-800"
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
                  <label className="mb-1 block text-xs font-bold text-slate-700">
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
                    className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStudentModalOpen(false)}
                    className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-700"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={savingStudent}
                    className="cartoon-button rounded-xl bg-emerald-600 px-5 py-2 text-xs font-extrabold text-white"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="cartoon-card max-h-[85vh] w-full max-w-lg overflow-y-auto bg-white p-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h2 className="font-display text-lg font-extrabold text-slate-900">
                  Gán Học Sinh Đã Có Vào Lớp {activeDetailClass.name}
                </h2>
                <button
                  type="button"
                  onClick={() => setAssignExistingModalOpen(false)}
                  className="rounded-lg border border-slate-300 p-1 hover:bg-slate-100"
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
                  className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                />

                <div className="mt-3 max-h-72 divide-y divide-slate-200 overflow-y-auto rounded-xl border-2 border-slate-800">
                  {unassignedStudents.map((st) => (
                    <div
                      key={st.id}
                      className="flex items-center justify-between px-3.5 py-2.5 text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          {st.fullName}
                        </div>
                        <div className="text-slate-500">
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
                        className="cartoon-button rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-extrabold text-white"
                      >
                        {assigningStudentId === st.id
                          ? 'Đang thêm...'
                          : '+ Thêm vào lớp'}
                      </button>
                    </div>
                  ))}
                  {unassignedStudents.length === 0 && (
                    <div className="p-6 text-center text-xs text-slate-500">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="cartoon-card w-full max-w-md bg-white p-6">
              <h3 className="font-display text-lg font-extrabold text-slate-900">
                Gỡ học sinh khỏi lớp {activeDetailClass.name}?
              </h3>
              <p className="mt-2 text-xs text-slate-600">
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
                  className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-700"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="cartoon-card max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h2 className="font-display text-lg font-extrabold text-slate-900">
                  {editingClass ? 'Chỉnh Sửa Lớp Học' : 'Tạo Lớp Học Mới'}
                </h2>
                <button
                  type="button"
                  onClick={() => setClassModalOpen(false)}
                  className="rounded-lg border border-slate-300 p-1 hover:bg-slate-100"
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
                  <label className="mb-1 block text-xs font-bold text-slate-700">
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
                    className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
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
                      className="w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-sm"
                    >
                      {GRADE_OPTIONS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
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
                      className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 font-mono text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
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
                    className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setClassModalOpen(false)}
                    className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-700"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={savingClass}
                    className="cartoon-button rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white"
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">
            Quản Lý Lớp Học
          </h1>
          <p className="text-sm text-slate-600">
            Nhấn vào &ldquo;Chi tiết&rdquo; từng lớp để xem và quản lý (thêm, sửa,
            lưu trữ, gỡ) danh sách học sinh trong lớp.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateClassModal}
          className="cartoon-button flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white whitespace-nowrap self-start"
        >
          <Plus className="h-4 w-4" />
          Tạo Lớp Học Mới
        </button>
      </div>

      {/* Filters & Search Bar */}
      <div className="cartoon-card flex flex-col justify-between gap-4 p-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên lớp học, khối/lớp, năm học hoặc mô tả..."
            className="w-full rounded-xl border-2 border-slate-800 bg-white py-2 pr-4 pl-10 text-sm focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-xs font-bold text-slate-800"
          >
            <option value="all">Tất cả khối lớp</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 rounded-xl border-2 border-slate-800 bg-slate-100 p-1">
            {(
              [
                { id: 'all', label: 'Tất cả' },
                { id: 'active', label: 'Đang hoạt động' },
                { id: 'archived', label: 'Lưu trữ' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Classes Grid */}
      {filteredClasses.length === 0 ? (
        <div className="cartoon-card p-12 text-center">
          <p className="font-display text-base font-bold text-slate-800">
            Không tìm thấy lớp học nào phù hợp
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Hãy tạo lớp học mới hoặc thay đổi bộ lọc tìm kiếm.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredClasses.map((cls) => {
            const classStudents = students.filter((s) =>
              s.classIds.includes(cls.id)
            );
            const classAssignments = assignments.filter((a) =>
              (a.classIds || []).includes(cls.id)
            );

            return (
              <div
                key={cls.id}
                className={`cartoon-card flex flex-col justify-between p-5 ${
                  cls.status === 'archived' ? 'bg-slate-50 opacity-85' : 'bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-bold text-blue-700">{cls.grade}</span>
                    <span>·</span>
                    <span className="font-mono">{cls.schoolYear}</span>
                    <span>·</span>
                    <span
                      className={
                        cls.status === 'active'
                          ? 'font-bold text-emerald-700'
                          : 'font-bold text-amber-700'
                      }
                    >
                      {cls.status === 'active' ? 'Đang hoạt động' : 'Đã lưu trữ'}
                    </span>
                  </div>

                  <h3
                    onClick={() => navigate(`/admin/classes/${cls.id}`)}
                    className="mt-2 cursor-pointer font-display text-lg font-extrabold text-slate-900 hover:text-blue-700"
                  >
                    {cls.name}
                  </h3>
                  {cls.description && (
                    <p className="mt-1.5 line-clamp-3 text-xs text-slate-600">
                      {cls.description}
                    </p>
                  )}
                </div>

                <div className="mt-5 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-slate-500" />
                      <span className="font-mono">{classStudents.length}</span> học
                      sinh
                    </span>
                    <span>
                      <span className="font-mono">
                        {classAssignments.length}
                      </span>{' '}
                      bài tập đã giao
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/classes/${cls.id}`)}
                      className="cartoon-button flex items-center gap-1 rounded-lg bg-sky-100 px-3 py-1.5 text-xs font-extrabold text-slate-900"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Chi tiết
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditClassModal(cls)}
                      className="cartoon-button flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleArchiveClassRoom(cls)}
                      className="cartoon-button flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-amber-800"
                      title="Không xóa cứng lớp học để bảo toàn lịch sử học tập"
                    >
                      {cls.status === 'active' ? (
                        <>
                          <Archive className="h-3.5 w-3.5" />
                          Lưu trữ
                        </>
                      ) : (
                        <>
                          <RotateCcw className="h-3.5 w-3.5" />
                          Khôi phục
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Class Modal */}
      {classModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="cartoon-card max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="font-display text-lg font-extrabold text-slate-900">
                {editingClass ? 'Chỉnh Sửa Lớp Học' : 'Tạo Lớp Học Mới'}
              </h2>
              <button
                type="button"
                onClick={() => setClassModalOpen(false)}
                className="rounded-lg border border-slate-300 p-1 hover:bg-slate-100"
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
                <label className="mb-1 block text-xs font-bold text-slate-700">
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
                  className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
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
                    className="w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-sm"
                  >
                    {GRADE_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
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
                    className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
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
                  className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setClassModalOpen(false)}
                  className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingClass}
                  className="cartoon-button rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white"
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
