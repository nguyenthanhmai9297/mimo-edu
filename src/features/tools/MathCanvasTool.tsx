import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, FilePlus2, FolderOpen, Library, Pencil, Shapes, Trash2 } from 'lucide-react';
import { CanvasEditor } from './mathCanvas/CanvasEditor';
import {
  deleteCanvas,
  duplicateCanvas,
  listCanvases,
  loadCanvas,
  newCanvasId,
  renameCanvas,
  saveCanvas,
  type SavedCanvas,
} from './mathCanvas/canvasFiles';
import { emptyDoc, parseCanvas, type CanvasDoc } from './mathCanvas/geometry';
import { CANVAS_TEMPLATES } from './mathCanvas/templates';

// ------------------------------------------------------------------ library

const CanvasLibrary: React.FC<{ onOpen: (id: string, doc: CanvasDoc) => void; onImport: () => void; notice: string }> = ({ onOpen, onImport, notice }) => {
  const [items, setItems] = useState<SavedCanvas[]>(() => listCanvases());
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');
  const refresh = () => setItems(listCanvases());
  const create = (doc: CanvasDoc) => {
    const id = newCanvasId();
    const r = saveCanvas(id, doc);
    if (!r.ok) setError(r.message);
    onOpen(id, doc);
  };
  const group = (g: (typeof CANVAS_TEMPLATES)[number]['group']) => CANVAS_TEMPLATES.filter((t) => t.group === g);

  return (
    <div className="space-y-6">
      {(error || notice) && <p className="rounded-xl bg-[#FFEDF1] px-4 py-2 text-sm font-bold text-[#D93B5B]">{error || notice}</p>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => create(emptyDoc())} className="studio-btn studio-btn-primary min-h-[48px] px-5 text-base">
              <FilePlus2 className="h-5 w-5" /> Bản vẽ mới
            </button>
            <button type="button" onClick={onImport} className="studio-btn studio-btn-secondary min-h-[48px]">
              <FolderOpen className="h-5 w-5" /> Mở tệp JSON
            </button>
          </div>
          {(
            [
              ['hinh-phang', 'Mẫu hình phẳng'],
              ['dem-hinh', 'Mẫu đếm hình'],
              ['lop-3', 'Lưới ô vuông và sơ đồ đoạn thẳng'],
              ['khoi-3d', 'Hình khối 3D và xếp khối'],
            ] as const
          ).map(([g, title]) => (
            <div key={g}>
              <h2 className="mb-2 font-display text-base font-extrabold text-[#172B4D]">{title} (sửa được mọi đỉnh, cạnh, nhãn)</h2>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {group(g).map((t) => (
                  <button key={t.id} type="button" onClick={() => create(t.build())} className="studio-card flex items-center gap-3 p-3 text-left transition hover:ring-2 hover:ring-[#54C8FF]">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF5FF] text-[#1267E9]">
                      <Shapes className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-bold text-[#071A63]">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <aside className="studio-card h-fit space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-[#071A63]">
            <Library className="h-5 w-5 text-[#1267E9]" /> Bản vẽ đã lưu trên máy này
          </h2>
          {items.length === 0 && <p className="text-sm text-[#5E6C84]">Chưa có bản vẽ nào. Bản vẽ tự lưu khi bạn chỉnh sửa.</p>}
          <ul className="space-y-2">
            {items.map((m) => (
              <li key={m.id} className="rounded-xl bg-[#F6FAFF] p-3 ring-1 ring-[#DCE7F3]">
                {renaming?.id === m.id ? (
                  <form
                    className="flex gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const r = renameCanvas(m.id, renaming.title);
                      if (!r.ok) setError(r.message);
                      setRenaming(null);
                      refresh();
                    }}
                  >
                    <input autoFocus value={renaming.title} maxLength={80} aria-label="Tên mới" onChange={(e) => setRenaming({ id: m.id, title: e.target.value })} className="min-w-0 flex-1 rounded-lg border-2 border-[#1267E9] px-2 py-1 text-sm font-bold" />
                    <button type="submit" className="studio-btn studio-btn-primary min-h-[34px] px-3 text-sm">
                      Lưu
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="block w-full text-left"
                    onClick={() => {
                      const doc = loadCanvas(m.id);
                      if (doc) onOpen(m.id, doc);
                      else setError('Không mở được bản vẽ này (dữ liệu hỏng).');
                    }}
                  >
                    <div className="truncate font-display font-extrabold text-[#071A63]">{m.title}</div>
                    <div className="text-xs text-[#5E6C84]">
                      Sửa lúc {new Date(m.updatedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                    </div>
                  </button>
                )}
                {confirm === m.id ? (
                  <div role="alertdialog" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-[#FFF1F4] p-2 text-xs font-bold text-[#D93B5B]">
                    Xóa hẳn bản vẽ này?
                    <button
                      type="button"
                      onClick={() => {
                        deleteCanvas(m.id);
                        setConfirm(null);
                        refresh();
                      }}
                      className="rounded-full bg-[#D93B5B] px-3 py-1 text-white"
                    >
                      Xóa
                    </button>
                    <button type="button" onClick={() => setConfirm(null)} className="rounded-full bg-white px-3 py-1 text-slate-600 ring-1 ring-slate-300">
                      Hủy
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
                    <button type="button" onClick={() => setRenaming({ id: m.id, title: m.title })} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[#1267E9] ring-1 ring-[#DCE7F3]">
                      <Pencil className="h-3.5 w-3.5" /> Đổi tên
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const r = duplicateCanvas(m.id);
                        if (!r.ok) setError(r.message);
                        refresh();
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[#1267E9] ring-1 ring-[#DCE7F3]"
                    >
                      <Copy className="h-3.5 w-3.5" /> Nhân bản
                    </button>
                    <button type="button" onClick={() => setConfirm(m.id)} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[#D93B5B] ring-1 ring-[#FFC9D1]">
                      <Trash2 className="h-3.5 w-3.5" /> Xóa
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-[#5E6C84]">Bản vẽ chỉ lưu trên trình duyệt của máy này. Muốn dùng ở máy khác, mở bản vẽ rồi chọn Xuất file → JSON.</p>
        </aside>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ tool

/** "Bảng vẽ Toán học": drawings stay in this browser (autosave) or in JSON files. */
export const MathCanvasTool: React.FC<{ presenting: boolean }> = ({ presenting }) => {
  const [current, setCurrent] = useState<{ id: string; doc: CanvasDoc } | null>(null);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState({ ok: true, message: '' });
  const past = useRef<CanvasDoc[]>([]);
  const future = useRef<CanvasDoc[]>([]);
  const docRef = useRef<CanvasDoc | null>(null);
  docRef.current = current?.doc ?? null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [, force] = useState(0);

  const persist = useCallback((id: string, doc: CanvasDoc) => {
    const r = saveCanvas(id, doc);
    setSaveState(r.ok ? { ok: true, message: `Đã lưu ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` } : { ok: false, message: r.message });
  }, []);

  useEffect(() => {
    if (!current) return;
    const id = window.setTimeout(() => persist(current.id, current.doc), 600);
    return () => window.clearTimeout(id);
  }, [current, persist]);

  const set = (doc: CanvasDoc) => setCurrent((c) => (c ? { ...c, doc } : c));
  /** A change that is one undo step. */
  const apply = useCallback((next: CanvasDoc) => {
    const cur = docRef.current;
    if (cur && cur !== next) {
      past.current = [...past.current.slice(-99), cur];
      future.current = [];
      force((x) => x + 1);
    }
    set(next);
  }, []);
  /** A change during a drag or while typing: the undo step is recorded at the end. */
  const live = useCallback((next: CanvasDoc) => set(next), []);
  const commitFrom = useCallback((before: CanvasDoc) => {
    if (docRef.current && docRef.current !== before && past.current[past.current.length - 1] !== before) {
      past.current = [...past.current.slice(-99), before];
      future.current = [];
      force((x) => x + 1);
    }
  }, []);
  const undo = () => {
    const prev = past.current.pop();
    if (!prev || !docRef.current) return;
    future.current.push(docRef.current);
    set(prev);
    force((x) => x + 1);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next || !docRef.current) return;
    past.current.push(docRef.current);
    set(next);
    force((x) => x + 1);
  };

  const open = (id: string, doc: CanvasDoc) => {
    past.current = [];
    future.current = [];
    setError('');
    setCurrent({ id, doc });
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = parseCanvas(JSON.parse(await file.text()));
      if (typeof parsed === 'string') setError(parsed);
      else {
        const id = newCanvasId();
        const r = saveCanvas(id, parsed);
        if (!r.ok) setError(r.message);
        open(id, parsed);
      }
    } catch {
      setError('Không đọc được tệp. Hãy chọn tệp .json được lưu từ Bảng vẽ Toán học.');
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} data-testid="canvas-file" />
      {current ? (
        <>
          {error && <p className="mb-2 rounded-xl bg-[#FFEDF1] px-4 py-2 text-sm font-bold text-[#D93B5B]">{error}</p>}
          <CanvasEditor
            key={current.id}
            doc={current.doc}
            apply={apply}
            live={live}
            commitFrom={commitFrom}
            undo={past.current.length ? undo : null}
            redo={future.current.length ? redo : null}
            presenting={presenting}
            saveState={saveState}
            onSaveNow={() => persist(current.id, current.doc)}
            onLibrary={() => {
              persist(current.id, current.doc);
              setCurrent(null);
              setSaveState({ ok: true, message: '' });
            }}
            onImport={() => fileRef.current?.click()}
          />
        </>
      ) : (
        <CanvasLibrary onOpen={open} onImport={() => fileRef.current?.click()} notice={error} />
      )}
    </>
  );
};
