import { useEffect, useState } from 'react';
import { auth } from '@/api';
import type { PasswordPolicy, PasswordStrength } from '@/api';

/** Viivästetty arvo — estää turhat kutsut kirjoittaessa. */
export function useDebounced<T>(value: T, delay = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return v;
}

/** Salasanan vahvuus lasketaan taustalogiikassa, jotta sääntö on sama kuin tallennuksessa. */
export function usePasswordStrength(password: string): PasswordStrength | null {
  const debounced = useDebounced(password, 220);
  const [res, setRes] = useState<PasswordStrength | null>(null);

  useEffect(() => {
    if (!debounced) {
      setRes(null);
      return;
    }
    let alive = true;
    void auth.passwordStrength(debounced).then(
      (r) => alive && setRes(r),
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, [debounced]);

  return res;
}

let policyCache: PasswordPolicy | null = null;

export function usePasswordPolicy(): PasswordPolicy | null {
  const [p, setP] = useState<PasswordPolicy | null>(policyCache);
  useEffect(() => {
    if (policyCache) return;
    let alive = true;
    void auth.passwordPolicy().then((r) => {
      policyCache = r;
      if (alive) setP(r);
    }, () => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return p;
}
