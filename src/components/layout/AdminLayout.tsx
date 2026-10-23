import React, { useState } from 'react';
import {
  BookOpen,
  Box,
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
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppContext } from '../../app/providers';

const NAV_ITEMS = [
  { to: '/admin', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/admin/classes', label: 'Lớp học', icon: School },
  { to: '/admin/students', label: 'Học sinh & Mã', icon: GraduationCap },
  { to: '/admin/homework', label: 'Kho học liệu Toán 3', icon: BookOpen },
  { to: '/admin/geometry3d', label: 'Hình học 3D', icon: Box },
  { to: '/admin/assignments', label: 'Giao bài tập', icon: CalendarCheck },
  { to: '/admin/grading', label: 'Chấm bài nộp', icon: CheckSquare },
  { to: '/admin/comments', label: 'Nhận xét tháng', icon: MessageSquareHeart },
  { to: '/admin/games', label: 'Kho trò chơi', icon: Gamepad2 },
  { to: '/admin/settings', label: 'Quyền Admin', icon: ShieldCheck },
];

export const AdminLayout: React.FC = () => {
  const { user, logoutAdmin, studentAssignments } = useAppContext();
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

  return (
    <div className="flex min-h-screen bg-[#FFFDF7] text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r-2 border-slate-900 bg-white lg:flex">
        <div className="flex h-16 items-center justify-between border-b-2 border-slate-900 bg-amber-100 px-5">
          <Link
            to="/admin"
            className="font-display text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap"
          >
            Lớp Chúng Tôi
          </Link>
          <span className="text-xs font-bold text-slate-600">Giáo viên</span>
        </div>

        <nav className="flex-1 space-y-1.5 p-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-bold transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-2 border-slate-900 bg-blue-600 text-white shadow-[0_3px_0_0_#1E293B]'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`
                }
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.to === '/admin/grading' && pendingGradingCount > 0 && (
                  <span className="font-mono text-xs font-extrabold underline">
                    ({pendingGradingCount})
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t-2 border-slate-900 bg-slate-50 p-4">
          <div className="mb-3 truncate text-xs font-semibold text-slate-600">
            {user?.email}
          </div>
          <div className="flex flex-col gap-2">
            <Link
              to="/portal"
              className="cartoon-button flex items-center justify-center gap-1.5 rounded-xl bg-amber-300 px-3 py-2 text-xs font-extrabold text-slate-900 whitespace-nowrap"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Mở Cổng Học Sinh
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="cartoon-button flex items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-rose-700 whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5" />
              Đăng xuất
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 flex w-72 flex-col border-r-2 border-slate-900 bg-white">
            <div className="flex h-16 items-center justify-between border-b-2 border-slate-900 bg-amber-100 px-5">
              <span className="font-display text-lg font-extrabold text-slate-900">
                Lớp Chúng Tôi
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg border border-slate-900 bg-white p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1.5 p-4">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold ${
                        isActive
                          ? 'border-2 border-slate-900 bg-blue-600 text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b-2 border-slate-900 bg-white px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-xl border-2 border-slate-900 bg-amber-100 p-2 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-slate-500">Quản trị</span>
              <span className="text-slate-400">/</span>
              <span className="font-display font-extrabold text-slate-900">
                {currentNav.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/admin/homework"
              className="cartoon-button hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-extrabold text-white whitespace-nowrap shrink-0"
            >
              + Soạn BTVN Toán
            </Link>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
