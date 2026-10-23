import React, { useMemo, useState } from 'react';
import { ArrowRight, Clock, Database, LayoutGrid, Lock, Search, Star, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { QuestionBankPanel } from './QuestionBankPanel';
import { matchesToolSearch, TEACHING_TOOLS, TeachingTool, TOOL_CATEGORIES, ToolCategory } from './toolCatalog';

type Tab = 'tools' | 'bank';

const ToolMeta: React.FC<{ tool: TeachingTool }> = ({ tool }) => (
  <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-[#5E6C84]">
    <span className="inline-flex items-center gap-1 rounded-full bg-[#F6FAFF] px-2 py-0.5">
      <Database className="h-3 w-3" /> {tool.usesQuestions ? 'Dùng Kho câu hỏi' : 'Không cần câu hỏi'}
    </span>
    <span className="inline-flex items-center gap-1 rounded-full bg-[#F6FAFF] px-2 py-0.5">
      <Users className="h-3 w-3" /> {tool.audience}
    </span>
    {tool.duration && (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#F6FAFF] px-2 py-0.5">
        <Clock className="h-3 w-3" /> {tool.duration}
      </span>
    )}
  </div>
);

const ActionButton: React.FC<{ tool: TeachingTool; onOpen: () => void; wide?: boolean }> = ({ tool, onOpen, wide }) =>
  tool.status === 'soon' ? (
    <button type="button" disabled className={`studio-btn studio-btn-secondary ${wide ? 'px-6' : 'w-full'}`}>
      <Lock className="h-4 w-4" /> Sắp ra mắt
    </button>
  ) : (
    <button type="button" onClick={onOpen} className={`studio-btn studio-btn-primary ${wide ? 'px-6' : 'w-full'}`}>
      {tool.studentShortcut ? 'Xem trước' : tool.status === 'link' ? 'Mở' : 'Bắt đầu'} <ArrowRight className="h-4 w-4" />
    </button>
  );

/** "Công cụ dạy học": catalogue of classroom tools plus the shared question bank. */
export const TeachingToolsPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('tools');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ToolCategory | 'all'>('all');
  const [onlyQuestionTools, setOnlyQuestionTools] = useState(false);

  const visible = useMemo(
    () =>
      TEACHING_TOOLS.filter(
        (t) =>
          (category === 'all' || t.category === category) &&
          (!onlyQuestionTools || t.usesQuestions) &&
          matchesToolSearch(t, search)
      ),
    [category, onlyQuestionTools, search]
  );
  const showFeatured = category === 'all' && !onlyQuestionTools && !search.trim();
  const featured = showFeatured ? visible.find((t) => t.featured) : undefined;
  const grid = visible.filter((t) => t !== featured);
  const open = (t: TeachingTool) => t.to && navigate(t.to);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-[#DCE7F3] bg-white p-5 shadow-[var(--studio-shadow)] sm:p-6">
        <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-[#EAF5FF]" />
        <div className="pointer-events-none absolute -bottom-20 right-40 h-40 w-40 rounded-full bg-[#FFEDF6]" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-[#172B4D] sm:text-3xl">Công cụ dạy học</h1>
            <p className="mt-1 text-sm text-[#5E6C84] sm:text-base">
              Biến tiết Toán thành hành trình khám phá: trò chơi, hoạt động và câu hỏi nhanh, trình chiếu được lên bảng.
            </p>
          </div>
          <label className="relative block w-full lg:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#5E6C84]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'tools' ? 'Tìm công cụ…' : 'Tìm bộ câu hỏi…'}
              aria-label="Tìm kiếm"
              className="w-full rounded-xl border border-[#DCE7F3] bg-white py-2.5 pr-3 pl-9 text-sm text-[#172B4D] focus:border-[#1267E9] focus:outline-none"
            />
          </label>
        </div>

        <div className="relative mt-5 inline-flex rounded-xl bg-[#F6FAFF] p-1 ring-1 ring-[#DCE7F3]">
          {([['tools', 'Công cụ', LayoutGrid], ['bank', 'Kho câu hỏi', Database]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-4 text-sm font-bold transition ${
                tab === id ? 'bg-[#1267E9] text-white shadow-sm' : 'text-[#5E6C84] hover:text-[#172B4D]'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </section>

      {tab === 'bank' ? (
        <QuestionBankPanel search={search} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {[{ id: 'all' as const, label: 'Tất cả', badge: '' }, ...TOOL_CATEGORIES].map((c) => {
              const count = c.id === 'all' ? TEACHING_TOOLS.length : TEACHING_TOOLS.filter((t) => t.category === c.id).length;
              const active = category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  aria-pressed={active}
                  className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-sm font-bold transition ${
                    active ? 'bg-[#071A63] text-white' : 'bg-white text-[#172B4D] ring-1 ring-[#DCE7F3] hover:ring-[#54C8FF]'
                  }`}
                >
                  {c.label}
                  <span className={`rounded-full px-1.5 text-[11px] ${active ? 'bg-white/20' : 'bg-[#F6FAFF] text-[#5E6C84]'}`}>{count}</span>
                </button>
              );
            })}
            <label className="ml-auto flex items-center gap-2 text-sm font-semibold text-[#5E6C84]">
              <input
                type="checkbox"
                checked={onlyQuestionTools}
                onChange={(e) => setOnlyQuestionTools(e.target.checked)}
                className="h-4 w-4 accent-[#1267E9]"
              />
              Chỉ công cụ dùng Kho câu hỏi
            </label>
          </div>

          {featured && (
            <article className="relative grid overflow-hidden rounded-2xl border border-[#FFC9E2] bg-gradient-to-r from-[#FFF5FA] via-white to-[#EAF5FF] shadow-[var(--studio-shadow)] md:grid-cols-[minmax(0,340px)_1fr]">
              <div className="h-48 md:h-full">
                <featured.art />
              </div>
              <div className="flex flex-col justify-center gap-3 p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="studio-badge bg-[#FF76B5] text-white">
                    <Star className="h-3 w-3 fill-white" /> Nổi bật
                  </span>
                  {featured.isNew && <span className="studio-badge bg-[#FFD34E] text-[#071A63]">Mới</span>}
                </div>
                <h2 className="font-display text-2xl font-extrabold text-[#172B4D]">{featured.name}</h2>
                <p className="text-sm text-[#5E6C84] sm:text-base">{featured.description}</p>
                <div className="flex flex-wrap gap-2 text-sm font-bold">
                  {['Gọi tên ngẫu nhiên', 'Không gọi trùng', 'Chia nhóm đều', 'Dùng danh sách lớp thật'].map((m, i) => (
                    <span key={m} className={['text-[#1267E9]', 'text-[#D9468C]', 'text-[#6A4BE6]', 'text-[#B7790A]'][i]}>
                      {i > 0 && <span className="mr-2 text-[#BFD6EE]">•</span>}
                      {m}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <ActionButton tool={featured} onOpen={() => open(featured)} wide />
                  <ToolMeta tool={featured} />
                </div>
              </div>
            </article>
          )}

          {grid.length === 0 && !featured ? (
            <div className="studio-card p-10 text-center text-sm text-[#5E6C84]">Không tìm thấy công cụ phù hợp.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {grid.map((t) => {
                const cat = TOOL_CATEGORIES.find((c) => c.id === t.category)!;
                return (
                  <article
                    key={t.id}
                    className={`group flex flex-col overflow-hidden rounded-2xl border border-[#DCE7F3] bg-white shadow-[var(--studio-shadow)] transition duration-200 ${
                      t.status === 'soon' ? 'opacity-80' : 'hover:-translate-y-1 hover:shadow-[var(--studio-shadow-hover)]'
                    }`}
                  >
                    <div className="relative h-36 p-3">
                      <t.art />
                      {t.isNew && <span className="studio-badge absolute top-5 right-5 bg-[#FFD34E] text-[#071A63]">Mới</span>}
                      {t.status === 'soon' && <span className="studio-badge absolute top-5 right-5 bg-white text-[#5E6C84] shadow-sm">Sắp ra mắt</span>}
                    </div>
                    <div className="flex flex-1 flex-col gap-2 px-4 pb-4">
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`studio-badge w-fit ${cat.badge}`}>{cat.label}</span>
                        {t.studentShortcut && <span className="studio-badge bg-slate-100 text-slate-600">Lối tắt · Dành cho học sinh</span>}
                      </div>
                      <h3 className="font-display text-base font-extrabold text-[#172B4D]">{t.name}</h3>
                      <p className="line-clamp-2 text-sm text-[#5E6C84]">{t.description}</p>
                      <ToolMeta tool={t} />
                      <div className="mt-auto pt-2">
                        <ActionButton tool={t} onOpen={() => open(t)} />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
