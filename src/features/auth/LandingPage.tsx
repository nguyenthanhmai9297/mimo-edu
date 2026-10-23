import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Compass,
  FileSpreadsheet,
  Gamepad2,
  KeyRound,
  LogIn,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react';
import { useAppContext } from '../../app/providers';
import { HeroClassroomIllustration } from '../../components/ui/CartoonIllustrations';
import { loginWithStudentCode } from '../../services/studentPortalService';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    user,
    isAdminAuthorized,
    authError,
    loginAdminWithGoogle,
    logoutAdmin,
    refreshStudentSessionState,
  } = useAppContext();

  const [studentCode, setStudentCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);

  const handleAdminSignIn = async () => {
    if (user && isAdminAuthorized) {
      navigate('/admin');
      return;
    }
    setAdminLoginLoading(true);
    try {
      const ok = await loginAdminWithGoogle();
      if (ok) {
        navigate('/admin');
      }
    } finally {
      setAdminLoginLoading(false);
    }
  };

  const handleStudentCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError(null);
    const cleaned = studentCode.trim().toUpperCase();
    if (cleaned.length !== 6) {
      setCodeError('Vui lòng nhập đủ 6 ký tự mã học sinh (ví dụ: 8K9P2A).');
      return;
    }

    setCodeLoading(true);
    try {
      await loginWithStudentCode(cleaned);
      refreshStudentSessionState();
      navigate('/portal');
    } catch (err) {
      setCodeError(
        err instanceof Error
          ? err.message
          : 'Không thể đăng nhập bằng mã này. Vui lòng kiểm tra lại.'
      );
    } finally {
      setCodeLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFDF7] text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 border-b-2 border-slate-900 bg-[#FFFDF7]/95 px-6 py-4 backdrop-blur-xs">
        <a
          href="/"
          className="font-display text-xl font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Lớp Chúng Tôi
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-700">
          <a
            href="#tinh-nang"
            className="hover:text-blue-600 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Tính năng
          </a>
          <a
            href="#cong-hoc-sinh"
            className="hover:text-blue-600 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Cổng học sinh
          </a>
          <a
            href="#loi-ich"
            className="hover:text-blue-600 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Lợi ích
          </a>
          <a
            href="#tro-choi"
            className="hover:text-blue-600 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Trò chơi Toán
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleAdminSignIn}
            disabled={adminLoginLoading}
            className="cartoon-button flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-extrabold text-white whitespace-nowrap shrink-0"
          >
            <LogIn className="h-4 w-4" />
            {user && isAdminAuthorized
              ? 'Vào Quản Trị Lớp'
              : adminLoginLoading
              ? 'Đang xác thực...'
              : 'Đăng nhập quản trị'}
          </button>
        </div>
      </header>

      {/* Unauthorized Admin Alert Banner */}
      {authError && (
        <div className="mx-auto max-w-6xl px-6 pt-6">
          <div className="cartoon-card flex flex-col justify-between gap-4 bg-rose-50 p-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              <div>
                <h2 className="font-display text-sm font-extrabold text-rose-900">
                  Từ chối quyền truy cập Quản trị
                </h2>
                <p className="mt-0.5 text-xs text-rose-800">{authError}</p>
              </div>
            </div>
            {user && (
              <button
                type="button"
                onClick={logoutAdmin}
                className="cartoon-button shrink-0 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-800"
              >
                Đổi tài khoản Google khác
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="mx-auto max-w-7xl px-6 py-12 lg:py-16">
        <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12">
          {/* Left Hero Copy + Student Code Entry */}
          <div className="flex flex-col justify-between lg:col-span-6">
            <div>
              <p className="text-xs font-extrabold tracking-wide text-blue-700">
                NỀN TẢNG QUẢN LÝ LỚP HỌC & BÀI TẬP TOÁN HỌC
              </p>
              <h1
                className="mt-3 font-display text-4xl font-extrabold leading-tight text-slate-900 sm:text-5xl"
                style={{ textWrap: 'balance' }}
              >
                Dạy Toán Sáng Tạo, Giao Bài Thông Minh & Gắn Kết Phụ Huynh
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-700">
                Hệ thống quản lý lớp học chuyên biệt cho giáo viên dạy Toán:
                soạn đề với công thức LaTeX và hình học phẳng, bóc tách đề từ
                ảnh/PDF bằng AI, tự động chấm bài và kết nối phụ huynh chỉ qua
                một mã học sinh 6 ký tự.
              </p>
            </div>

            {/* Cổng Phụ Huynh / Học Sinh Quick Entry Box */}
            <div
              id="cong-hoc-sinh"
              className="cartoon-card mt-8 bg-amber-50 p-6"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-slate-900 bg-amber-300">
                  <KeyRound className="h-5 w-5 text-slate-900" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-extrabold text-slate-900">
                    Cổng Phụ Huynh & Học Sinh
                  </h2>
                  <p className="text-xs text-slate-600">
                    Nhập mã truy cập 6 ký tự do thầy/cô cung cấp để làm BTVN và
                    xem điểm
                  </p>
                </div>
              </div>

              <form
                onSubmit={handleStudentCodeSubmit}
                className="mt-4 flex flex-col gap-3 sm:flex-row"
              >
                <input
                  type="text"
                  maxLength={6}
                  value={studentCode}
                  onChange={(e) =>
                    setStudentCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                  }
                  placeholder="NHẬP MÃ 6 KÝ TỰ (VD: 8K9P2A)"
                  className="flex-1 rounded-xl border-2 border-slate-900 bg-white px-4 py-3 font-mono text-base font-bold tracking-widest text-slate-900 uppercase placeholder:font-sans placeholder:text-xs placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={codeLoading}
                  className="cartoon-button flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 py-3 font-display text-sm font-extrabold text-slate-900 whitespace-nowrap shrink-0"
                >
                  {codeLoading ? 'Đang kiểm tra...' : 'Vào Lớp Ngay'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>

              {codeError && (
                <p className="mt-2.5 text-xs font-bold text-rose-600">
                  {codeError}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span>Không cần tài khoản Google · Bảo mật theo phiên</span>
                <button
                  type="button"
                  onClick={() => navigate('/portal')}
                  className="font-bold text-blue-700 hover:underline"
                >
                  Mở trang đăng nhập học sinh riêng →
                </button>
              </div>
            </div>
          </div>

          {/* Right Hero Illustration */}
          <div className="flex flex-col justify-center lg:col-span-6">
            <HeroClassroomIllustration className="h-full" />
          </div>
        </div>
      </section>

      {/* Core Features Section */}
      <section
        id="tinh-nang"
        className="border-y-2 border-slate-900 bg-sky-50/70 py-16"
      >
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-2xl">
            <h2
              className="font-display text-3xl font-extrabold text-slate-900"
              style={{ textWrap: 'balance' }}
            >
              Trọn Bộ Công Cụ Dành Riêng Cho Lớp Học Toán
            </h2>
            <p className="mt-2 text-base text-slate-700">
              Từ quản lý danh sách lớp, biên soạn đề hình học phức tạp đến chấm
              bài tự luận có AI trợ giúp.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="cartoon-card p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-slate-900 bg-blue-100">
                <Users className="h-6 w-6 text-blue-700" />
              </div>
              <h3 className="mt-4 font-display text-lg font-extrabold text-slate-900">
                01. Quản Lý Lớp & Mã Học Sinh 6 Ký Tự
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Tạo lớp theo năm học, quản lý hồ sơ học sinh và tự động sinh mã
                truy cập 6 ký tự duy nhất phía server để gửi cho phụ huynh chỉ
                với một cú nhấp chuột.
              </p>
            </div>

            <div className="cartoon-card p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-slate-900 bg-amber-100">
                <Compass className="h-6 w-6 text-amber-800" />
              </div>
              <h3 className="mt-4 font-display text-lg font-extrabold text-slate-900">
                02. Trình Soạn Đề Toán & Vẽ Hình Học
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Hỗ trợ đầy đủ 5 dạng câu hỏi Toán, gõ công thức KaTeX siêu tốc và
                dựng hình học phẳng (điểm, đoạn thẳng, góc, tam giác, đường tròn)
                ngay trong trình soạn thảo.
              </p>
            </div>

            <div className="cartoon-card p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-slate-900 bg-purple-100">
                <Sparkles className="h-6 w-6 text-purple-800" />
              </div>
              <h3 className="mt-4 font-display text-lg font-extrabold text-slate-900">
                03. Chuyển Ảnh/PDF Thành Đề Bằng AI
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Tải lên ảnh chụp hoặc PDF phiếu bài tập. AI tự động nhận diện
                công thức, phân loại câu hỏi và tùy chọn tự giải đề để giáo viên
                duyệt trước khi lưu.
              </p>
            </div>

            <div className="cartoon-card p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-slate-900 bg-emerald-100">
                <BookOpenCheck className="h-6 w-6 text-emerald-800" />
              </div>
              <h3 className="mt-4 font-display text-lg font-extrabold text-slate-900">
                04. Giao Bài Snapshot & Tự Động Chấm
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Đóng băng nội dung đề tại thời điểm giao, ẩn tuyệt đối đáp án
                chuẩn dưới trình duyệt. Tự chấm trắc nghiệm, đúng/sai nhiều ý,
                trả lời ngắn và gợi ý chấm tự luận.
              </p>
            </div>

            <div className="cartoon-card p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-slate-900 bg-rose-100">
                <FileSpreadsheet className="h-6 w-6 text-rose-800" />
              </div>
              <h3 className="mt-4 font-display text-lg font-extrabold text-slate-900">
                05. Sổ Nhận Xét Tháng Cho Phụ Huynh
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Tổng hợp điểm mạnh, nội dung cần cải thiện, tỷ lệ hoàn thành
                BTVN và gợi ý luyện tập hàng tháng giúp phụ huynh nắm bắt sát
                sao việc học của con.
              </p>
            </div>

            <div id="tro-choi" className="cartoon-card p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-slate-900 bg-orange-100">
                <Gamepad2 className="h-6 w-6 text-orange-800" />
              </div>
              <h3 className="mt-4 font-display text-lg font-extrabold text-slate-900">
                06. Kho Trò Chơi Toán Học Tương Tác
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Tích hợp các trò chơi rèn luyện Số học, Phép tính, Hình học và
                Tư duy logic qua HTTPS iframe an toàn, giúp học sinh hứng thú
                ôn luyện mỗi ngày.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Comparison for Teachers & Parents */}
      <section id="loi-ich" className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="cartoon-card bg-white p-8">
            <p className="text-xs font-extrabold text-blue-700">
              DÀNH CHO GIÁO VIÊN TOÁN
            </p>
            <h3 className="mt-2 font-display text-2xl font-extrabold text-slate-900">
              Tiết Kiệm 70% Thời Gian Soạn Đề & Chấm Bài
            </h3>
            <ul className="mt-5 space-y-3 text-sm text-slate-700">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <span>
                  Soạn đề Toán chuẩn cấu trúc 5 loại câu hỏi mới nhất, có sẵn
                  bảng dựng hình học phẳng trực quan.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <span>
                  Chuyển phiếu bài tập giấy hoặc file PDF thành học liệu Toán 3
                  số hóa chỉ trong vài giây nhờ AI.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <span>
                  Theo dõi tức thì học sinh nào chưa làm, đang làm hoặc đã nộp
                  bài trên bảng điều khiển trung tâm.
                </span>
              </li>
            </ul>
            <button
              type="button"
              onClick={handleAdminSignIn}
              className="cartoon-button mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white"
            >
              <LogIn className="h-4 w-4" />
              Đăng nhập Quản trị Giáo viên
            </button>
          </div>

          <div className="cartoon-card bg-amber-50/70 p-8">
            <p className="text-xs font-extrabold text-amber-900">
              DÀNH CHO PHỤ HUYNH & HỌC SINH
            </p>
            <h3 className="mt-2 font-display text-2xl font-extrabold text-slate-900">
              Truy Cập Dễ Dàng Trên Điện Thoại — Không Cần Tạo Tài Khoản
            </h3>
            <ul className="mt-5 space-y-3 text-sm text-slate-700">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <span>
                  Chỉ cần nhập 6 ký tự mã học sinh để vào ngay góc học tập cá
                  nhân trên điện thoại hoặc máy tính bảng.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <span>
                  Làm bài tập về nhà rõ nét, có lưu nháp tự động và bộ gõ công
                  thức Toán thân thiện cho câu tự luận.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <span>
                  Phụ huynh xem trực tiếp điểm số, lời giải chi tiết sau khi
                  chấm và nhận xét định kỳ hàng tháng từ giáo viên.
                </span>
              </li>
            </ul>
            <a
              href="#cong-hoc-sinh"
              className="cartoon-button mt-6 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-xs font-extrabold text-slate-900"
            >
              <KeyRound className="h-4 w-4" />
              Nhập Mã Học Sinh Ngay
            </a>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t-2 border-slate-900 bg-white py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div>
            <span className="font-display text-base font-extrabold text-slate-900">
              Lớp Chúng Tôi
            </span>
            <span className="mx-2 text-slate-400">·</span>
            <span className="text-xs text-slate-600">
              Hệ thống quản lý lớp học Toán, giao chấm BTVN và cổng phụ huynh
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={handleAdminSignIn}
              className="hover:text-blue-600"
            >
              Quản trị Giáo viên
            </button>
            <button
              type="button"
              onClick={() => navigate('/portal')}
              className="hover:text-blue-600"
            >
              Cổng Học Sinh
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
