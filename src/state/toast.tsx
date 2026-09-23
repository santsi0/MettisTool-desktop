import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { errorKey, isAppError } from '@/api';
import { useT } from '@/i18n';
import { Icon } from '@/ui/Icon';

type Kind = 'ok' | 'err' | 'info';
interface Item { id: number; kind: Kind; msg: string; }

interface ToastApi {
  ok: (msg: string) => void;
  err: (msg: string) => void;
  info: (msg: string) => void;
  /** Näyttää AppErrorin käännettynä. */
  fail: (e: unknown) => void;
}

const Ctx = createContext<ToastApi | null>(null);
const TTL = 4200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [items, setItems] = useState<Item[]>([]);
  const next = useRef(1);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const handles = timers.current;
    return () => handles.forEach(window.clearTimeout);
  }, []);

  const push = useCallback((kind: Kind, msg: string) => {
    const id = next.current++;
    setItems((prev) => [...prev.slice(-3), { id, kind, msg }]);
    timers.current.push(
      window.setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), TTL)
    );
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      ok: (m) => push('ok', m),
      err: (m) => push('err', m),
      info: (m) => push('info', m),
      fail: (e) => {
        const vars = isAppError(e) && e.retryAfter ? { n: e.retryAfter } : undefined;
        push('err', t(errorKey(e), vars));
      }
    }),
    [push, t]
  );

  const close = (id: number) => setItems((prev) => prev.filter((i) => i.id !== id));

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={i.kind === 'info' ? 'toast' : `toast ${i.kind}`}>
            <Icon name={i.kind === 'ok' ? 'check_circle' : i.kind === 'err' ? 'alert-circle' : 'info'} className="ic ic-sm" />
            <span className="grow">{i.msg}</span>
            <button className="icon-btn close" onClick={() => close(i.id)} aria-label={t('common.close')}>
              <Icon name="x" className="ic ic-sm" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('ToastProvider puuttuu');
  return ctx;
}
