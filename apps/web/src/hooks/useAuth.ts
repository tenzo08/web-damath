import { useCallback, useEffect, useState } from 'react';
import * as authClient from '../lib/authClient';
import type { AuthSession, AuthUser, GooglePendingSignup } from '../lib/authClient';

const STORAGE_KEY = 'damath.auth.token';

/**
 * Sign-in is optional, not a gate — chess.com-style guest play stays available
 * everywhere; this only matters for "Play Online" and match history, which need a
 * real account. The token lives in localStorage so a refresh doesn't sign you out.
 */
export function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>(token ? 'loading' : 'ready');

  useEffect(() => {
    if (!token) {
      setUser(null);
      setStatus('ready');
      return;
    }
    setStatus('loading');
    let cancelled = false;
    authClient
      .me(token)
      .then((u) => {
        if (!cancelled) {
          setUser(u);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem(STORAGE_KEY);
          setToken(null);
          setUser(null);
          setStatus('ready');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const applySession = useCallback((session: AuthSession) => {
    localStorage.setItem(STORAGE_KEY, session.token);
    setToken(session.token);
    setUser(session.user);
  }, []);

  const signup = useCallback(
    async (email: string, password: string, displayName: string) => {
      applySession(await authClient.signup(email, password, displayName));
    },
    [applySession],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      applySession(await authClient.login(email, password));
    },
    [applySession],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  /** Signs in immediately if `idToken` matches an existing account; otherwise returns the pending-signup details so the caller (LoginModal) can collect a nickname and password via `completeGoogleSignup`. */
  const googleAuth = useCallback(
    async (idToken: string): Promise<GooglePendingSignup | null> => {
      const result = await authClient.googleAuth(idToken);
      if ('pending' in result) return result;
      applySession(result);
      return null;
    },
    [applySession],
  );

  const completeGoogleSignup = useCallback(
    async (pendingToken: string, displayName: string, password: string) => {
      applySession(await authClient.completeGoogleSignup(pendingToken, displayName, password));
    },
    [applySession],
  );

  /**
   * Re-fetches `/auth/me` without touching `status`/`token` — for anything that changes
   * server-side outside a request this hook itself made, most notably the Elo rating
   * (rating/elo.ts) updating after an online game finishes. Nothing here calls this
   * automatically; found missing by actually playing a game and watching the displayed
   * rating stay stale (KNOWLEDGE.md) — a caller (OnlineGameScreen) has to ask for it.
   */
  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      setUser(await authClient.me(token));
    } catch {
      // Best-effort — a transient failure here shouldn't sign the user out; the
      // token-driven effect above already handles a genuinely invalid/expired token.
    }
  }, [token]);

  /**
   * Unlike `refreshUser` (best-effort, silent), this throws on failure — SettingsModal
   * needs to show the caller (e.g. an avatar value the server's allow-list rejects)
   * rather than swallow it.
   */
  const updateProfile = useCallback(
    async (patch: { displayName?: string; avatarEmoji?: string | null }) => {
      if (!token) throw new Error('not signed in');
      setUser(await authClient.updateProfile(token, patch));
    },
    [token],
  );

  return { token, user, status, signup, login, logout, refreshUser, updateProfile, googleAuth, completeGoogleSignup };
}
