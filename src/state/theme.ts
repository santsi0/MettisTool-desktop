/**
 * Teeman ja korostusvärin soveltaminen.
 *
 * Versiossa 2 teema on koneen oma asetus eikä seuraa tiliä: se on puhtaasti
 * ulkoasua, ja paikallinen valinta toimii myös ennen kirjautumista.
 */

export const THEMES = ['dark', 'darker', 'light', 'system'] as const;
export const ACCENTS = ['crimson', 'blue', 'purple', 'green', 'orange'] as const;

export type Theme = (typeof THEMES)[number];
export type Accent = (typeof ACCENTS)[number];

const STORAGE = 'mt.theme';
const dark = () => window.matchMedia('(prefers-color-scheme: dark)');

function resolve(theme: Theme): Exclude<Theme, 'system'> {
  return theme === 'system' ? (dark().matches ? 'dark' : 'light') : theme;
}

let current: Theme = 'dark';
let listening = false;

const onSystemChange = () => {
  if (current === 'system') document.documentElement.dataset.theme = resolve('system');
};

export function applyTheme(theme: Theme, accent: Accent): void {
  current = theme;
  const root = document.documentElement;
  root.dataset.theme = resolve(theme);
  root.dataset.accent = accent;
  try {
    localStorage.setItem(STORAGE, `${theme}|${accent}`);
  } catch {
    /* localStorage voi olla estetty — teema toimii silti istunnon ajan */
  }
  if (!listening) {
    dark().addEventListener('change', onSystemChange);
    listening = true;
  }
}

/** Viimeksi valittu teema. Luetaan ennen ensimmäistä piirtoa, jottei ruutu välähdä. */
export function loadThemePrefs(): { theme: string; accent: string } {
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved) {
      const [theme, accent] = saved.split('|');
      return { theme: theme ?? 'dark', accent: accent ?? 'crimson' };
    }
  } catch {
    /* oletukset riittävät */
  }
  return { theme: 'dark', accent: 'crimson' };
}

/** Soveltaa tallennetun teeman heti sovelluksen käynnistyessä. */
export function restoreTheme(): void {
  const { theme, accent } = loadThemePrefs();
  applyTheme(isTheme(theme) ? theme : 'dark', isAccent(accent) ? accent : 'crimson');
}

export function isTheme(v: string): v is Theme {
  return (THEMES as readonly string[]).includes(v);
}

export function isAccent(v: string): v is Accent {
  return (ACCENTS as readonly string[]).includes(v);
}
