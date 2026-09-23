//! Salaisuuksien tallennus käyttöjärjestelmän omaan avainsäilöön.
//!
//! Windowsilla tämä on Credential Manager (DPAPI-suojattu), macOS:llä Keychain ja
//! Linuxilla kernelin avainsäilö. Salaisuuksia ei koskaan kirjoiteta tietokantaan,
//! asetustiedostoihin eikä lokeihin.

use crate::error::{AppError, AppResult};

const SERVICE: &str = "MettisTool";

pub const RESEND_API_KEY: &str = "resend_api_key";
pub const DISCORD_WEBHOOK: &str = "discord_webhook";
pub const GOOGLE_CLIENT_ID: &str = "google_client_id";
pub const GOOGLE_CLIENT_SECRET: &str = "google_client_secret";
pub const REMEMBER_TOKEN: &str = "remember_token";

pub fn totp_key(user_id: i64) -> String {
    format!("totp_secret_{user_id}")
}

fn entry(key: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, key).map_err(|e| AppError::internal(format!("avainsäilö: {e}")))
}

pub fn set(key: &str, value: &str) -> AppResult<()> {
    entry(key)?
        .set_password(value)
        .map_err(|e| AppError::internal(format!("avainsäilön kirjoitus epäonnistui: {e}")))
}

pub fn get(key: &str) -> Option<String> {
    match entry(key) {
        Ok(e) => match e.get_password() {
            Ok(v) if !v.is_empty() => Some(v),
            _ => None,
        },
        Err(_) => None,
    }
}

pub fn delete(key: &str) -> AppResult<()> {
    match entry(key) {
        Ok(e) => match e.delete_credential() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::internal(format!(
                "avainsäilön poisto epäonnistui: {e}"
            ))),
        },
        Err(e) => Err(e),
    }
}

pub fn exists(key: &str) -> bool {
    get(key).is_some()
}

/// Ympäristömuuttuja voi syrjäyttää avainsäilön kehityskäytössä.
/// Tuotannossa suositellaan avainsäilöä; .env-tiedostoa ei koskaan pakata mukaan.
pub fn get_with_env(key: &str, env_name: &str) -> Option<String> {
    if let Ok(v) = std::env::var(env_name) {
        let v = v.trim().to_string();
        if !v.is_empty() {
            return Some(v);
        }
    }
    get(key)
}
