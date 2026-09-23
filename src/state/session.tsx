import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { listen } from '@tauri-apps/api/event';
import { auth } from '@/api';
import type { AppStatus, PublicUser, SessionInfo } from '@/api';
import { isLang, useI18n } from '@/i18n';
import { applyTheme, isAccent, isTheme } from './theme';

interface SessionValue {
  status: AppStatus | null;
  session: SessionInfo | null;
  user: PublicUser | null;
  booting: boolean;
  /** Onko käyttäjällä oikeus. Tämä on vain käyttöliittymän kulissi — Rust tarkistaa jokaisen komennon erikseen. */
  can: (permission: string) => boolean;
  isAdmin: boolean;
  isOwner: boolean;
  setSession: (s: SessionInfo | null) => void;
  refreshStatus: () => Promise<void>;
  refreshSession: () => Promise<void>;
  applyUser: (u: PublicUser) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { setLang } = useI18n();
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [session, setSessionState] = useState<SessionInfo | null>(null);
  const [booting, setBooting] = useState(true);

  const applyUser = useCallback(
    (u: PublicUser) => {
      applyTheme(isTheme(u.theme) ? u.theme : 'dark', isAccent(u.accent) ? u.accent : 'crimson');
      if (isLang(u.language)) setLang(u.language);
      setSessionState((prev) => (prev ? { ...prev, user: u } : prev));
    },
    [setLang]
  );

  const setSession = useCallback(
    (s: SessionInfo | null) => {
      setSessionState(s);
      if (s) {
        applyTheme(isTheme(s.user.theme) ? s.user.theme : 'dark', isAccent(s.user.accent) ? s.user.accent : 'crimson');
        if (isLang(s.user.language)) setLang(s.user.language);
      }
    },
    [setLang]
  );

  const refreshStatus = useCallback(async () => {
    setStatus(await auth.appStatus());
  }, []);

  const refreshSession = useCallback(async () => {
    const s = await auth.currentSession();
    setSessionState(s);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      setSessionState(null);
      void auth.appStatus().then(setStatus).catch(() => undefined);
    }
  }, []);

  // Käynnistys: sovelluksen tila + mahdollinen muistettu istunto.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const st = await auth.appStatus();
        if (!alive) return;
        setStatus(st);
        if (st.setupComplete) {
          const restored = await auth.restoreSession();
          if (alive && restored) setSession(restored);
        }
      } catch {
        /* virhe näkyy kirjautumisnäkymässä; sovellus käynnistyy silti */
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [setSession]);

  // Taustalogiikka voi päättää istunnon (esim. ilmaisinalueen "Kirjaudu ulos").
  useEffect(() => {
    const un = listen('session-ended', () => setSessionState(null));
    return () => {
      void un.then((f) => f());
    };
  }, []);

  const value = useMemo<SessionValue>(() => {
    const perms = session?.permissions ?? [];
    const role = session?.user.role;
    return {
      status,
      session,
      user: session?.user ?? null,
      booting,
      can: (p) => role === 'OWNER' || perms.includes(p),
      isAdmin: role === 'ADMIN' || role === 'OWNER' || role === 'MODERATOR',
      isOwner: role === 'OWNER',
      setSession,
      refreshStatus,
      refreshSession,
      applyUser,
      signOut
    };
  }, [status, session, booting, setSession, refreshStatus, refreshSession, applyUser, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('SessionProvider puuttuu');
  return ctx;
}
