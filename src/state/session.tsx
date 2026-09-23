import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { auth } from '@/api';
import type { AppStatus, CloudSession, Profile, Role } from '@/api';
import { isLang, useI18n } from '@/i18n';
import { applyTheme, isAccent, isTheme, loadThemePrefs } from './theme';

const RANK: Record<Role, number> = { USER: 1, MODERATOR: 2, ADMIN: 3, OWNER: 4 };

interface SessionValue {
  status: AppStatus | null;
  session: CloudSession | null;
  user: Profile | null;
  booting: boolean;
  /**
   * Onko käyttäjällä oikeus. Tämä on vain käyttöliittymän kulissi —
   * tietokanta tarkistaa jokaisen kutsun uudelleen RLS-säännöillä.
   */
  can: (permission: string) => boolean;
  isAdmin: boolean;
  isOwner: boolean;
  setSession: (s: CloudSession | null) => void;
  refreshStatus: () => Promise<void>;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { setLang } = useI18n();
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [session, setSessionState] = useState<CloudSession | null>(null);
  const [booting, setBooting] = useState(true);

  const setSession = useCallback(
    (s: CloudSession | null) => {
      setSessionState(s);
      if (s && isLang(s.user.language)) setLang(s.user.language);
    },
    [setLang]
  );

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await auth.appStatus());
    } catch {
      // app_status ei heitä normaalisti; jos se silti heittää, ei jäädytetä
      // sovellusta vaan näytetään yhteysvirhe.
      setStatus({
        appVersion: '',
        registrationEnabled: false,
        requireEmailVerification: true,
        googleLoginEnabled: false,
        online: false
      });
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      setSession(await auth.currentSession());
    } catch {
      setSession(null);
    }
  }, [setSession]);

  const signOut = useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      setSession(null);
    }
  }, [setSession]);

  // Käynnistys: teema paikallisista asetuksista heti, sitten palvelimen tila
  // ja mahdollinen aiempi istunto.
  useEffect(() => {
    const prefs = loadThemePrefs();
    applyTheme(isTheme(prefs.theme) ? prefs.theme : 'dark', isAccent(prefs.accent) ? prefs.accent : 'crimson');

    let alive = true;
    void (async () => {
      await refreshStatus();
      try {
        const restored = await auth.restoreSession();
        if (alive) setSession(restored);
      } catch {
        if (alive) setSession(null);
      }
      if (alive) setBooting(false);
    })();
    return () => {
      alive = false;
    };
  }, [refreshStatus, setSession]);

  const user = session?.user ?? null;
  const rank = user ? RANK[user.role] ?? 1 : 0;

  const can = useCallback(
    (permission: string) => {
      if (!user) return false;
      const override = user.permissions?.[permission];
      if (typeof override === 'boolean') return override;
      return RANK[user.role] >= RANK.ADMIN;
    },
    [user]
  );

  const value = useMemo<SessionValue>(
    () => ({
      status,
      session,
      user,
      booting,
      can,
      isAdmin: rank >= RANK.ADMIN,
      isOwner: rank >= RANK.OWNER,
      setSession,
      refreshStatus,
      refreshSession,
      signOut
    }),
    [status, session, user, booting, can, rank, setSession, refreshStatus, refreshSession, signOut]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession vaatii SessionProviderin');
  return v;
}
