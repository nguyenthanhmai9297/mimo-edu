import React, { useState } from 'react';
import {
  AlertTriangle,
  Edit3,
  ExternalLink,
  Eye,
  Gamepad2,
  Plus,
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
  saveMathGame,
} from '../../services/firestoreRepository';
import { GameCategory, MathGame } from '../../types/domain';

const CATEGORIES: GameCategory[] = [
  'Số học',
  'Phép tính',
  'Hình học',
  'Tư duy logic',
  'Ôn tập kiến thức',
];

export const GamesAdminPage: React.FC = () => {
  const { games } = useAppContext();

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
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Không thể lưu trò chơi.'
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
            Quản Lý Kho Trò Chơi Toán Học (Iframe)
          </h1>
          <p className="text-sm text-slate-600">
            Thêm trò chơi tương tác qua URL HTTPS an toàn. Chỉ những trò chơi ở
            trạng thái &ldquo;Đã xuất bản&rdquo; mới hiển thị ở cổng học sinh.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="cartoon-button flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-extrabold text-slate-900 whitespace-nowrap self-start"
        >
          <Plus className="h-4 w-4" />
          Thêm Trò Chơi Mới
        </button>
      </div>

      {games.length === 0 ? (
        <div className="cartoon-card p-12 text-center">
          <Gamepad2 className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 font-display text-base font-bold text-slate-800">
            Kho trò chơi đang trống
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Hãy thêm URL nhúng HTTPS của trò chơi Toán học để học sinh giải trí.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {games.map((g) => (
            <div
              key={g.id}
              className="cartoon-card flex flex-col justify-between bg-white p-5"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-bold text-blue-700">{g.category}</span>
                  <span>·</span>
                  <span className="font-mono">Thứ tự #{g.order}</span>
                  <span>·</span>
                  <span
                    className={
                      g.status === 'published'
                        ? 'font-bold text-emerald-700'
                        : 'font-bold text-amber-700'
                    }
                  >
                    {g.status === 'published'
                      ? 'Đã xuất bản'
                      : g.status === 'draft'
                      ? 'Bản nháp'
                      : 'Lưu trữ'}
                  </span>
                </div>

                <h3 className="mt-2 font-display text-lg font-extrabold text-slate-900">
                  {g.title}
                </h3>
                {g.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                    {g.description}
                  </p>
                )}
                <div className="mt-2 truncate font-mono text-[11px] text-slate-400">
                  {g.embedUrl}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setPreviewGame(g)}
                  className="cartoon-button flex items-center gap-1 rounded-lg bg-sky-100 px-2.5 py-1.5 text-xs font-bold text-slate-900"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Xem trước Iframe
                </button>
                <button
                  type="button"
                  onClick={() => openEditModal(g)}
                  className="cartoon-button flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Sửa
                </button>
                <button
                  type="button"
                  onClick={() => deleteMathGame(g.id)}
                  className="cartoon-button flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Xóa
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="cartoon-card max-h-[90vh] w-full max-w-xl overflow-y-auto bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="font-display text-lg font-extrabold text-slate-900">
                {editingGame
                  ? 'Chỉnh Sửa Trò Chơi Toán Học'
                  : 'Thêm Trò Chơi Mới'}
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

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Tên trò chơi *
                </label>
                <input
                  type="text"
                  required
                  value={formValues.title}
                  onChange={(e) =>
                    setFormValues({ ...formValues, title: e.target.value })
                  }
                  placeholder="Ví dụ: Khám Phá Phân Số (PhET Interactive)"
                  className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  URL nhúng Iframe (Bắt buộc HTTPS) *
                </label>
                <input
                  type="url"
                  required
                  value={formValues.embedUrl}
                  onChange={(e) =>
                    setFormValues({ ...formValues, embedUrl: e.target.value })
                  }
                  placeholder="https://phet.colorado.edu/sims/html/..."
                  className="w-full rounded-xl border-2 border-slate-800 px-3 py-2 font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Danh mục *
                  </label>
                  <select
                    value={formValues.category}
                    onChange={(e) =>
                      setFormValues({
                        ...formValues,
                        category: e.target.value as GameCategory,
                      })
                    }
                    className="w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-sm"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Thứ tự hiển thị
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formValues.order}
                    onChange={(e) =>
                      setFormValues({
                        ...formValues,
                        order: Number(e.target.value),
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
                    value={formValues.status}
                    onChange={(e) =>
                      setFormValues({
                        ...formValues,
                        status: e.target.value as
                          | 'draft'
                          | 'published'
                          | 'archived',
                      })
                    }
                    className="w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-sm"
                  >
                    <option value="published">Đã xuất bản</option>
                    <option value="draft">Bản nháp</option>
                    <option value="archived">Lưu trữ</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Mô tả trò chơi
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
                  placeholder="Hướng dẫn cách chơi hoặc kiến thức Toán được rèn luyện..."
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
                  {saving ? 'Đang lưu...' : 'Lưu Trò Chơi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Iframe Preview Modal */}
      {previewGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="cartoon-card flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden bg-white">
            <div className="flex items-center justify-between border-b-2 border-slate-900 bg-amber-100 px-5 py-3">
              <div>
                <h3 className="font-display text-base font-extrabold text-slate-900">
                  Xem trước: {previewGame.title}
                </h3>
                <p className="font-mono text-xs text-slate-600">
                  {previewGame.embedUrl}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewGame.embedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cartoon-button flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-800"
                >
                  Mở tab mới <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewGame(null)}
                  className="rounded-lg border-2 border-slate-900 bg-white p-1"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
              <span>
                Lưu ý: Một số website bên ngoài đặt chính sách{' '}
                <code>X-Frame-Options</code> chặn nhúng iframe. Nếu khung dưới
                trống hoặc báo từ chối kết nối, hãy sử dụng nguồn hỗ trợ nhúng
                (như PhET Interactive Simulations, GeoGebra hoặc Wordwall Embed).
              </span>
            </div>

            <div className="relative flex-1 bg-slate-900">
              <iframe
                src={previewGame.embedUrl}
                title={previewGame.title}
                sandbox="allow-scripts allow-same-origin allow-forms"
                className="h-full w-full border-0"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
