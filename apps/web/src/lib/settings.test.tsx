import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { SettingsProvider, useSettings } from './settings';

/**
 * Unit-tests the provider directly rather than through the UI that reaches it
 * (App.test.tsx used to click through to SettingsModal, but that path only ever
 * existed for a signed-out visitor — removed once the profile button became the sole
 * entry point, sign-in-gated). Testing at this layer is strictly better anyway: it
 * verifies the actual contract (the `<html data-theme>` DOM effect, localStorage
 * persistence) without depending on any particular button existing to reach it.
 */
function setup() {
  return renderHook(() => useSettings(), { wrapper: SettingsProvider });
}

describe('SettingsProvider / useSettings', () => {
  it('defaults to dark (no data-theme attribute) with sound on', () => {
    const { result } = setup();
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(result.current.soundEnabled).toBe(true);
  });

  it('switching to light sets <html data-theme="light"> and persists it', () => {
    const { result } = setup();

    act(() => result.current.setTheme('light'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('damath.theme')).toBe('light');
    expect(result.current.effectiveTheme).toBe('light');

    act(() => result.current.setTheme('dark'));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('damath.theme')).toBe('dark');
  });

  it('a fresh provider picks up a previously persisted theme', () => {
    localStorage.setItem('damath.theme', 'light');
    const { result } = setup();
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('turning sound off persists the preference and zeroes effectiveVolume', () => {
    const { result } = setup();
    expect(result.current.effectiveVolume).toBeGreaterThan(0);

    act(() => result.current.setSoundEnabled(false));
    expect(result.current.soundEnabled).toBe(false);
    expect(result.current.effectiveVolume).toBe(0);
    expect(localStorage.getItem('damath.sound.enabled')).toBe('false');
  });

  it('setSoundVolume persists and is reflected in effectiveVolume while sound is on', () => {
    const { result } = setup();
    act(() => result.current.setSoundVolume(0.75));
    expect(result.current.soundVolume).toBe(0.75);
    expect(result.current.effectiveVolume).toBe(0.75);
    expect(localStorage.getItem('damath.sound.volume')).toBe('0.75');
  });
});
