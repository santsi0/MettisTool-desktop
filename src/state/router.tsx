import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'tool'; id: string }
  | { name: 'category'; id: string }
  | { name: 'favorites' }
  | { name: 'recent' }
  | { name: 'account' }
  | { name: 'settings' }
  | { name: 'admin'; tab: string };

const HOME: Route = { name: 'home' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  const arg = decodeURIComponent(parts[1] ?? '');
  switch (parts[0]) {
    case 't': return arg ? { name: 'tool', id: arg } : HOME;
    case 'm': return arg ? { name: 'category', id: arg } : HOME;
    case 'suosikit': return { name: 'favorites' };
    case 'viimeisimmat': return { name: 'recent' };
    case 'tili': return { name: 'account' };
    case 'asetukset': return { name: 'settings' };
    case 'hallinta': return { name: 'admin', tab: arg || 'overview' };
    default: return HOME;
  }
}

export function toHash(r: Route): string {
  switch (r.name) {
    case 'tool': return `#/t/${encodeURIComponent(r.id)}`;
    case 'category': return `#/m/${encodeURIComponent(r.id)}`;
    case 'favorites': return '#/suosikit';
    case 'recent': return '#/viimeisimmat';
    case 'account': return '#/tili';
    case 'settings': return '#/asetukset';
    case 'admin': return `#/hallinta/${r.tab}`;
    default: return '#/koti';
  }
}

interface RouterValue {
  route: Route;
  navigate: (r: Route) => void;
  /** Vaiheen 1 moottori käyttää suoraa hash-muotoa. */
  goHash: (hash: string) => void;
}

const Ctx = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const goHash = useCallback((hash: string) => {
    if (location.hash === hash) setRoute(parseHash(hash));
    else location.hash = hash;
  }, []);

  const navigate = useCallback((r: Route) => goHash(toHash(r)), [goHash]);

  const value = useMemo(() => ({ route, navigate, goHash }), [route, navigate, goHash]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRouter(): RouterValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('RouterProvider puuttuu');
  return ctx;
}
