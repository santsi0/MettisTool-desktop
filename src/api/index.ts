/**
 * Typoitu kutsukerros. Nimet ja parametrit vastaavat tarkalleen Rustin
 * `#[tauri::command]`-funktioita; frontend ei kutsu `invoke`ä muualla.
 *
 * Vaihe 1 kattaa tunnistautumisen, työkalut ja järjestelmän. Tili- ja
 * hallintakutsut palaavat vaiheissa 2 ja 3.
 */
import { call } from './ipc';
import type {
  AppStatus, CloudSession, LoginInput, PasswordPolicy, PasswordStrength,
  RegisterInput, RegisterResult, ToolUsageRow, UpdateInfo
} from './types';

export const auth = {
  appStatus: () => call<AppStatus>('app_status'),

  register: (input: RegisterInput) => call<RegisterResult>('register', { input }),
  verifyEmail: (emailAddress: string, code: string) =>
    call<CloudSession>('verify_email', { emailAddress, code }),
  resendVerification: (emailAddress: string) =>
    call<void>('resend_verification', { emailAddress }),

  login: (input: LoginInput) => call<CloudSession>('login', { input }),
  logout: () => call<void>('logout'),
  restoreSession: () => call<CloudSession | null>('restore_session'),
  currentSession: () => call<CloudSession | null>('current_session'),
  forgetRememberedSession: () => call<void>('forget_remembered_session'),

  requestPasswordReset: (emailAddress: string) =>
    call<void>('request_password_reset', { emailAddress }),
  resetPassword: (emailAddress: string, code: string, newPassword: string) =>
    call<void>('reset_password', { emailAddress, code, newPassword }),

  passwordPolicy: () => call<PasswordPolicy>('password_policy'),
  passwordStrength: (password: string) => call<PasswordStrength>('password_strength', { password })
};

export const tools = {
  stateGet: (key: string) => call<string | null>('tool_state_get', { key }),
  stateSet: (key: string, value: string) => call<void>('tool_state_set', { key, value }),
  stateDelete: (key: string) => call<void>('tool_state_delete', { key }),
  stateAll: () => call<Record<string, string>>('tool_state_all'),
  used: (toolId: string) => call<void>('tool_used', { toolId }),
  setFavorite: (toolId: string, favorite: boolean) =>
    call<void>('tool_set_favorite', { toolId, favorite }),
  usage: () => call<ToolUsageRow[]>('tool_usage'),
  usageClear: (keepFavorites: boolean) => call<void>('tool_usage_clear', { keepFavorites })
};

export const system = {
  appReady: () => call<void>('app_ready'),
  minimizeToTray: () => call<void>('window_minimize_to_tray'),
  openDataFolder: () => call<string>('open_data_folder'),
  checkUpdates: () => call<UpdateInfo>('check_updates'),
  setAutostart: (enabled: boolean) => call<boolean>('set_autostart', { enabled }),
  autostartEnabled: () => call<boolean>('autostart_enabled')
};

export * from './types';
export { AppError, errorKey, isAppError } from './ipc';
