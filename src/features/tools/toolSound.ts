/** Short UI sounds synthesised with Web Audio – no sound files, nothing copied. */

type Note = { at: number; freq: number; dur: number; type?: OscillatorType; volume?: number };

function play(notes: Note[]) {
  try {
    const Ctx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + n.at;
      osc.type = n.type ?? 'sine';
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(n.volume ?? 0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + n.dur + 0.02);
    }
    const end = Math.max(...notes.map((n) => n.at + n.dur));
    window.setTimeout(() => void ctx.close(), (end + 0.5) * 1000);
  } catch {
    // Audio unavailable: visuals still show what happened
  }
}

/** Three beeps for "time is up". */
export const playChime = () =>
  play([
    { at: 0, freq: 784, dur: 0.3 },
    { at: 0.35, freq: 784, dur: 0.3 },
    { at: 0.7, freq: 1046, dur: 0.3 },
  ]);

/** Bright rising pair for a correct answer. */
export const playCorrect = () =>
  play([
    { at: 0, freq: 659, dur: 0.14, type: 'triangle' },
    { at: 0.12, freq: 988, dur: 0.24, type: 'triangle' },
  ]);

/** Soft low buzz for a wrong answer. */
export const playWrong = () => play([{ at: 0, freq: 196, dur: 0.32, type: 'square', volume: 0.12 }]);

/** Little fanfare for the end of a game. */
export const playFanfare = () =>
  play([
    { at: 0, freq: 523, dur: 0.18, type: 'triangle' },
    { at: 0.18, freq: 659, dur: 0.18, type: 'triangle' },
    { at: 0.36, freq: 784, dur: 0.18, type: 'triangle' },
    { at: 0.54, freq: 1046, dur: 0.45, type: 'triangle' },
  ]);

/** Two-tone train whistle when a train sets off. */
export const playWhistle = () =>
  play([
    { at: 0, freq: 587, dur: 0.45, type: 'triangle', volume: 0.22 },
    { at: 0, freq: 740, dur: 0.45, type: 'triangle', volume: 0.18 },
    { at: 0.55, freq: 587, dur: 0.7, type: 'triangle', volume: 0.22 },
    { at: 0.55, freq: 740, dur: 0.7, type: 'triangle', volume: 0.18 },
  ]);
