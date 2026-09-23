/** Teeman ja korostusvärin soveltaminen. Arvot tulevat käyttäjän profiilista. */

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

/** Palauttaa viimeksi käytetyn teeman jo ennen kirjautumista, jotta ruutu ei välähdä. */
export function restoreTheme(): void {
  let theme: Theme = 'dark';
  let accent: Accent = 'crimson';
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved) {
      const [th, ac] = saved.split('|');
      if ((THEMES as readonly string[]).includes(th)) theme = th as Theme;
      if ((ACCENTS as readonly string[]).includes(ac)) accent = ac as Accent;
    }
  } catch {
    /* oletukset riittävät */
  }
  applyTheme(theme, accent);
}

export function isTheme(v: string): v is Theme {
  return (THEMES as readonly string[]).includes(v);
}

export function isAccent(v: string): v is Accent {
  return (ACCENTS as readonly string[]).includes(v);
}
