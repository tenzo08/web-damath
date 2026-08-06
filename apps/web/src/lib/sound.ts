/**
 * Short synthesized tones via the Web Audio API — no external audio assets. That means
 * no licensing question, no network fetch (works fully offline, same as the rest of
 * this app's PWA story), and no binary files to source, which wasn't practical to do
 * for this pass. Background music is a different problem (a real composition, not a
 * beep) and is deliberately not attempted here — see TASK.md.
 */

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  // Not every environment has AudioContext (jsdom in tests, very old browsers) — sound
  // is a pure enhancement, never something correctness depends on, so missing support
  // just means silence, not an error.
  if (typeof AudioContext === 'undefined') return null;
  sharedContext ??= new AudioContext();
  return sharedContext;
}

interface ToneSpec {
  readonly freq: number;
  readonly startAt: number;
  readonly durationMs: number;
  readonly type?: OscillatorType;
}

function playTones(tones: readonly ToneSpec[], volume: number): void {
  if (volume <= 0) return;
  const ctx = getContext();
  if (!ctx) return;
  // Most browsers start an AudioContext "suspended" until a user gesture — every call
  // site here is already inside one (a click that moved a piece, a click that toggled
  // the setting itself), so resuming is safe and usually a no-op.
  void ctx.resume();
  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type ?? 'sine';
    osc.frequency.value = tone.freq;
    const startTime = ctx.currentTime + tone.startAt / 1000;
    const endTime = startTime + tone.durationMs / 1000;
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
    osc.connect(gain).connect(ctx.destination);
    osc.start(startTime);
    osc.stop(endTime);
  }
}

/** A quiet, quick click — an ordinary move with no capture. */
export function playMoveSound(volume: number): void {
  playTones([{ freq: 420, startAt: 0, durationMs: 70 }], volume);
}

/** A sharper two-note hit — a capture landed. */
export function playCaptureSound(volume: number): void {
  playTones(
    [
      { freq: 300, startAt: 0, durationMs: 60, type: 'square' },
      { freq: 500, startAt: 40, durationMs: 90, type: 'square' },
    ],
    volume,
  );
}

/** A short rising arpeggio — the game ended in this player's favor. */
export function playWinSound(volume: number): void {
  playTones(
    [
      { freq: 523, startAt: 0, durationMs: 120 },
      { freq: 659, startAt: 100, durationMs: 120 },
      { freq: 784, startAt: 200, durationMs: 220 },
    ],
    volume,
  );
}

/** A short falling pair — the game ended against this player. */
export function playLossSound(volume: number): void {
  playTones(
    [
      { freq: 392, startAt: 0, durationMs: 140 },
      { freq: 294, startAt: 120, durationMs: 260 },
    ],
    volume,
  );
}

/** A low buzz — an illegal action was rejected. */
export function playErrorSound(volume: number): void {
  playTones([{ freq: 160, startAt: 0, durationMs: 160, type: 'sawtooth' }], volume);
}
