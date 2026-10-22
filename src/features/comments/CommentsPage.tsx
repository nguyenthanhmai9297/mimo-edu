import React, { useState } from 'react';
import {
  Edit3,
  MessageSquarePlus,
  Trash2,
  X,
} from 'lucide-react';
import { useAppContext } from '../../app/providers';
import {
  commentFormSchema,
  CommentFormValues,
} from '../../schemas/validation';
import {
  deleteDraftComment,
  saveCommentReport,
} from '../../services/firestoreRepository';
import { CommentReport } from '../../types/domain';

export const CommentsPage: React.FC = () => {
  const { comments, students } = useAppContext();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingComment, setEditingComment] = useState<CommentReport | null>(
    null
  );
  const [studentFilter, setStudentFilter] = useState('all');

  const [formValues, setFormValues] = useState<CommentFormValues>({
    studentId: '',
    type: 'monthly',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    strengths: '',
    improvements: '',
    completionRate: 'Hoàn thành 100% BTVN đúng hạn',
    practiceSuggestions: '',
    status: 'published',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredComments = comments.filter((c) =>
    studentFilter === 'all' ? true : c.studentId === studentFilter
  );

  const openCreateModal = () => {
    setEditingComment(null);
    setFormValues({
      studentId: students[0]?.id || '',
      type: 'monthly',
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      strengths: '',
      improvements: '',
      completionRate: 'Hoàn thành đầy đủ các phiếu BTVN trong tháng',
      practiceSuggestions: '',
      status: 'published',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (cmt: CommentReport) => {
    setEditingComment(cmt);
    setFormValues({
      studentId: cmt.studentId,
      type: cmt.type,
      month: cmt.month || new Date().getMonth() + 1,
      year: cmt.year || new Date().getFullYear(),
      strengths: cmt.strengths,
      improvements: cmt.improvements || '',
      completionRate: cmt.completionRate || '',
      practiceSuggestions: cmt.practiceSuggestions || '',
      status: cmt.status,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = commentFormSchema.safeParse(formValues);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.');
      return;
    }

    setSaving(true);
    try {
      await saveCommentReport(parsed.data, editingComment || undefined);
      setModalOpen(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Không thể lưu nhận xét tháng.'
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
            Nhận Xét Định Kỳ Hàng Tháng
          </h1>
          <p className="text-sm text-slate-600">
            Lập phiếu nhận xét tháng cho từng học sinh. Bản nháp chỉ giáo viên
            nhìn thấy; chỉ những nhận xét đã công bố mới hiển thị trên cổng phụ
            huynh.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="cartoon-button flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white whitespace-nowrap self-start"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Tạo Nhận Xét Tháng
        </button>
      </div>

      {/* Filter */}
      <div className="cartoon-card flex items-center justify-between gap-4 p-4">
        <span className="text-xs font-bold text-slate-700">
          Lọc theo học sinh:
        </span>
        <select
          value={studentFilter}
          onChange={(e) => setStudentFilter(e.target.value)}
          className="rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-xs font-bold"
        >
          <option value="all">Tất cả học sinh</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName} (Mã: {s.accessCode})
            </option>
          ))}
        </select>
      </div>

      {/* Comments Grid */}
      {filteredComments.length === 0 ? (
        <div className="cartoon-card p-12 text-center text-sm text-slate-500">
          Chưa có nhận xét tháng nào được tạo.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {filteredComments.map((cmt) => {
            const stu = students.find((s) => s.id === cmt.studentId);
            return (
              <div
                key={cmt.id}
                className="cartoon-card flex flex-col justify-between bg-white p-5"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 text-xs">
                    <div>
                      <span className="font-display text-sm font-extrabold text-slate-900">
                        {stu?.fullName || 'Học sinh'}
                      </span>
                      <span className="mx-1.5 text-slate-400">·</span>
                      <span className="font-mono font-bold text-blue-700">
                        Tháng {cmt.month}/{cmt.year}
                      </span>
                    </div>
                    <span
                      className={
                        cmt.status === 'published'
                          ? 'font-bold text-emerald-700'
                          : 'font-bold text-amber-700'
                      }
                    >
                      {cmt.status === 'published' ? 'Đã công bố' : 'Bản nháp'}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs text-slate-700">
                    <div>
                      <strong className="text-slate-900">Điểm mạnh:</strong>{' '}
                      {cmt.strengths}
                    </div>
                    {cmt.improvements && (
                      <div>
                        <strong className="text-slate-900">
                          Cần cải thiện:
                        </strong>{' '}
                        {cmt.improvements}
                      </div>
                    )}
                    {cmt.completionRate && (
                      <div>
                        <strong className="text-slate-900">
                          Mức độ hoàn thành BTVN:
                        </strong>{' '}
                        {cmt.completionRate}
                      </div>
                    )}
                    {cmt.practiceSuggestions && (
                      <div>
                        <strong className="text-slate-900">
                          Gợi ý luyện tập thêm:
                        </strong>{' '}
                        {cmt.practiceSuggestions}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
                  <button
                    type="button"
                    onClick={() => openEditModal(cmt)}
                    className="cartoon-button flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-800"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Chỉnh sửa
                  </button>
                  {cmt.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => deleteDraftComment(cmt.id)}
                      className="cartoon-button flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Xóa nháp
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="cartoon-card max-h-[90vh] w-full max-w-xl overflow-y-auto bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="font-display text-lg font-extrabold text-slate-900">
                {editingComment
                  ? 'Chỉnh Sửa Nhận Xét Tháng'
                  : 'Lập Nhận Xét Tháng Cho Học Sinh'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-300 p-1"
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Học sinh *
                  </label>
                  <select
                    value={formValues.studentId}
                    onChange={(e) =>
                      setFormValues({
                        ...formValues,
                        studentId: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">-- Chọn --</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Tháng *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={formValues.month}
                    onChange={(e) =>
                      setFormValues({
                        ...formValues,
                        month: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Năm *
                  </label>
                  <input
                    type="number"
                    min={2024}
                    max={2035}
                    value={formValues.year}
                    onChange={(e) =>
                      setFormValues({
                        ...formValues,
                        year: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Điểm mạnh trong quá trình học *
                </label>
                <textarea
                  rows={2}
                  required
                  value={formValues.strengths}
                  onChange={(e) =>
                    setFormValues({ ...formValues, strengths: e.target.value })
                  }
                  placeholder="Nêu bật sự tiến bộ, thái độ học tập và kỹ năng Toán tốt của con..."
                  className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Nội dung cần cải thiện
                </label>
                <textarea
                  rows={2}
                  value={formValues.improvements || ''}
                  onChange={(e) =>
                    setFormValues({
                      ...formValues,
                      improvements: e.target.value,
                    })
                  }
                  placeholder="Các kỹ năng tính toán hoặc trình bày con cần lưu ý hơn..."
                  className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Mức độ hoàn thành bài tập về nhà
                </label>
                <input
                  type="text"
                  value={formValues.completionRate || ''}
                  onChange={(e) =>
                    setFormValues({
                      ...formValues,
                      completionRate: e.target.value,
                    })
                  }
                  placeholder="Ví dụ: Hoàn thành 100% BTVN đúng hạn (4/4 phiếu)"
                  className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Gợi ý luyện tập thêm tại nhà
                </label>
                <textarea
                  rows={2}
                  value={formValues.practiceSuggestions || ''}
                  onChange={(e) =>
                    setFormValues({
                      ...formValues,
                      practiceSuggestions: e.target.value,
                    })
                  }
                  placeholder="Đề xuất chủ đề ôn tập hoặc trò chơi Toán trên cổng học sinh..."
                  className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Trạng thái hiển thị
                </label>
                <select
                  value={formValues.status}
                  onChange={(e) =>
                    setFormValues({
                      ...formValues,
                      status: e.target.value as 'draft' | 'published',
                    })
                  }
                  className="w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-sm font-bold"
                >
                  <option value="published">
                    Công bố ngay (Phụ huynh & Học sinh xem được)
                  </option>
                  <option value="draft">
                    Lưu bản nháp (Chỉ Giáo viên xem)
                  </option>
                </select>
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
                  {saving ? 'Đang lưu...' : 'Lưu Nhận Xét'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
