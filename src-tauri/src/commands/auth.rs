//! Tunnistautumiskomennot.

use crate::db::models::*;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::{audit, auth, email, rbac, secrets, settings, util};
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum LoginResponse {
    #[serde(rename_all = "camelCase")]
    Ok {
        session: SessionInfo,
    },
    TwoFactor,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterResponse {
    pub requires_verification: bool,
    pub email_sent: bool,
    pub email: String,
}

/// Sovelluksen tila ennen kirjautumista: tarvitaanko ensikäynnistys, mitkä
/// kirjautumistavat ovat käytössä ja onko verkko saatavilla.
#[tauri::command]
pub fn app_status(state: State<'_, AppState>) -> AppResult<AppStatus> {
    let db = &state.db;
    Ok(AppStatus {
        setup_complete: rbac::owner_exists(db)?,
        app_version: util::app_version(),
        schema_version: crate::db::migrations::CURRENT_VERSION,
        email_configured: email::is_configured(db),
        google_configured: auth::oauth::is_configured(),
        discord_configured: crate::discord::status(db).configured,
        registration_enabled: settings::get_bool(db, settings::REGISTRATION_ENABLED),
        google_login_enabled: settings::get_bool(db, settings::GOOGLE_LOGIN_ENABLED)
            && auth::oauth::is_configured(),
        require_email_verification: settings::get_bool(db, settings::REQUIRE_EMAIL_VERIFICATION),
        online: true,
    })
}

/// Ensikäynnistys: luo ensimmäisen OWNER-tilin. Toimii vain kerran.
#[tauri::command]
pub async fn setup_owner(
    state: State<'_, AppState>,
    username: String,
    email_address: String,
    password: String,
    password_confirm: String,
    language: String,
) -> AppResult<SessionInfo> {
    let result = auth::first_run_setup(
        &state.db,
        &username,
        &email_address,
        &password,
        &password_confirm,
        &language,
    )?;

    // Tervetuloviesti jos sähköposti on määritetty — sisäänpääsy ei riipu siitä.
    if email::is_configured(&state.db) {
        let mail = email::security_mail(
            &result.email,
            &result.username,
            "omistajatili luotiin",
            &result.language,
        );
        let _ = email::send(&state.db, mail).await;
    }

    let _ = settings::set(
        &state.db,
        settings::EMAIL_SENDER_NAME,
        "MettisTool",
        Some(result.user_id),
    );
    auth::establish_session(&state, result.user_id, false, "setup")
}

#[tauri::command]
pub async fn register(
    state: State<'_, AppState>,
    input: RegisterInput,
) -> AppResult<RegisterResponse> {
    let result = auth::register(
        &state.db,
        &input.username,
        &input.email,
        &input.password,
        &input.password_confirm,
        input.language.as_deref().unwrap_or("fi"),
    )?;

    let mut email_sent = false;
    if let Some(code) = &result.verify_code {
        if email::is_configured(&state.db) {
            let hours = result.verify_hours;
            let mail = email::verification_mail(
                &result.email,
                &result.username,
                code,
                hours,
                &result.language,
            );
            email_sent = email::send(&state.db, mail).await.is_ok();
        }
    }

    Ok(RegisterResponse {
        requires_verification: result.requires_verification,
        email_sent,
        email: result.email,
    })
}

#[tauri::command]
pub fn login(state: State<'_, AppState>, input: LoginInput) -> AppResult<LoginResponse> {
    match auth::login(&state, &input.email, &input.password, input.remember)? {
        auth::LoginOutcome::Ok(session) => Ok(LoginResponse::Ok { session }),
        auth::LoginOutcome::TwoFactorRequired => Ok(LoginResponse::TwoFactor),
    }
}

#[tauri::command]
pub fn login_two_factor(state: State<'_, AppState>, code: String) -> AppResult<SessionInfo> {
    auth::complete_two_factor(&state, &code)
}

#[tauri::command]
pub fn logout(state: State<'_, AppState>) -> AppResult<()> {
    auth::logout(&state)
}

#[tauri::command]
pub fn restore_session(state: State<'_, AppState>) -> AppResult<Option<SessionInfo>> {
    auth::restore_session(&state)
}

#[tauri::command]
pub fn current_session(state: State<'_, AppState>) -> AppResult<Option<SessionInfo>> {
    let Some(active) = state.session_snapshot() else {
        return Ok(None);
    };
    match state.require_auth() {
        Ok(ctx) => Ok(Some(auth::session_info(
            &state.db,
            ctx.user_id,
            active.expires_at,
        )?)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub fn verify_email(state: State<'_, AppState>, code: String) -> AppResult<()> {
    auth::verify_email(&state.db, &code)?;
    Ok(())
}

#[tauri::command]
pub async fn resend_verification(
    state: State<'_, AppState>,
    email_address: String,
) -> AppResult<bool> {
    let delivery = auth::prepare_verification_resend(&state.db, &email_address)?;
    let Some(d) = delivery else {
        // Ei paljasteta onko tiliä olemassa.
        return Ok(true);
    };
    if !email::is_configured(&state.db) {
        return Err(AppError::EmailNotConfigured);
    }
    let mail = email::verification_mail(&d.email, &d.username, &d.code, d.ttl, &d.language);
    email::send(&state.db, mail).await?;
    Ok(true)
}

#[tauri::command]
pub async fn request_password_reset(
    state: State<'_, AppState>,
    email_address: String,
) -> AppResult<bool> {
    let delivery = auth::prepare_password_reset(&state.db, &email_address)?;
    let Some(d) = delivery else {
        return Ok(true);
    };
    if !email::is_configured(&state.db) {
        return Err(AppError::EmailNotConfigured);
    }
    let mail = email::reset_mail(&d.email, &d.username, &d.code, d.ttl, &d.language);
    email::send(&state.db, mail).await?;
    Ok(true)
}

#[tauri::command]
pub async fn reset_password(
    state: State<'_, AppState>,
    code: String,
    new_password: String,
) -> AppResult<()> {
    let user_id = auth::complete_password_reset(&state.db, &code, &new_password)?;
    if email::is_configured(&state.db) {
        if let Ok(Some(user)) = auth::find_by_id(&state.db, user_id) {
            let mail = email::security_mail(
                &user.email,
                &user.username,
                "salasana vaihdettiin",
                &user.language,
            );
            let _ = email::send(&state.db, mail).await;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn accept_invite(
    state: State<'_, AppState>,
    code: String,
    new_password: String,
) -> AppResult<()> {
    auth::complete_invite(&state.db, &code, &new_password)?;
    Ok(())
}

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

/// Salasanan vahvuuden arviointi näytettäväksi — laskenta tehdään paikallisesti.
#[tauri::command]
pub fn password_strength(password: String) -> serde_json::Value {
    let bits = util::password_entropy_bits(&password);
    let issues: Vec<String> = match util::validate_password(&password) {
        Ok(_) => Vec::new(),
        Err(AppError::Validation { code, .. }) => vec![code],
        Err(_) => vec!["invalid".to_string()],
    };
    serde_json::json!({
        "bits": bits.round(),
        "score": if bits < 40.0 { 1 } else if bits < 60.0 { 2 } else if bits < 90.0 { 3 } else { 4 },
        "issues": issues
    })
}

// ===== Google-kirjautuminen =====

#[tauri::command]
pub fn google_begin(state: State<'_, AppState>, link_current: bool) -> AppResult<String> {
    if !settings::get_bool(&state.db, settings::GOOGLE_LOGIN_ENABLED) {
        return Err(AppError::OAuthNotConfigured);
    }
    crate::auth::ratelimit::check(&state.db, "oauth:begin", &crate::auth::ratelimit::OAUTH)?;

    let link_to = if link_current {
        Some(state.require_auth()?.user_id)
    } else {
        None
    };
    auth::oauth::begin(&state, link_to)
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum GooglePoll {
    Pending,
    #[serde(rename_all = "camelCase")]
    Ready {
        session: Option<SessionInfo>,
        linked: bool,
    },
    #[serde(rename_all = "camelCase")]
    Failed {
        reason: String,
    },
}

/// Käyttöliittymä kutsuu tätä kunnes tila on `ready` tai `failed`.
#[tauri::command]
pub async fn google_poll(state: State<'_, AppState>) -> AppResult<GooglePoll> {
    let callback = {
        let mut guard = state
            .oauth_result
            .lock()
            .map_err(|_| AppError::internal("oauth-lukko"))?;
        guard.take()
    };

    let Some(cb) = callback else {
        return Ok(GooglePoll::Pending);
    };

    let flow = {
        let mut guard = state
            .oauth
            .lock()
            .map_err(|_| AppError::internal("oauth-lukko"))?;
        guard.take()
    };
    let Some(flow) = flow else {
        return Ok(GooglePoll::Failed {
            reason: "no_flow".into(),
        });
    };

    if let Some(err) = cb.error {
        audit::log(
            &state.db,
            audit::Event::new("GOOGLE_LOGIN", audit::CAT_AUTH)
                .failure()
                .severity(audit::SEV_WARNING)
                .meta(serde_json::json!({ "reason": util::sanitize_line(&err, 40) })),
        );
        return Ok(GooglePoll::Failed { reason: err });
    }
    if !util::ct_eq(&cb.state, &flow.state) {
        audit::log(
            &state.db,
            audit::Event::new("GOOGLE_LOGIN", audit::CAT_SECURITY)
                .failure()
                .severity(audit::SEV_CRITICAL)
                .meta(serde_json::json!({ "reason": "state_mismatch" })),
        );
        return Ok(GooglePoll::Failed {
            reason: "state_mismatch".into(),
        });
    }
    let Some(code) = cb.code else {
        return Ok(GooglePoll::Failed {
            reason: "no_code".into(),
        });
    };

    let profile = auth::oauth::exchange(&code, &flow.pkce_verifier, &flow.redirect_uri).await?;

    // Linkitys nykyiseen tiliin
    if let Some(user_id) = flow.link_to_user {
        link_google_identity(&state, user_id, &profile)?;
        return Ok(GooglePoll::Ready {
            session: None,
            linked: true,
        });
    }

    let session = login_with_google(&state, &profile)?;
    Ok(GooglePoll::Ready {
        session: Some(session),
        linked: false,
    })
}

fn link_google_identity(
    state: &AppState,
    user_id: i64,
    profile: &auth::oauth::GoogleUser,
) -> AppResult<()> {
    let db = &state.db;
    let existing: Option<i64> = db.with(|c| {
        Ok(c.query_row(
            "SELECT user_id FROM oauth_identities WHERE provider = 'google' AND subject = ?1",
            rusqlite::params![profile.subject],
            |r| r.get(0),
        )
        .ok())
    })?;
    if let Some(other) = existing {
        if other != user_id {
            return Err(AppError::Conflict("google_already_linked".into()));
        }
        return Ok(());
    }

    db.with(|c| {
        c.execute(
            "INSERT INTO oauth_identities (user_id, provider, subject, email, display_name, created_at, last_used_at)
             VALUES (?1, 'google', ?2, ?3, ?4, ?5, ?5)",
            rusqlite::params![
                user_id,
                profile.subject,
                profile.email,
                profile.name,
                util::now()
            ],
        )?;
        Ok(())
    })?;

    if let Some(user) = auth::find_by_id(db, user_id)? {
        audit::log(
            db,
            audit::Event::new("GOOGLE_ACCOUNT_LINKED", audit::CAT_SECURITY)
                .severity(audit::SEV_NOTICE)
                .actor(user.id, user.username.clone())
                .target(user.id, user.username),
        );
    }
    Ok(())
}

fn login_with_google(
    state: &AppState,
    profile: &auth::oauth::GoogleUser,
) -> AppResult<SessionInfo> {
    let db = &state.db;

    // 1) Tunnettu Google-identiteetti
    let by_subject: Option<i64> = db.with(|c| {
        Ok(c.query_row(
            "SELECT user_id FROM oauth_identities WHERE provider = 'google' AND subject = ?1",
            rusqlite::params![profile.subject],
            |r| r.get(0),
        )
        .ok())
    })?;

    let user_id = if let Some(id) = by_subject {
        id
    } else {
        // 2) Sama sähköposti olemassa olevalla tilillä → linkitetään,
        //    mutta vain jos Google on vahvistanut osoitteen ja tili on vahvistettu.
        match auth::find_by_email(db, &profile.email)? {
            Some(existing) => {
                if !profile.email_verified || !existing.email_verified {
                    audit::log(
                        db,
                        audit::Event::new("GOOGLE_LOGIN", audit::CAT_SECURITY)
                            .failure()
                            .severity(audit::SEV_WARNING)
                            .target(existing.id, existing.username.clone())
                            .meta(serde_json::json!({ "reason": "unverified_link_blocked" })),
                    );
                    return Err(AppError::OAuthFailed("email_not_verified".into()));
                }
                link_google_identity(state, existing.id, profile)?;
                existing.id
            }
            None => {
                // 3) Uusi tili — vain jos rekisteröinti on sallittu.
                if !settings::get_bool(db, settings::REGISTRATION_ENABLED) {
                    return Err(AppError::Forbidden);
                }
                let base = profile
                    .email
                    .split('@')
                    .next()
                    .unwrap_or("kayttaja")
                    .chars()
                    .filter(|c| c.is_alphanumeric() || *c == '.' || *c == '-' || *c == '_')
                    .take(24)
                    .collect::<String>();
                let username =
                    unique_username(db, if base.len() >= 3 { &base } else { "kayttaja" })?;

                let id = auth::create_user(
                    db,
                    auth::NewUser {
                        username: &username,
                        email: &profile.email,
                        password: None,
                        role: rbac::ROLE_USER,
                        email_verified: profile.email_verified,
                        must_change_password: false,
                        language: "fi",
                    },
                )?;
                link_google_identity(state, id, profile)?;
                audit::log(
                    db,
                    audit::Event::new("ACCOUNT_CREATED", audit::CAT_AUTH)
                        .severity(audit::SEV_NOTICE)
                        .actor(id, username.clone())
                        .target(id, username)
                        .meta(serde_json::json!({ "role": "USER", "provider": "google" })),
                );
                id
            }
        }
    };

    let user = auth::find_by_id(db, user_id)?.ok_or(AppError::NotFound)?;
    if user.status != "ACTIVE" {
        return Err(AppError::AccountDisabled);
    }

    db.with(|c| {
        c.execute(
            "UPDATE oauth_identities SET last_used_at = ?1 WHERE user_id = ?2 AND provider = 'google'",
            rusqlite::params![util::now(), user_id],
        )?;
        Ok(())
    })?;

    audit::log(
        db,
        audit::Event::new("GOOGLE_LOGIN", audit::CAT_AUTH).actor(user.id, user.username.clone()),
    );

    auth::establish_session(state, user_id, false, "google")
}

fn unique_username(db: &crate::db::Db, base: &str) -> AppResult<String> {
    let mut candidate = base.to_lowercase();
    for attempt in 0..50 {
        if attempt > 0 {
            candidate = format!("{}{}", base.to_lowercase(), attempt + 1);
        }
        let taken: i64 = db.with(|c| {
            Ok(c.query_row(
                "SELECT COUNT(*) FROM users WHERE username_lower = ?1",
                rusqlite::params![candidate],
                |r| r.get(0),
            )?)
        })?;
        if taken == 0 {
            return Ok(candidate);
        }
    }
    Ok(format!("kayttaja{}", util::now()))
}

/// Google-tilin irrotus. Ei sallita jos se jäisi ainoaksi kirjautumistavaksi.
#[tauri::command]
pub fn google_unlink(state: State<'_, AppState>) -> AppResult<()> {
    let ctx = state.require_auth()?;
    let db = &state.db;
    let user = auth::find_by_id(db, ctx.user_id)?.ok_or(AppError::NotFound)?;
    if user.password_hash.is_none() {
        return Err(AppError::LastLoginMethod);
    }
    db.with(|c| {
        c.execute(
            "DELETE FROM oauth_identities WHERE user_id = ?1 AND provider = 'google'",
            rusqlite::params![ctx.user_id],
        )?;
        Ok(())
    })?;
    audit::log(
        db,
        audit::Event::new("GOOGLE_ACCOUNT_UNLINKED", audit::CAT_SECURITY)
            .severity(audit::SEV_NOTICE)
            .actor(ctx.user_id, ctx.username.clone())
            .target(ctx.user_id, ctx.username),
    );
    Ok(())
}

/// Peruuttaa keskeneräisen Google-kirjautumisen.
#[tauri::command]
pub fn google_cancel(state: State<'_, AppState>) -> AppResult<()> {
    if let Ok(mut g) = state.oauth.lock() {
        *g = None;
    }
    if let Ok(mut g) = state.oauth_result.lock() {
        *g = None;
    }
    Ok(())
}

/// Kirjautumistavat tilinäkymään.
#[tauri::command]
pub fn login_methods(state: State<'_, AppState>) -> AppResult<serde_json::Value> {
    let ctx = state.require_auth()?;
    let user = auth::public_user(&state.db, ctx.user_id)?;
    Ok(serde_json::json!({
        "password": user.has_password,
        "google": user.has_google,
        "totp": user.totp_enabled,
        "googleAvailable": auth::oauth::is_configured()
            && settings::get_bool(&state.db, settings::GOOGLE_LOGIN_ENABLED)
    }))
}

/// Muistetun istunnon poisto (esim. "kirjaudu ulos kaikkialta" -napin yhteydessä).
#[tauri::command]
pub fn forget_remembered_session() -> AppResult<()> {
    secrets::delete(secrets::REMEMBER_TOKEN)
}
