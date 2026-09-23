//! Tunnistautumiskomennot.
//!
//! Kaikki kulkee Supabasen kautta. Tämä kerros ei tee yhtään turvallisuus-
//! päätöstä: se välittää kutsun, kääntää virheen käyttöliittymän ymmärtämäksi
//! koodiksi ja pitää huolen ettei tokeneita valu frontendille.

use crate::cloud::{CloudSession, SignUpResult};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::util;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    pub app_version: String,
    pub registration_enabled: bool,
    pub require_email_verification: bool,
    pub google_login_enabled: bool,
    /// Saatiinko yhteys palvelimeen. Sovellus vaatii verkon, joten tämä
    /// ratkaisee näytetäänkö kirjautuminen vai yhteysvirhe.
    pub online: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterInput {
    pub username: String,
    pub email: String,
    pub password: String,
    pub password_confirm: String,
    pub language: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginInput {
    pub email: String,
    pub password: String,
    #[serde(default)]
    pub remember: bool,
}

/// Sovelluksen tila ennen kirjautumista. Ei vaadi istuntoa.
#[tauri::command]
pub async fn app_status(state: State<'_, AppState>) -> AppResult<AppStatus> {
    let version = util::app_version();

    match state.cloud.public_status().await {
        Ok(v) => Ok(AppStatus {
            app_version: version,
            registration_enabled: v["registrationEnabled"].as_bool().unwrap_or(true),
            require_email_verification: v["requireEmailVerification"].as_bool().unwrap_or(true),
            google_login_enabled: v["googleLoginEnabled"].as_bool().unwrap_or(false),
            online: true,
        }),
        // Ei yhteyttä: kerrotaan se suoraan sen sijaan että näytettäisiin
        // kirjautumislomake, joka ei voi toimia.
        Err(_) => Ok(AppStatus {
            app_version: version,
            registration_enabled: false,
            require_email_verification: true,
            google_login_enabled: false,
            online: false,
        }),
    }
}

#[tauri::command]
pub async fn register(state: State<'_, AppState>, input: RegisterInput) -> AppResult<SignUpResult> {
    if input.password != input.password_confirm {
        return Err(AppError::validation("passwordConfirm", "mismatch"));
    }
    util::validate_email(&input.email)?;
    util::validate_password(&input.password)?;

    let language = input.language.as_deref().unwrap_or("fi");
    let language = if util::valid_language(language) {
        language
    } else {
        "fi"
    };

    state
        .cloud
        .sign_up(&input.email, &input.password, &input.username, language)
        .await
}

/// Vahvistaa rekisteröitymisen sähköpostiin tulleella koodilla ja kirjaa sisään.
#[tauri::command]
pub async fn verify_email(
    state: State<'_, AppState>,
    email_address: String,
    code: String,
) -> AppResult<CloudSession> {
    state.cloud.verify_signup(&email_address, &code).await
}

#[tauri::command]
pub async fn resend_verification(
    state: State<'_, AppState>,
    email_address: String,
) -> AppResult<()> {
    state.cloud.resend_code(&email_address, "signup").await
}

#[tauri::command]
pub async fn login(state: State<'_, AppState>, input: LoginInput) -> AppResult<CloudSession> {
    state
        .cloud
        .sign_in(&input.email, &input.password, input.remember)
        .await
}

#[tauri::command]
pub async fn logout(state: State<'_, AppState>) -> AppResult<()> {
    state
        .cloud
        .audit("LOGOUT", "AUTH", "INFO", true, None)
        .await;
    state.cloud.sign_out().await
}

/// Käynnistyksessä: jatketaanko edellistä istuntoa. `None` = näytä kirjautuminen.
#[tauri::command]
pub async fn restore_session(state: State<'_, AppState>) -> AppResult<Option<CloudSession>> {
    state.cloud.restore().await
}

/// Nykyinen istunto ilman virkistystä sivulatauksia varten.
#[tauri::command]
pub async fn current_session(state: State<'_, AppState>) -> AppResult<Option<CloudSession>> {
    if !state.cloud.is_signed_in() {
        return Ok(None);
    }
    match state.cloud.me().await {
        Ok(user) => Ok(Some(CloudSession {
            user,
            expires_at: 0,
            app_version: util::app_version(),
        })),
        Err(AppError::NotAuthenticated) => Ok(None),
        Err(e) => Err(e),
    }
}

/// Unohtaa "muista minut" -tokenin tältä koneelta kirjautumatta ulos.
#[tauri::command]
pub fn forget_remembered_session() -> AppResult<()> {
    crate::secrets::delete(crate::secrets::REMEMBER_TOKEN)
}

#[tauri::command]
pub async fn request_password_reset(
    state: State<'_, AppState>,
    email_address: String,
) -> AppResult<()> {
    // Vastaus on aina onnistunut, jottei tilin olemassaolo paljastu.
    let _ = state.cloud.request_password_reset(&email_address).await;
    Ok(())
}

#[tauri::command]
pub async fn reset_password(
    state: State<'_, AppState>,
    email_address: String,
    code: String,
    new_password: String,
) -> AppResult<()> {
    util::validate_password(&new_password)?;
    state
        .cloud
        .reset_password(&email_address, &code, &new_password)
        .await
}

// ===== Paikalliset apufunktiot =====
//
// Nämä eivät kutsu verkkoa: salasanan vahvuus lasketaan koneella, jottei
// salasanaa tarvitse lähettää minnekään ennen kuin se on valmis.

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordPolicy {
    pub min_length: usize,
    pub require_upper: bool,
    pub require_lower: bool,
    pub require_digit: bool,
    pub require_symbol: bool,
}

/// Säännöt tulevat samasta paikasta kuin tarkistus. Jos käyttöliittymä
/// näyttäisi löysemmät vaatimukset kuin `validate_password` hyväksyy,
/// rekisteröityminen kaatuisi ohjeita noudattaneelta käyttäjältä.
#[tauri::command]
pub fn password_policy() -> PasswordPolicy {
    PasswordPolicy {
        min_length: util::MIN_PASSWORD_LENGTH,
        require_upper: true,
        require_lower: true,
        require_digit: true,
        require_symbol: true,
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordStrength {
    pub score: u8,
    pub bits: f64,
    pub ok: bool,
}

#[tauri::command]
pub fn password_strength(password: String) -> PasswordStrength {
    let bits = util::password_entropy_bits(&password);
    let score = match bits {
        b if b < 28.0 => 0,
        b if b < 40.0 => 1,
        b if b < 60.0 => 2,
        b if b < 80.0 => 3,
        _ => 4,
    };
    PasswordStrength {
        score,
        bits,
        ok: util::validate_password(&password).is_ok(),
    }
}
