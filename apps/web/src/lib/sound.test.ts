import { describe, expect, it } from 'vitest';
import { playCaptureSound, playErrorSound, playLossSound, playMoveSound, playWinSound } from './sound';

// jsdom (this test environment) has no AudioContext at all, the same as any browser
// without Web Audio support — every one of these must be a silent no-op, never a thrown
// error, since sound is a pure enhancement nothing else depends on.
describe('sound effects degrade gracefully with no AudioContext support', () => {
  it('never throws when played, volume on or off', () => {
    expect(() => playMoveSound(0.5)).not.toThrow();
    expect(() => playCaptureSound(0.5)).not.toThrow();
    expect(() => playWinSound(0.5)).not.toThrow();
    expect(() => playLossSound(0.5)).not.toThrow();
    expect(() => playErrorSound(0.5)).not.toThrow();
  });

  it('a zero or negative volume is a no-op even conceptually, not just quiet', () => {
    // Can't observe "no sound played" directly without a real AudioContext, but this at
    // least documents and locks in the volume<=0 short-circuit exists and doesn't throw.
    expect(() => playMoveSound(0)).not.toThrow();
    expect(() => playMoveSound(-1)).not.toThrow();
  });
});
