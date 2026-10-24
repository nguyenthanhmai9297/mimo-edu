import React, { useState } from 'react';
import {
  Archive,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  GraduationCap,
  KeyRound,
  Plus,
  School,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { useAppContext } from '../../app/providers';
import { studentFormSchema, StudentFormValues } from '../../schemas/validation';
import { createStudent, updateStudent } from '../../services/firestoreRepository';
import { Student } from '../../types/domain';
import {
  DataTable,
  EmptyState,
  FilterSelect,
  PageHeader,
  SearchInput,
  StatCard,
  StatusBadge,
  STUDIO_TONE,
  TD,
  TH,
  THEAD,
  Toolbar,
  TR,
} from '../../components/studio/StudioUi';

export const StudentsPage: React.FC = () => {
  const { students, classes } = useAppContext();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'dropped' | 'archived'
  >('all');

  const [gradeFilter, setGradeFilter] = useState('all');

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
    if (gradeFilter !== 'all' && st.grade !== gradeFilter) return false;
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

  const grades = Array.from(new Set(students.map((s) => s.grade))).sort();
  const count = (status: Student['status']) => students.filter((s) => s.status === status).length;
  const filtersOn = searchQuery.trim() !== '' || selectedClassFilter !== 'all' || gradeFilter !== 'all' || statusFilter !== 'all';
  const STATUS_BADGE: Record<Student['status'], { kind: 'success' | 'danger' | 'neutral'; label: string }> = {
    active: { kind: 'success', label: 'Đang học' },
    dropped: { kind: 'danger', label: 'Nghỉ học' },
    archived: { kind: 'neutral', label: 'Lưu trữ' },
  };

  return (
    <div className="studio-skin space-y-6">
      <PageHeader
        icon={GraduationCap}
        tone="green"
        title="Học sinh & Mã"
        description="Mỗi học sinh được máy chủ tự cấp một mã 6 ký tự duy nhất để học sinh và phụ huynh vào cổng học sinh."
        actions={
          <button type="button" onClick={openCreateModal} className="studio-btn studio-btn-primary">
            <UserPlus className="h-4 w-4" />
            Thêm học sinh
          </button>
        }
      />

      {students.length > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard icon={GraduationCap} tone="blue" label="Tổng số học sinh" value={students.length} note={`${grades.length} khối lớp`} />
          <StatCard icon={CheckCircle2} tone="green" label="Đang học" value={count('active')} />
          <StatCard icon={School} tone="yellow" label="Chưa ghép lớp" value={students.filter((s) => s.classIds.length === 0).length} note="Vẫn luyện Toán cùng Mimo được" />
          <StatCard icon={Archive} tone="gray" label="Nghỉ học / lưu trữ" value={count('dropped') + count('archived')} />
        </section>
      )}

      {students.length > 0 && (
        <Toolbar>
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Tìm theo họ tên, tên gọi hoặc mã 6 ký tự…" />
          <div className="flex flex-wrap items-center gap-3">
            <FilterSelect label="Lớp" value={selectedClassFilter} onChange={setSelectedClassFilter}>
              <option value="all">Tất cả</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Khối" value={gradeFilter} onChange={setGradeFilter}>
              <option value="all">Tất cả</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Trạng thái" value={statusFilter} onChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <option value="all">Tất cả</option>
              <option value="active">Đang học</option>
              <option value="dropped">Nghỉ học</option>
              <option value="archived">Lưu trữ</option>
            </FilterSelect>
          </div>
        </Toolbar>
      )}

      {students.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          tone="green"
          title="Chưa có học sinh nào"
          text="Thêm học sinh đầu tiên: hệ thống sẽ tự cấp mã 6 ký tự để em đăng nhập cổng học sinh. Có thể ghép lớp ngay hoặc để sau."
          action={
            <button type="button" onClick={openCreateModal} className="studio-btn studio-btn-primary">
              <UserPlus className="h-4 w-4" />
              Thêm học sinh đầu tiên
            </button>
          }
        />
      ) : filteredStudents.length === 0 ? (
        <EmptyState
          icon={Search}
          tone="gray"
          title="Không có học sinh phù hợp"
          text="Thử từ khóa khác hoặc bỏ bớt bộ lọc."
          action={
            filtersOn && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedClassFilter('all');
                  setGradeFilter('all');
                  setStatusFilter('all');
                }}
                className="studio-btn studio-btn-secondary"
              >
                Xóa bộ lọc
              </button>
            )
          }
        />
      ) : (
        <DataTable minWidth={860}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Học sinh</th>
              <th className={TH}>Khối & lớp</th>
              <th className={TH}>Mã truy cập</th>
              <th className={TH}>Ghi chú của giáo viên</th>
              <th className={TH}>Trạng thái</th>
              <th className={`${TH} text-right`}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((st) => {
              const enrolledNames = st.classIds
                .map((cid) => classes.find((c) => c.id === cid)?.name)
                .filter(Boolean)
                .join(' · ');
              const badge = STATUS_BADGE[st.status];
              return (
                <tr key={st.id} className={TR}>
                  <td className={TD}>
                    <div className="flex items-center gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-sm font-extrabold ${STUDIO_TONE.blue}`}>
                        {st.fullName.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-bold text-[#172B4D]">{st.fullName}</div>
                        <div className="text-xs text-[#5E6C84]">
                          {[st.nickname && `Tên gọi: ${st.nickname}`, st.dob && `NS: ${st.dob}`].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className={`${TD} text-xs`}>
                    <div className="font-bold text-[#172B4D]">{st.grade}</div>
                    <div className={`mt-0.5 ${enrolledNames ? 'text-[#5E6C84]' : 'text-[#B7790A]'}`}>{enrolledNames || 'Chưa ghép lớp'}</div>
                  </td>
                  <td className={TD}>
                    <button
                      type="button"
                      onClick={() => handleCopyAccessCode(st)}
                      title="Bấm để sao chép mã gửi cho phụ huynh"
                      className="group inline-flex items-center gap-2 rounded-xl border border-[#FFE7A3] bg-[#FFF8E1] py-1 pr-2 pl-3 transition hover:border-[#FFD34E]"
                    >
                      <span className="font-mono text-base font-black tracking-[0.18em] text-[#1E3A8A]">{st.accessCode}</span>
                      <span
                        className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-bold ${
                          copiedCodeId === st.id ? 'bg-[#E7F7F0] text-[#1F9D6B]' : 'bg-white text-[#5E6C84] group-hover:text-[#172B4D]'
                        }`}
                      >
                        {copiedCodeId === st.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedCodeId === st.id ? 'Đã chép' : 'Chép'}
                      </span>
                    </button>
                  </td>
                  <td className={`${TD} max-w-xs text-xs text-[#5E6C84]`}>
                    <span className="line-clamp-2">{st.internalNotes || '—'}</span>
                  </td>
                  <td className={TD}>
                    <StatusBadge kind={badge.kind}>{badge.label}</StatusBadge>
                  </td>
                  <td className={`${TD} text-right`}>
                    <button type="button" onClick={() => openEditModal(st)} className="studio-btn studio-btn-secondary px-3 text-xs">
                      <Edit3 className="h-3.5 w-3.5" />
                      Sửa hồ sơ
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}

      {/* Create / Edit Student Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E3A8A]/40 backdrop-blur-[2px] p-4">
          <div className="cartoon-card max-h-[90vh] w-full max-w-xl overflow-y-auto bg-white p-6">
            <div className="flex items-center justify-between border-b border-[#EEF3F9] pb-3">
              <h2 className="font-display text-lg font-extrabold text-[#172B4D]">
                {editingStudent
                  ? 'Chỉnh Sửa Hồ Sơ Học Sinh'
                  : 'Thêm Hồ Sơ Học Sinh Mới'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-[#DCE7F3] p-1 hover:bg-[#F6FAFF]"
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
                <div className="flex items-center justify-between rounded-xl border border-[#DCE7F3] bg-amber-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#172B4D]">
                    <KeyRound className="h-4 w-4 text-amber-700" />
                    <span>
                      Mã truy cập cố định (không thể chỉnh sửa thủ công):
                    </span>
                  </div>
                  <span className="font-mono text-base font-black tracking-widest text-[#2563EB]">
                    {editingStudent.accessCode}
                  </span>
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
                    value={formValues.fullName}
                    onChange={(e) =>
                      setFormValues({ ...formValues, fullName: e.target.value })
                    }
                    placeholder="Ví dụ: Nguyễn Minh Khôi"
                    className="w-full rounded-xl border border-[#DCE7F3] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                    Tên gọi thân mật (Tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={formValues.nickname || ''}
                    onChange={(e) =>
                      setFormValues({ ...formValues, nickname: e.target.value })
                    }
                    placeholder="Ví dụ: Bé Khôi"
                    className="w-full rounded-xl border border-[#DCE7F3] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                    Khối lớp *
                  </label>
                  <select
                    value={formValues.grade}
                    onChange={(e) =>
                      setFormValues({ ...formValues, grade: e.target.value })
                    }
                    className="w-full rounded-xl border border-[#DCE7F3] bg-white px-3 py-2 text-sm"
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
                  <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                    Ngày sinh
                  </label>
                  <input
                    type="date"
                    value={formValues.dob || ''}
                    onChange={(e) =>
                      setFormValues({ ...formValues, dob: e.target.value })
                    }
                    className="w-full rounded-xl border border-[#DCE7F3] px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
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
                    className="w-full rounded-xl border border-[#DCE7F3] bg-white px-3 py-2 text-sm"
                  >
                    <option value="active">Đang học</option>
                    <option value="dropped">Ngừng học</option>
                    <option value="archived">Lưu trữ</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-[#3B4A66]">
                  Gán vào các lớp học đang hoạt động
                </label>
                <div className="grid max-h-36 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-[#DCE7F3] bg-[#F6FAFF] p-3 sm:grid-cols-2">
                  {classes.map((cls) => {
                    const checked = formValues.classIds.includes(cls.id);
                    return (
                      <label
                        key={cls.id}
                        className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#172B4D]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleClassSelection(cls.id)}
                          className="h-4 w-4 rounded border-[#DCE7F3]"
                        />
                        <span>
                          {cls.name} ({cls.grade})
                        </span>
                      </label>
                    );
                  })}
                  {classes.length === 0 && (
                    <span className="text-xs text-[#5E6C84]">
                      Chưa có lớp học nào. Bạn có thể tạo lớp trước.
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
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
                  className="w-full rounded-xl border border-[#DCE7F3] px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#3B4A66]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="cartoon-button flex items-center gap-1.5 rounded-xl bg-[#1F9D6B] px-5 py-2 text-xs font-extrabold text-white"
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
