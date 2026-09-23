import type { TFn } from '@/i18n';

const dtCache = new Map<string, Intl.DateTimeFormat>();

function fmt(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(opts);
  let f = dtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    dtCache.set(key, f);
  }
  return f;
}

/** Unix-sekunnit → päivämäärä. */
export function date(ts: number | null | undefined, locale: string): string {
  if (!ts) return '—';
  return fmt(locale, { dateStyle: 'medium' }).format(ts * 1000);
}

export function dateTime(ts: number | null | undefined, locale: string): string {
  if (!ts) return '—';
  return fmt(locale, { dateStyle: 'short', timeStyle: 'short' }).format(ts * 1000);
}

export function time(ts: number | null | undefined, locale: string): string {
  if (!ts) return '—';
  return fmt(locale, { timeStyle: 'short' }).format(ts * 1000);
}

export function num(n: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(n);
}

export function bytes(n: number, t: TFn, locale: string): string {
  if (n < 1024) return t('common.bytes', { n: num(n, locale) });
  if (n < 1024 * 1024) return t('common.kb', { n: num(Math.round(n / 1024), locale) });
  return t('common.mb', { n: num(Math.round((n / 1048576) * 10) / 10, locale) });
}

/** Kesto sekunteina → "3 d 4 h" / "12 min". Yksiköt ovat SI-lyhenteitä, joten ne eivät vaadi käännöstä. */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] ?? '') + (parts[1][0] ?? '');
}
