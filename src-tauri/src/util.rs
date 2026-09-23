//! Pienet apufunktiot: aika, satunnaisuus, validointi ja peittäminen.
//!
//! Salasanojen tiivistys ja tokenien vertailu hoidetaan versiossa 2
//! palvelimella, joten niiden apufunktiot on poistettu täältä.

use crate::error::{AppError, AppResult};
use base64::Engine as _;
use rand::RngCore;

pub fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

/// URL-turvallinen satunnaistoken (ei täytemerkkejä).
pub fn random_token(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::rngs::OsRng.fill_bytes(&mut buf);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(buf)
}

/// Peittää salaisuuden lokeja ja käyttöliittymää varten: "sk_live_…a93f".
pub fn mask_secret(value: &str) -> String {
    let len = value.chars().count();
    if len <= 8 {
        return "••••••••".to_string();
    }
    let head: String = value.chars().take(6).collect();
    let tail: String = value.chars().skip(len.saturating_sub(4)).collect();
    format!("{head}…{tail}")
}

pub fn mask_url(value: &str) -> String {
    match url::Url::parse(value) {
        Ok(u) => {
            let host = u.host_str().unwrap_or("?");
            let tail: String = value
                .chars()
                .skip(value.chars().count().saturating_sub(4))
                .collect();
            format!("https://{host}/…{tail}")
        }
        Err(_) => mask_secret(value),
    }
}

// ===== Validointi =====

pub fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

pub fn validate_email(email: &str) -> AppResult<String> {
    let e = email.trim();
    if e.is_empty() {
        return Err(AppError::validation("email", "required"));
    }
    if e.len() > 254 {
        return Err(AppError::validation("email", "too_long"));
    }
    let parts: Vec<&str> = e.split('@').collect();
    if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() {
        return Err(AppError::validation("email", "invalid"));
    }
    let domain = parts[1];
    if !domain.contains('.')
        || domain.starts_with('.')
        || domain.ends_with('.')
        || domain.contains("..")
    {
        return Err(AppError::validation("email", "invalid"));
    }
    if e.chars().any(|c| c.is_whitespace()) {
        return Err(AppError::validation("email", "invalid"));
    }
    Ok(e.to_string())
}

pub fn validate_username(name: &str) -> AppResult<String> {
    let n = name.trim();
    let len = n.chars().count();
    if len < 3 {
        return Err(AppError::validation("username", "too_short"));
    }
    if len > 32 {
        return Err(AppError::validation("username", "too_long"));
    }
    if !n
        .chars()
        .all(|c| c.is_alphanumeric() || c == '_' || c == '-' || c == '.')
    {
        return Err(AppError::validation("username", "invalid_chars"));
    }
    if n.starts_with('.') || n.ends_with('.') {
        return Err(AppError::validation("username", "invalid_chars"));
    }
    Ok(n.to_string())
}

pub const MIN_PASSWORD_LENGTH: usize = 12;

pub fn validate_password(password: &str) -> AppResult<()> {
    let len = password.chars().count();
    if len < MIN_PASSWORD_LENGTH {
        return Err(AppError::validation("password", "too_short"));
    }
    if len > 1024 {
        return Err(AppError::validation("password", "too_long"));
    }
    let has_lower = password.chars().any(|c| c.is_lowercase());
    let has_upper = password.chars().any(|c| c.is_uppercase());
    let has_digit = password.chars().any(|c| c.is_numeric());
    let has_symbol = password.chars().any(|c| !c.is_alphanumeric());
    if !has_lower {
        return Err(AppError::validation("password", "need_lower"));
    }
    if !has_upper {
        return Err(AppError::validation("password", "need_upper"));
    }
    if !has_digit {
        return Err(AppError::validation("password", "need_digit"));
    }
    if !has_symbol {
        return Err(AppError::validation("password", "need_symbol"));
    }
    let lower = password.to_lowercase();
    const COMMON: [&str; 8] = [
        "password",
        "salasana",
        "qwerty",
        "123456",
        "admin123",
        "mettistool",
        "iloveyou",
        "welcome",
    ];
    if COMMON.iter().any(|c| lower.contains(c)) {
        return Err(AppError::validation("password", "too_common"));
    }
    Ok(())
}

/// Karkea entropia-arvio bitteinä — näytetään vahvuusmittarissa.
pub fn password_entropy_bits(password: &str) -> f64 {
    let mut pool = 0f64;
    if password.chars().any(|c| c.is_ascii_lowercase()) {
        pool += 26.0;
    }
    if password.chars().any(|c| c.is_ascii_uppercase()) {
        pool += 26.0;
    }
    if password.chars().any(|c| c.is_ascii_digit()) {
        pool += 10.0;
    }
    if password.chars().any(|c| !c.is_alphanumeric()) {
        pool += 33.0;
    }
    if password.chars().any(|c| !c.is_ascii()) {
        pool += 100.0;
    }
    if pool < 2.0 {
        pool = 2.0;
    }
    (password.chars().count() as f64) * pool.log2()
}

pub fn valid_role(role: &str) -> bool {
    matches!(role, "USER" | "MODERATOR" | "ADMIN" | "OWNER")
}

pub fn valid_language(lang: &str) -> bool {
    matches!(
        lang,
        "fi" | "en" | "sv" | "de" | "fr" | "es" | "it" | "pt" | "nl" | "pl" | "no" | "da"
    )
}

pub fn valid_theme(theme: &str) -> bool {
    matches!(theme, "dark" | "darker" | "light" | "system")
}

pub fn valid_accent(accent: &str) -> bool {
    matches!(accent, "crimson" | "blue" | "purple" | "green" | "orange")
}

/// Poistaa ohjausmerkit ja rajaa pituuden — käytetään kaikkeen lokitettavaan tekstiin.
pub fn sanitize_line(input: &str, max: usize) -> String {
    input
        .chars()
        .filter(|c| !c.is_control())
        .take(max)
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
