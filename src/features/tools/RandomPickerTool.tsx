import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dices, RotateCcw, Shuffle, Users } from 'lucide-react';
import { useAppContext } from '../../app/providers';
import { groupCountForSize, parseNameList, pickName, randomIndex, splitIntoGroups } from './toolUtils';

const GROUP_COLORS = [
  'from-[#1267E9] to-[#54C8FF]',
  'from-[#FF76B5] to-[#FFB3D6]',
  'from-[#FFB800] to-[#FFD34E]',
  'from-[#7B5CFF] to-[#B49CFF]',
  'from-[#13B5C9] to-[#54C8FF]',
  'from-[#22C38E] to-[#7FE0BD]',
  'from-[#071A63] to-[#1267E9]',
  'from-[#FF8A5B] to-[#FFC2A6]',
];
const SPIN_MS = 1400;

type Mode = 'pick' | 'groups';

/** "Gọi tên & Chia nhóm": names come from a MimoEDU class or a pasted list. */
export const RandomPickerTool: React.FC<{ presenting: boolean }> = ({ presenting }) => {
  const { classes, students } = useAppContext();
  const activeClasses = classes.filter((c) => c.status === 'active');
  const [source, setSource] = useState<string>(activeClasses[0]?.id ?? 'manual');
  const [manualText, setManualText] = useState('');
  const [useNickname, setUseNickname] = useState(false);
  const [mode, setMode] = useState<Mode>('pick');

  const [avoidRepeats, setAvoidRepeats] = useState(true);
  const [called, setCalled] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const spinTimer = useRef<number | null>(null);

  const [splitBy, setSplitBy] = useState<'count' | 'size'>('count');
  const [splitValue, setSplitValue] = useState(4);
  const [groups, setGroups] = useState<string[][]>([]);

  const names = useMemo(() => {
    if (source === 'manual') return parseNameList(manualText);
    return students
      .filter((s) => s.status === 'active' && s.classIds.includes(source))
      .map((s) => (useNickname && s.nickname ? s.nickname : s.fullName))
      .sort((a, b) => a.localeCompare(b, 'vi'));
  }, [source, manualText, students, useNickname]);

  // Classes load after the page opens: pick the first class once it arrives
  const autoSelected = useRef(false);
  useEffect(() => {
    if (autoSelected.current || activeClasses.length === 0) return;
    autoSelected.current = true;
    if (source === 'manual' && !manualText) setSource(activeClasses[0].id);
  }, [activeClasses, source, manualText]);

  // A new list starts a fresh round
  useEffect(() => {
    setCalled([]);
    setCurrent(null);
    setGroups([]);
    setNotice(null);
  }, [source, manualText, useNickname]);

  useEffect(() => () => {
    if (spinTimer.current) window.clearInterval(spinTimer.current);
  }, []);

  const callName = () => {
    if (names.length === 0 || spinning) return;
    const result = pickName(names, called, avoidRepeats);
    if (!result) return;
    setNotice(result.roundReset ? 'Cả lớp đã được gọi, bắt đầu lượt mới!' : null);
    setSpinning(true);
    const startedAt = Date.now();
    spinTimer.current = window.setInterval(() => {
      if (Date.now() - startedAt >= SPIN_MS) {
        if (spinTimer.current) window.clearInterval(spinTimer.current);
        setCurrent(result.name);
        setCalled(result.called);
        setSpinning(false);
      } else {
        setCurrent(names[randomIndex(names.length)]);
      }
    }, 70);
  };

  const makeGroups = () => {
    const count = splitBy === 'count' ? splitValue : groupCountForSize(names.length, splitValue);
    setGroups(splitIntoGroups(names, count));
  };

  const remaining = avoidRepeats ? names.length - called.length : names.length;
  const big = presenting;

  return (
    <div className={`grid gap-6 ${big ? '' : 'lg:grid-cols-[300px_minmax(0,1fr)]'}`}>
      {/* Settings – hidden while presenting to keep the board clean */}
      {!big && (
        <aside className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[#5E6C84]" htmlFor="picker-source">Danh sách học sinh</label>
            <select
              id="picker-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#DCE7F3] bg-white px-3 py-2.5 text-sm font-semibold text-[#172B4D] focus:border-[#1267E9] focus:outline-none"
            >
              {activeClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({students.filter((s) => s.status === 'active' && s.classIds.includes(c.id)).length} học sinh)
                </option>
              ))}
              <option value="manual">Nhập danh sách thủ công</option>
            </select>
          </div>

          {source === 'manual' ? (
            <div>
              <label className="text-xs font-bold text-[#5E6C84]" htmlFor="picker-names">Mỗi dòng một tên</label>
              <textarea
                id="picker-names"
                rows={7}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder={'Nguyễn Minh An\nTrần Bảo Ngọc\nLê Gia Huy'}
                className="mt-1 w-full rounded-xl border border-[#DCE7F3] bg-white px-3 py-2 text-sm text-[#172B4D] focus:border-[#1267E9] focus:outline-none"
              />
            </div>
          ) : (
            <label className="flex items-center gap-2 text-sm text-[#172B4D]">
              <input type="checkbox" checked={useNickname} onChange={(e) => setUseNickname(e.target.checked)} className="h-4 w-4 accent-[#1267E9]" />
              Dùng tên gọi thân mật (nếu có)
            </label>
          )}

          <div className="rounded-xl bg-[#F6FAFF] p-3 text-sm text-[#5E6C84]">
            <Users className="mr-1 inline h-4 w-4 text-[#1267E9]" />
            <b className="text-[#172B4D]">{names.length}</b> học sinh trong danh sách
          </div>
        </aside>
      )}

      <section className="min-w-0">
        <div className="mb-5 inline-flex rounded-xl bg-[#EAF5FF] p-1">
          {([['pick', 'Gọi tên ngẫu nhiên', Dices], ['groups', 'Chia nhóm', Shuffle]] as const).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 font-bold transition ${big ? 'min-h-[52px] text-lg' : 'min-h-[40px] text-sm'} ${
                mode === m ? 'bg-white text-[#1267E9] shadow-sm' : 'text-[#5E6C84] hover:text-[#172B4D]'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {names.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#BFD6EE] bg-[#F6FAFF] p-10 text-center text-sm text-[#5E6C84]">
            Chưa có tên nào. Hãy chọn lớp có học sinh hoặc nhập danh sách thủ công.
          </div>
        ) : mode === 'pick' ? (
          <div className="space-y-5">
            <div
              className={`flex items-center justify-center rounded-3xl bg-gradient-to-br from-[#071A63] via-[#1267E9] to-[#54C8FF] px-6 text-center text-white shadow-[0_24px_50px_-28px_rgba(18,103,233,0.9)] ${
                big ? 'min-h-[46vh]' : 'min-h-[220px]'
              }`}
              aria-live="polite"
            >
              <span
                className={`font-display font-extrabold break-words transition ${spinning ? 'opacity-80' : 'mimo-pop'} ${
                  big ? 'text-6xl sm:text-8xl' : 'text-4xl sm:text-5xl'
                }`}
              >
                {current ?? 'Sẵn sàng!'}
              </span>
            </div>

            {notice && <div className="rounded-xl bg-[#FFF6DC] px-4 py-2.5 text-sm font-bold text-[#B7790A]">{notice}</div>}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={callName}
                disabled={spinning}
                className={`studio-btn studio-btn-accent ${big ? 'min-h-[64px] px-10 text-xl' : 'min-h-[48px] px-7 text-base'}`}
              >
                <Dices className="h-5 w-5" /> {spinning ? 'Đang chọn…' : 'Gọi tên'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCalled([]);
                  setCurrent(null);
                  setNotice(null);
                }}
                className={`studio-btn studio-btn-secondary ${big ? 'min-h-[64px] text-lg' : ''}`}
              >
                <RotateCcw className="h-4 w-4" /> Lượt mới
              </button>
              <label className={`flex items-center gap-2 text-[#172B4D] ${big ? 'text-lg' : 'text-sm'}`}>
                <input type="checkbox" checked={avoidRepeats} onChange={(e) => setAvoidRepeats(e.target.checked)} className="h-4 w-4 accent-[#1267E9]" />
                Không gọi lại người đã gọi
              </label>
              {avoidRepeats && (
                <span className={`studio-badge studio-badge-info ${big ? 'text-sm' : ''}`}>Còn {remaining}/{names.length} bạn</span>
              )}
            </div>

            {called.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-bold text-[#5E6C84]">Đã gọi ({called.length})</div>
                <div className="flex flex-wrap gap-2">
                  {called.map((n, i) => (
                    <span key={`${n}-${i}`} className={`rounded-full bg-[#EAF5FF] px-3 py-1 font-semibold text-[#1267E9] ${big ? 'text-base' : 'text-xs'}`}>
                      {i + 1}. {n}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div className={`flex flex-wrap items-center gap-3 ${big ? 'text-lg' : 'text-sm'}`}>
              <select
                value={splitBy}
                onChange={(e) => setSplitBy(e.target.value as 'count' | 'size')}
                aria-label="Cách chia nhóm"
                className="rounded-xl border border-[#DCE7F3] bg-white px-3 py-2 font-semibold text-[#172B4D]"
              >
                <option value="count">Chia thành số nhóm</option>
                <option value="size">Số bạn mỗi nhóm</option>
              </select>
              <div className="inline-flex items-center rounded-xl border border-[#DCE7F3] bg-white">
                <button type="button" onClick={() => setSplitValue((v) => Math.max(2, v - 1))} className="px-3 py-2 text-lg font-bold text-[#1267E9]" aria-label="Giảm">−</button>
                <span className="min-w-[2.5rem] text-center font-display text-lg font-extrabold text-[#172B4D]">{splitValue}</span>
                <button type="button" onClick={() => setSplitValue((v) => Math.min(12, v + 1))} className="px-3 py-2 text-lg font-bold text-[#1267E9]" aria-label="Tăng">+</button>
              </div>
              <button type="button" onClick={makeGroups} className={`studio-btn studio-btn-primary ${big ? 'min-h-[56px] px-8 text-lg' : 'min-h-[44px] px-6'}`}>
                <Shuffle className="h-4 w-4" /> {groups.length ? 'Chia lại' : 'Chia nhóm'}
              </button>
            </div>

            {groups.length > 0 ? (
              <div className={`grid gap-4 ${big ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
                {groups.map((g, i) => (
                  <div key={i} className="mimo-pop overflow-hidden rounded-2xl bg-white shadow-[var(--studio-shadow)] ring-1 ring-[#DCE7F3]" style={{ animationDelay: `${i * 0.06}s` }}>
                    <div className={`bg-gradient-to-r px-4 py-2.5 font-display font-extrabold text-white ${GROUP_COLORS[i % GROUP_COLORS.length]} ${big ? 'text-2xl' : 'text-base'}`}>
                      Nhóm {i + 1} <span className="font-semibold opacity-80">· {g.length} bạn</span>
                    </div>
                    <ul className={`space-y-1 px-4 py-3 text-[#172B4D] ${big ? 'text-xl' : 'text-sm'}`}>
                      {g.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#BFD6EE] bg-[#F6FAFF] p-8 text-center text-sm text-[#5E6C84]">
                Chọn cách chia rồi bấm <b>Chia nhóm</b>. {names.length} bạn sẽ được chia đều, các nhóm chênh nhau tối đa 1 bạn.
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
