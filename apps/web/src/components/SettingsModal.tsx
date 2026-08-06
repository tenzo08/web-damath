import { Modal } from './Modal';
import { useSettings, type ThemePreference } from '../lib/settings';
import { playMoveSound } from '../lib/sound';

const cardButton = (active: boolean) =>
  ({
    textAlign: 'left' as const,
    padding: 'var(--pad-md)',
    borderRadius: 'var(--radius)',
    border: active ? '1px solid rgba(227, 179, 65, 0.5)' : '1px solid var(--border)',
    background: active ? 'var(--accent-bg)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    cursor: 'pointer',
  }) as const;

const THEME_OPTIONS: readonly { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'system', label: 'System', icon: '🖥️' },
];

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

/** Personalization, per browser: theme (dark/light/system) and sound effect volume. Reachable from the lobby header. Music isn't offered here — no audio asset pipeline exists in this codebase, and a toggle with nothing to toggle would just be a broken control (see TASK.md). */
export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { theme, setTheme, soundEnabled, setSoundEnabled, soundVolume, setSoundVolume } = useSettings();

  return (
    <Modal open={open} onClose={onClose} title="Settings" width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <div>
          <h3 style={{ margin: '0 0 var(--pad-sm) 0', fontSize: 'var(--fs-label)', color: 'var(--text-secondary)' }}>Theme</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--gap-sm)' }}>
            {THEME_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" style={cardButton(theme === opt.value)} onClick={() => setTheme(opt.value)}>
                <span aria-hidden="true">{opt.icon}</span> {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 style={{ margin: '0 0 var(--pad-sm) 0', fontSize: 'var(--fs-label)', color: 'var(--text-secondary)' }}>Sound effects</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)', fontSize: 'var(--fs-body)', color: 'var(--text-primary)' }}>
            <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />
            Play a sound for moves, captures, and game-over
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--gap-sm)',
              marginTop: 'var(--pad-sm)',
              fontSize: 'var(--fs-meta)',
              color: 'var(--text-secondary)',
              opacity: soundEnabled ? 1 : 0.5,
            }}
          >
            Volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={soundVolume}
              disabled={!soundEnabled}
              onChange={(e) => setSoundVolume(Number(e.target.value))}
              // Hear the change on release, not on every tick while dragging (which would
              // overlap dozens of tones) — by the time mouseup/touchend fires, the last
              // onChange has already updated `soundVolume` for this render.
              onMouseUp={() => soundEnabled && playMoveSound(soundVolume)}
              onTouchEnd={() => soundEnabled && playMoveSound(soundVolume)}
              style={{ flex: 1 }}
            />
          </label>
        </div>

        <p style={{ margin: 0, fontSize: 'var(--fs-micro)', color: 'var(--text-muted)' }}>
          Background music isn't available yet — there's no audio track shipped with this build.
        </p>
      </div>
    </Modal>
  );
}
