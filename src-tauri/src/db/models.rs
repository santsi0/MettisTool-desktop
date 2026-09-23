//! IPC:n yli kulkevat tietomallit.
//!
//! Näissä rakenteissa EI koskaan ole salasanatiivisteitä, tokeneita, API-avaimia
//! eikä webhook-osoitteita. Kaikki käyttöliittymälle menevä data kulkee näiden kautta.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicUser {
    pub id: i64,
    pub username: String,
    pub email: String,
    pub role: String,
    pub status: String,
    pub email_verified: bool,
    pub totp_enabled: bool,
    pub must_change_password: bool,
    pub has_password: bool,
    pub has_google: bool,
    pub language: String,
    pub theme: String,
    pub accent: String,
    pub created_at: i64,
    pub last_login_at: Option<i64>,
    pub locked_until: Option<i64>,
    pub failed_logins: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub user: PublicUser,
    pub permissions: Vec<String>,
    pub expires_at: i64,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    /// Onko ensikäynnistyksen asennus tehty (löytyykö OWNER).
    pub setup_complete: bool,
    pub app_version: String,
    pub schema_version: i64,
    pub email_configured: bool,
    pub google_configured: bool,
    pub discord_configured: bool,
    pub registration_enabled: bool,
    pub google_login_enabled: bool,
    pub require_email_verification: bool,
    pub online: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub id: i64,
    pub ts: i64,
    pub event: String,
    pub severity: String,
    pub category: String,
    pub result: String,
    pub actor_name: Option<String>,
    pub actor_user_id: Option<i64>,
    pub target_name: Option<String>,
    pub target_user_id: Option<i64>,
    pub app_version: Option<String>,
    pub meta: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminStats {
    pub total_users: i64,
    pub verified_users: i64,
    pub unverified_users: i64,
    pub disabled_users: i64,
    pub locked_users: i64,
    pub owners: i64,
    pub admins: i64,
    pub moderators: i64,
    pub active_sessions: i64,
    pub registrations_7d: i64,
    pub logins_7d: i64,
    pub failed_logins_7d: i64,
    pub security_events_7d: i64,
    /// 14 päivän aikasarja: (päivä ISO, rekisteröinnit, kirjautumiset, epäonnistuneet)
    pub daily: Vec<DailyPoint>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyPoint {
    pub day: String,
    pub registrations: i64,
    pub logins: i64,
    pub failed: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbStats {
    pub size_bytes: i64,
    pub integrity_ok: bool,
    pub users: i64,
    pub audit_entries: i64,
    pub active_sessions: i64,
    pub schema_version: i64,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRow {
    pub id: i64,
    pub created_at: i64,
    pub last_seen_at: i64,
    pub expires_at: i64,
    pub device: Option<String>,
    pub current: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationRow {
    pub id: i64,
    pub ts: i64,
    pub kind: String,
    pub title: String,
    pub body: Option<String>,
    pub read: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRow {
    pub id: i64,
    pub path: String,
    pub created_at: i64,
    pub size: i64,
    pub kind: String,
    pub app_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailStatus {
    pub configured: bool,
    pub sender_name: String,
    pub sender_email: String,
    pub last_success: Option<i64>,
    pub last_failure: Option<i64>,
    pub last_error: Option<String>,
    pub failure_count: i64,
    pub sent_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordStatus {
    pub enabled: bool,
    pub configured: bool,
    /// Näytetään vain peitetty muoto, esim. "https://discord.com/api/webhooks/…9f2c"
    pub webhook_masked: Option<String>,
    pub level: String,
    pub last_success: Option<i64>,
    pub last_failure: Option<i64>,
    pub failure_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleStatus {
    pub enabled: bool,
    pub configured: bool,
    pub client_id_masked: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionInfo {
    pub name: String,
    pub description: String,
    pub granted: bool,
    pub from_role: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolUsageRow {
    pub tool_id: String,
    pub uses: i64,
    pub last_used: Option<i64>,
    pub favorite: bool,
}

// ===== Frontendilta tulevat pyynnöt =====

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterInput {
    pub username: String,
    pub email: String,
    pub password: String,
    pub password_confirm: String,
    #[serde(default)]
    pub language: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginInput {
    pub email: String,
    pub password: String,
    #[serde(default)]
    pub remember: bool,
    #[serde(default)]
    pub totp: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserInput {
    pub username: String,
    pub email: String,
    pub role: String,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub require_password_change: bool,
    #[serde(default)]
    pub send_invite: bool,
    #[serde(default)]
    pub mark_verified: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserFilter {
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub verified: Option<bool>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditFilter {
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub severity: Option<String>,
    #[serde(default)]
    pub since: Option<i64>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_limit() -> i64 {
    50
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub items: Vec<T>,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwoFactorSetup {
    pub secret: String,
    pub otpauth_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryCodes {
    pub codes: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordPolicy {
    pub min_length: usize,
    pub require_upper: bool,
    pub require_lower: bool,
    pub require_digit: bool,
    pub require_symbol: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub download_url: Option<String>,
    pub notes: Option<String>,
    pub checked_at: i64,
}
