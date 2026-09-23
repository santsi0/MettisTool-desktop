//! Käyttäjän oman tilin hallinta. Arkaluontoiset muutokset vaativat salasanan
//! uudelleensyötön (re-authentication).

use crate::db::models::*;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::{audit, auth, email, secrets, util};
use rusqlite::params;
use tauri::State;

fn reauth(state: &AppState, user_id: i64, password: &str) -> AppResult<()> {
    let user = auth::find_by_id(&state.db, user_id)?.ok_or(AppError::NotFound)?;
    match &user.password_hash {
        Some(h) if auth::password::verify(password, h) => Ok(()),
        Some(_) => {
            audit::log(
                &state.db,
                audit::Event::new("REAUTH_FAILED", audit::CAT_SECURITY)
                    .severity(audit::SEV_WARNING)
                    .failure()
                    .actor(user.id, user.username.clone()),
            );
            Err(AppError::InvalidCredentials)
        }
        // Pelkkä Google-tili: uudelleentunnistautuminen tehdään Google-virralla,
        // joten sallitaan muutos vain jos salasanaa ei ole asetettu lainkaan.
        None => Ok(()),
    }
}

#[tauri::command]
pub fn account_profile(state: State<'_, AppState>) -> AppResult<PublicUser> {
    let ctx = state.require_auth()?;
    auth::public_user(&state.db, ctx.user_id)
}

#[tauri::command]
pub fn update_preferences(
    state: State<'_, AppState>,
    language: Option<String>,
    theme: Option<String>,
    accent: Option<String>,
) -> AppResult<PublicUser> {
    let ctx = state.require_auth()?;
    let db = &state.db;

    if let Some(lang) = &language {
        if !util::valid_language(lang) {
            return Err(AppError::validation("language", "invalid"));
        }
        db.with(|c| {
            c.execute(
                "UPDATE users SET language = ?1, updated_at = ?2 WHERE id = ?3",
                params![lang, util::now(), ctx.user_id],
            )?;
            Ok(())
        })?;
    }
    if let Some(t) = &theme {
        if !util::valid_theme(t) {
            return Err(AppError::validation("theme", "invalid"));
        }
        db.with(|c| {
            c.execute(
                "UPDATE users SET theme = ?1, updated_at = ?2 WHERE id = ?3",
                params![t, util::now(), ctx.user_id],
            )?;
            Ok(())
        })?;
    }
    if let Some(a) = &accent {
        if !util::valid_accent(a) {
            return Err(AppError::validation("accent", "invalid"));
        }
        db.with(|c| {
            c.execute(
                "UPDATE users SET accent = ?1, updated_at = ?2 WHERE id = ?3",
                params![a, util::now(), ctx.user_id],
            )?;
            Ok(())
        })?;
    }

    auth::public_user(db, ctx.user_id)
}

#[tauri::command]
pub async fn change_password(
    state: State<'_, AppState>,
    current_password: String,
    new_password: String,
) -> AppResult<()> {
    auth::change_password(&state, &current_password, &new_password)?;
    let ctx = state.require_auth()?;
    if email::is_configured(&state.db) {
        if let Ok(Some(user)) = auth::find_by_id(&state.db, ctx.user_id) {
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
pub async fn change_email(
    state: State<'_, AppState>,
    password: String,
    new_email: String,
) -> AppResult<PublicUser> {
    let ctx = state.require_auth()?;
    reauth(&state, ctx.user_id, &password)?;

    let email_address = util::validate_email(&new_email)?;
    let lower = util::normalize_email(&email_address);
    let db = &state.db;

    db.with(|c| {
        let taken: i64 = c.query_row(
            "SELECT COUNT(*) FROM users WHERE email_lower = ?1 AND id != ?2",
            params![lower, ctx.user_id],
            |r| r.get(0),
        )?;
        if taken > 0 {
            return Err(AppError::Conflict("email".into()));
        }
        c.execute(
            "UPDATE users SET email = ?1, email_lower = ?2, email_verified = 0, updated_at = ?3 WHERE id = ?4",
            params![email_address, lower, util::now(), ctx.user_id],
        )?;
        Ok(())
    })?;

    audit::log(
        db,
        audit::Event::new("EMAIL_CHANGED", audit::CAT_SECURITY)
            .severity(audit::SEV_NOTICE)
            .actor(ctx.user_id, ctx.username.clone())
            .target(ctx.user_id, ctx.username.clone()),
    );

    // Uusi osoite vahvistetaan koodilla.
    if email::is_configured(db) {
        if let Some(d) = auth::prepare_verification_resend(db, &email_address)? {
            let mail = email::verification_mail(&d.email, &d.username, &d.code, d.ttl, &d.language);
            let _ = email::send(db, mail).await;
        }
    }

    auth::public_user(db, ctx.user_id)
}

#[tauri::command]
pub fn change_username(
    state: State<'_, AppState>,
    password: String,
    new_username: String,
) -> AppResult<PublicUser> {
    let ctx = state.require_auth()?;
    reauth(&state, ctx.user_id, &password)?;

    let username = util::validate_username(&new_username)?;
    let lower = username.to_lowercase();
    let db = &state.db;

    db.with(|c| {
        let taken: i64 = c.query_row(
            "SELECT COUNT(*) FROM users WHERE username_lower = ?1 AND id != ?2",
            params![lower, ctx.user_id],
            |r| r.get(0),
        )?;
        if taken > 0 {
            return Err(AppError::Conflict("username".into()));
        }
        c.execute(
            "UPDATE users SET username = ?1, username_lower = ?2, updated_at = ?3 WHERE id = ?4",
            params![username, lower, util::now(), ctx.user_id],
        )?;
        Ok(())
    })?;

    audit::log(
        db,
        audit::Event::new("USERNAME_CHANGED", audit::CAT_ADMIN)
            .actor(ctx.user_id, ctx.username.clone())
            .target(ctx.user_id, username.clone()),
    );
    auth::public_user(db, ctx.user_id)
}

// ===== Kaksivaiheinen tunnistautuminen =====

#[tauri::command]
pub fn two_factor_begin(state: State<'_, AppState>) -> AppResult<TwoFactorSetup> {
    let ctx = state.require_auth()?;
    let user = auth::find_by_id(&state.db, ctx.user_id)?.ok_or(AppError::NotFound)?;
    if user.totp_enabled {
        return Err(AppError::Conflict("already_enabled".into()));
    }
    let secret = auth::totp::generate_secret();
    // Salaisuus tallennetaan vasta kun käyttäjä on vahvistanut koodin.
    secrets::set(&format!("{}_pending", secrets::totp_key(ctx.user_id)), &secret)?;
    Ok(TwoFactorSetup {
        otpauth_url: auth::totp::otpauth_url(&secret, &user.email),
        secret,
    })
}

#[tauri::command]
pub async fn two_factor_enable(state: State<'_, AppState>, code: String) -> AppResult<RecoveryCodes> {
    let ctx = state.require_auth()?;
    let pending_key = format!("{}_pending", secrets::totp_key(ctx.user_id));
    let secret = secrets::get(&pending_key).ok_or(AppError::Conflict("no_pending_setup".into()))?;

    if !auth::totp::verify(&secret, &code)? {
        return Err(AppError::InvalidTwoFactor);
    }

    secrets::set(&secrets::totp_key(ctx.user_id), &secret)?;
    let _ = secrets::delete(&pending_key);

    state.db.with(|c| {
        c.execute(
            "UPDATE users SET totp_enabled = 1, updated_at = ?1 WHERE id = ?2",
            params![util::now(), ctx.user_id],
        )?;
        Ok(())
    })?;

    let codes = auth::totp::generate_recovery_codes(&state.db, ctx.user_id)?;

    audit::log(
        &state.db,
        audit::Event::new("TWO_FACTOR_ENABLED", audit::CAT_SECURITY)
            .severity(audit::SEV_NOTICE)
            .actor(ctx.user_id, ctx.username.clone())
            .target(ctx.user_id, ctx.username.clone()),
    );

    if email::is_configured(&state.db) {
        if let Ok(Some(user)) = auth::find_by_id(&state.db, ctx.user_id) {
            let mail = email::security_mail(
                &user.email,
                &user.username,
                "kaksivaiheinen tunnistautuminen otettiin käyttöön",
                &user.language,
            );
            let _ = email::send(&state.db, mail).await;
        }
    }

    Ok(RecoveryCodes { codes })
}

#[tauri::command]
pub async fn two_factor_disable(state: State<'_, AppState>, password: String) -> AppResult<()> {
    let ctx = state.require_auth()?;
    reauth(&state, ctx.user_id, &password)?;

    state.db.with(|c| {
        c.execute(
            "UPDATE users SET totp_enabled = 0, updated_at = ?1 WHERE id = ?2",
            params![util::now(), ctx.user_id],
        )?;
        c.execute(
            "DELETE FROM recovery_codes WHERE user_id = ?1",
            params![ctx.user_id],
        )?;
        Ok(())
    })?;
    let _ = secrets::delete(&secrets::totp_key(ctx.user_id));

    audit::log(
        &state.db,
        audit::Event::new("TWO_FACTOR_DISABLED", audit::CAT_SECURITY)
            .severity(audit::SEV_WARNING)
            .actor(ctx.user_id, ctx.username.clone())
            .target(ctx.user_id, ctx.username.clone()),
    );

    if email::is_configured(&state.db) {
        if let Ok(Some(user)) = auth::find_by_id(&state.db, ctx.user_id) {
            let mail = email::security_mail(
                &user.email,
                &user.username,
                "kaksivaiheinen tunnistautuminen poistettiin käytöstä",
                &user.language,
            );
            let _ = email::send(&state.db, mail).await;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn two_factor_recovery_codes(
    state: State<'_, AppState>,
    password: String,
) -> AppResult<RecoveryCodes> {
    let ctx = state.require_auth()?;
    reauth(&state, ctx.user_id, &password)?;
    let codes = auth::totp::generate_recovery_codes(&state.db, ctx.user_id)?;
    audit::log(
        &state.db,
        audit::Event::new("RECOVERY_CODES_REGENERATED", audit::CAT_SECURITY)
            .severity(audit::SEV_NOTICE)
            .actor(ctx.user_id, ctx.username.clone()),
    );
    Ok(RecoveryCodes { codes })
}

#[tauri::command]
pub fn two_factor_status(state: State<'_, AppState>) -> AppResult<serde_json::Value> {
    let ctx = state.require_auth()?;
    let user = auth::find_by_id(&state.db, ctx.user_id)?.ok_or(AppError::NotFound)?;
    Ok(serde_json::json!({
        "enabled": user.totp_enabled,
        "remainingRecoveryCodes": auth::totp::remaining_recovery_codes(&state.db, ctx.user_id)?
    }))
}

// ===== Istunnot =====

#[tauri::command]
pub fn account_sessions(state: State<'_, AppState>) -> AppResult<Vec<SessionRow>> {
    let ctx = state.require_auth()?;
    auth::session::list(&state.db, ctx.user_id, Some(ctx.session_id))
}

#[tauri::command]
pub fn revoke_session(state: State<'_, AppState>, session_id: i64) -> AppResult<()> {
    let ctx = state.require_auth()?;
    let owner: Option<i64> = state.db.with(|c| {
        Ok(c.query_row(
            "SELECT user_id FROM sessions WHERE id = ?1",
            params![session_id],
            |r| r.get(0),
        )
        .ok())
    })?;
    if owner != Some(ctx.user_id) {
        return Err(AppError::Forbidden);
    }
    auth::session::revoke(&state.db, session_id)?;
    if session_id == ctx.session_id {
        auth::logout(&state)?;
    }
    Ok(())
}

#[tauri::command]
pub fn revoke_other_sessions(state: State<'_, AppState>) -> AppResult<usize> {
    let ctx = state.require_auth()?;
    let n = auth::session::revoke_all(&state.db, ctx.user_id, Some(ctx.session_id))?;
    audit::log(
        &state.db,
        audit::Event::new("SESSIONS_REVOKED", audit::CAT_SECURITY)
            .severity(audit::SEV_NOTICE)
            .actor(ctx.user_id, ctx.username.clone())
            .meta(serde_json::json!({ "count": n })),
    );
    Ok(n)
}

// ===== Tiedot =====

#[tauri::command]
pub fn export_my_data(state: State<'_, AppState>) -> AppResult<serde_json::Value> {
    let ctx = state.require_auth()?;
    crate::backup::export_user_data(&state.db, ctx.user_id)
}

#[tauri::command]
pub fn delete_my_account(state: State<'_, AppState>, password: String) -> AppResult<()> {
    let ctx = state.require_auth()?;
    reauth(&state, ctx.user_id, &password)?;
    crate::rbac::ensure_not_last_owner(&state.db, ctx.user_id)?;

    state.db.with(|c| {
        c.execute("DELETE FROM users WHERE id = ?1", params![ctx.user_id])?;
        Ok(())
    })?;
    let _ = secrets::delete(&secrets::totp_key(ctx.user_id));

    audit::log(
        &state.db,
        audit::Event::new("ACCOUNT_DELETED", audit::CAT_ADMIN)
            .severity(audit::SEV_CRITICAL)
            .actor(ctx.user_id, ctx.username.clone())
            .target(ctx.user_id, ctx.username.clone())
            .meta(serde_json::json!({ "self_service": true })),
    );

    auth::logout(&state)?;
    Ok(())
}
