import React, { useState } from 'react';
import {
  BookOpen,
  CalendarCheck,
  CheckSquare,
  Gamepad2,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareHeart,
  School,
  ShieldCheck,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppContext } from '../../app/providers';
import { MimoMascot } from '../../features/practice/student/practiceTheme';

/** Pastel icon colours on the blue sidebar, cycling down the menu. */
const NAV_TINTS = ['text-[#7DD3FC]', 'text-[#FDE68A]', 'text-[#F9A8D4]', 'text-[#C4B5FD]', 'text-[#86EFAC]'];

const NAV_ITEMS = [
  { to: '/admin', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/admin/tools', label: 'Công cụ dạy học', icon: Wand2 },
  { to: '/admin/classes', label: 'Lớp học', icon: School },
  { to: '/admin/students', label: 'Học sinh & Mã', icon: GraduationCap },
  { to: '/admin/homework', label: 'Soạn bài tập', icon: BookOpen },
  { to: '/admin/practice', label: 'Luyện Toán cùng Mimo', icon: Sparkles },
  { to: '/admin/assignments', label: 'Giao bài tập', icon: CalendarCheck },
  { to: '/admin/grading', label: 'Chấm bài nộp', icon: CheckSquare },
  { to: '/admin/comments', label: 'Nhận xét tháng', icon: MessageSquareHeart },
  { to: '/admin/games', label: 'Kho trò chơi', icon: Gamepad2, adminOnly: true },
  { to: '/admin/settings', label: 'Quyền Admin', icon: ShieldCheck, adminOnly: true },
];

export const AdminLayout: React.FC = () => {
  const { user, logoutAdmin, studentAssignments, isSystemAdmin } = useAppContext();
  // Teachers see their Studio; the system pages are for admins
  const navItems = NAV_ITEMS.filter((item) => !('adminOnly' in item) || isSystemAdmin);
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const pendingGradingCount = studentAssignments.filter(
    (sa) => sa.status === 'submitted'
  ).length;

  const currentNav =
    NAV_ITEMS.find((item) =>
      item.end
        ? location.pathname === item.to
        : location.pathname.startsWith(item.to)
    ) || NAV_ITEMS[0];

  const handleSignOut = async () => {
    await logoutAdmin();
    navigate('/');
  };

  const brand = (
    <span className="flex items-center gap-2.5">
      <MimoMascot size={34} eager className="ring-2" />
      <span className="leading-tight">
        <span className="block font-display text-lg font-extrabold tracking-tight text-white">
          Mimo<span className="text-[#54C8FF]">EDU</span>
        </span>
        <span className="block text-[10px] font-bold tracking-[0.18em] text-white/60 uppercase">Studio giáo viên</span>
      </span>
    </span>
  );

  const navLinkClass = (isActive: boolean) =>
    `flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition whitespace-nowrap ${
      isActive
        ? 'bg-white text-[#1D4ED8] shadow-[0_10px_22px_-12px_rgba(15,23,42,0.6)]'
        : 'text-white/85 hover:bg-white/12 hover:text-white'
    }`;

  const renderNav = (onNavigate?: () => void) => (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3">
      {navItems.map((item, index) => {
        const Icon = item.icon;
        return (
          <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate} className={({ isActive }) => navLinkClass(isActive)}>
            {({ isActive }) => (
              <>
                <span className="flex items-center gap-2.5">
                  <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-[#2563EB]' : NAV_TINTS[index % NAV_TINTS.length]}`} />
                  <span>{item.label}</span>
                </span>
                {item.to === '/admin/grading' && pendingGradingCount > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${isActive ? 'bg-[#FF76B5] text-white' : 'bg-[#FF76B5] text-white ring-2 ring-white/30'}`}>
                    {pendingGradingCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="studio-backdrop flex min-h-screen text-[#172B4D]">
      {/* Desktop Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-gradient-to-b from-[#1E3A8A] via-[#1D4ED8] to-[#2563EB] shadow-[8px_0_30px_-20px_rgba(30,58,138,0.7)] lg:flex">
        <Link to="/admin" className="flex h-16 items-center border-b border-white/10 px-4">
          {brand}
        </Link>

        {renderNav()}

        <div className="border-t border-white/10 p-3">
          <div className="mb-2.5 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFD34E] text-xs font-extrabold text-[#1E3A8A]">
              {(user?.email ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate text-xs font-semibold text-white/80">{user?.email}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link to="/portal" className="studio-btn studio-btn-secondary px-2 text-xs">
              <KeyRound className="h-3.5 w-3.5 text-[#2563EB]" />
              Cổng học sinh
            </Link>
            <button type="button" onClick={handleSignOut} className="studio-btn studio-btn-danger px-2 text-xs">
              <LogOut className="h-3.5 w-3.5" />
              Đăng xuất
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-[#1E3A8A]/40 backdrop-blur-[2px]" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative z-10 flex w-72 flex-col bg-gradient-to-b from-[#1E3A8A] via-[#1D4ED8] to-[#2563EB] shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
              {brand}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Đóng menu"
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderNav(() => setMobileMenuOpen(false))}
            <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-3">
              <Link to="/portal" className="studio-btn studio-btn-secondary px-2 text-xs">
                <KeyRound className="h-3.5 w-3.5 text-[#2563EB]" />
                Cổng học sinh
              </Link>
              <button type="button" onClick={handleSignOut} className="studio-btn studio-btn-danger px-2 text-xs">
                <LogOut className="h-3.5 w-3.5" />
                Đăng xuất
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 bg-white/85 px-4 shadow-[0_6px_20px_-16px_rgba(30,58,138,0.6)] backdrop-blur sm:px-6">
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-[#2563EB] via-[#38BDF8] to-[#FF76B5]" aria-hidden="true" />
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Mở menu"
              className="rounded-xl border border-[#DCE7F3] bg-white p-2 text-[#172B4D] hover:bg-[#F6FAFF] lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden font-semibold text-[#5E6C84] sm:inline">Quản trị</span>
              <span className="hidden text-[#BFD6EE] sm:inline">/</span>
              <span className="truncate font-display font-extrabold text-[#172B4D]">{currentNav.label}</span>
            </div>
          </div>

        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
