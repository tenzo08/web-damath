import { useCallback, useEffect, useState } from 'react';
import * as authClient from '../lib/authClient';
import type { AuthSession, AuthUser } from '../lib/authClient';

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

  return { token, user, status, signup, login, logout };
}
