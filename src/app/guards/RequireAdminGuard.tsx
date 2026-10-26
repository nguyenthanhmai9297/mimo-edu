import React, { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppContext } from '../providers';
import { ShieldAlert, LogOut, RefreshCw, WifiOff } from 'lucide-react';
import { MimoLoading } from '../../components/ui/MimoLoading';

export const RequireAdminGuard: React.FC = () => {
  const {
    user,
    authReady,
    isTeacherAuthorized,
    adminCheckLoading,
    adminCheckFailed,
    logoutAdmin,
    loginAdminWithGoogle,
    ensureTeacherAuth,
  } = useAppContext();
  // Arriving from a student page: the teacher sign-in check has not started yet
  useEffect(ensureTeacherAuth, [ensureTeacherAuth]);

  if (!authReady || adminCheckLoading) {
    return <MimoLoading variant="page" text="Đang đăng nhập…" />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  // A connection problem is not a missing permission: say so and let the teacher retry
  if (adminCheckFailed) {
    return (
      <div className="studio-skin flex min-h-screen items-center justify-center bg-[#F6FAFF] p-6">
        <div role="alert" className="studio-card w-full max-w-md p-8 text-center">
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF6DC] text-[#B7790A]">
            <WifiOff className="h-8 w-8" />
          </span>
          <h1 className="mb-2 font-display text-2xl font-extrabold text-[#172B4D]">Chưa kết nối được máy chủ</h1>
          <p className="mb-6 text-sm text-[#5E6C84]">
            MimoEDU chưa kiểm tra được quyền của <span className="font-mono font-bold text-[#172B4D]">{user.email}</span> vì mạng hoặc máy chủ đang chậm. Hãy kiểm tra kết nối rồi thử lại.
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <button type="button" onClick={logoutAdmin} className="studio-btn studio-btn-secondary">
              <LogOut className="h-4 w-4" /> Đăng xuất
            </button>
            {/* A fresh page opens a fresh connection; retrying on a stalled one keeps failing */}
            <button type="button" onClick={() => window.location.reload()} className="studio-btn studio-btn-primary">
              <RefreshCw className="h-4 w-4" /> Thử lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isTeacherAuthorized) {
    return (
      <div className="studio-skin flex min-h-screen items-center justify-center bg-[#F6FAFF] p-6">
        <div className="studio-card w-full max-w-md p-8 text-center">
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFEDF1] text-[#D93B5B]">
            <ShieldAlert className="h-8 w-8" />
          </span>
          <h1 className="mb-2 font-display text-2xl font-extrabold text-[#172B4D]">Email chưa được xác minh</h1>
          <p className="mb-6 text-sm text-[#5E6C84]">
            Tài khoản <span className="font-mono font-bold text-[#172B4D]">{user.email}</span> chưa được Google xác minh email. Hãy đăng nhập bằng một tài khoản Google khác.
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <button type="button" onClick={logoutAdmin} className="studio-btn studio-btn-danger">
              <LogOut className="h-4 w-4" /> Đăng xuất
            </button>
            <button type="button" onClick={loginAdminWithGoogle} className="studio-btn studio-btn-primary">
              Đổi tài khoản Google khác
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <Outlet />;
};

/** System pages (Quyền Admin, Kho trò chơi): admins only; teachers go back to their Studio. */
export const RequireSystemAdmin: React.FC = () => {
  const { isSystemAdmin } = useAppContext();
  return isSystemAdmin ? <Outlet /> : <Navigate to="/admin" replace />;
};
