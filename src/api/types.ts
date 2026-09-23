/** IPC-rajapinnan tyypit. Vastaavat 1:1 Rust-puolen `db::models`-rakenteita. */

export type Role = 'USER' | 'MODERATOR' | 'ADMIN' | 'OWNER';
export type UserStatus = 'ACTIVE' | 'DISABLED';

export interface PublicUser {
  id: number;
  username: string;
  email: string;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  totpEnabled: boolean;
  mustChangePassword: boolean;
  hasPassword: boolean;
  hasGoogle: boolean;
  language: string;
  theme: string;
  accent: string;
  createdAt: number;
  lastLoginAt: number | null;
  lockedUntil: number | null;
  failedLogins: number;
}

export interface SessionInfo {
  user: PublicUser;
  permissions: string[];
  expiresAt: number;
  appVersion: string;
}

export interface AppStatus {
  setupComplete: boolean;
  appVersion: string;
  schemaVersion: number;
  emailConfigured: boolean;
  googleConfigured: boolean;
  discordConfigured: boolean;
  registrationEnabled: boolean;
  googleLoginEnabled: boolean;
  requireEmailVerification: boolean;
  online: boolean;
}

export interface AuditEntry {
  id: number;
  ts: number;
  event: string;
  severity: string;
  category: string;
  result: string;
  actorName: string | null;
  actorUserId: number | null;
  targetName: string | null;
  targetUserId: number | null;
  appVersion: string | null;
  meta: string | null;
}

export interface DailyPoint {
  day: string;
  registrations: number;
  logins: number;
  failed: number;
}

export interface AdminStats {
  totalUsers: number;
  verifiedUsers: number;
  unverifiedUsers: number;
  disabledUsers: number;
  lockedUsers: number;
  owners: number;
  admins: number;
  moderators: number;
  activeSessions: number;
  registrations7d: number;
  logins7d: number;
  failedLogins7d: number;
  securityEvents7d: number;
  daily: DailyPoint[];
}

export interface DbStats {
  sizeBytes: number;
  integrityOk: boolean;
  users: number;
  auditEntries: number;
  activeSessions: number;
  schemaVersion: number;
  path: string;
}

export interface SessionRow {
  id: number;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  device: string | null;
  current: boolean;
}

export interface NotificationRow {
  id: number;
  ts: number;
  kind: string;
  title: string;
  body: string | null;
  read: boolean;
}

export interface BackupRow {
  id: number;
  path: string;
  createdAt: number;
  size: number;
  kind: string;
  appVersion: string | null;
}

export interface EmailStatus {
  configured: boolean;
  senderName: string;
  senderEmail: string;
  lastSuccess: number | null;
  lastFailure: number | null;
  lastError: string | null;
  failureCount: number;
  sentCount: number;
}

export interface DiscordStatus {
  enabled: boolean;
  configured: boolean;
  webhookMasked: string | null;
  level: string;
  lastSuccess: number | null;
  lastFailure: number | null;
  failureCount: number;
}

export interface GoogleStatus {
  enabled: boolean;
  configured: boolean;
  clientIdMasked: string | null;
}

export interface PermissionInfo {
  name: string;
  description: string;
  granted: boolean;
  fromRole: boolean;
}

export interface ToolUsageRow {
  toolId: string;
  uses: number;
  lastUsed: number | null;
  favorite: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
}

export interface PasswordPolicy {
  minLength: number;
  requireUpper: boolean;
  requireLower: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
}

export interface PasswordStrength {
  bits: number;
  score: 1 | 2 | 3 | 4;
  issues: string[];
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  downloadUrl: string | null;
  notes: string | null;
  checkedAt: number;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  passwordConfirm: string;
  language?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  remember?: boolean;
}

export interface CreateUserInput {
  username: string;
  email: string;
  role: Role;
  password?: string;
  requirePasswordChange?: boolean;
  sendInvite?: boolean;
  markVerified?: boolean;
}

export interface UserFilter {
  search?: string;
  role?: string;
  status?: string;
  verified?: boolean;
  limit: number;
  offset: number;
}

export interface AuditFilter {
  search?: string;
  category?: string;
  severity?: string;
  since?: number;
  limit: number;
  offset: number;
}

export type LoginResponse =
  | { status: 'ok'; session: SessionInfo }
  | { status: 'twoFactor' };

export type GooglePoll =
  | { status: 'pending' }
  | { status: 'ready'; session: SessionInfo | null; linked: boolean }
  | { status: 'failed'; reason: string };

export interface RegisterResponse {
  requiresVerification: boolean;
  emailSent: boolean;
  email: string;
}

export interface LoginMethods {
  password: boolean;
  google: boolean;
  totp: boolean;
  googleAvailable: boolean;
}

export interface TwoFactorState {
  enabled: boolean;
  remainingRecoveryCodes: number;
}

export interface SystemInfo {
  appVersion: string;
  os: string;
  arch: string;
  startedAt: number;
  database: DbStats;
  email: EmailStatus;
  discord: DiscordStatus;
  googleConfigured: boolean;
}

/** Asetusavaimet, joita hallintapaneeli saa kirjoittaa (Rust: settings::is_writable). */
export type SettingsMap = Record<string, string>;
