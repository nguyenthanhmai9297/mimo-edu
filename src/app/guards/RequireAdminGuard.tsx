import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppContext } from '../providers';
import { ShieldAlert, LogOut } from 'lucide-react';
import { MimoLoading } from '../../components/ui/MimoLoading';

export const RequireAdminGuard: React.FC = () => {
  const {
    user,
    authReady,
    isAdminAuthorized,
    adminCheckLoading,
    logoutAdmin,
    loginAdminWithGoogle,
  } = useAppContext();

  if (!authReady || adminCheckLoading) {
    return <MimoLoading variant="page" text="Đang xác thực quyền quản trị…" />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!isAdminAuthorized) {
    return (
      <div className="studio-skin flex min-h-screen items-center justify-center bg-[#F6FAFF] p-6">
        <div className="studio-card w-full max-w-md p-8 text-center">
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFEDF1] text-[#D93B5B]">
            <ShieldAlert className="h-8 w-8" />
          </span>
          <h1 className="mb-2 font-display text-2xl font-extrabold text-[#172B4D]">Tài khoản chưa được cấp quyền</h1>
          <p className="mb-4 text-sm text-[#5E6C84]">
            Email <span className="font-mono font-bold text-[#172B4D]">{user.email}</span> chưa có trong danh sách quản trị viên của MimoEDU.
          </p>
          <div className="mb-6 rounded-xl bg-[#F6FAFF] p-3 text-left text-xs text-[#5E6C84] ring-1 ring-[#DCE7F3]">
            Chỉ tài khoản Google đã được quản trị viên cấp phép mới vào được MimoEDU Studio. Hệ thống không cho tự đăng ký làm admin.
          </div>
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
