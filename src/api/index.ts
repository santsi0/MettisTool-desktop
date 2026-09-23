/**
 * Typoitu kutsukerros. Nimet ja parametrit vastaavat tarkalleen Rustin
 * `#[tauri::command]`-funktioita; frontend ei kutsu `invoke`ä muualla.
 */
import { call } from './ipc';
import type {
  AdminStats, AppStatus, AuditEntry, AuditFilter, BackupRow, CreateUserInput,
  DbStats, DiscordStatus, EmailStatus, GooglePoll, GoogleStatus, LoginInput,
  LoginMethods, LoginResponse, NotificationRow, Page, PasswordPolicy,
  PasswordStrength, PermissionInfo, PublicUser, RegisterInput, RegisterResponse,
  Role, SessionInfo, SessionRow, SettingsMap, SystemInfo, ToolUsageRow,
  TwoFactorSetup, TwoFactorState, UpdateInfo, UserFilter
} from './types';

export const auth = {
  appStatus: () => call<AppStatus>('app_status'),
  setupOwner: (username: string, emailAddress: string, password: string, passwordConfirm: string, language: string) =>
    call<SessionInfo>('setup_owner', { username, emailAddress, password, passwordConfirm, language }),
  register: (input: RegisterInput) => call<RegisterResponse>('register', { input }),
  login: (input: LoginInput) => call<LoginResponse>('login', { input }),
  loginTwoFactor: (code: string) => call<SessionInfo>('login_two_factor', { code }),
  logout: () => call<void>('logout'),
  restoreSession: () => call<SessionInfo | null>('restore_session'),
  currentSession: () => call<SessionInfo | null>('current_session'),
  verifyEmail: (code: string) => call<void>('verify_email', { code }),
  resendVerification: (emailAddress: string) => call<boolean>('resend_verification', { emailAddress }),
  requestPasswordReset: (emailAddress: string) => call<boolean>('request_password_reset', { emailAddress }),
  resetPassword: (code: string, newPassword: string) => call<void>('reset_password', { code, newPassword }),
  acceptInvite: (code: string, newPassword: string) => call<void>('accept_invite', { code, newPassword }),
  passwordPolicy: () => call<PasswordPolicy>('password_policy'),
  passwordStrength: (password: string) => call<PasswordStrength>('password_strength', { password }),
  googleBegin: (linkCurrent: boolean) => call<string>('google_begin', { linkCurrent }),
  googlePoll: () => call<GooglePoll>('google_poll'),
  googleCancel: () => call<void>('google_cancel'),
  googleUnlink: () => call<void>('google_unlink'),
  loginMethods: () => call<LoginMethods>('login_methods'),
  forgetRememberedSession: () => call<void>('forget_remembered_session')
};

export const account = {
  profile: () => call<PublicUser>('account_profile'),
  updatePreferences: (p: { language?: string; theme?: string; accent?: string }) =>
    call<PublicUser>('update_preferences', {
      language: p.language ?? null,
      theme: p.theme ?? null,
      accent: p.accent ?? null
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    call<void>('change_password', { currentPassword, newPassword }),
  changeEmail: (password: string, newEmail: string) =>
    call<PublicUser>('change_email', { password, newEmail }),
  changeUsername: (password: string, newUsername: string) =>
    call<PublicUser>('change_username', { password, newUsername }),
  twoFactorBegin: () => call<TwoFactorSetup>('two_factor_begin'),
  twoFactorEnable: (code: string) => call<{ codes: string[] }>('two_factor_enable', { code }),
  twoFactorDisable: (password: string) => call<void>('two_factor_disable', { password }),
  twoFactorRecoveryCodes: (password: string) => call<{ codes: string[] }>('two_factor_recovery_codes', { password }),
  twoFactorStatus: () => call<TwoFactorState>('two_factor_status'),
  sessions: () => call<SessionRow[]>('account_sessions'),
  revokeSession: (sessionId: number) => call<void>('revoke_session', { sessionId }),
  revokeOtherSessions: () => call<number>('revoke_other_sessions'),
  exportMyData: () => call<unknown>('export_my_data'),
  deleteMyAccount: (password: string) => call<void>('delete_my_account', { password })
};

export const admin = {
  stats: () => call<AdminStats>('admin_stats'),
  listUsers: (filter: UserFilter) => call<Page<PublicUser>>('list_users', { filter }),
  getUser: (userId: number) => call<PublicUser>('get_user', { userId }),
  createUser: (input: CreateUserInput) => call<PublicUser>('admin_create_user', { input }),
  setUserRole: (userId: number, role: Role) => call<PublicUser>('set_user_role', { userId, role }),
  setUserStatus: (userId: number, enabled: boolean) => call<PublicUser>('set_user_status', { userId, enabled }),
  setUserLock: (userId: number, locked: boolean) => call<PublicUser>('set_user_lock', { userId, locked }),
  verifyUserEmail: (userId: number) => call<PublicUser>('verify_user_email', { userId }),
  sendVerification: (userId: number) => call<void>('admin_send_verification', { userId }),
  resetPassword: (userId: number) => call<void>('admin_reset_password', { userId }),
  forcePasswordChange: (userId: number) => call<PublicUser>('force_password_change', { userId }),
  revokeUserSessions: (userId: number) => call<number>('revoke_user_sessions', { userId }),
  deleteUser: (userId: number) => call<void>('delete_user', { userId }),
  listPermissions: (userId: number) => call<PermissionInfo[]>('list_permissions', { userId }),
  setUserPermission: (userId: number, permission: string, granted: boolean) =>
    call<void>('set_user_permission', { userId, permission, granted }),
  auditList: (filter: AuditFilter) => call<Page<AuditEntry>>('audit_list', { filter }),
  auditExport: (filter: AuditFilter) => call<string>('audit_export', { filter }),
  auditPrune: (keepDays: number) => call<number>('audit_prune', { keepDays }),
  emailStatus: () => call<EmailStatus>('email_status'),
  emailConfigure: (p: { apiKey?: string; senderName?: string; senderEmail?: string }) =>
    call<EmailStatus>('email_configure', {
      apiKey: p.apiKey ?? null,
      senderName: p.senderName ?? null,
      senderEmail: p.senderEmail ?? null
    }),
  emailClearKey: () => call<EmailStatus>('email_clear_key'),
  emailTest: (to: string) => call<void>('email_test', { to }),
  discordStatus: () => call<DiscordStatus>('discord_status'),
  discordConfigure: (p: { webhook?: string; enabled?: boolean; level?: string }) =>
    call<DiscordStatus>('discord_configure', {
      webhook: p.webhook ?? null,
      enabled: p.enabled ?? null,
      level: p.level ?? null
    }),
  discordClear: () => call<DiscordStatus>('discord_clear'),
  discordTest: () => call<void>('discord_test'),
  googleStatus: () => call<GoogleStatus>('google_status'),
  googleConfigure: (p: { clientId?: string; clientSecret?: string; enabled?: boolean }) =>
    call<GoogleStatus>('google_configure', {
      clientId: p.clientId ?? null,
      clientSecret: p.clientSecret ?? null,
      enabled: p.enabled ?? null
    }),
  googleClear: () => call<void>('google_clear'),
  getSettings: () => call<SettingsMap>('get_settings'),
  setSetting: (key: string, value: string) => call<SettingsMap>('set_setting', { key, value }),
  systemInfo: () => call<SystemInfo>('system_info'),
  backupList: () => call<BackupRow[]>('backup_list'),
  backupCreate: () => call<BackupRow>('backup_create'),
  backupRestore: (path: string) => call<void>('backup_restore', { path }),
  databaseStats: () => call<DbStats>('database_stats')
};

export const tools = {
  stateGet: (key: string) => call<string | null>('tool_state_get', { key }),
  stateSet: (key: string, value: string) => call<void>('tool_state_set', { key, value }),
  stateDelete: (key: string) => call<void>('tool_state_delete', { key }),
  stateAll: () => call<Record<string, string>>('tool_state_all'),
  used: (toolId: string) => call<void>('tool_used', { toolId }),
  setFavorite: (toolId: string, favorite: boolean) => call<void>('tool_set_favorite', { toolId, favorite }),
  usage: () => call<ToolUsageRow[]>('tool_usage'),
  usageClear: (keepFavorites: boolean) => call<void>('tool_usage_clear', { keepFavorites })
};

export const system = {
  appReady: () => call<void>('app_ready'),
  minimizeToTray: () => call<void>('window_minimize_to_tray'),
  openDataFolder: () => call<string>('open_data_folder'),
  notifications: () => call<NotificationRow[]>('notifications_list'),
  markRead: (id?: number) => call<void>('notifications_mark_read', { id: id ?? null }),
  checkUpdates: () => call<UpdateInfo>('check_updates'),
  setAutostart: (enabled: boolean) => call<boolean>('set_autostart', { enabled }),
  autostartEnabled: () => call<boolean>('autostart_enabled')
};

export { AppError, errorKey, isAppError } from './ipc';
export type * from './types';
