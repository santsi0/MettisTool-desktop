import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { tools as toolApi } from '@/api';
import type { ToolUsageRow } from '@/api';
import { useT } from '@/i18n';
import { loadEngine } from '@/tools/runtime';
import type { HostBridge, ToolEngine } from '@/tools/runtime';
import { parseHash, useRouter } from './router';
import { useToast } from './toast';

interface ToolsValue {
  engine: ToolEngine | null;
  failed: boolean;
  favorites: string[];
  usage: Record<string, number>;
  recent: string[];
  isFav: (id: string) => boolean;
  toggleFav: (id: string) => void;
  /** Merkitsee työkalun käytetyksi paikallisessa tilassa (moottori kirjaa itse taustalle). */
  noteUsed: (id: string) => void;
}

const Ctx = createContext<ToolsValue | null>(null);

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function ToolsProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const toast = useToast();
  const { goHash } = useRouter();

  const [engine, setEngine] = useState<ToolEngine | null>(null);
  const [failed, setFailed] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [recent, setRecent] = useState<string[]>([]);

  // Sillan kutsut ohjataan refien kautta, jotta moottori näkee aina tuoreen kielen ja reitittimen.
  const live = useRef({ t, toast, goHash });
  live.current = { t, toast, goHash };

  useEffect(() => {
    let alive = true;

    void (async () => {
      let state: Record<string, string> = {};
      let rows: ToolUsageRow[] = [];
      try {
        [state, rows] = await Promise.all([toolApi.stateAll(), toolApi.usage()]);
      } catch {
        /* tila voi olla tyhjä ensimmäisellä kerralla — moottori toimii silti */
      }
      if (!alive) return;

      const favs = rows.filter((r) => r.favorite).map((r) => r.toolId);
      const uses: Record<string, number> = {};
      rows.forEach((r) => {
        uses[r.toolId] = r.uses;
      });
      const recentIds = rows
        .filter((r) => r.lastUsed)
        .sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))
        .map((r) => r.toolId);

      setFavorites(favs);
      setUsage(uses);
      setRecent(recentIds);

      const bridge: HostBridge = {
        state: {
          fav: favs,
          recent: recentIds.map((id) => ({ id, t: (rows.find((r) => r.toolId === id)?.lastUsed ?? 0) * 1000 })),
          usage: uses,
          log: parseJson(state.log, {}),
          open: parseJson(state.open, {}),
          data: parseJson(state.data, {}),
          s: parseJson(state.s, { wrap: false, autorun: true, indent: 2 })
        },
        saveState: (partial) => {
          Object.entries(partial).forEach(([key, value]) => {
            void toolApi.stateSet(key, JSON.stringify(value)).catch(() => undefined);
          });
        },
        setFav: (id, on) => {
          void toolApi.setFavorite(id, on).catch(() => undefined);
        },
        touch: (id) => {
          void toolApi.used(id).catch(() => undefined);
        },
        toast: (msg, kind) => {
          if (kind === 'err') live.current.toast.err(msg);
          else if (kind === 'ok') live.current.toast.ok(msg);
          else live.current.toast.info(msg);
        },
        go: (hash) => live.current.goHash(hash),
        open: (id) => live.current.goHash(`#/t/${encodeURIComponent(id)}`),
        route: () => {
          const r = parseHash(location.hash);
          return r.name === 'tool' ? { page: 't', arg: r.id } : { page: r.name, arg: '' };
        },
        t: (key, vars) => live.current.t(key, vars),
        ready: () => undefined
      };

      try {
        const mt = await loadEngine(bridge);
        if (alive) setEngine(mt);
      } catch {
        if (alive) setFailed(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const toggleFav = useCallback(
    (id: string) => {
      const on = engine ? engine.toggleFav(id) : false;
      setFavorites((prev) => (on ? [id, ...prev.filter((f) => f !== id)] : prev.filter((f) => f !== id)));
    },
    [engine]
  );

  const noteUsed = useCallback((id: string) => {
    setUsage((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    setRecent((prev) => [id, ...prev.filter((r) => r !== id)].slice(0, 40));
  }, []);

  const value = useMemo<ToolsValue>(
    () => ({
      engine,
      failed,
      favorites,
      usage,
      recent,
      isFav: (id) => favorites.includes(id),
      toggleFav,
      noteUsed
    }),
    [engine, failed, favorites, usage, recent, toggleFav, noteUsed]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTools(): ToolsValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('ToolsProvider puuttuu');
  return ctx;
}
