import React, { useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Gamepad2,
  Play,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useAppContext } from '../../app/providers';
import {
  mathGameFormSchema,
  MathGameFormValues,
} from '../../schemas/validation';
import {
  deleteMathGame,
  describeGameSaveError,
  saveMathGame,
} from '../../services/firestoreRepository';
import { GameCategory, MathGame } from '../../types/domain';
import { GAME_COVERS, GameCover, isLibraryCover } from './gameCovers';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FilterSelect,
  LoadingState,
  PageHeader,
  SearchInput,
  SegmentedFilter,
  StatusBadge,
  STUDIO_INPUT,
  STUDIO_LABEL,
  StudioModal,
  Toolbar,
} from '../../components/studio/StudioUi';

/** Category chip colours (MimoEDU pastel accents). */
const CATEGORY_CHIP: Record<GameCategory, string> = {
  'Số học': 'bg-[#EAF5FF] text-[#1267E9]',
  'Phép tính': 'bg-[#F3EFFF] text-[#6A4BE6]',
  'Hình học': 'bg-[#FFF6DC] text-[#B7790A]',
  'Tư duy logic': 'bg-[#FFEDF6] text-[#D9468C]',
  'Ôn tập kiến thức': 'bg-[#E6FAFC] text-[#0E8A9A]',
};

const STATUS_BADGE: Record<MathGame['status'], { kind: 'success' | 'warning' | 'neutral'; label: string }> = {
  published: { kind: 'success', label: 'Đã xuất bản' },
  draft: { kind: 'warning', label: 'Bản nháp' },
  archived: { kind: 'neutral', label: 'Lưu trữ' },
};

const CATEGORIES: GameCategory[] = [
  'Số học',
  'Phép tính',
  'Hình học',
  'Tư duy logic',
  'Ôn tập kiến thức',
];

export const GamesAdminPage: React.FC = () => {
  const { games, gamesLoading, gamesError } = useAppContext();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MathGame['status']>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [deleting, setDeleting] = useState<MathGame | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<MathGame | null>(null);
  const [previewGame, setPreviewGame] = useState<MathGame | null>(null);

  const [formValues, setFormValues] = useState<MathGameFormValues>({
    title: '',
    description: '',
    embedUrl: 'https://phet.colorado.edu/sims/html/fractions-intro/latest/fractions-intro_vi.html',
    category: 'Số học',
    thumbnailUrl: '',
    order: games.length + 1,
    status: 'published',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openCreateModal = () => {
    setSavedNotice(null);
    setEditingGame(null);
    setFormValues({
      title: '',
      description: '',
      embedUrl: 'https://',
      category: 'Số học',
      thumbnailUrl: '',
      order: games.length + 1,
      status: 'published',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (game: MathGame) => {
    setEditingGame(game);
    setFormValues({
      title: game.title,
      description: game.description || '',
      embedUrl: game.embedUrl,
      category: game.category,
      thumbnailUrl: game.thumbnailUrl || '',
      order: game.order,
      status: game.status,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = mathGameFormSchema.safeParse(formValues);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.');
      return;
    }

    setSaving(true);
    try {
      await saveMathGame(parsed.data, editingGame || undefined);
      setModalOpen(false);
      setSavedNotice(
        `Đã lưu “${parsed.data.title}” vào Firestore${parsed.data.status === 'published' ? ' và xuất bản cho học sinh' : ' (chưa xuất bản)'}.`
      );
    } catch (err) {
      setFormError(describeGameSaveError(err));
    } finally {
      setSaving(false);
    }
  };

  // Quick Xuất bản / Ẩn: the same saveMathGame call as the form, only the status changes
  const toggleStatus = async (g: MathGame) => {
    const next = g.status === 'published' ? 'draft' : 'published';
    setTogglingId(g.id);
    setSavedNotice(null);
    setDeleteError(null);
    try {
      await saveMathGame(
        {
          title: g.title,
          description: g.description || '',
          embedUrl: g.embedUrl,
          category: g.category,
          thumbnailUrl: g.thumbnailUrl || '',
          order: g.order,
          status: next,
        },
        g
      );
      setSavedNotice(next === 'published' ? `Đã xuất bản “${g.title}” cho học sinh.` : `Đã ẩn “${g.title}” khỏi cổng học sinh (chuyển về bản nháp).`);
    } catch (err) {
      setDeleteError(describeGameSaveError(err));
    } finally {
      setTogglingId(null);
    }
  };

  const counts = {
    all: games.length,
    published: games.filter((g) => g.status === 'published').length,
    draft: games.filter((g) => g.status === 'draft').length,
    archived: games.filter((g) => g.status === 'archived').length,
  };
  const shown = games
    .filter((g) => statusFilter === 'all' || g.status === statusFilter)
    .filter((g) => categoryFilter === 'all' || g.category === categoryFilter)
    .filter((g) => {
      const q = search.trim().toLowerCase();
      return !q || g.title.toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q);
    });
  const filtersOn = search.trim() !== '' || statusFilter !== 'all' || categoryFilter !== 'all';
  const set = <K extends keyof MathGameFormValues>(k: K, v: MathGameFormValues[K]) => setFormValues((f) => ({ ...f, [k]: v }));

  return (
    <div className="studio-skin space-y-6">
      <PageHeader
        icon={Gamepad2}
        tone="teal"
        title="Kho trò chơi"
        description="Thêm trò chơi Toán bằng đường dẫn HTTPS. Chỉ trò chơi “Đã xuất bản” hiện ở mục Trò chơi Toán của cổng học sinh; trang không cho nhúng sẽ tự mở ở tab mới cho học sinh."
        actions={
          <button type="button" onClick={openCreateModal} className="studio-btn studio-btn-primary">
            <Plus className="h-4 w-4" />
            Thêm trò chơi
          </button>
        }
      />

      {games.length > 0 && (
        <section aria-label="Thống kê Kho trò chơi" className="studio-card grid grid-cols-2 gap-1 p-1.5 sm:grid-cols-4">
          {(
            [
              ['Tổng trò chơi', counts.all, Gamepad2, 'bg-[#E6FAFC] text-[#0E8A9A]'],
              ['Đã xuất bản', counts.published, Eye, 'bg-[#E7F7F0] text-[#1F9D6B]'],
              ['Bản nháp', counts.draft, FileText, 'bg-[#FFF6DC] text-[#B7790A]'],
              ['Lưu trữ', counts.archived, Archive, 'bg-[#F1F4F9] text-[#5E6C84]'],
            ] as const
          ).map(([label, value, Icon, tone]) => (
            <div key={label} className="flex items-center gap-2.5 rounded-xl px-3 py-2">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="leading-tight">
                <span className="block font-display text-lg font-extrabold text-[#172B4D] [font-variant-numeric:tabular-nums]">{value}</span>
                <span className="block text-xs text-[#5E6C84]">{label}</span>
              </span>
            </div>
          ))}
        </section>
      )}

      {games.length > 0 && (
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Tìm theo tên hoặc mô tả trò chơi…" />
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
            <FilterSelect label="Danh mục" value={categoryFilter} onChange={setCategoryFilter}>
              <option value="all">Tất cả</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </FilterSelect>
            {/* Scrolls inside its own box on phones instead of widening the page */}
            <div className="max-w-full min-w-0 overflow-x-auto">
              <SegmentedFilter
                label="Trạng thái trò chơi"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { id: 'all', label: 'Tất cả', count: counts.all },
                  { id: 'published', label: 'Đã xuất bản', count: counts.published },
                  { id: 'draft', label: 'Nháp', count: counts.draft },
                  { id: 'archived', label: 'Lưu trữ', count: counts.archived },
                ]}
              />
            </div>
          </div>
        </Toolbar>
      )}

      {savedNotice && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-2xl border border-[#BFE8D4] bg-[#E7F7F0] p-4 text-sm font-bold text-[#1F7A55]">
          {savedNotice}
          <button type="button" onClick={() => setSavedNotice(null)} aria-label="Đóng thông báo" className="rounded-lg p-0.5 hover:bg-white/60">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {deleteError && <ErrorState message={deleteError} />}

      {gamesError ? (
        <ErrorState message={`Không tải được Kho trò chơi: ${gamesError}`} onRetry={() => window.location.reload()} />
      ) : gamesLoading ? (
        <LoadingState rows={3} label="Đang tải Kho trò chơi…" />
      ) : games.length === 0 ? (
        <EmptyState
          icon={Gamepad2}
          tone="teal"
          title="Kho trò chơi đang trống"
          text="Thêm trò chơi Toán bằng đường dẫn HTTPS (ví dụ PhET, GeoGebra, Wordwall). Trò chơi của project Firebase cũ chưa được chuyển sang project hiện tại."
          action={
            <button type="button" onClick={openCreateModal} className="studio-btn studio-btn-primary">
              <Plus className="h-4 w-4" />
              Thêm trò chơi đầu tiên
            </button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Search}
          tone="gray"
          title="Không có trò chơi phù hợp"
          text="Thử từ khóa, danh mục hoặc trạng thái khác."
          action={
            filtersOn && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                  setCategoryFilter('all');
                }}
                className="studio-btn studio-btn-secondary"
              >
                Xóa bộ lọc
              </button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {shown.map((g) => {
            const badge = STATUS_BADGE[g.status];
            const published = g.status === 'published';
            return (
              <article
                key={g.id}
                className="studio-card group flex h-full flex-col overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--studio-shadow-hover)] sm:flex-row"
              >
                <button
                  type="button"
                  onClick={() => setPreviewGame(g)}
                  aria-label={`Xem trước ${g.title}`}
                  className="relative aspect-[16/10] w-full shrink-0 overflow-hidden sm:aspect-auto sm:min-h-[168px] sm:w-[46%]"
                >
                  <GameCover game={g} className="absolute inset-0 transition duration-300 group-hover:scale-[1.03]" />
                  <span className="absolute top-2.5 left-2.5">
                    <StatusBadge kind={badge.kind}>{badge.label}</StatusBadge>
                  </span>
                  <span className="absolute inset-0 flex items-center justify-center bg-[#071A63]/0 opacity-0 transition group-hover:bg-[#071A63]/25 group-hover:opacity-100">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-[#1267E9] shadow-lg">
                      <Play className="ml-0.5 h-5 w-5 fill-current" />
                    </span>
                  </span>
                </button>

                <div className="flex min-w-0 flex-1 flex-col p-4">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${CATEGORY_CHIP[g.category] ?? 'bg-[#F1F4F9] text-[#5E6C84]'}`}>{g.category}</span>
                    <span className="ml-auto font-mono text-[11px] text-[#94A3B8]" title="Thứ tự hiển thị">
                      #{g.order}
                    </span>
                  </div>
                  <h3 className="mt-2 line-clamp-2 font-display text-base leading-snug font-extrabold text-[#172B4D]" title={g.title}>
                    {g.title}
                  </h3>
                  <p className={`mt-1 line-clamp-2 text-sm ${g.description ? 'text-[#5E6C84]' : 'text-[#94A3B8] italic'}`}>{g.description || 'Chưa có mô tả'}</p>

                  <div className="mt-auto flex items-center gap-1.5 pt-3">
                    <button
                      type="button"
                      onClick={() => void toggleStatus(g)}
                      disabled={togglingId === g.id}
                      className={`studio-btn flex-1 px-3 text-xs ${published ? 'studio-btn-secondary' : 'studio-btn-primary'}`}
                      title={published ? 'Ẩn khỏi cổng học sinh (chuyển về nháp)' : 'Xuất bản cho học sinh'}
                    >
                      {published ? <EyeOff className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                      {togglingId === g.id ? 'Đang lưu…' : published ? 'Ẩn' : 'Xuất bản'}
                    </button>
                    <button type="button" onClick={() => setPreviewGame(g)} className="studio-btn studio-btn-secondary px-2.5" title="Xem trước">
                      <Eye className="h-4 w-4" />
                      <span className="sr-only">Xem trước</span>
                    </button>
                    <button type="button" onClick={() => openEditModal(g)} className="studio-btn studio-btn-secondary px-2.5" title="Sửa trò chơi">
                      <Edit3 className="h-4 w-4" />
                      <span className="sr-only">Sửa</span>
                    </button>
                    <button type="button" onClick={() => setDeleting(g)} className="studio-btn studio-btn-danger px-2.5" title="Xóa trò chơi">
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Xóa</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Create / edit */}
      <StudioModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingGame ? 'Sửa trò chơi' : 'Thêm trò chơi'}
        icon={Gamepad2}
        tone="teal"
        width="lg"
        footer={
          <>
            <button type="button" onClick={() => setModalOpen(false)} className="studio-btn studio-btn-secondary">
              Hủy
            </button>
            <button type="submit" form="game-form" disabled={saving} className="studio-btn studio-btn-primary">
              {saving ? 'Đang lưu…' : 'Lưu trò chơi'}
            </button>
          </>
        }
      >
        <form id="game-form" onSubmit={handleSubmit} className="space-y-4">
          {formError && <ErrorState message={formError} />}
          <div>
            <label className={STUDIO_LABEL}>Tên trò chơi *</label>
            <input type="text" required value={formValues.title} onChange={(e) => set('title', e.target.value)} placeholder="Ví dụ: Khám phá phân số" className={STUDIO_INPUT} />
          </div>
          <div>
            <label className={STUDIO_LABEL}>Đường dẫn trò chơi (bắt buộc HTTPS) *</label>
            <input
              type="url"
              required
              value={formValues.embedUrl}
              onChange={(e) => set('embedUrl', e.target.value)}
              placeholder="https://phet.colorado.edu/sims/html/…"
              className={`${STUDIO_INPUT} font-mono`}
            />
            <p className="mt-1 text-xs text-[#5E6C84]">Trang không cho nhúng vẫn dùng được: học sinh sẽ mở trò chơi ở tab mới.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={STUDIO_LABEL}>Danh mục *</label>
              <select value={formValues.category} onChange={(e) => set('category', e.target.value as GameCategory)} className={STUDIO_INPUT}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={STUDIO_LABEL}>Thứ tự hiển thị</label>
              <input type="number" min={0} value={formValues.order} onChange={(e) => set('order', Number(e.target.value))} className={`${STUDIO_INPUT} font-mono`} />
            </div>
            <div>
              <label className={STUDIO_LABEL}>Trạng thái</label>
              <select value={formValues.status} onChange={(e) => set('status', e.target.value as MathGameFormValues['status'])} className={STUDIO_INPUT}>
                <option value="published">Đã xuất bản</option>
                <option value="draft">Bản nháp</option>
                <option value="archived">Lưu trữ</option>
              </select>
            </div>
          </div>
          <fieldset>
            <legend className={STUDIO_LABEL}>Ảnh bìa (không bắt buộc)</legend>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {[
                    { src: '', label: 'Mặc định theo danh mục' },
                    ...[...GAME_COVERS].sort((a, b) => Number(b.category === formValues.category) - Number(a.category === formValues.category)),
                  ].map((c) => {
                    const on = (formValues.thumbnailUrl || '') === c.src;
                    return (
                      <button
                        key={c.src || 'default'}
                        type="button"
                        onClick={() => set('thumbnailUrl', c.src)}
                        aria-pressed={on}
                        title={c.label}
                        className={`relative overflow-hidden rounded-xl ring-2 transition ${on ? 'ring-[#1267E9]' : 'ring-transparent hover:ring-[#BFD6EE]'}`}
                      >
                        <GameCover game={{ category: formValues.category, thumbnailUrl: c.src }} className="aspect-[16/10]" />
                        {c.src === '' && (
                          <span className="absolute inset-x-0 bottom-0 bg-white/85 px-1 py-0.5 text-[10px] leading-tight font-bold text-[#172B4D]">Mặc định</span>
                        )}
                        {on && (
                          <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#1267E9] text-white">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={isLibraryCover(formValues.thumbnailUrl) ? '' : formValues.thumbnailUrl || ''}
                  onChange={(e) => set('thumbnailUrl', e.target.value)}
                  placeholder="Hoặc dán đường dẫn ảnh riêng: https://…/anh.png"
                  className={`${STUDIO_INPUT} font-mono text-xs`}
                />
                <p className="text-xs text-[#5E6C84]">
                  Chưa hỗ trợ tải ảnh từ máy vì Firebase Storage chưa được bật cho MimoEDU. Ảnh riêng được hiển thị trọn vẹn, không bị méo hay cắt chữ.
                </p>
              </div>
              <div>
                <div className="overflow-hidden rounded-2xl ring-1 ring-[#DCE7F3]">
                  <GameCover game={{ category: formValues.category, thumbnailUrl: formValues.thumbnailUrl }} className="aspect-[16/10]" />
                  <div className="p-2.5">
                    <div className="line-clamp-2 text-sm font-extrabold text-[#172B4D]">{formValues.title || 'Tên trò chơi'}</div>
                    <div className="text-[11px] text-[#5E6C84]">{formValues.category} · xem trước thẻ</div>
                  </div>
                </div>
              </div>
            </div>
          </fieldset>
          <div>
            <label className={STUDIO_LABEL}>Mô tả</label>
            <textarea
              rows={3}
              value={formValues.description || ''}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Cách chơi hoặc kiến thức Toán được rèn luyện…"
              className={`${STUDIO_INPUT} py-2`}
            />
          </div>
        </form>
      </StudioModal>

      {/* Preview */}
      {previewGame && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#071A63]/50 p-4 backdrop-blur-[2px]"
          onMouseDown={(e) => e.target === e.currentTarget && setPreviewGame(null)}
        >
          <div role="dialog" aria-modal="true" className="studio-card flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DCE7F3] px-5 py-3">
              <div className="min-w-0">
                <h3 className="truncate font-display text-base font-extrabold text-[#172B4D]">Xem trước: {previewGame.title}</h3>
                <p className="truncate font-mono text-xs text-[#5E6C84]">{previewGame.embedUrl}</p>
              </div>
              <div className="flex items-center gap-2">
                <a href={previewGame.embedUrl} target="_blank" rel="noopener noreferrer" className="studio-btn studio-btn-secondary">
                  Mở tab mới <ExternalLink className="h-4 w-4" />
                </a>
                <button type="button" onClick={() => setPreviewGame(null)} aria-label="Đóng xem trước" className="studio-btn studio-btn-secondary px-2.5">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex items-start gap-2 bg-[#FFF6DC] px-5 py-2 text-xs text-[#7A5200]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Một số website chặn nhúng (X-Frame-Options / CSP). Nếu khung dưới trống hoặc báo từ chối kết nối thì trang đó không cho nhúng; học sinh vẫn chơi được vì cổng học sinh sẽ mở trò chơi ở tab mới.
            </div>
            <div className="relative flex-1 bg-[#0B1B4D]">
              <iframe
                src={previewGame.embedUrl}
                title={previewGame.title}
                sandbox="allow-scripts allow-same-origin allow-forms"
                className="h-full w-full border-0 bg-white"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        danger
        busy={deletingBusy}
        title="Xóa trò chơi?"
        message={
          <>
            <b className="text-[#172B4D]">{deleting?.title}</b> sẽ bị xóa khỏi Kho trò chơi và biến mất khỏi cổng học sinh. Nếu chỉ muốn tạm ẩn, hãy sửa trạng thái thành “Lưu trữ”.
          </>
        }
        confirmLabel="Xóa trò chơi"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setDeletingBusy(true);
          setDeleteError(null);
          try {
            await deleteMathGame(deleting.id);
            setDeleting(null);
          } catch (err) {
            setDeleting(null);
            setDeleteError(describeGameSaveError(err).replace('Trò chơi CHƯA được lưu', 'Chưa xóa được trò chơi'));
          } finally {
            setDeletingBusy(false);
          }
        }}
      />
    </div>
  );
};
