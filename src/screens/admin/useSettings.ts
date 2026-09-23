import { useCallback, useEffect, useState } from 'react';
import { admin } from '@/api';
import type { SettingsMap } from '@/api';
import { useToast } from '@/state/toast';

export interface SettingsApi {
  values: SettingsMap | null;
  busy: boolean;
  bool: (key: string) => boolean;
  text: (key: string) => string;
  set: (key: string, value: string) => void;
  setBool: (key: string, value: boolean) => void;
}

/** Sovellusasetukset. Kirjoitusoikeuden tarkistaa aina taustalogiikka. */
export function useSettings(): SettingsApi {
  const toast = useToast();
  const [values, setValues] = useState<SettingsMap | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void admin.getSettings().then(
      (v) => alive && setValues(v),
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, []);

  const set = useCallback(
    (key: string, value: string) => {
      setValues((prev) => (prev ? { ...prev, [key]: value } : prev));
      setBusy(true);
      void admin
        .setSetting(key, value)
        .then(setValues)
        .catch(toast.fail)
        .finally(() => setBusy(false));
    },
    [toast]
  );

  return {
    values,
    busy,
    bool: (key) => values?.[key] === '1',
    text: (key) => values?.[key] ?? '',
    set,
    setBool: (key, value) => set(key, value ? '1' : '0')
  };
}
