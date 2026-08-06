import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemePreference = 'dark' | 'light' | 'system';

const THEME_KEY = 'damath.theme';
const SOUND_ENABLED_KEY = 'damath.sound.enabled';
const SOUND_VOLUME_KEY = 'damath.sound.volume';

function readStoredTheme(): ThemePreference {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'system' ? stored : 'dark';
}

function readStoredSoundEnabled(): boolean {
  return localStorage.getItem(SOUND_ENABLED_KEY) !== 'false'; // on by default
}

function readStoredSoundVolume(): number {
  // `localStorage.getItem` returns `null` when nothing's been saved yet, and
  // `Number(null) === 0` -- checking `Number.isFinite` on the *raw* conversion can't
  // tell "nothing persisted" apart from "explicitly saved 0", so a fresh browser with
  // no stored value silently got volume 0 instead of the intended 0.4 default (found
  // by a real test asserting the documented default, lib/settings.test.tsx).
  const raw = localStorage.getItem(SOUND_VOLUME_KEY);
  if (raw === null) return 0.4;
  const stored = Number(raw);
  return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.4;
}

function systemPrefersLight(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches;
}

interface SettingsContextValue {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  /** "system" resolved to an actual value — this is what's applied to `<html data-theme>` right now. */
  effectiveTheme: 'dark' | 'light';
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  soundVolume: number;
  setSoundVolume: (volume: number) => void;
  /** 0 when sound is off, the configured volume otherwise — pass straight into `lib/sound.ts`'s `play*Sound` functions so call sites never need their own `if (soundEnabled)` check. */
  effectiveVolume: number;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Theme (dark/light/system) and sound-effect preferences, persisted per browser —
 * same context-provider shape as `lib/i18n.tsx`'s `LocaleProvider`. Music isn't here:
 * there's no audio asset pipeline in this codebase, so a "music" toggle with nothing to
 * toggle would just be a broken control (see TASK.md for the scope note).
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readStoredTheme);
  const [systemIsLight, setSystemIsLight] = useState(systemPrefersLight);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(readStoredSoundEnabled);
  const [soundVolume, setSoundVolumeState] = useState<number>(readStoredSoundVolume);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setSystemIsLight(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const effectiveTheme: 'dark' | 'light' = theme === 'system' ? (systemIsLight ? 'light' : 'dark') : theme;

  // The one DOM side effect this whole file has — tokens.css's `[data-theme="light"]`
  // block reacts to this attribute; every other theme value (including "dark", the
  // default) needs no attribute at all, since :root's own values already are the dark
  // palette.
  useEffect(() => {
    if (effectiveTheme === 'light') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
  }, [effectiveTheme]);

  function setTheme(next: ThemePreference) {
    localStorage.setItem(THEME_KEY, next);
    setThemeState(next);
  }

  function setSoundEnabled(next: boolean) {
    localStorage.setItem(SOUND_ENABLED_KEY, String(next));
    setSoundEnabledState(next);
  }

  function setSoundVolume(next: number) {
    localStorage.setItem(SOUND_VOLUME_KEY, String(next));
    setSoundVolumeState(next);
  }

  const value: SettingsContextValue = {
    theme,
    setTheme,
    effectiveTheme,
    soundEnabled,
    setSoundEnabled,
    soundVolume,
    setSoundVolume,
    effectiveVolume: soundEnabled ? soundVolume : 0,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
