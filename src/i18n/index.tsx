/**
 * Monikielisyys. Käyttöliittymässä ei ole yhtään kovakoodattua tekstiä:
 * kaikki kulkee `t()`-funktion kautta ja käännökset ovat locales/*.json-tiedostoissa.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import fiDict from './locales/fi.json';

export const LANGUAGES = [
  { code: 'fi', name: 'Suomi' },
  { code: 'en', name: 'English' },
  { code: 'sv', name: 'Svenska' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'no', name: 'Norsk' },
  { code: 'da', name: 'Dansk' }
] as const;

export type LangCode = (typeof LANGUAGES)[number]['code'];

const CODES: readonly string[] = LANGUAGES.map((l) => l.code);
export const DEFAULT_LANG: LangCode = 'fi';

export function isLang(v: string): v is LangCode {
  return CODES.includes(v);
}

type Dict = Record<string, string>;

const base = fiDict as Dict;
const loaders = import.meta.glob<{ default: Dict }>('./locales/*.json');
const cache = new Map<string, Dict>([['fi', base]]);

async function loadDict(lang: string): Promise<Dict> {
  const hit = cache.get(lang);
  if (hit) return hit;
  const loader = loaders[`./locales/${lang}.json`];
  if (!loader) return base;
  const mod = await loader();
  cache.set(lang, mod.default);
  return mod.default;
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

interface I18nValue {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  t: TFn;
  /** Locale-tunnus Intl-muotoiluihin. */
  locale: string;
}

const Ctx = createContext<I18nValue | null>(null);

const INTL: Record<string, string> = {
  fi: 'fi-FI', en: 'en-GB', sv: 'sv-SE', de: 'de-DE', fr: 'fr-FR', es: 'es-ES',
  it: 'it-IT', pt: 'pt-PT', nl: 'nl-NL', pl: 'pl-PL', no: 'nb-NO', da: 'da-DK'
};

const STORAGE_KEY = 'mt.lang';

function initialLang(): LangCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isLang(saved)) return saved;
  } catch {
    /* localStorage voi olla estetty — käytetään oletusta */
  }
  const nav = navigator.language.slice(0, 2).toLowerCase();
  const alias = nav === 'nb' || nav === 'nn' ? 'no' : nav;
  return isLang(alias) ? alias : DEFAULT_LANG;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(initialLang);
  const [dict, setDict] = useState<Dict>(() => cache.get(initialLang()) ?? base);

  useEffect(() => {
    let alive = true;
    void loadDict(lang).then((d) => {
      if (alive) setDict(d);
    });
    document.documentElement.lang = lang;
    return () => {
      alive = false;
    };
  }, [lang]);

  const setLang = useCallback((next: LangCode) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ei kriittinen */
    }
  }, []);

  const t = useCallback<TFn>(
    (key, vars) => interpolate(dict[key] ?? base[key] ?? key, vars),
    [dict]
  );

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t, locale: INTL[lang] ?? 'fi-FI' }),
    [lang, setLang, t]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('I18nProvider puuttuu');
  return ctx;
}

export function useT(): TFn {
  return useI18n().t;
}
