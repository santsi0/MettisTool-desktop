//! Virhetyypit. Käyttäjälle palautetaan aina siisti, turvallinen viesti —
//! tekniset yksityiskohdat jäävät lokiin, eivät koskaan käyttöliittymään.

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("not_authenticated")]
    NotAuthenticated,

    #[error("forbidden")]
    Forbidden,

    #[error("invalid_credentials")]
    InvalidCredentials,

    #[error("account_locked")]
    AccountLocked { until: i64 },

    #[error("account_disabled")]
    AccountDisabled,

    #[error("email_not_verified")]
    EmailNotVerified,

    #[error("two_factor_required")]
    TwoFactorRequired,

    #[error("invalid_two_factor")]
    InvalidTwoFactor,

    #[error("rate_limited")]
    RateLimited { retry_after: i64 },

    #[error("validation:{field}:{code}")]
    Validation { field: String, code: String },

    #[error("conflict:{0}")]
    Conflict(String),

    #[error("not_found")]
    NotFound,

    #[error("token_invalid")]
    TokenInvalid,

    #[error("token_expired")]
    TokenExpired,

    #[error("setup_required")]
    SetupRequired,

    #[error("setup_already_done")]
    SetupAlreadyDone,

    #[error("email_not_configured")]
    EmailNotConfigured,

    #[error("oauth_not_configured")]
    OAuthNotConfigured,

    #[error("oauth_failed:{0}")]
    OAuthFailed(String),

    #[error("last_login_method")]
    LastLoginMethod,

    #[error("internal")]
    Internal(String),
}

impl AppError {
    pub fn internal<E: std::fmt::Display>(e: E) -> Self {
        let msg = e.to_string();
        log::error!("sisäinen virhe: {msg}");
        AppError::Internal(msg)
    }

    pub fn validation(field: &str, code: &str) -> Self {
        AppError::Validation {
            field: field.to_string(),
            code: code.to_string(),
        }
    }

    /// Koneluettava virhekoodi, jonka frontend kääntää käyttäjän kielelle.
    pub fn code(&self) -> &'static str {
        match self {
            AppError::NotAuthenticated => "not_authenticated",
            AppError::Forbidden => "forbidden",
            AppError::InvalidCredentials => "invalid_credentials",
            AppError::AccountLocked { .. } => "account_locked",
            AppError::AccountDisabled => "account_disabled",
            AppError::EmailNotVerified => "email_not_verified",
            AppError::TwoFactorRequired => "two_factor_required",
            AppError::InvalidTwoFactor => "invalid_two_factor",
            AppError::RateLimited { .. } => "rate_limited",
            AppError::Validation { .. } => "validation",
            AppError::Conflict(_) => "conflict",
            AppError::NotFound => "not_found",
            AppError::TokenInvalid => "token_invalid",
            AppError::TokenExpired => "token_expired",
            AppError::SetupRequired => "setup_required",
            AppError::SetupAlreadyDone => "setup_already_done",
            AppError::EmailNotConfigured => "email_not_configured",
            AppError::OAuthNotConfigured => "oauth_not_configured",
            AppError::OAuthFailed(_) => "oauth_failed",
            AppError::LastLoginMethod => "last_login_method",
            AppError::Internal(_) => "internal",
        }
    }
}

/// IPC:n yli palautettava muoto. Ei koskaan sisällä salaisuuksia eikä pinojälkiä.
#[derive(Debug, Serialize)]
pub struct ErrorPayload {
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_after: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub until: Option<i64>,
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let payload = match self {
            AppError::Validation { field, code } => ErrorPayload {
                code: "validation".into(),
                field: Some(field.clone()),
                reason: Some(code.clone()),
                retry_after: None,
                until: None,
            },
            AppError::Conflict(what) => ErrorPayload {
                code: "conflict".into(),
                field: Some(what.clone()),
                reason: None,
                retry_after: None,
                until: None,
            },
            AppError::RateLimited { retry_after } => ErrorPayload {
                code: "rate_limited".into(),
                field: None,
                reason: None,
                retry_after: Some(*retry_after),
                until: None,
            },
            AppError::AccountLocked { until } => ErrorPayload {
                code: "account_locked".into(),
                field: None,
                reason: None,
                retry_after: None,
                until: Some(*until),
            },
            AppError::OAuthFailed(reason) => ErrorPayload {
                code: "oauth_failed".into(),
                field: None,
                reason: Some(reason.clone()),
                retry_after: None,
                until: None,
            },
            other => ErrorPayload {
                code: other.code().to_string(),
                field: None,
                reason: None,
                retry_after: None,
                until: None,
            },
        };
        payload.serialize(s)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::internal(format!("tietokanta: {e}"))
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::internal(format!("io: {e}"))
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        // Verkkovirheen yksityiskohdat voivat sisältää osoitteita — ei käyttöliittymään.
        AppError::internal(format!("verkko: {e}"))
    }
}

pub type AppResult<T> = Result<T, AppError>;
