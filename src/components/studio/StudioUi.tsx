import React, { useEffect } from 'react';
import { AlertTriangle, LucideIcon, Search, X } from 'lucide-react';

/**
 * Shared building blocks of MimoEDU Studio, matching the Tổng quan page:
 * white cards with a light blue border and soft shadow (studio-card), blue /
 * navy / yellow buttons (studio-btn-*), pill badges (studio-badge-*), all
 * driven by the --studio-* tokens in index.css. Teacher pages only.
 */

export type StudioTone = 'blue' | 'green' | 'yellow' | 'pink' | 'teal' | 'navy' | 'gray';

/** Icon tile colours, as on the Tổng quan KPI cards. */
export const STUDIO_TONE: Record<StudioTone, string> = {
  blue: 'bg-[#EAF5FF] text-[#1267E9]',
  green: 'bg-[#E7F7F0] text-[#1F9D6B]',
  yellow: 'bg-[#FFF6DC] text-[#B7790A]',
  pink: 'bg-[#FFEDF6] text-[#D9468C]',
  teal: 'bg-[#E6FAFC] text-[#0E8A9A]',
  navy: 'bg-[#E8ECF8] text-[#071A63]',
  gray: 'bg-[#F1F4F9] text-[#5E6C84]',
};

export const STUDIO_TEXT = 'text-[#172B4D]';
export const STUDIO_MUTED = 'text-[#5E6C84]';
/** Text inputs and selects. */
export const STUDIO_INPUT =
  'min-h-[40px] w-full rounded-xl border border-[#DCE7F3] bg-white px-3 text-sm text-[#172B4D] placeholder:text-[#94A3B8] transition focus:border-[#54C8FF] focus:ring-4 focus:ring-[#54C8FF]/20 focus:outline-none';
export const STUDIO_LABEL = 'mb-1 block text-xs font-bold text-[#5E6C84]';

/** Page title block: icon tile, title, one-line description and the page actions. */
export const PageHeader: React.FC<{
  icon: LucideIcon;
  tone?: StudioTone;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}> = ({ icon: Icon, tone = 'blue', title, description, actions, eyebrow }) => (
  <section className="studio-card relative overflow-hidden p-5 sm:p-6">
    <div className="pointer-events-none absolute -top-16 -right-12 h-44 w-44 rounded-full bg-[#EAF5FF] blur-2xl" aria-hidden="true" />
    <div className="pointer-events-none absolute -bottom-20 right-1/4 h-36 w-36 rounded-full bg-[#FFD34E]/15 blur-2xl" aria-hidden="true" />
    <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
      <div className="flex min-w-0 items-start gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${STUDIO_TONE[tone]}`}>
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          {eyebrow && <div className="mb-0.5 text-xs font-bold text-[#1267E9]">{eyebrow}</div>}
          <h1 className={`font-display text-2xl font-extrabold sm:text-[1.7rem] ${STUDIO_TEXT}`}>{title}</h1>
          {description && <p className={`mt-1 max-w-3xl text-sm leading-relaxed ${STUDIO_MUTED}`}>{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  </section>
);

export const SectionHeading: React.FC<{ icon?: LucideIcon; title: React.ReactNode; note?: React.ReactNode; actions?: React.ReactNode }> = ({
  icon: Icon,
  title,
  note,
  actions,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h2 className={`flex items-center gap-2 font-display text-base font-extrabold sm:text-lg ${STUDIO_TEXT}`}>
        {Icon && <Icon className="h-5 w-5 text-[#1267E9]" />}
        {title}
      </h2>
      {note && <p className={`text-xs ${STUDIO_MUTED}`}>{note}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export const StatCard: React.FC<{ icon: LucideIcon; tone: StudioTone; label: string; value: React.ReactNode; note?: React.ReactNode }> = ({
  icon: Icon,
  tone,
  label,
  value,
  note,
}) => (
  <div className="studio-card p-4 transition hover:shadow-[var(--studio-shadow-hover)] sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <span className={`text-xs font-semibold sm:text-sm ${STUDIO_MUTED}`}>{label}</span>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${STUDIO_TONE[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
    </div>
    <div className={`mt-2 font-display text-3xl font-extrabold [font-variant-numeric:tabular-nums] ${STUDIO_TEXT}`}>{value}</div>
    {note && <div className={`mt-1 text-xs ${STUDIO_MUTED}`}>{note}</div>}
  </div>
);

/** Search box + filters row. */
export const Toolbar: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`studio-card flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-center ${className}`}>{children}</div>
);

export const SearchInput: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string; className?: string }> = ({
  value,
  onChange,
  placeholder,
  className = '',
}) => (
  <label className={`relative block min-w-0 flex-1 ${className}`}>
    <span className="sr-only">{placeholder}</span>
    <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
    <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${STUDIO_INPUT} pl-9`} />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        aria-label="Xóa từ khóa"
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1 text-[#94A3B8] hover:bg-[#F6FAFF] hover:text-[#172B4D]"
      >
        <X className="h-4 w-4" />
      </button>
    )}
  </label>
);

/** Segmented filter (status tabs), with optional counts. */
export function SegmentedFilter<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; count?: number }[];
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex shrink-0 gap-1 overflow-x-auto rounded-xl bg-[#F6FAFF] p-1">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 text-xs font-bold whitespace-nowrap transition ${
              on ? 'bg-white text-[#1267E9] shadow-sm ring-1 ring-[#DCE7F3]' : 'text-[#5E6C84] hover:text-[#172B4D]'
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={`rounded-full px-1.5 text-[11px] ${on ? 'bg-[#EAF5FF] text-[#1267E9]' : 'bg-white text-[#5E6C84]'}`}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export const FilterSelect: React.FC<{ label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }> = ({
  label,
  value,
  onChange,
  children,
}) => (
  <label className="flex shrink-0 items-center gap-2">
    <span className={`text-xs font-bold whitespace-nowrap ${STUDIO_MUTED}`}>{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${STUDIO_INPUT} w-auto min-w-[8rem] pr-8`}>
      {children}
    </select>
  </label>
);

export type BadgeKind = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export const StatusBadge: React.FC<{ kind: BadgeKind; children: React.ReactNode; icon?: LucideIcon }> = ({ kind, children, icon: Icon }) => (
  <span className={`studio-badge ${kind === 'neutral' ? 'bg-[#F1F4F9] text-[#5E6C84]' : `studio-badge-${kind}`}`}>
    {Icon && <Icon className="h-3 w-3" />}
    {children}
  </span>
);

export const EmptyState: React.FC<{
  icon: LucideIcon;
  tone?: StudioTone;
  title: React.ReactNode;
  text?: React.ReactNode;
  action?: React.ReactNode;
  bare?: boolean;
}> = ({ icon: Icon, tone = 'blue', title, text, action, bare = false }) => (
  <div className={`flex flex-col items-center px-6 py-12 text-center ${bare ? '' : 'studio-card'}`}>
    <span className={`relative flex h-16 w-16 items-center justify-center rounded-2xl ${STUDIO_TONE[tone]}`}>
      <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-[#FFD34E]" aria-hidden="true" />
      <Icon className="h-8 w-8" />
    </span>
    <h3 className={`mt-4 font-display text-lg font-extrabold ${STUDIO_TEXT}`}>{title}</h3>
    {text && <p className={`mt-1 max-w-md text-sm leading-relaxed ${STUDIO_MUTED}`}>{text}</p>}
    {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
  </div>
);

export const LoadingState: React.FC<{ rows?: number; label?: string }> = ({ rows = 3, label = 'Đang tải dữ liệu…' }) => (
  <div role="status" aria-label={label} className="space-y-3">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="studio-card h-20 animate-pulse bg-[#F6FAFF]" />
    ))}
  </div>
);

export const ErrorState: React.FC<{ message: React.ReactNode; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#F5C6D1] bg-[#FFF1F4] p-4 text-sm text-[#9F2B47]">
    <span className="flex items-start gap-2">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </span>
    {onRetry && (
      <button type="button" onClick={onRetry} className="studio-btn studio-btn-secondary">
        Thử lại
      </button>
    )}
  </div>
);

/** Table wrapper: horizontal scroll on small screens, light header row. */
export const DataTable: React.FC<{ children: React.ReactNode; minWidth?: number }> = ({ children, minWidth = 720 }) => (
  <div className="studio-card overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  </div>
);
export const TH = 'px-4 py-3 text-xs font-bold tracking-wide text-[#5E6C84] uppercase';
export const THEAD = 'border-b border-[#DCE7F3] bg-[#F6FAFF]';
export const TR = 'border-b border-[#EEF3F9] last:border-0 transition-colors hover:bg-[#F6FAFF]';
export const TD = 'px-4 py-3 align-middle';

/** Centered dialog with a dimmed backdrop; Escape and the backdrop close it. */
export const StudioModal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  icon?: LucideIcon;
  tone?: StudioTone;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'sm' | 'md' | 'lg';
}> = ({ open, onClose, title, icon: Icon, tone = 'blue', children, footer, width = 'md' }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const max = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' }[width];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071A63]/40 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={`studio-card flex max-h-[90vh] w-full flex-col ${max}`}>
        <div className="flex items-center justify-between gap-3 border-b border-[#DCE7F3] px-5 py-4">
          <h2 className={`flex items-center gap-2.5 font-display text-lg font-extrabold ${STUDIO_TEXT}`}>
            {Icon && (
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${STUDIO_TONE[tone]}`}>
                <Icon className="h-5 w-5" />
              </span>
            )}
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg p-1.5 text-[#5E6C84] hover:bg-[#F6FAFF] hover:text-[#172B4D]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-[#DCE7F3] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: React.ReactNode;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, message, confirmLabel, danger = false, busy = false, onConfirm, onCancel }) => (
  <StudioModal
    open={open}
    onClose={onCancel}
    title={title}
    icon={AlertTriangle}
    tone={danger ? 'pink' : 'yellow'}
    width="sm"
    footer={
      <>
        <button type="button" onClick={onCancel} className="studio-btn studio-btn-secondary">
          Hủy
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={`studio-btn ${danger ? 'bg-[#D93B5B] text-white hover:bg-[#C12F4D]' : 'studio-btn-primary'}`}>
          {busy ? 'Đang xử lý…' : confirmLabel}
        </button>
      </>
    }
  >
    <div className={`text-sm leading-relaxed ${STUDIO_MUTED}`}>{message}</div>
  </StudioModal>
);
