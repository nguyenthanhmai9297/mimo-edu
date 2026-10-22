import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppContext } from '../providers';
import { ShieldAlert, LogOut, Sparkles } from 'lucide-react';

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
    return (
      <div className="min-h-screen bg-[#FFFDF8] flex items-center justify-center p-6">
        <div className="cartoon-card p-8 text-center max-w-sm w-full">
          <div className="w-12 h-12 rounded-2xl bg-[#FFFAF0] border-2 border-[#1E1B4B] flex items-center justify-center mx-auto mb-3 animate-pulse">
            <Sparkles className="w-6 h-6 text-[#FF6B35]" />
          </div>
          <p className="font-display font-bold text-lg text-[#1E1B4B]">Đang xác thực quyền Quản trị...</p>
          <p className="text-xs font-semibold text-[#475569] mt-1">Vui lòng đợi trong giây lát</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!isAdminAuthorized) {
    return (
      <div className="min-h-screen bg-[#FFFDF8] flex items-center justify-center p-6">
        <div className="cartoon-card p-8 max-w-md w-full text-center bg-white">
          <div className="w-16 h-16 rounded-2xl bg-[#FEE2E2] border-2 border-[#1E1B4B] flex items-center justify-center mx-auto mb-4 shadow-[3px_3px_0px_#1E1B4B]">
            <ShieldAlert className="w-8 h-8 text-[#EF4444]" />
          </div>
          <h1 className="font-display font-bold text-2xl text-[#1E1B4B] mb-2">
            Tài khoản chưa được cấp quyền
          </h1>
          <p className="text-sm font-medium text-[#475569] mb-4">
            Email <span className="font-mono font-bold text-[#1E1B4B]">{user.email}</span> hiện chưa nằm trong danh sách Quản trị viên (Allowlist) của Lớp Chúng Tôi.
          </p>
          <div className="p-3 rounded-xl bg-[#FFFAF0] border-2 border-[#1E1B4B] text-xs font-semibold text-[#475569] mb-6 text-left">
            Chỉ những tài khoản Google đã được Quản trị viên cấp phép trong hệ thống mới có quyền truy cập phân hệ Giáo viên. Hệ thống không cho phép tự đăng ký làm Admin.
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={logoutAdmin}
              className="cartoon-btn bg-[#FEE2E2] text-[#EF4444] px-5 py-2.5 text-sm inline-flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" /> Đăng xuất
            </button>
            <button
              onClick={loginAdminWithGoogle}
              className="cartoon-btn bg-[#2563EB] text-white px-5 py-2.5 text-sm inline-flex items-center justify-center gap-2"
            >
              Đổi tài khoản Google khác
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <Outlet />;
};
