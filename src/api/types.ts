/**
 * IPC:n yli kulkevat tyypit. Nämä vastaavat tarkalleen Rustin rakenteita —
 * jos jompikumpi muuttuu, toinen on muutettava samalla.
 *
 * Versio 2: käyttäjätunnus on Supabasen UUID (merkkijono), ei enää
 * paikallisen tietokannan juokseva numero.
 */

export type Role = 'USER' | 'MODERATOR' | 'ADMIN' | 'OWNER';
export type AccountStatus = 'ACTIVE' | 'DISABLED';

/** Kirjautuneen käyttäjän profiili sellaisena kuin palvelin sen antaa. */
export interface Profile {
  id: string;
  username: string;
  email: string;
  role: Role;
  status: AccountStatus;
  language: string;
  mustChangePassword: boolean;
  createdAt: string;
  /** Roolin ylittävät poikkeukset: { "audit.read": true }. */
  permissions: Record<string, boolean>;
}

export interface CloudSession {
  user: Profile;
  /** Unix-aika, jolloin pääsytoken vanhenee. 0 = ei tiedossa. */
  expiresAt: number;
  appVersion: string;
}

/** Tila ennen kirjautumista. Ei vaadi istuntoa. */
export interface AppStatus {
  appVersion: string;
  registrationEnabled: boolean;
  requireEmailVerification: boolean;
  googleLoginEnabled: boolean;
  /** false = palvelimeen ei saatu yhteyttä. Sovellus vaatii verkon. */
  online: boolean;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  passwordConfirm: string;
  language?: string;
}

export interface RegisterResult {
  requiresVerification: boolean;
  email: string;
}

export interface LoginInput {
  email: string;
  password: string;
  remember: boolean;
}

export interface PasswordPolicy {
  minLength: number;
  requireUpper: boolean;
  requireLower: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
}

export interface PasswordStrength {
  score: number;
  bits: number;
  ok: boolean;
}

export interface ToolUsageRow {
  toolId: string;
  uses: number;
  lastUsed: number | null;
  favorite: boolean;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  downloadUrl: string | null;
  notes: string | null;
}
