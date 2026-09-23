import { invoke } from '@tauri-apps/api/core';

/** Rustin `ErrorPayload`. Ei koskaan sisällä salaisuuksia eikä pinojälkiä. */
export interface ErrorPayload {
  code: string;
  field?: string;
  reason?: string;
  retryAfter?: number;
  until?: number;
}

export class AppError extends Error {
  readonly code: string;
  readonly field?: string;
  readonly reason?: string;
  readonly retryAfter?: number;
  readonly until?: number;

  constructor(p: ErrorPayload) {
    super(p.code);
    this.name = 'AppError';
    this.code = p.code;
    this.field = p.field;
    this.reason = p.reason;
    this.retryAfter = p.retryAfter;
    this.until = p.until;
  }
}

function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e && typeof e === 'object' && typeof (e as ErrorPayload).code === 'string') {
    return new AppError(e as ErrorPayload);
  }
  return new AppError({ code: 'internal' });
}

/** Ainoa reitti taustalogiikkaan. Kaikki virheet normalisoidaan AppErroriksi. */
export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw toAppError(e);
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Virhekoodi käännösavaimeksi. Validointivirheet tarkentuvat kentän syyllä. */
export function errorKey(e: unknown): string {
  const err = toAppError(e);
  if (err.code === 'validation' && err.reason) return `err.validation.${err.reason}`;
  if (err.code === 'conflict' && err.field) return `err.conflict.${err.field}`;
  return `err.${err.code}`;
}
