import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpenCheck,
  Gamepad2,
  GraduationCap,
  KeyRound,
  LogIn,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useAppContext } from '../../app/providers';
import { loadStudentPortal, prefetchWhenIdle } from '../../app/studentChunks';
import { loginWithStudentCode } from '../../services/studentPortalService';
import { MimoMascot, SpaceDecor } from '../practice/student/practiceTheme';

/** Student portal tab to open after the access code is accepted. */
type PortalTarget = 'overview' | 'practice' | 'homework' | 'games';

const HOME_BANNER = '/images/mimo-home-banner.png';
/** [width, path] – generated from the PNG with cwebp (q85, sharp YUV). */
const HOME_BANNER_WEBP: [number, string][] = [
  [800, '/images/mimo-home-banner-800.webp'],
  [1280, '/images/mimo-home-banner-1280.webp'],
  [2048, '/images/mimo-home-banner-2048.webp'],
];

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  // Most visitors go on to the student portal: fetch its code while idle
  useEffect(() => prefetchWhenIdle(loadStudentPortal), []);
  const {
    user,
    isTeacherAuthorized,
    authError,
    loginAdminWithGoogle,
    ensureTeacherAuth,
    logoutAdmin,
    hasStudentSession,
    refreshStudentSessionState,
  } = useAppContext();
  // Shows "Trang giáo viên" when a teacher is already signed in; Firebase loads once the page is idle
  useEffect(() => prefetchWhenIdle(async () => ensureTeacherAuth()), [ensureTeacherAuth]);

  const [studentCode, setStudentCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);
  const [target, setTarget] = useState<PortalTarget>('overview');
  const codeSectionRef = useRef<HTMLElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const portalPath = (tab: PortalTarget) => (tab === 'overview' ? '/portal' : `/portal?tab=${tab}`);

  const handleAdminSignIn = async () => {
    if (user && isTeacherAuthorized) {
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

  /** Students go straight in when already signed in, otherwise to the code box. */
  const openStudentArea = (tab: PortalTarget) => {
    if (hasStudentSession) {
      navigate(portalPath(tab));
      return;
    }
    setTarget(tab);
    setCodeError(null);
    codeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => codeInputRef.current?.focus({ preventScroll: true }), 400);
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
      navigate(portalPath(target));
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

  const adminLabel =
    user && isTeacherAuthorized ? 'Vào trang giáo viên' : adminLoginLoading ? 'Đang xác thực...' : 'Dành cho giáo viên';

  const heroCopy = (
    <>
      <h1 className="font-display text-3xl leading-tight font-extrabold text-white sm:text-4xl xl:text-5xl" style={{ textWrap: 'balance' }}>
        Học Toán vui, <span className="text-[#FFD34E]">tiến bộ</span> mỗi ngày!
      </h1>
      <p className="mt-3 text-base font-semibold text-white/90 sm:text-lg">
        Cùng Mimo khám phá thế giới Toán học đầy màu sắc.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => openStudentArea('overview')}
          className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#FFD34E] px-6 text-base font-extrabold text-[#071A63] shadow-[0_12px_28px_-12px_rgba(255,211,78,0.9)] transition hover:-translate-y-0.5 hover:brightness-105"
        >
          <KeyRound className="h-5 w-5" /> Vào lớp của em
        </button>
        <button
          type="button"
          onClick={handleAdminSignIn}
          disabled={adminLoginLoading}
          className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-white/10 px-6 text-base font-bold text-white ring-2 ring-white/50 backdrop-blur transition hover:bg-white/20"
        >
          <LogIn className="h-5 w-5" /> {adminLabel}
        </button>
      </div>
    </>
  );

  const features: {
    title: string;
    desc: string;
    icon: React.ReactNode;
    gradient: string;
    onClick: () => void;
  }[] = [
    {
      title: 'Luyện Toán cùng Mimo',
      desc: 'Luyện theo chuyên đề và mức độ',
      icon: <Sparkles className="h-6 w-6" />,
      gradient: 'from-[#2563EB] to-[#54C8FF]',
      onClick: () => openStudentArea('practice'),
    },
    {
      title: 'Bài tập của em',
      desc: 'Làm bài thầy cô giao, xem điểm',
      icon: <BookOpenCheck className="h-6 w-6" />,
      gradient: 'from-[#FF76B5] to-[#FFB3D6]',
      onClick: () => openStudentArea('homework'),
    },
    {
      title: 'Trò chơi Toán học',
      desc: 'Vừa học vừa chơi thật vui',
      icon: <Gamepad2 className="h-6 w-6" />,
      gradient: 'from-[#FFB800] to-[#FFD34E]',
      onClick: () => openStudentArea('games'),
    },
    {
      title: 'Dành cho giáo viên',
      desc: 'Soạn đề, giao bài, theo dõi lớp',
      icon: <GraduationCap className="h-6 w-6" />,
      gradient: 'from-[#7B5CFF] to-[#FF76B5]',
      onClick: handleAdminSignIn,
    },
  ];

  return (
    <div className="min-h-screen bg-[#071A63] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#071A63]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="/" className="flex shrink-0 items-center gap-2.5" aria-label="MimoEDU – Trang chủ">
            <MimoMascot size={40} eager className="ring-2" />
            <span className="font-display text-xl font-extrabold tracking-tight">
              Mimo<span className="text-[#54C8FF]">EDU</span>
            </span>
          </a>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openStudentArea('overview')}
              className="hidden min-h-[40px] rounded-full px-4 text-sm font-bold text-white/90 transition hover:bg-white/10 sm:inline-flex sm:items-center"
            >
              Vào lớp
            </button>
            <button
              type="button"
              onClick={handleAdminSignIn}
              disabled={adminLoginLoading}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white px-4 text-sm font-extrabold text-[#2563EB] shadow-sm transition hover:bg-[#EAF6FF]"
            >
              <LogIn className="h-4 w-4" />
              {user && isTeacherAuthorized ? 'Trang giáo viên' : 'Giáo viên đăng nhập'}
            </button>
          </div>
        </div>
      </header>

      {authError && (
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
          <div className="flex flex-col justify-between gap-3 rounded-2xl bg-white p-4 text-slate-800 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              <div>
                <h2 className="font-display text-sm font-extrabold text-rose-900">Chưa đăng nhập được</h2>
                <p className="mt-0.5 text-xs text-rose-800">{authError}</p>
              </div>
            </div>
            {user && (
              <button
                type="button"
                onClick={logoutAdmin}
                className="shrink-0 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800"
              >
                Đổi tài khoản Google khác
              </button>
            )}
          </div>
        </div>
      )}

      <main className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top_left,rgba(84,200,255,0.25),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(255,118,181,0.18),transparent_55%)]">
        <SpaceDecor />

        {/* Hero: the banner keeps its natural ratio; copy sits on the empty sky on the left */}
        <section className="relative mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8">
          <div className="relative overflow-hidden rounded-[2rem] shadow-[0_30px_80px_-40px_rgba(84,200,255,0.9)] ring-1 ring-white/15">
            <picture>
              <source
                type="image/webp"
                srcSet={HOME_BANNER_WEBP.map(([w, src]) => `${src} ${w}w`).join(', ')}
                sizes="(min-width: 1280px) 1232px, calc(100vw - 32px)"
              />
              <img
                src={HOME_BANNER}
                width={2048}
                height={768}
                alt="Mimo ngồi trên mặt trăng giữa vũ trụ Toán học với các con số, hình học và ngôi sao"
                className="block h-auto w-full"
                loading="eager"
                decoding="async"
              />
            </picture>
            <div className="absolute inset-y-0 left-0 hidden w-[52%] items-center bg-gradient-to-r from-[#071A63]/75 via-[#071A63]/35 to-transparent pl-10 xl:pl-14 lg:flex">
              <div className="max-w-md">{heroCopy}</div>
            </div>
          </div>
          {/* Narrow screens: the banner is too short to carry text, so the copy follows it */}
          <div className="px-1 pt-6 text-center sm:text-left lg:hidden">{heroCopy}</div>
        </section>

        <section className="relative mx-auto max-w-7xl px-4 pt-10 sm:px-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {features.map((f) => (
              <button
                key={f.title}
                type="button"
                onClick={f.onClick}
                className="group flex min-h-[148px] flex-col items-start gap-2.5 rounded-3xl bg-white p-4 text-left sm:gap-3 sm:p-5 shadow-md transition duration-200 hover:-translate-y-1.5 hover:shadow-[0_18px_40px_-18px_rgba(84,200,255,0.9)]"
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md transition group-hover:scale-110 group-hover:rotate-6 ${f.gradient}`}>
                  {f.icon}
                </span>
                <span className="font-display text-base leading-snug font-extrabold text-[#071A63] sm:text-lg">{f.title}</span>
                <span className="text-xs text-slate-500 sm:text-sm">{f.desc}</span>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-extrabold text-[#2563EB] transition group-hover:gap-2">
                  Bắt đầu <ArrowRight className="h-4 w-4" />
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Student access code – same login flow as before */}
        <section ref={codeSectionRef} id="cong-hoc-sinh" className="relative mx-auto max-w-3xl scroll-mt-24 px-4 py-12 sm:px-6">
          <div className="rounded-[2rem] bg-white p-6 text-[#071A63] shadow-lg sm:p-8">
            <div className="flex items-center gap-3">
              <MimoMascot size={56} />
              <div>
                <h2 className="font-display text-xl font-extrabold">Vào lớp của em</h2>
                <p className="text-sm text-slate-500">Nhập mã 6 ký tự thầy cô đã gửi cho em.</p>
              </div>
            </div>
            <form onSubmit={handleStudentCodeSubmit} className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input
                ref={codeInputRef}
                type="text"
                maxLength={6}
                value={studentCode}
                onChange={(e) => setStudentCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="VD: 8K9P2A"
                aria-label="Mã học sinh 6 ký tự"
                className="min-h-[56px] flex-1 rounded-2xl border-2 border-[#BFE3FF] bg-[#F4FAFF] px-5 font-mono text-xl font-bold tracking-[0.3em] text-[#071A63] uppercase placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none"
              />
              <button
                type="submit"
                disabled={codeLoading}
                className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-[#2563EB] px-6 text-base font-extrabold text-white shadow-md transition hover:bg-[#1D4ED8]"
              >
                {codeLoading ? 'Đang kiểm tra...' : 'Vào lớp'}
                <ArrowRight className="h-5 w-5" />
              </button>
            </form>
            {codeError && <p className="mt-3 text-sm font-bold text-rose-600">{codeError}</p>}
            <p className="mt-3 text-xs text-slate-500">Không cần tài khoản · Phụ huynh có thể dùng cùng mã để xem bài và điểm của con.</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-sm text-white/70 sm:flex-row sm:px-6">
          <span>
            <b className="font-display text-white">MimoEDU</b> · Học Toán vui cùng Mimo
          </span>
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => openStudentArea('overview')} className="hover:text-white">
              Cổng học sinh
            </button>
            <button type="button" onClick={handleAdminSignIn} className="hover:text-white">
              Giáo viên
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
