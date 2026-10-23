import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, Pause, Play, Plus, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { formatClock } from './toolUtils';

const PRESETS = [1, 2, 3, 5, 10, 15];
const R = 120;
const CIRC = 2 * Math.PI * R;

/** Three short beeps generated with Web Audio (no sound files). */
function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 2 ? 1046 : 784;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.32);
    });
    window.setTimeout(() => void ctx.close(), 1500);
  } catch {
    // Audio unavailable: the visual "Hết giờ!" still shows
  }
}

/** "Đồng hồ đếm ngược": wall-clock based so it stays accurate in background tabs. */
export const CountdownTool: React.FC<{ presenting: boolean }> = ({ presenting }) => {
  const [duration, setDuration] = useState(5 * 60);
  const [remaining, setRemaining] = useState(5 * 60);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [sound, setSound] = useState(true);
  const [label, setLabel] = useState('');
  const [customMin, setCustomMin] = useState('');
  const [customSec, setCustomSec] = useState('');
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const running = endAt !== null;

  useEffect(() => {
    if (endAt === null) return;
    const tick = () => {
      const left = (endAt - Date.now()) / 1000;
      if (left <= 0) {
        setRemaining(0);
        setEndAt(null);
        setFinished(true);
        if (soundRef.current) playChime();
      } else {
        setRemaining(left);
      }
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [endAt]);

  const setTime = useCallback((seconds: number) => {
    const s = Math.max(1, Math.min(99 * 60 + 59, Math.round(seconds)));
    setDuration(s);
    setRemaining(s);
    setEndAt(null);
    setFinished(false);
  }, []);

  const start = () => {
    if (remaining <= 0) return;
    setFinished(false);
    setEndAt(Date.now() + remaining * 1000);
  };
  const pause = () => {
    if (endAt) setRemaining(Math.max(0, (endAt - Date.now()) / 1000));
    setEndAt(null);
  };
  const addMinute = () => {
    setFinished(false);
    setDuration((d) => d + 60);
    if (endAt) setEndAt(endAt + 60_000);
    else setRemaining((r) => r + 60);
  };

  // Space starts/pauses while presenting
  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      e.preventDefault();
      if (running) pause();
      else start();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const ratio = duration ? remaining / duration : 0;
  const color = finished ? '#FF76B5' : remaining <= 10 ? '#FF76B5' : remaining <= 30 ? '#FFB800' : '#1267E9';
  const big = presenting;

  return (
    <div className="flex flex-col items-center gap-6">
      {big ? (
        label && <div className="text-center font-display text-3xl font-extrabold text-[#172B4D] sm:text-4xl">{label}</div>
      ) : (
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={80}
          placeholder="Tên hoạt động (không bắt buộc), ví dụ: Thảo luận nhóm"
          aria-label="Tên hoạt động"
          className="w-full max-w-xl rounded-xl border border-[#DCE7F3] bg-white px-4 py-2.5 text-center text-sm text-[#172B4D] focus:border-[#1267E9] focus:outline-none"
        />
      )}

      <div className={`relative ${big ? 'h-[min(62vh,560px)] w-[min(62vh,560px)]' : 'h-72 w-72 sm:h-80 sm:w-80'}`}>
        <svg viewBox="0 0 280 280" className="h-full w-full -rotate-90">
          <circle cx="140" cy="140" r={R} fill="#FFFFFF" stroke="#EAF5FF" strokeWidth="18" />
          <circle
            cx="140"
            cy="140"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="18"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - ratio)}
            style={{ transition: 'stroke-dashoffset 0.25s linear, stroke 0.3s' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" aria-live="polite">
          {finished ? (
            <>
              <BellRing className={`mimo-pop text-[#FF76B5] ${big ? 'h-20 w-20' : 'h-12 w-12'}`} />
              <span className={`mt-2 font-display font-extrabold text-[#FF76B5] ${big ? 'text-6xl' : 'text-4xl'}`}>Hết giờ!</span>
            </>
          ) : (
            <span
              className={`font-display font-extrabold [font-variant-numeric:tabular-nums] ${big ? 'text-8xl sm:text-9xl' : 'text-6xl'}`}
              style={{ color: remaining <= 10 ? '#D9468C' : '#071A63' }}
            >
              {formatClock(remaining)}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {running ? (
          <button type="button" onClick={pause} className={`studio-btn studio-btn-navy ${big ? 'min-h-[64px] px-10 text-xl' : 'min-h-[48px] px-7 text-base'}`}>
            <Pause className="h-5 w-5" /> Tạm dừng
          </button>
        ) : (
          <button
            type="button"
            onClick={finished ? () => setTime(duration) : start}
            className={`studio-btn studio-btn-accent ${big ? 'min-h-[64px] px-10 text-xl' : 'min-h-[48px] px-7 text-base'}`}
          >
            {finished ? <RotateCcw className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            {finished ? 'Đặt lại' : remaining < duration ? 'Tiếp tục' : 'Bắt đầu'}
          </button>
        )}
        <button type="button" onClick={addMinute} className={`studio-btn studio-btn-secondary ${big ? 'min-h-[64px] text-lg' : 'min-h-[48px]'}`}>
          <Plus className="h-4 w-4" /> 1 phút
        </button>
        <button type="button" onClick={() => setTime(duration)} className={`studio-btn studio-btn-secondary ${big ? 'min-h-[64px] text-lg' : 'min-h-[48px]'}`}>
          <RotateCcw className="h-4 w-4" /> Làm lại
        </button>
        <button
          type="button"
          onClick={() => setSound((s) => !s)}
          aria-pressed={sound}
          className={`studio-btn studio-btn-secondary ${big ? 'min-h-[64px] text-lg' : 'min-h-[48px]'}`}
        >
          {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          {sound ? 'Có chuông' : 'Tắt chuông'}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setTime(m * 60)}
            aria-pressed={duration === m * 60 && !running}
            className={`rounded-full px-4 font-bold transition ${big ? 'min-h-[52px] text-lg' : 'min-h-[40px] text-sm'} ${
              duration === m * 60 ? 'bg-[#1267E9] text-white' : 'bg-[#EAF5FF] text-[#1267E9] hover:bg-[#DCEEFF]'
            }`}
          >
            {m} phút
          </button>
        ))}
        {!big && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const total = (Number(customMin) || 0) * 60 + (Number(customSec) || 0);
              if (total > 0) setTime(total);
            }}
            className="flex items-center gap-1.5"
          >
            <input
              inputMode="numeric"
              value={customMin}
              onChange={(e) => setCustomMin(e.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="phút"
              aria-label="Số phút"
              className="w-16 rounded-xl border border-[#DCE7F3] px-2 py-2 text-center text-sm"
            />
            <span className="font-bold text-[#5E6C84]">:</span>
            <input
              inputMode="numeric"
              value={customSec}
              onChange={(e) => setCustomSec(e.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="giây"
              aria-label="Số giây"
              className="w-16 rounded-xl border border-[#DCE7F3] px-2 py-2 text-center text-sm"
            />
            <button type="submit" className="studio-btn studio-btn-secondary">Đặt</button>
          </form>
        )}
      </div>
      {big && <p className="text-sm text-[#5E6C84]">Phím cách để bắt đầu / tạm dừng · Esc để thoát trình chiếu</p>}
    </div>
  );
};
