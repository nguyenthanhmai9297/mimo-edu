import React, { useState } from 'react';
import {
  Archive,
  Edit3,
  Eye,
  Plus,
  RotateCcw,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useAppContext } from '../../app/providers';
import { classFormSchema, ClassFormValues } from '../../schemas/validation';
import {
  createClassRoom,
  toggleArchiveClassRoom,
  updateClassRoom,
} from '../../services/firestoreRepository';
import { ClassRoom } from '../../types/domain';

export const ClassesPage: React.FC = () => {
  const { classes, students, assignments } = useAppContext();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>(
    'all'
  );
  const [gradeFilter, setGradeFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRoom | null>(null);
  const [inspectingClass, setInspectingClass] = useState<ClassRoom | null>(null);

  const [formValues, setFormValues] = useState<ClassFormValues>({
    name: '',
    code: '',
    grade: 'Khối 5',
    subject: 'Toán',
    schoolYear: '2026-2027',
    description: '',
    scheduleText: '',
    startDate: '',
    endDate: '',
    status: 'active',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const grades = Array.from(new Set(classes.map((c) => c.grade)));

  const filteredClasses = classes.filter((cls) => {
    if (statusFilter !== 'all' && cls.status !== statusFilter) return false;
    if (gradeFilter !== 'all' && cls.grade !== gradeFilter) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      cls.name.toLowerCase().includes(q) ||
      cls.code.toLowerCase().includes(q) ||
      cls.grade.toLowerCase().includes(q) ||
      cls.schoolYear.toLowerCase().includes(q)
    );
  });

  const openCreateModal = () => {
    setEditingClass(null);
    setFormValues({
      name: '',
      code: `TOAN-${Math.floor(100 + Math.random() * 900)}`,
      grade: 'Khối 5',
      subject: 'Toán',
      schoolYear: '2026-2027',
      description: '',
      scheduleText: 'Thứ Ba & Thứ Năm (18:00 - 19:30)',
      startDate: '2026-09-05',
      endDate: '2027-05-30',
      status: 'active',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (cls: ClassRoom) => {
    setEditingClass(cls);
    setFormValues({
      name: cls.name,
      code: cls.code,
      grade: cls.grade,
      subject: cls.subject || 'Toán',
      schoolYear: cls.schoolYear,
      description: cls.description || '',
      scheduleText: cls.scheduleText || '',
      startDate: cls.startDate || '',
      endDate: cls.endDate || '',
      status: cls.status,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = classFormSchema.safeParse(formValues);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.');
      return;
    }

    setSaving(true);
    try {
      if (editingClass) {
        await updateClassRoom(editingClass.id, editingClass, parsed.data);
      } else {
        await createClassRoom(parsed.data);
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Không thể lưu thông tin lớp học.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">
            Quản Lý Lớp Học
          </h1>
          <p className="text-sm text-slate-600">
            Tạo lớp, phân lịch học và theo dõi danh sách học sinh cùng bài tập
            đã giao cho từng lớp.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
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
            placeholder="Tìm theo tên lớp, mã lớp, khối hoặc năm học..."
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

      {/* Classes Table / Grid */}
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
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-mono font-bold text-blue-700">
                      {cls.code}
                    </span>
                    <span>·</span>
                    <span>{cls.grade}</span>
                    <span>·</span>
                    <span>{cls.schoolYear}</span>
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

                  <h3 className="mt-2 font-display text-lg font-extrabold text-slate-900">
                    {cls.name}
                  </h3>
                  {cls.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                      {cls.description}
                    </p>
                  )}

                  {cls.scheduleText && (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-amber-50/70 px-3 py-2 text-xs font-medium text-slate-800">
                      Lịch học: {cls.scheduleText}
                    </div>
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
                      onClick={() => setInspectingClass(cls)}
                      className="cartoon-button flex items-center gap-1 rounded-lg bg-sky-100 px-2.5 py-1.5 text-xs font-bold text-slate-900"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Chi tiết
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(cls)}
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

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="cartoon-card max-h-[90vh] w-full max-w-xl overflow-y-auto bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="font-display text-lg font-extrabold text-slate-900">
                {editingClass ? 'Chỉnh Sửa Lớp Học' : 'Tạo Lớp Học Toán Mới'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-300 p-1 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {formError && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Tên lớp học *
                  </label>
                  <input
                    type="text"
                    required
                    value={formValues.name}
                    onChange={(e) =>
                      setFormValues({ ...formValues, name: e.target.value })
                    }
                    placeholder="Ví dụ: Toán Tư Duy 5A"
                    className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Mã lớp duy nhất *
                  </label>
                  <input
                    type="text"
                    required
                    value={formValues.code}
                    onChange={(e) =>
                      setFormValues({
                        ...formValues,
                        code: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="Ví dụ: TOAN5A-2026"
                    className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 font-mono text-sm uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Khối / Lớp *
                  </label>
                  <select
                    value={formValues.grade}
                    onChange={(e) =>
                      setFormValues({ ...formValues, grade: e.target.value })
                    }
                    className="w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-sm"
                  >
                    {[
                      'Khối 1',
                      'Khối 2',
                      'Khối 3',
                      'Khối 4',
                      'Khối 5',
                      'Khối 6',
                      'Khối 7',
                      'Khối 8',
                      'Khối 9',
                    ].map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Môn học
                  </label>
                  <input
                    type="text"
                    value={formValues.subject}
                    onChange={(e) =>
                      setFormValues({ ...formValues, subject: e.target.value })
                    }
                    className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Năm học *
                  </label>
                  <input
                    type="text"
                    required
                    value={formValues.schoolYear}
                    onChange={(e) =>
                      setFormValues({
                        ...formValues,
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
                  Lịch học dạng văn bản
                </label>
                <input
                  type="text"
                  value={formValues.scheduleText || ''}
                  onChange={(e) =>
                    setFormValues({
                      ...formValues,
                      scheduleText: e.target.value,
                    })
                  }
                  placeholder="Ví dụ: Thứ Ba & Thứ Năm (18:00 - 19:30)"
                  className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Ngày bắt đầu
                  </label>
                  <input
                    type="date"
                    value={formValues.startDate || ''}
                    onChange={(e) =>
                      setFormValues({ ...formValues, startDate: e.target.value })
                    }
                    className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Ngày kết thúc
                  </label>
                  <input
                    type="date"
                    value={formValues.endDate || ''}
                    onChange={(e) =>
                      setFormValues({ ...formValues, endDate: e.target.value })
                    }
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
                  value={formValues.description || ''}
                  onChange={(e) =>
                    setFormValues({
                      ...formValues,
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
                  onClick={() => setModalOpen(false)}
                  className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="cartoon-button rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white"
                >
                  {saving ? 'Đang lưu...' : 'Lưu Lớp Học'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Class Students & Assignments Modal */}
      {inspectingClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="cartoon-card max-h-[88vh] w-full max-w-3xl overflow-y-auto bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="font-display text-lg font-extrabold text-slate-900">
                  {inspectingClass.name} ({inspectingClass.code})
                </h2>
                <p className="text-xs text-slate-500">
                  {inspectingClass.grade} · Năm học {inspectingClass.schoolYear}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingClass(null)}
                className="rounded-lg border border-slate-300 p-1 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <h3 className="font-display text-sm font-extrabold text-slate-900">
                  Danh Sách Học Sinh Trong Lớp
                </h3>
                <div className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200">
                  {students
                    .filter((s) => s.classIds.includes(inspectingClass.id))
                    .map((st) => (
                      <div
                        key={st.id}
                        className="flex items-center justify-between px-3 py-2.5 text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-900">
                            {st.fullName}
                          </div>
                          <div className="text-slate-500">{st.grade}</div>
                        </div>
                        <span className="font-mono font-bold text-blue-700">
                          Mã: {st.accessCode}
                        </span>
                      </div>
                    ))}
                  {students.filter((s) =>
                    s.classIds.includes(inspectingClass.id)
                  ).length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-500">
                      Chưa có học sinh nào được gán vào lớp này.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-display text-sm font-extrabold text-slate-900">
                  Các Đợt BTVN Đã Giao Cho Lớp
                </h3>
                <div className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200">
                  {assignments
                    .filter((a) =>
                      (a.classIds || []).includes(inspectingClass.id)
                    )
                    .map((asg) => (
                      <div key={asg.id} className="px-3 py-2.5 text-xs">
                        <div className="font-bold text-slate-900">
                          {asg.title}
                        </div>
                        <div className="mt-0.5 text-slate-500">
                          Giao: {asg.assignedAt} · Hạn nộp: {asg.dueAt}
                        </div>
                      </div>
                    ))}
                  {assignments.filter((a) =>
                    (a.classIds || []).includes(inspectingClass.id)
                  ).length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-500">
                      Chưa có BTVN nào giao cho lớp này.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
