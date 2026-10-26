import React, { useRef, useState } from 'react';
import { AlertTriangle, ClipboardPaste, Download, FileUp, ListChecks, PencilLine, Plus, Trash2, Users, X } from 'lucide-react';
import { useAppContext } from '../../../app/providers';
import { ErrorState, STUDIO_INPUT, StudioModal } from '../../../components/studio/StudioUi';
import { MAX_PLAYERS } from './bellEngine';
import { downloadRosterTemplate, duplicateNames, readRosterFile, ROSTER_ACCEPT } from './rosterFile';

export interface RosterRow {
  key: string;
  name: string;
  /** Unticked: not playing this time (keeps their number). */
  on: boolean;
}

/** Who plays: taken from a MimoEDU class, a file or typed in. Only names are kept, for this game. */
export interface Roster {
  source: 'class' | 'file' | 'manual';
  label: string;
  classId?: string;
  rows: RosterRow[];
}

const STORE_KEY = 'mimo.bell.roster';
let seq = 0;
const row = (name: string): RosterRow => ({ key: `r${Date.now().toString(36)}${seq++}`, name, on: true });

/** Each pupil keeps their number in the list (unticked pupils keep theirs too). */
export const rosterPlayers = (r: Roster | null) =>
  (r?.rows ?? []).map((x, i) => ({ seat: i + 1, name: x.name.replace(/\s+/g, ' ').trim(), on: x.on })).filter((p) => p.on && p.name).map(({ seat, name }) => ({ seat, name }));

export const loadRoster = (): Roster | null => {
  try {
    const r = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Roster | null;
    return r && Array.isArray(r.rows) ? r : null;
  } catch {
    return null;
  }
};
export const keepRoster = (r: Roster | null) => {
  try {
    if (r) localStorage.setItem(STORE_KEY, JSON.stringify(r));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    // storage blocked: the list lasts until the page is closed
  }
};

const classLabel = (name: string) => (/^lớp/i.test(name.trim()) ? name.trim() : `Lớp ${name.trim()}`);

export const BellRosterPicker: React.FC<{ roster: Roster | null; onChange: (r: Roster | null) => void; optional: boolean }> = ({ roster, onChange, optional }) => {
  const { classes, students } = useAppContext();
  const activeClasses = classes.filter((c) => c.status === 'active');
  const fileInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  const fromClass = (classId: string) => {
    const c = activeClasses.find((x) => x.id === classId);
    if (!c) return onChange(null);
    const rows = students.filter((s) => s.status === 'active' && s.classIds.includes(classId)).map((s) => row(s.fullName));
    onChange({ source: 'class', label: classLabel(c.name), classId, rows });
  };
  const fromFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setReading(true);
    try {
      const r = await readRosterFile(file);
      onChange({ source: 'file', label: r.className ? classLabel(r.className) : file.name.replace(/\.[^.]+$/, ''), rows: r.names.map(row) });
      setEditing(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  };
  const pickFile = () => {
    if (fileInput.current) fileInput.current.value = '';
    fileInput.current?.click();
  };

  const players = rosterPlayers(roster);
  const dups = duplicateNames(players);

  return (
    <div className="space-y-2" data-testid="bell-roster">
      <div className="text-sm font-extrabold text-[#172B4D]">Học sinh tham gia</div>
      <input ref={fileInput} type="file" hidden accept={ROSTER_ACCEPT} data-testid="bell-roster-file" onChange={(e) => void fromFile(e.target.files?.[0])} />
      {roster ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-[#DCE7F3] p-3">
          <Users className="h-5 w-5 text-[#2563EB]" />
          <span className="font-extrabold text-[#172B4D]" data-testid="bell-roster-summary">
            {roster.label} – {players.length} học sinh
          </span>
          {dups.length > 0 && (
            <span className="flex items-center gap-1 text-xs font-bold text-amber-700">
              <AlertTriangle className="h-4 w-4" /> {dups.length} tên trùng
            </span>
          )}
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className="studio-btn studio-btn-secondary">
              <ListChecks className="h-4 w-4" /> Xem / chỉnh sửa danh sách
            </button>
            <button type="button" aria-label="Đổi danh sách" title="Đổi danh sách" onClick={() => onChange(null)} className="studio-btn studio-btn-secondary px-2">
              <X className="h-4 w-4" />
            </button>
          </span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select id="bell-class" aria-label="Chọn lớp từ MimoEDU" className={STUDIO_INPUT} value="" onChange={(e) => fromClass(e.target.value)}>
              <option value="">Chọn lớp MimoEDU…</option>
              {activeClasses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button type="button" disabled={reading} onClick={pickFile} className="studio-btn studio-btn-secondary justify-center">
              <FileUp className="h-4 w-4" /> {reading ? 'Đang đọc tệp…' : 'Tải danh sách từ tệp'}
            </button>
            <button
              type="button"
              onClick={() => {
                onChange({ source: 'manual', label: 'Danh sách tự nhập', rows: [] });
                setEditing(true);
              }}
              className="studio-btn studio-btn-secondary justify-center"
            >
              <PencilLine className="h-4 w-4" /> Nhập tên
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#5E6C84]">
            {optional && <span>Không chọn: học sinh tự gõ tên khi vào phòng.</span>}
            <button type="button" onClick={() => void downloadRosterTemplate()} className="inline-flex items-center gap-1 font-bold text-[#2563EB] hover:underline">
              <Download className="h-3.5 w-3.5" /> Tải file Excel mẫu
            </button>
          </div>
        </>
      )}
      {error && <ErrorState message={error} />}
      {roster && <RosterEditor open={editing} roster={roster} onChange={onChange} onClose={() => setEditing(false)} />}
    </div>
  );
};

const RosterEditor: React.FC<{ open: boolean; roster: Roster; onChange: (r: Roster) => void; onClose: () => void }> = ({ open, roster, onChange, onClose }) => {
  const [paste, setPaste] = useState('');
  const set = (rows: RosterRow[]) => onChange({ ...roster, rows });
  const edit = (key: string, change: Partial<RosterRow>) => set(roster.rows.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const players = rosterPlayers(roster);
  const dups = duplicateNames(players);
  const dupSeats = new Set(dups.flatMap((d) => d.seats));
  const blanks = roster.rows.filter((r) => !r.name.trim()).length;
  const lastInput = useRef<HTMLInputElement>(null);
  const add = () => {
    set([...roster.rows, row('')]);
    window.setTimeout(() => lastInput.current?.focus(), 0);
  };

  return (
    <StudioModal
      open={open}
      onClose={onClose}
      icon={Users}
      tone="blue"
      width="lg"
      title={`${roster.label} – ${players.length} học sinh`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={add} className="studio-btn studio-btn-secondary mr-auto">
            <Plus className="h-4 w-4" /> Thêm học sinh
          </button>
          {blanks > 0 && (
            <button type="button" onClick={() => set(roster.rows.filter((r) => r.name.trim()))} className="studio-btn studio-btn-secondary">
              Xóa {blanks} dòng trống
            </button>
          )}
          <button type="button" onClick={onClose} className="studio-btn studio-btn-primary">
            Xong
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {players.length > MAX_PLAYERS && <ErrorState message={`Tối đa ${MAX_PLAYERS} học sinh trên sân.`} />}
        {dups.length > 0 && (
          <div role="status" className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="bell-roster-dups">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Tên trùng – kiểm tra lại: {dups.map((d) => `${d.name} (số ${d.seats.join(', ')})`).join('; ')}</span>
          </div>
        )}
        {roster.rows.length === 0 && (
          <div className="space-y-2">
            <textarea
              aria-label="Dán danh sách, mỗi dòng một tên"
              rows={6}
              className={STUDIO_INPUT}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={'Mỗi dòng một tên\nNguyễn An\nTrần Bình'}
            />
            <button
              type="button"
              disabled={!paste.trim()}
              onClick={() => {
                set(paste.split('\n').map((n) => n.replace(/^\d{1,3}\s*[.)\-–:]\s*/, '').trim()).filter(Boolean).map(row));
                setPaste('');
              }}
              className="studio-btn studio-btn-secondary"
            >
              <ClipboardPaste className="h-4 w-4" /> Đưa vào danh sách
            </button>
          </div>
        )}
        <ol className="divide-y divide-[#EEF2F7]">
          {roster.rows.map((r, i) => (
            <li key={r.key} className="flex items-center gap-2 py-1.5" data-testid="bell-roster-row">
              <input type="checkbox" aria-label={`Tham gia: ${r.name || `dòng ${i + 1}`}`} checked={r.on} onChange={(e) => edit(r.key, { on: e.target.checked })} className="h-4 w-4" />
              <span className="w-8 text-right font-display font-extrabold text-[#3B4A66] [font-variant-numeric:tabular-nums]">{i + 1}</span>
              <input
                ref={i === roster.rows.length - 1 ? lastInput : undefined}
                aria-label={`Họ tên số ${i + 1}`}
                maxLength={40}
                value={r.name}
                onChange={(e) => edit(r.key, { name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && i === roster.rows.length - 1) {
                    e.preventDefault();
                    add();
                  }
                }}
                className={`${STUDIO_INPUT} py-1.5 ${!r.on ? 'opacity-50' : ''} ${dupSeats.has(i + 1) ? 'border-amber-400' : ''}`}
              />
              <button type="button" aria-label={`Xóa số ${i + 1}`} onClick={() => set(roster.rows.filter((x) => x.key !== r.key))} className="rounded-lg p-1.5 text-[#5E6C84] hover:bg-rose-50 hover:text-rose-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </StudioModal>
  );
};
