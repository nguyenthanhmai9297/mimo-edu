import React from 'react';

export const HeroClassroomIllustration: React.FC<{ className?: string }> = ({
  className = '',
}) => (
  <div
    className={`relative overflow-hidden rounded-3xl border-2 border-slate-900 bg-gradient-to-br from-sky-100 via-amber-50 to-indigo-100 p-6 shadow-[0_6px_0_0_#1E293B] ${className}`}
  >
    <svg
      viewBox="0 0 560 360"
      className="h-auto w-full select-none"
      role="img"
      aria-label="Minh họa lớp học Toán Lớp Chúng Tôi"
    >
      {/* Classroom Board */}
      <rect
        x="40"
        y="24"
        width="480"
        height="220"
        rx="20"
        fill="#0F172A"
        stroke="#1E293B"
        strokeWidth="6"
      />
      <rect
        x="52"
        y="36"
        width="456"
        height="196"
        rx="12"
        fill="#1E3A8A"
        stroke="#3B82F6"
        strokeWidth="2"
      />

      {/* Chalk Math & Geometry on Board */}
      <polygon
        points="110,185 110,85 230,185"
        fill="rgba(56, 189, 248, 0.2)"
        stroke="#38BDF8"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <rect
        x="110"
        y="165"
        width="20"
        height="20"
        fill="none"
        stroke="#FACC15"
        strokeWidth="3"
      />
      <text
        x="92"
        y="85"
        fill="#FACC15"
        fontSize="18"
        fontWeight="800"
        fontFamily="Plus Jakarta Sans, sans-serif"
      >
        B
      </text>
      <text
        x="88"
        y="195"
        fill="#FACC15"
        fontSize="18"
        fontWeight="800"
        fontFamily="Plus Jakarta Sans, sans-serif"
      >
        A
      </text>
      <text
        x="240"
        y="195"
        fill="#FACC15"
        fontSize="18"
        fontWeight="800"
        fontFamily="Plus Jakarta Sans, sans-serif"
      >
        C
      </text>

      {/* Formula Card on Board */}
      <rect
        x="275"
        y="65"
        width="205"
        height="68"
        rx="14"
        fill="#FFFFFF"
        stroke="#0F172A"
        strokeWidth="3"
      />
      <text
        x="295"
        y="98"
        fill="#0F172A"
        fontSize="18"
        fontWeight="800"
        fontFamily="JetBrains Mono, monospace"
      >
        S = ½ × a × h
      </text>
      <text
        x="295"
        y="120"
        fill="#2563EB"
        fontSize="13"
        fontWeight="700"
        fontFamily="DM Sans, sans-serif"
      >
        a² + b² = c² (Pytago)
      </text>

      {/* Circle & Compass Diagram */}
      <circle
        cx="335"
        cy="180"
        r="34"
        fill="rgba(250, 204, 21, 0.2)"
        stroke="#FDE047"
        strokeWidth="3.5"
        strokeDasharray="6 4"
      />
      <circle cx="335" cy="180" r="4" fill="#FDE047" />
      <line
        x1="335"
        y1="180"
        x2="369"
        y2="180"
        stroke="#F97316"
        strokeWidth="3"
      />
      <text
        x="345"
        y="173"
        fill="#FFFFFF"
        fontSize="13"
        fontWeight="700"
      >
        R
      </text>

      {/* Floating Cartoon Ruler */}
      <g transform="translate(405, 152) rotate(-12)">
        <rect
          x="0"
          y="0"
          width="86"
          height="28"
          rx="6"
          fill="#F97316"
          stroke="#0F172A"
          strokeWidth="3"
        />
        <line x1="15" y1="0" x2="15" y2="10" stroke="#0F172A" strokeWidth="2.5" />
        <line x1="30" y1="0" x2="30" y2="14" stroke="#0F172A" strokeWidth="2.5" />
        <line x1="45" y1="0" x2="45" y2="10" stroke="#0F172A" strokeWidth="2.5" />
        <line x1="60" y1="0" x2="60" y2="14" stroke="#0F172A" strokeWidth="2.5" />
        <line x1="75" y1="0" x2="75" y2="10" stroke="#0F172A" strokeWidth="2.5" />
      </g>

      {/* Cheerful Student & Teacher Characters */}
      {/* Character 1: Teacher Left */}
      <g transform="translate(75, 232)">
        <rect
          x="14"
          y="54"
          width="72"
          height="64"
          rx="22"
          fill="#2563EB"
          stroke="#0F172A"
          strokeWidth="4"
        />
        <circle
          cx="50"
          cy="30"
          r="26"
          fill="#FDE68A"
          stroke="#0F172A"
          strokeWidth="4"
        />
        <circle cx="42" cy="26" r="3.5" fill="#0F172A" />
        <circle cx="58" cy="26" r="3.5" fill="#0F172A" />
        <path
          d="M 42 37 Q 50 44 58 37"
          fill="none"
          stroke="#0F172A"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>

      {/* Character 2: Student Center holding 6-char Code Card */}
      <g transform="translate(215, 240)">
        <rect
          x="18"
          y="48"
          width="64"
          height="60"
          rx="20"
          fill="#10B981"
          stroke="#0F172A"
          strokeWidth="4"
        />
        <circle
          cx="50"
          cy="26"
          r="23"
          fill="#FED7AA"
          stroke="#0F172A"
          strokeWidth="4"
        />
        <circle cx="43" cy="23" r="3" fill="#0F172A" />
        <circle cx="57" cy="23" r="3" fill="#0F172A" />
        <path
          d="M 43 33 Q 50 39 57 33"
          fill="none"
          stroke="#0F172A"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* 6-char Access Badge */}
        <rect
          x="85"
          y="32"
          width="126"
          height="46"
          rx="12"
          fill="#FEF08A"
          stroke="#0F172A"
          strokeWidth="3.5"
        />
        <text
          x="100"
          y="61"
          fill="#0F172A"
          fontSize="18"
          fontWeight="800"
          fontFamily="JetBrains Mono, monospace"
        >
          MÃ: 8K9P2A
        </text>
      </g>
    </svg>
  </div>
);

export const GamePortalBannerIllustration: React.FC = () => (
  <div className="relative overflow-hidden rounded-3xl border-2 border-slate-900 bg-gradient-to-r from-amber-200 via-sky-100 to-emerald-100 p-5 shadow-[0_4px_0_0_#1E293B]">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <p className="text-xs font-extrabold tracking-wide text-amber-900">
          KHO TRÒ CHƠI TOÁN HỌC TƯƠNG TÁC
        </p>
        <h2 className="mt-1 font-display text-2xl font-extrabold text-slate-900">
          Vừa Học Vừa Chơi — Rèn Tư Duy Nhạy Bén
        </h2>
        <p className="mt-1 max-w-xl text-sm text-slate-700">
          Khám phá phân số, cân bằng phương trình, ghép hình diện tích và giải đố
          logic ngay trên trình duyệt.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-slate-900 bg-white font-display text-xl font-black text-blue-600 shadow-[0_3px_0_0_#1E293B]">
          ∑
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-slate-900 bg-amber-300 font-display text-xl font-black text-slate-900 shadow-[0_3px_0_0_#1E293B]">
          △
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-slate-900 bg-emerald-300 font-display text-xl font-black text-slate-900 shadow-[0_3px_0_0_#1E293B]">
          π
        </div>
      </div>
    </div>
  </div>
);
