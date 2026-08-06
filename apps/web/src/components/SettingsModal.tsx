import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useSettings, type ThemePreference } from '../lib/settings';
import { playMoveSound } from '../lib/sound';
import { AVATAR_OPTIONS } from '../lib/avatars';
import type { AuthUser } from '../lib/authClient';

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

const sectionHeading = {
  margin: '0 0 var(--pad-sm) 0',
  fontSize: 'var(--fs-label)',
  color: 'var(--text-secondary)',
  fontWeight: 700,
} as const;

const THEME_OPTIONS: readonly { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'system', label: 'System', icon: '🖥️' },
];

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** `null` while signed out — the Profile section only makes sense for a real account, so it's omitted entirely rather than shown disabled. */
  user: AuthUser | null;
  onUpdateProfile: (patch: { displayName?: string; avatarEmoji?: string | null }) => Promise<void>;
}

/** Avatar + display name, editable in place. Split out so ProfileSection's own `useState` (the draft name, save-in-flight state) resets cleanly whenever a different `user` is passed in, rather than being hand-rolled inside SettingsModal itself. */
function ProfileSection({ user, onUpdateProfile }: { user: AuthUser; onUpdateProfile: SettingsModalProps['onUpdateProfile'] }) {
  const [name, setName] = useState(user.displayName);
  const [savingName, setSavingName] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The draft field should always reflect *this* account's current name — if the modal
  // stays open across a sign-out/sign-in (unlikely but not impossible) or `user` changes
  // for any other reason, an in-progress edit for a *different* account shouldn't linger.
  useEffect(() => {
    setName(user.displayName);
  }, [user.id, user.displayName]);

  const nameChanged = name.trim() !== user.displayName && name.trim().length > 0;

  async function saveName() {
    setError(null);
    setSavingName(true);
    try {
      await onUpdateProfile({ displayName: name.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your name.');
    } finally {
      setSavingName(false);
    }
  }

  async function pickAvatar(emoji: string) {
    setError(null);
    setSavingAvatar(emoji);
    try {
      await onUpdateProfile({ avatarEmoji: emoji === user.avatarEmoji ? null : emoji });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your avatar.');
    } finally {
      setSavingAvatar(null);
    }
  }

  return (
    <div>
      <h3 style={sectionHeading}>Profile</h3>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)', marginBottom: 'var(--pad-md)' }}>
        <span
          aria-hidden="true"
          style={{
            width: 48,
            height: 48,
            flexShrink: 0,
            borderRadius: '50%',
            background: 'var(--accent)',
            color: 'var(--accent-on)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: user.avatarEmoji ? 24 : 'var(--fs-title)',
            fontWeight: 700,
          }}
        >
          {user.avatarEmoji ?? user.displayName.charAt(0).toUpperCase()}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>{user.email}</span>
          <span style={{ fontSize: 'var(--fs-body)', fontWeight: 700 }}>Rating {user.rating}</span>
        </div>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)', marginBottom: 'var(--pad-md)' }}>
        Display name
        <div style={{ display: 'flex', gap: 'var(--gap-sm)' }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            style={{
              flex: 1,
              padding: 'var(--pad-sm) var(--pad-md)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--surface-raised)',
              color: 'var(--text-primary)',
              fontSize: 'var(--fs-body)',
            }}
          />
          <button
            type="button"
            onClick={() => void saveName()}
            disabled={!nameChanged || savingName}
            style={{
              background: nameChanged ? 'var(--accent)' : 'transparent',
              color: nameChanged ? 'var(--accent-on)' : 'var(--text-muted)',
              border: nameChanged ? 'none' : '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 'var(--pad-sm) var(--pad-md)',
              fontWeight: 700,
              cursor: nameChanged && !savingName ? 'pointer' : 'default',
            }}
          >
            {savingName ? 'Saving…' : 'Save'}
          </button>
        </div>
      </label>

      <span style={{ display: 'block', fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)', marginBottom: 'var(--pad-sm)' }}>
        Avatar
      </span>
      <div
        role="group"
        aria-label="Choose an avatar"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 'var(--gap-xs, 6px)' }}
      >
        {AVATAR_OPTIONS.map((emoji) => {
          const active = user.avatarEmoji === emoji;
          return (
            <button
              key={emoji}
              type="button"
              aria-label={`Avatar ${emoji}${active ? ' (selected)' : ''}`}
              aria-pressed={active}
              onClick={() => void pickAvatar(emoji)}
              disabled={savingAvatar !== null}
              style={{
                ...cardButton(active),
                textAlign: 'center',
                fontSize: 20,
                padding: 'var(--pad-sm) 0',
                lineHeight: 1,
                opacity: savingAvatar !== null && savingAvatar !== emoji ? 0.5 : 1,
              }}
            >
              {emoji}
            </button>
          );
        })}
      </div>
      <p style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-micro)', color: 'var(--text-muted)' }}>
        Tap your current avatar again to go back to the plain initial.
      </p>

      {error && (
        <p role="alert" style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-meta)', color: 'var(--danger)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Personalization, per browser: theme (dark/light/system) and sound effect volume — plus, when signed in, the account's own profile (avatar, display name). Reachable from the lobby header. Music isn't offered here — no audio asset pipeline exists in this codebase, and a toggle with nothing to toggle would just be a broken control (see TASK.md). */
export function SettingsModal({ open, onClose, user, onUpdateProfile }: SettingsModalProps) {
  const { theme, setTheme, soundEnabled, setSoundEnabled, soundVolume, setSoundVolume } = useSettings();

  return (
    <Modal open={open} onClose={onClose} title="Settings" width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-xl)' }}>
        {user && <ProfileSection user={user} onUpdateProfile={onUpdateProfile} />}

        <div>
          <h3 style={sectionHeading}>Theme</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--gap-sm)' }}>
            {THEME_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" style={cardButton(theme === opt.value)} onClick={() => setTheme(opt.value)}>
                <span aria-hidden="true">{opt.icon}</span> {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 style={sectionHeading}>Sound effects</h3>
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
