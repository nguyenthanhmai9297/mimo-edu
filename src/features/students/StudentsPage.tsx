import React, { useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  KeyRound,
  Plus,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { useAppContext } from '../../app/providers';
import { studentFormSchema, StudentFormValues } from '../../schemas/validation';
import { createStudent, updateStudent } from '../../services/firestoreRepository';
import { Student } from '../../types/domain';

export const StudentsPage: React.FC = () => {
  const { students, classes } = useAppContext();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'dropped' | 'archived'
  >('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const [formValues, setFormValues] = useState<StudentFormValues>({
    fullName: '',
    nickname: '',
    avatarUrl: '',
    grade: 'Khối 5',
    classIds: [],
    dob: '',
    internalNotes: '',
    status: 'active',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredStudents = students.filter((st) => {
    if (statusFilter !== 'all' && st.status !== statusFilter) return false;
    if (
      selectedClassFilter !== 'all' &&
      !st.classIds.includes(selectedClassFilter)
    ) {
      return false;
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      st.fullName.toLowerCase().includes(q) ||
      (st.nickname || '').toLowerCase().includes(q) ||
      st.accessCode.toLowerCase().includes(q)
    );
  });

  const openCreateModal = () => {
    setEditingStudent(null);
    setFormValues({
      fullName: '',
      nickname: '',
      avatarUrl: '',
      grade: 'Khối 5',
      classIds: classes[0] ? [classes[0].id] : [],
      dob: '',
      internalNotes: '',
      status: 'active',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (st: Student) => {
    setEditingStudent(st);
    setFormValues({
      fullName: st.fullName,
      nickname: st.nickname || '',
      avatarUrl: st.avatarUrl || '',
      grade: st.grade,
      classIds: st.classIds || [],
      dob: st.dob || '',
      internalNotes: st.internalNotes || '',
      status: st.status,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const toggleClassSelection = (classId: string) => {
    setFormValues((prev) => ({
      ...prev,
      classIds: prev.classIds.includes(classId)
        ? prev.classIds.filter((id) => id !== classId)
        : [...prev.classIds, classId],
    }));
  };

  const handleCopyAccessCode = (student: Student) => {
    navigator.clipboard.writeText(student.accessCode);
    setCopiedCodeId(student.id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = studentFormSchema.safeParse(formValues);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.');
      return;
    }

    setSaving(true);
    try {
      if (editingStudent) {
        await updateStudent(editingStudent.id, editingStudent, parsed.data);
      } else {
        await createStudent(parsed.data);
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Không thể lưu hồ sơ học sinh.'
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
            Quản Lý Học Sinh & Mã Truy Cập
          </h1>
          <p className="text-sm text-slate-600">
            Mỗi học sinh được máy chủ tự động cấp một mã 6 ký tự duy nhất để phụ
            huynh và học sinh đăng nhập.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="cartoon-button flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white whitespace-nowrap self-start"
        >
          <UserPlus className="h-4 w-4" />
          Thêm Học Sinh Mới
        </button>
      </div>

      {/* Search & Filters */}
      <div className="cartoon-card flex flex-col justify-between gap-4 p-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo họ tên, biệt danh hoặc mã 6 ký tự..."
            className="w-full rounded-xl border-2 border-slate-800 bg-white py-2 pr-4 pl-10 text-sm focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedClassFilter}
            onChange={(e) => setSelectedClassFilter(e.target.value)}
            className="rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-xs font-bold text-slate-800"
          >
            <option value="all">Tất cả lớp học</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.grade})
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as 'all' | 'active' | 'dropped' | 'archived'
              )
            }
            className="rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-xs font-bold text-slate-800"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang học</option>
            <option value="dropped">Ngừng học</option>
            <option value="archived">Lưu trữ</option>
          </select>
        </div>
      </div>

      {/* Students Table */}
      <div className="cartoon-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-slate-900 bg-amber-100/80 text-xs font-extrabold text-slate-900">
                <th className="px-4 py-3.5">Học sinh</th>
                <th className="px-4 py-3.5">Khối & Lớp tham gia</th>
                <th className="px-4 py-3.5">Mã truy cập (6 ký tự)</th>
                <th className="px-4 py-3.5">Ghi chú nội bộ (Giáo viên)</th>
                <th className="px-4 py-3.5">Trạng thái</th>
                <th className="px-4 py-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-sm text-slate-500"
                  >
                    Chưa có hồ sơ học sinh nào khớp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st) => {
                  const enrolledNames = st.classIds
                    .map((cid) => classes.find((c) => c.id === cid)?.name)
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <tr
                      key={st.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-slate-900 bg-sky-200 font-display text-sm font-extrabold text-slate-900">
                            {st.fullName.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-display font-bold text-slate-900">
                              {st.fullName}
                            </div>
                            <div className="text-xs text-slate-500">
                              {st.nickname ? `Biệt danh: ${st.nickname}` : ''}
                              {st.dob ? ` · NS: ${st.dob}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-xs">
                        <div className="font-bold text-slate-800">{st.grade}</div>
                        <div className="mt-0.5 text-slate-500">
                          {enrolledNames || 'Chưa gán lớp'}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="rounded-lg border-2 border-slate-900 bg-amber-200 px-2.5 py-1 font-mono text-sm font-black tracking-wider text-slate-900">
                            {st.accessCode}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyAccessCode(st)}
                            className="cartoon-button flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-800 whitespace-nowrap"
                            title="Sao chép mã gửi cho phụ huynh"
                          >
                            {copiedCodeId === st.id ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                                Đã chép
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
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

                      <td className="px-4 py-3.5 text-xs font-bold">
                        {st.status === 'active' && (
                          <span className="text-emerald-700">Đang học</span>
                        )}
                        {st.status === 'dropped' && (
                          <span className="text-rose-700">Ngừng học</span>
                        )}
                        {st.status === 'archived' && (
                          <span className="text-amber-700">Lưu trữ</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => openEditModal(st)}
                          className="cartoon-button inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-800"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Sửa hồ sơ
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Student Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="cartoon-card max-h-[90vh] w-full max-w-xl overflow-y-auto bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="font-display text-lg font-extrabold text-slate-900">
                {editingStudent
                  ? 'Chỉnh Sửa Hồ Sơ Học Sinh'
                  : 'Thêm Hồ Sơ Học Sinh Mới'}
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

              {editingStudent && (
                <div className="flex items-center justify-between rounded-xl border-2 border-slate-900 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <KeyRound className="h-4 w-4 text-amber-700" />
                    <span>
                      Mã truy cập cố định (không thể chỉnh sửa thủ công):
                    </span>
                  </div>
                  <span className="font-mono text-base font-black tracking-widest text-blue-700">
                    {editingStudent.accessCode}
                  </span>
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
                    value={formValues.fullName}
                    onChange={(e) =>
                      setFormValues({ ...formValues, fullName: e.target.value })
                    }
                    placeholder="Ví dụ: Nguyễn Minh Khôi"
                    className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Tên gọi thân mật (Tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={formValues.nickname || ''}
                    onChange={(e) =>
                      setFormValues({ ...formValues, nickname: e.target.value })
                    }
                    placeholder="Ví dụ: Bé Khôi"
                    className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Khối lớp *
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
                    Ngày sinh
                  </label>
                  <input
                    type="date"
                    value={formValues.dob || ''}
                    onChange={(e) =>
                      setFormValues({ ...formValues, dob: e.target.value })
                    }
                    className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Trạng thái
                  </label>
                  <select
                    value={formValues.status}
                    onChange={(e) =>
                      setFormValues({
                        ...formValues,
                        status: e.target.value as
                          | 'active'
                          | 'dropped'
                          | 'archived',
                      })
                    }
                    className="w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-sm"
                  >
                    <option value="active">Đang học</option>
                    <option value="dropped">Ngừng học</option>
                    <option value="archived">Lưu trữ</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  Gán vào các lớp học đang hoạt động
                </label>
                <div className="grid max-h-36 grid-cols-1 gap-2 overflow-y-auto rounded-xl border-2 border-slate-800 bg-slate-50 p-3 sm:grid-cols-2">
                  {classes.map((cls) => {
                    const checked = formValues.classIds.includes(cls.id);
                    return (
                      <label
                        key={cls.id}
                        className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-800"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleClassSelection(cls.id)}
                          className="h-4 w-4 rounded border-slate-800"
                        />
                        <span>
                          {cls.name} ({cls.grade})
                        </span>
                      </label>
                    );
                  })}
                  {classes.length === 0 && (
                    <span className="text-xs text-slate-500">
                      Chưa có lớp học nào. Bạn có thể tạo lớp trước.
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Ghi chú nội bộ của giáo viên (Phụ huynh/Học sinh KHÔNG nhìn thấy)
                </label>
                <textarea
                  rows={3}
                  value={formValues.internalNotes || ''}
                  onChange={(e) =>
                    setFormValues({
                      ...formValues,
                      internalNotes: e.target.value,
                    })
                  }
                  placeholder="Nhận xét riêng tư cho giáo viên về tính cách, học lực..."
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
                  className="cartoon-button flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-extrabold text-white"
                >
                  <Plus className="h-4 w-4" />
                  {saving
                    ? 'Đang cấp mã & lưu...'
                    : editingStudent
                    ? 'Lưu Thay Đổi'
                    : 'Tạo Hồ Sơ & Sinh Mã 6 Ký Tự'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
