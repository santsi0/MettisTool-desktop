/**
 * Työkalumoottorin lataus ja typoitu rajapinta.
 *
 * Moottori ja 221 työkalua ovat vaiheen 1 koodia, joka ladataan sellaisenaan
 * klassisina skripteinä public/tools-hakemistosta. Silta (MT_HOST) ohjaa
 * tallennuksen, ilmoitukset ja navigoinnin React-puolelle — työkalut itse
 * eivät koskaan koske tietokantaan tai istuntoon.
 */

export interface ToolCategory {
  id: string;
  name: string;
  icon: string;
  desc: string;
}

export interface ToolDef {
  id: string;
  name: string;
  cat: string;
  kind: 'io' | 'form' | 'custom';
  icon: string;
  desc?: string;
  /** true, jos työkalu tarvitsee verkkoyhteyden. */
  net?: boolean;
}

export interface ToolEngine {
  CATS: ToolCategory[];
  tools: ToolDef[];
  byId: Record<string, ToolDef>;
  search: (q: string, limit?: number) => ToolDef[];
  isFav: (id: string) => boolean;
  toggleFav: (id: string) => boolean;
  mount: (el: HTMLElement, toolId: string) => () => void;
  headActions: (toolId: string) => Node | null;
  /** Vaihtaa sillan ja tyhjentää edellisen käyttäjän muistissa olevan tilan. */
  reseed: (bridge: HostBridge) => void;
}

export interface HostBridge {
  state: {
    fav: string[];
    recent: { id: string; t: number }[];
    usage: Record<string, number>;
    log: Record<string, number>;
    open: Record<string, boolean>;
    data: Record<string, unknown>;
    s: Record<string, unknown>;
  };
  saveState: (partial: Record<string, unknown>) => void;
  setFav: (id: string, on: boolean) => void;
  touch: (id: string) => void;
  toast: (msg: string, kind: string) => void;
  go: (hash: string) => void;
  open: (id: string) => void;
  route: () => { page: string; arg: string };
  t: (key: string, vars?: Record<string, string | number>) => string;
  ready: () => void;
}

declare global {
  interface Window {
    MT?: ToolEngine;
    MT_HOST?: HostBridge;
  }
}

const SCRIPTS = [
  'tools/core.js',
  'tools/host.js',
  'tools/lib/fmt.js',
  'tools/lib/hash.js',
  'tools/lib/qr.js',
  'tools/modules/laskurit.js',
  'tools/modules/kehittaja.js',
  'tools/modules/teksti.js',
  'tools/modules/kuvat.js',
  'tools/modules/tiedostot.js',
  'tools/modules/turvallisuus.js',
  'tools/modules/web.js',
  'tools/modules/design.js',
  'tools/modules/data.js',
  'tools/modules/aika.js',
  'tools/modules/tuottavuus.js',
  'tools/modules/verkko.js',
  'tools/modules/tekniikka.js'
];

function inject(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = false;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(src));
    document.head.appendChild(el);
  });
}

let pending: Promise<ToolEngine> | null = null;

/**
 * Lataa moottorin kerran sovelluksen käynnistystä kohden. Skriptejä ei voi
 * poistaa selaimesta, joten uudella kirjautumisella moottori vain kytketään
 * uuteen siltaan ja edellisen käyttäjän tila pyyhitään muistista.
 */
export function loadEngine(bridge: HostBridge): Promise<ToolEngine> {
  window.MT_HOST = bridge;
  if (pending) {
    return pending.then((mt) => {
      mt.reseed(bridge);
      return mt;
    });
  }
  pending = (async () => {
    for (const src of SCRIPTS) await inject(src);
    const mt = window.MT;
    if (!mt) throw new Error('moottoria ei löytynyt');
    return mt;
  })();
  return pending;
}
