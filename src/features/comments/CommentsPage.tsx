import React, { useState } from 'react';
import {
  Edit3,
  FileText,
  MessageSquareHeart,
  MessageSquarePlus,
  Search,
  Send,
  Trash2,
  Users,
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
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FilterSelect,
  PageHeader,
  SegmentedFilter,
  StatCard,
  StatusBadge,
  STUDIO_INPUT,
  STUDIO_LABEL,
  STUDIO_TONE,
  StudioModal,
  Toolbar,
} from '../../components/studio/StudioUi';

export const CommentsPage: React.FC = () => {
  const { comments, students } = useAppContext();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingComment, setEditingComment] = useState<CommentReport | null>(
    null
  );
  const [studentFilter, setStudentFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [deleting, setDeleting] = useState<CommentReport | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

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

  const monthKey = (c: CommentReport) => `${c.year ?? 0}-${String(c.month ?? 0).padStart(2, '0')}`;
  const months = Array.from(new Set(comments.map(monthKey))).sort().reverse();
  const counts = {
    all: comments.length,
    published: comments.filter((c) => c.status === 'published').length,
    draft: comments.filter((c) => c.status === 'draft').length,
  };
  const shown = filteredComments
    .filter((c) => monthFilter === 'all' || monthKey(c) === monthFilter)
    .filter((c) => statusFilter === 'all' || c.status === statusFilter)
    .sort((a, b) => monthKey(b).localeCompare(monthKey(a)));
  const filtersOn = studentFilter !== 'all' || monthFilter !== 'all' || statusFilter !== 'all';
  const set = <K extends keyof CommentFormValues>(k: K, v: CommentFormValues[K]) => setFormValues((f) => ({ ...f, [k]: v }));

  return (
    <div className="studio-skin space-y-6">
      <PageHeader
        icon={MessageSquareHeart}
        tone="pink"
        title="Nhận xét tháng"
        description="Lập phiếu nhận xét tháng cho từng học sinh. Bản nháp chỉ giáo viên thấy; nhận xét đã công bố hiện ở cổng học sinh và phụ huynh."
        actions={
          <button type="button" onClick={openCreateModal} className="studio-btn studio-btn-primary">
            <MessageSquarePlus className="h-4 w-4" />
            Tạo nhận xét
          </button>
        }
      />

      {comments.length > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard icon={MessageSquareHeart} tone="pink" label="Tổng phiếu nhận xét" value={counts.all} />
          <StatCard icon={Send} tone="green" label="Đã công bố" value={counts.published} note="Học sinh & phụ huynh xem được" />
          <StatCard icon={FileText} tone="yellow" label="Bản nháp" value={counts.draft} note="Chỉ giáo viên thấy" />
          <StatCard icon={Users} tone="blue" label="Học sinh đã có nhận xét" value={new Set(comments.map((c) => c.studentId)).size} note={`Trên ${students.length} học sinh`} />
        </section>
      )}

      {comments.length > 0 && (
        <Toolbar>
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <FilterSelect label="Học sinh" value={studentFilter} onChange={setStudentFilter}>
              <option value="all">Tất cả</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.accessCode})
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Tháng" value={monthFilter} onChange={setMonthFilter}>
              <option value="all">Tất cả</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  Tháng {Number(m.slice(5))}/{m.slice(0, 4)}
                </option>
              ))}
            </FilterSelect>
          </div>
          <SegmentedFilter
            label="Trạng thái nhận xét"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { id: 'all', label: 'Tất cả', count: counts.all },
              { id: 'published', label: 'Đã công bố', count: counts.published },
              { id: 'draft', label: 'Bản nháp', count: counts.draft },
            ]}
          />
        </Toolbar>
      )}

      {comments.length === 0 ? (
        <EmptyState
          icon={MessageSquareHeart}
          tone="pink"
          title="Chưa có nhận xét tháng nào"
          text={students.length === 0 ? 'Hãy thêm học sinh trước, rồi quay lại để lập phiếu nhận xét.' : 'Lập phiếu đầu tiên: điểm mạnh, điều cần cố gắng, mức hoàn thành bài tập và gợi ý luyện thêm.'}
          action={
            students.length > 0 && (
              <button type="button" onClick={openCreateModal} className="studio-btn studio-btn-primary">
                <MessageSquarePlus className="h-4 w-4" />
                Tạo nhận xét đầu tiên
              </button>
            )
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Search}
          tone="gray"
          title="Không có nhận xét phù hợp"
          text="Thử học sinh, tháng hoặc trạng thái khác."
          action={
            filtersOn && (
              <button
                type="button"
                onClick={() => {
                  setStudentFilter('all');
                  setMonthFilter('all');
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {shown.map((cmt) => {
            const stu = students.find((s) => s.id === cmt.studentId);
            const published = cmt.status === 'published';
            return (
              <article key={cmt.id} className="studio-card flex flex-col p-5 transition hover:shadow-[var(--studio-shadow-hover)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${STUDIO_TONE.pink}`}>
                      {(stu?.fullName || '?').slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-display text-base font-extrabold text-[#172B4D]">{stu?.fullName || 'Học sinh'}</div>
                      <div className="text-xs font-bold text-[#1267E9]">
                        Tháng {cmt.month}/{cmt.year}
                      </div>
                    </div>
                  </div>
                  <StatusBadge kind={published ? 'success' : 'warning'}>{published ? 'Đã công bố' : 'Bản nháp'}</StatusBadge>
                </div>

                <div className="mt-4 space-y-2 text-sm text-[#172B4D]">
                  <div className="rounded-xl bg-[#E7F7F0] px-3.5 py-2.5">
                    <div className="text-xs font-bold text-[#1F7A55]">Điểm mạnh</div>
                    <p className="mt-0.5 line-clamp-3">{cmt.strengths}</p>
                  </div>
                  {cmt.improvements && (
                    <div className="rounded-xl bg-[#FFF6DC] px-3.5 py-2.5">
                      <div className="text-xs font-bold text-[#B7790A]">Cần cố gắng thêm</div>
                      <p className="mt-0.5 line-clamp-3">{cmt.improvements}</p>
                    </div>
                  )}
                  {cmt.practiceSuggestions && (
                    <div className="rounded-xl bg-[#EAF5FF] px-3.5 py-2.5">
                      <div className="text-xs font-bold text-[#1267E9]">Gợi ý luyện thêm</div>
                      <p className="mt-0.5 line-clamp-3">{cmt.practiceSuggestions}</p>
                    </div>
                  )}
                  {cmt.completionRate && (
                    <p className="text-xs text-[#5E6C84]">
                      <b className="text-[#172B4D]">Hoàn thành bài tập:</b> {cmt.completionRate}
                    </p>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-end gap-2 border-t border-[#EEF3F9] pt-4">
                  <button type="button" onClick={() => openEditModal(cmt)} className="studio-btn studio-btn-secondary">
                    <Edit3 className="h-4 w-4" />
                    Chỉnh sửa
                  </button>
                  {cmt.status === 'draft' && (
                    <button type="button" onClick={() => setDeleting(cmt)} className="studio-btn studio-btn-danger">
                      <Trash2 className="h-4 w-4" />
                      Xóa nháp
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <StudioModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingComment ? 'Chỉnh sửa nhận xét' : 'Tạo nhận xét tháng'}
        icon={MessageSquareHeart}
        tone="pink"
        width="lg"
        footer={
          <>
            <button type="button" onClick={() => setModalOpen(false)} className="studio-btn studio-btn-secondary">
              Hủy
            </button>
            <button type="submit" form="comment-form" disabled={saving} className="studio-btn studio-btn-primary">
              {saving ? 'Đang lưu…' : formValues.status === 'published' ? 'Lưu & công bố' : 'Lưu bản nháp'}
            </button>
          </>
        }
      >
        <form id="comment-form" onSubmit={handleSubmit} className="space-y-4">
          {formError && <ErrorState message={formError} />}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className={STUDIO_LABEL}>Học sinh *</label>
              <select value={formValues.studentId} onChange={(e) => set('studentId', e.target.value)} className={STUDIO_INPUT}>
                <option value="">-- Chọn học sinh --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={STUDIO_LABEL}>Tháng *</label>
              <input type="number" min={1} max={12} value={formValues.month} onChange={(e) => set('month', Number(e.target.value))} className={`${STUDIO_INPUT} font-mono`} />
            </div>
            <div>
              <label className={STUDIO_LABEL}>Năm *</label>
              <input type="number" min={2024} max={2035} value={formValues.year} onChange={(e) => set('year', Number(e.target.value))} className={`${STUDIO_INPUT} font-mono`} />
            </div>
          </div>

          <div>
            <label className={STUDIO_LABEL}>Điểm mạnh trong tháng *</label>
            <textarea
              rows={3}
              required
              value={formValues.strengths}
              onChange={(e) => set('strengths', e.target.value)}
              placeholder="Sự tiến bộ, thái độ học tập và kỹ năng Toán tốt của con…"
              className={`${STUDIO_INPUT} py-2`}
            />
          </div>
          <div>
            <label className={STUDIO_LABEL}>Cần cố gắng thêm</label>
            <textarea
              rows={2}
              value={formValues.improvements || ''}
              onChange={(e) => set('improvements', e.target.value)}
              placeholder="Kỹ năng tính toán hoặc trình bày con cần lưu ý hơn…"
              className={`${STUDIO_INPUT} py-2`}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={STUDIO_LABEL}>Mức hoàn thành bài tập</label>
              <input
                type="text"
                value={formValues.completionRate || ''}
                onChange={(e) => set('completionRate', e.target.value)}
                placeholder="Ví dụ: Hoàn thành 4/4 phiếu đúng hạn"
                className={STUDIO_INPUT}
              />
            </div>
            <div>
              <label className={STUDIO_LABEL}>Gợi ý luyện thêm tại nhà</label>
              <input
                type="text"
                value={formValues.practiceSuggestions || ''}
                onChange={(e) => set('practiceSuggestions', e.target.value)}
                placeholder="Ví dụ: Luyện chuyên đề N05 mỗi ngày 15 phút"
                className={STUDIO_INPUT}
              />
            </div>
          </div>

          <fieldset>
            <legend className={STUDIO_LABEL}>Hiển thị</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  ['published', 'Công bố ngay', 'Học sinh và phụ huynh xem được', Send],
                  ['draft', 'Lưu bản nháp', 'Chỉ giáo viên thấy', FileText],
                ] as const
              ).map(([v, label, note, Icon]) => {
                const on = formValues.status === v;
                return (
                  <label
                    key={v}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${on ? 'border-[#1267E9] bg-[#EAF5FF]' : 'border-[#DCE7F3] hover:bg-[#F6FAFF]'}`}
                  >
                    <input type="radio" name="comment-status" checked={on} onChange={() => set('status', v)} className="mt-1 h-4 w-4 accent-[#1267E9]" />
                    <span>
                      <span className="flex items-center gap-1.5 text-sm font-bold text-[#172B4D]">
                        <Icon className="h-4 w-4 text-[#1267E9]" /> {label}
                      </span>
                      <span className="block text-xs text-[#5E6C84]">{note}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </form>
      </StudioModal>

      <ConfirmDialog
        open={deleting !== null}
        danger
        busy={deletingBusy}
        title="Xóa bản nháp nhận xét?"
        message="Bản nháp này sẽ bị xóa và không khôi phục được."
        confirmLabel="Xóa bản nháp"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setDeletingBusy(true);
          try {
            await deleteDraftComment(deleting.id);
            setDeleting(null);
          } finally {
            setDeletingBusy(false);
          }
        }}
      />
    </div>
  );
};
