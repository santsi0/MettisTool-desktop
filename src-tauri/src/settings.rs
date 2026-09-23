//! Sovellusasetukset tietokannassa. Salaisuudet eivät koskaan päädy tänne.

use crate::db::Db;
use crate::error::AppResult;
use crate::util::now;
use rusqlite::params;

// Yleiset
pub const REGISTRATION_ENABLED: &str = "app.registration_enabled";
pub const GOOGLE_LOGIN_ENABLED: &str = "app.google_login_enabled";
pub const REQUIRE_EMAIL_VERIFICATION: &str = "app.require_email_verification";
pub const MINIMIZE_TO_TRAY: &str = "app.minimize_to_tray";
pub const AUTOSTART: &str = "app.autostart";
pub const AUTO_BACKUP: &str = "app.auto_backup";
pub const UPDATE_CHECK: &str = "app.update_check";
pub const UPDATE_REPO: &str = "app.update_repo";

// Turvallisuus
pub const SESSION_HOURS: &str = "security.session_hours";
pub const REMEMBER_DAYS: &str = "security.remember_days";
pub const MAX_FAILED_LOGINS: &str = "security.max_failed_logins";
pub const LOCKOUT_MINUTES: &str = "security.lockout_minutes";
pub const VERIFY_TOKEN_HOURS: &str = "security.verify_token_hours";
pub const RESET_TOKEN_MINUTES: &str = "security.reset_token_minutes";

// Sähköposti
pub const EMAIL_SENDER_NAME: &str = "email.sender_name";
pub const EMAIL_SENDER_ADDRESS: &str = "email.sender_address";
pub const EMAIL_LAST_SUCCESS: &str = "email.last_success";
pub const EMAIL_LAST_FAILURE: &str = "email.last_failure";
pub const EMAIL_LAST_ERROR: &str = "email.last_error";
pub const EMAIL_FAILURE_COUNT: &str = "email.failure_count";
pub const EMAIL_SENT_COUNT: &str = "email.sent_count";

// Discord
pub const DISCORD_ENABLED: &str = "discord.enabled";
pub const DISCORD_LEVEL: &str = "discord.level";
pub const DISCORD_LAST_SUCCESS: &str = "discord.last_success";
pub const DISCORD_LAST_FAILURE: &str = "discord.last_failure";
pub const DISCORD_FAILURE_COUNT: &str = "discord.failure_count";

fn default_for(key: &str) -> &'static str {
    match key {
        REGISTRATION_ENABLED => "1",
        GOOGLE_LOGIN_ENABLED => "0",
        REQUIRE_EMAIL_VERIFICATION => "1",
        MINIMIZE_TO_TRAY => "1",
        AUTOSTART => "0",
        AUTO_BACKUP => "1",
        UPDATE_CHECK => "1",
        UPDATE_REPO => "",
        SESSION_HOURS => "12",
        REMEMBER_DAYS => "30",
        MAX_FAILED_LOGINS => "5",
        LOCKOUT_MINUTES => "15",
        VERIFY_TOKEN_HOURS => "24",
        RESET_TOKEN_MINUTES => "60",
        EMAIL_SENDER_NAME => "MettisTool",
        EMAIL_SENDER_ADDRESS => "",
        DISCORD_ENABLED => "0",
        DISCORD_LEVEL => "SECURITY",
        _ => "",
    }
}

pub fn get(db: &Db, key: &str) -> String {
    db.with(|c| {
        let v: Option<String> = c
            .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| {
                r.get(0)
            })
            .ok();
        Ok(v.unwrap_or_else(|| default_for(key).to_string()))
    })
    .unwrap_or_else(|_| default_for(key).to_string())
}

pub fn get_bool(db: &Db, key: &str) -> bool {
    matches!(get(db, key).as_str(), "1" | "true" | "on" | "yes")
}

pub fn get_i64(db: &Db, key: &str, min: i64, max: i64) -> i64 {
    get(db, key).parse::<i64>().unwrap_or_else(|_| {
        default_for(key).parse::<i64>().unwrap_or(min)
    }).clamp(min, max)
}

pub fn set(db: &Db, key: &str, value: &str, by: Option<i64>) -> AppResult<()> {
    db.with(|c| {
        c.execute(
            "INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                            updated_at = excluded.updated_at,
                                            updated_by = excluded.updated_by",
            params![key, value, now(), by],
        )?;
        Ok(())
    })
}

pub fn set_bool(db: &Db, key: &str, value: bool, by: Option<i64>) -> AppResult<()> {
    set(db, key, if value { "1" } else { "0" }, by)
}

pub fn bump_counter(db: &Db, key: &str) {
    let current = get(db, key).parse::<i64>().unwrap_or(0);
    let _ = set(db, key, &(current + 1).to_string(), None);
}

/// Kaikki ei-salaiset asetukset hallintapaneelille.
pub fn all(db: &Db) -> AppResult<serde_json::Value> {
    let keys = [
        REGISTRATION_ENABLED,
        GOOGLE_LOGIN_ENABLED,
        REQUIRE_EMAIL_VERIFICATION,
        MINIMIZE_TO_TRAY,
        AUTOSTART,
        AUTO_BACKUP,
        UPDATE_CHECK,
        UPDATE_REPO,
        SESSION_HOURS,
        REMEMBER_DAYS,
        MAX_FAILED_LOGINS,
        LOCKOUT_MINUTES,
        VERIFY_TOKEN_HOURS,
        RESET_TOKEN_MINUTES,
        EMAIL_SENDER_NAME,
        EMAIL_SENDER_ADDRESS,
        DISCORD_ENABLED,
        DISCORD_LEVEL,
    ];
    let mut map = serde_json::Map::new();
    for k in keys {
        map.insert(k.to_string(), serde_json::Value::String(get(db, k)));
    }
    Ok(serde_json::Value::Object(map))
}

/// Sallitut avaimet, joita hallintapaneeli saa muuttaa.
pub fn is_writable(key: &str) -> bool {
    matches!(
        key,
        REGISTRATION_ENABLED
            | GOOGLE_LOGIN_ENABLED
            | REQUIRE_EMAIL_VERIFICATION
            | MINIMIZE_TO_TRAY
            | AUTOSTART
            | AUTO_BACKUP
            | UPDATE_CHECK
            | UPDATE_REPO
            | SESSION_HOURS
            | REMEMBER_DAYS
            | MAX_FAILED_LOGINS
            | LOCKOUT_MINUTES
            | VERIFY_TOKEN_HOURS
            | RESET_TOKEN_MINUTES
            | EMAIL_SENDER_NAME
            | EMAIL_SENDER_ADDRESS
            | DISCORD_ENABLED
            | DISCORD_LEVEL
    )
}
