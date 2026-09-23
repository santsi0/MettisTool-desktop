//! Tunnistautumisen palvelukerros.
//!
//! Kaikki tarkistukset tehdään täällä — käyttöliittymä ei voi ohittaa mitään.
//! Funktiot ovat synkronisia; sähköpostin lähetys tehdään komentokerroksessa,
//! jottei tietokantalukkoa koskaan pidetä `await`-pisteen yli.

pub mod oauth;
pub mod password;
pub mod ratelimit;
pub mod session;
pub mod tokens;
pub mod totp;

use crate::db::models::{PublicUser, SessionInfo};
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::state::{ActiveSession, AppState, PendingLogin};
use crate::util::{self, now};
use crate::{audit, rbac, secrets, settings};
use rusqlite::params;

pub struct UserRow {
    pub id: i64,
    pub username: String,
    pub email: String,
    pub password_hash: Option<String>,
    pub role: String,
    pub status: String,
    pub email_verified: bool,
    pub totp_enabled: bool,
    pub must_change_password: bool,
    pub failed_logins: i64,
    pub locked_until: Option<i64>,
    pub language: String,
}

fn map_user(row: &rusqlite::Row<'_>) -> rusqlite::Result<UserRow> {
    Ok(UserRow {
        id: row.get("id")?,
        username: row.get("username")?,
        email: row.get("email")?,
        password_hash: row.get("password_hash")?,
        role: row.get("role")?,
        status: row.get("status")?,
        email_verified: row.get::<_, i64>("email_verified")? == 1,
        totp_enabled: row.get::<_, i64>("totp_enabled")? == 1,
        must_change_password: row.get::<_, i64>("must_change_password")? == 1,
        failed_logins: row.get("failed_logins")?,
        locked_until: row.get("locked_until")?,
        language: row.get("language")?,
    })
}

const USER_COLUMNS: &str = "id, username, email, password_hash, role, status, email_verified,
     totp_enabled, must_change_password, failed_logins, locked_until, language";

pub fn find_by_email(db: &Db, email: &str) -> AppResult<Option<UserRow>> {
    let key = util::normalize_email(email);
    db.with(|c| {
        Ok(c.query_row(
            &format!("SELECT {USER_COLUMNS} FROM users WHERE email_lower = ?1"),
            params![key],
            map_user,
        )
        .ok())
    })
}

pub fn find_by_id(db: &Db, id: i64) -> AppResult<Option<UserRow>> {
    db.with(|c| {
        Ok(c.query_row(
            &format!("SELECT {USER_COLUMNS} FROM users WHERE id = ?1"),
            params![id],
            map_user,
        )
        .ok())
    })
}

pub fn public_user(db: &Db, id: i64) -> AppResult<PublicUser> {
    db.with(|c| {
        let u = c
            .query_row(
                "SELECT id, username, email, role, status, email_verified, totp_enabled,
                        must_change_password, password_hash, language, theme, accent,
                        created_at, last_login_at, locked_until, failed_logins
                 FROM users WHERE id = ?1",
                params![id],
                |r| {
                    Ok(PublicUser {
                        id: r.get(0)?,
                        username: r.get(1)?,
                        email: r.get(2)?,
                        role: r.get(3)?,
                        status: r.get(4)?,
                        email_verified: r.get::<_, i64>(5)? == 1,
                        totp_enabled: r.get::<_, i64>(6)? == 1,
                        must_change_password: r.get::<_, i64>(7)? == 1,
                        has_password: r.get::<_, Option<String>>(8)?.is_some(),
                        has_google: false,
                        language: r.get(9)?,
                        theme: r.get(10)?,
                        accent: r.get(11)?,
                        created_at: r.get(12)?,
                        last_login_at: r.get(13)?,
                        locked_until: r.get(14)?,
                        failed_logins: r.get(15)?,
                    })
                },
            )
            .map_err(|_| AppError::NotFound)?;

        let google: i64 = c.query_row(
            "SELECT COUNT(*) FROM oauth_identities WHERE user_id = ?1 AND provider = 'google'",
            params![id],
            |r| r.get(0),
        )?;

        Ok(PublicUser {
            has_google: google > 0,
            ..u
        })
    })
}

pub fn session_info(db: &Db, user_id: i64, expires_at: i64) -> AppResult<SessionInfo> {
    let user = public_user(db, user_id)?;
    let permissions = rbac::effective_permissions(db, user_id, &user.role)?;
    Ok(SessionInfo {
        user,
        permissions,
        expires_at,
        app_version: util::app_version(),
    })
}

// ===== Käyttäjän luonti =====

pub struct NewUser<'a> {
    pub username: &'a str,
    pub email: &'a str,
    pub password: Option<&'a str>,
    pub role: &'a str,
    pub email_verified: bool,
    pub must_change_password: bool,
    pub language: &'a str,
}

pub fn create_user(db: &Db, input: NewUser<'_>) -> AppResult<i64> {
    let username = util::validate_username(input.username)?;
    let email = util::validate_email(input.email)?;
    let email_lower = util::normalize_email(&email);
    let username_lower = username.to_lowercase();

    let hash = match input.password {
        Some(pw) => {
            util::validate_password(pw)?;
            Some(password::hash(pw)?)
        }
        None => None,
    };

    let ts = now();
    let language = if util::valid_language(input.language) {
        input.language
    } else {
        "fi"
    };

    db.with(|c| {
        let exists: i64 = c.query_row(
            "SELECT COUNT(*) FROM users WHERE email_lower = ?1",
            params![email_lower],
            |r| r.get(0),
        )?;
        if exists > 0 {
            return Err(AppError::Conflict("email".into()));
        }
        let exists: i64 = c.query_row(
            "SELECT COUNT(*) FROM users WHERE username_lower = ?1",
            params![username_lower],
            |r| r.get(0),
        )?;
        if exists > 0 {
            return Err(AppError::Conflict("username".into()));
        }

        c.execute(
            "INSERT INTO users
                (username, username_lower, email, email_lower, password_hash, role, status,
                 email_verified, must_change_password, language, created_at, updated_at, password_changed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'ACTIVE', ?7, ?8, ?9, ?10, ?10, ?11)",
            params![
                username,
                username_lower,
                email,
                email_lower,
                hash,
                input.role,
                input.email_verified as i64,
                input.must_change_password as i64,
                language,
                ts,
                hash_ts(&hash, ts)
            ],
        )?;
        Ok(c.last_insert_rowid())
    })
}

fn hash_ts(hash: &Option<String>, ts: i64) -> Option<i64> {
    hash.as_ref().map(|_| ts)
}

// ===== Ensikäynnistys =====

pub struct SetupResult {
    pub user_id: i64,
    pub username: String,
    pub email: String,
    pub language: String,
    pub verify_code: Option<String>,
    pub verify_hours: i64,
}

/// Luo ensimmäisen OWNER-tilin. Tämä on AINOA tapa saada OWNER-rooli.
pub fn first_run_setup(
    db: &Db,
    username: &str,
    email: &str,
    password: &str,
    password_confirm: &str,
    language: &str,
) -> AppResult<SetupResult> {
    if rbac::owner_exists(db)? {
        return Err(AppError::SetupAlreadyDone);
    }
    if password != password_confirm {
        return Err(AppError::validation("passwordConfirm", "mismatch"));
    }

    let user_id = create_user(
        db,
        NewUser {
            username,
            email,
            password: Some(password),
            role: rbac::ROLE_OWNER,
            // Omistaja pääsee sisään heti; sähköpostin vahvistus pyydetään silti,
            // jotta palautustoiminto varmasti toimii.
            email_verified: true,
            must_change_password: false,
            language,
        },
    )?;

    let user = find_by_id(db, user_id)?.ok_or(AppError::NotFound)?;

    // Omistajaa ei koskaan lukita ulos omasta sovelluksestaan: tili on heti
    // käyttökelpoinen. Jos sähköposti on määritetty, lähetetään vahvistusviesti
    // tiedoksi — mutta sisäänpääsy ei riipu siitä.
    let verify: Option<(String, i64)> = None;

    audit::log(
        db,
        audit::Event::new("SETUP_COMPLETED", audit::CAT_SYSTEM)
            .severity(audit::SEV_CRITICAL)
            .actor(user_id, user.username.clone())
            .meta(serde_json::json!({ "role": "OWNER" })),
    );

    Ok(SetupResult {
        user_id,
        username: user.username,
        email: user.email,
        language: user.language,
        verify_code: verify.as_ref().map(|(t, _)| t.clone()),
        verify_hours: verify.map(|(_, h)| h).unwrap_or(24),
    })
}

// ===== Rekisteröinti =====

pub struct RegistrationResult {
    pub user_id: i64,
    pub username: String,
    pub email: String,
    pub language: String,
    pub verify_code: Option<String>,
    pub verify_hours: i64,
    pub requires_verification: bool,
}

pub fn register(
    db: &Db,
    username: &str,
    email: &str,
    pw: &str,
    pw_confirm: &str,
    language: &str,
) -> AppResult<RegistrationResult> {
    if !rbac::owner_exists(db)? {
        return Err(AppError::SetupRequired);
    }
    if !settings::get_bool(db, settings::REGISTRATION_ENABLED) {
        return Err(AppError::Forbidden);
    }
    if pw != pw_confirm {
        return Err(AppError::validation("passwordConfirm", "mismatch"));
    }

    let normalized = util::normalize_email(email);
    ratelimit::check(db, &format!("register:{normalized}"), &ratelimit::REGISTER)?;

    let require_verification = settings::get_bool(db, settings::REQUIRE_EMAIL_VERIFICATION);

    // Normaali rekisteröinti voi luoda VAIN tavallisen käyttäjän.
    let user_id = create_user(
        db,
        NewUser {
            username,
            email,
            password: Some(pw),
            role: rbac::ROLE_USER,
            email_verified: !require_verification,
            must_change_password: false,
            language,
        },
    )?;

    let user = find_by_id(db, user_id)?.ok_or(AppError::NotFound)?;

    let verify = if require_verification {
        let hours = settings::get_i64(db, settings::VERIFY_TOKEN_HOURS, 1, 168);
        let issued = tokens::issue(db, user_id, tokens::KIND_VERIFY, hours * 3_600)?;
        Some((issued.token, hours))
    } else {
        None
    };

    audit::log(
        db,
        audit::Event::new("ACCOUNT_CREATED", audit::CAT_AUTH)
            .severity(audit::SEV_NOTICE)
            .actor(user_id, user.username.clone())
            .target(user_id, user.username.clone())
            .meta(serde_json::json!({ "role": "USER", "self_service": true })),
    );

    Ok(RegistrationResult {
        user_id,
        username: user.username,
        email: user.email,
        language: user.language,
        verify_code: verify.as_ref().map(|(t, _)| t.clone()),
        verify_hours: verify.map(|(_, h)| h).unwrap_or(24),
        requires_verification: require_verification,
    })
}

// ===== Kirjautuminen =====

pub enum LoginOutcome {
    Ok(SessionInfo),
    TwoFactorRequired,
}

fn device_label() -> String {
    format!(
        "{} · MettisTool {}",
        std::env::consts::OS,
        util::app_version()
    )
}

pub fn login(state: &AppState, email: &str, pw: &str, remember: bool) -> AppResult<LoginOutcome> {
    let db = state.db.clone();
    let normalized = util::normalize_email(email);
    ratelimit::check(&db, &format!("login:{normalized}"), &ratelimit::LOGIN)?;

    let user = match find_by_email(&db, &normalized)? {
        Some(u) => u,
        None => {
            // Sama vastausaika kuin oikealla käyttäjällä — ei tietovuotoa.
            password::dummy_verify(pw);
            audit::log(
                &db,
                audit::Event::new("LOGIN_FAILED", audit::CAT_AUTH)
                    .severity(audit::SEV_WARNING)
                    .failure()
                    .meta(serde_json::json!({ "reason": "unknown_account" })),
            );
            return Err(AppError::InvalidCredentials);
        }
    };

    if let Some(until) = user.locked_until {
        if until > now() {
            return Err(AppError::AccountLocked { until });
        }
    }
    if user.status != "ACTIVE" {
        audit::log(
            &db,
            audit::Event::new("LOGIN_FAILED", audit::CAT_AUTH)
                .severity(audit::SEV_WARNING)
                .failure()
                .target(user.id, user.username.clone())
                .meta(serde_json::json!({ "reason": "disabled" })),
        );
        return Err(AppError::AccountDisabled);
    }

    let stored = match &user.password_hash {
        Some(h) => h.clone(),
        None => {
            // Tili on luotu vain Google-kirjautumista varten.
            password::dummy_verify(pw);
            return Err(AppError::InvalidCredentials);
        }
    };

    if !password::verify(pw, &stored) {
        register_failed_login(&db, &user)?;
        return Err(AppError::InvalidCredentials);
    }

    // Onnistunut salasanan tarkistus — nollaa laskurit.
    let _ = db.with(|c| {
        c.execute(
            "UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?1",
            params![user.id],
        )?;
        Ok(())
    });

    if settings::get_bool(&db, settings::REQUIRE_EMAIL_VERIFICATION) && !user.email_verified {
        audit::log(
            &db,
            audit::Event::new("LOGIN_FAILED", audit::CAT_AUTH)
                .failure()
                .target(user.id, user.username.clone())
                .meta(serde_json::json!({ "reason": "email_not_verified" })),
        );
        return Err(AppError::EmailNotVerified);
    }

    // Päivitä tiiviste jos parametrit ovat vanhentuneet.
    if password::needs_rehash(&stored) {
        if let Ok(new_hash) = password::hash(pw) {
            let _ = db.with(|c| {
                c.execute(
                    "UPDATE users SET password_hash = ?1, updated_at = ?2 WHERE id = ?3",
                    params![new_hash, now(), user.id],
                )?;
                Ok(())
            });
        }
    }

    if user.totp_enabled {
        if let Ok(mut pending) = state.pending_login.lock() {
            *pending = Some(PendingLogin {
                user_id: user.id,
                remember,
                created_at: now(),
                attempts: 0,
            });
        }
        return Ok(LoginOutcome::TwoFactorRequired);
    }

    let info = establish_session(state, user.id, remember, "password")?;
    Ok(LoginOutcome::Ok(info))
}

fn register_failed_login(db: &Db, user: &UserRow) -> AppResult<()> {
    let max = settings::get_i64(db, settings::MAX_FAILED_LOGINS, 3, 20);
    let lock_minutes = settings::get_i64(db, settings::LOCKOUT_MINUTES, 1, 1440);
    let failed = user.failed_logins + 1;
    let lock_until = if failed >= max {
        Some(now() + lock_minutes * 60)
    } else {
        None
    };

    db.with(|c| {
        c.execute(
            "UPDATE users SET failed_logins = ?1, locked_until = ?2, updated_at = ?3 WHERE id = ?4",
            params![failed, lock_until, now(), user.id],
        )?;
        Ok(())
    })?;

    audit::log(
        db,
        audit::Event::new("LOGIN_FAILED", audit::CAT_AUTH)
            .severity(audit::SEV_WARNING)
            .failure()
            .target(user.id, user.username.clone())
            .meta(serde_json::json!({ "attempts": failed, "reason": "bad_password" })),
    );

    if let Some(until) = lock_until {
        audit::log(
            db,
            audit::Event::new("ACCOUNT_LOCKED", audit::CAT_SECURITY)
                .severity(audit::SEV_CRITICAL)
                .target(user.id, user.username.clone())
                .meta(serde_json::json!({ "until": until, "attempts": failed })),
        );
        return Err(AppError::AccountLocked { until });
    }
    Ok(())
}

pub fn complete_two_factor(state: &AppState, code: &str) -> AppResult<SessionInfo> {
    let db = state.db.clone();
    let pending = state
        .pending_login
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .ok_or(AppError::NotAuthenticated)?;

    // Kahden vaiheen välissä saa kulua enintään 5 minuuttia.
    if now() - pending.created_at > 300 {
        state.pending_login.lock().ok().map(|mut g| g.take());
        return Err(AppError::NotAuthenticated);
    }

    ratelimit::check(
        &db,
        &format!("totp:{}", pending.user_id),
        &ratelimit::TOTP_ATTEMPT,
    )?;

    let user = find_by_id(&db, pending.user_id)?.ok_or(AppError::NotAuthenticated)?;
    let secret = secrets::get(&secrets::totp_key(user.id)).ok_or(AppError::InvalidTwoFactor)?;

    let normalized = code.trim();
    let ok = if normalized.contains('-') || normalized.len() > 6 {
        totp::consume_recovery_code(&db, user.id, normalized)?
    } else {
        totp::verify(&secret, normalized)?
    };

    if !ok {
        audit::log(
            &db,
            audit::Event::new("LOGIN_FAILED", audit::CAT_SECURITY)
                .severity(audit::SEV_WARNING)
                .failure()
                .target(user.id, user.username.clone())
                .meta(serde_json::json!({ "reason": "bad_totp" })),
        );
        return Err(AppError::InvalidTwoFactor);
    }

    if let Ok(mut g) = state.pending_login.lock() {
        *g = None;
    }
    ratelimit::reset(&db, &format!("totp:{}", user.id));

    establish_session(state, user.id, pending.remember, "password+2fa")
}

pub fn establish_session(
    state: &AppState,
    user_id: i64,
    remember: bool,
    method: &str,
) -> AppResult<SessionInfo> {
    let db = state.db.clone();
    let hours = settings::get_i64(&db, settings::SESSION_HOURS, 1, 720);
    let days = settings::get_i64(&db, settings::REMEMBER_DAYS, 1, 365);

    let new = session::create(&db, user_id, remember, &device_label(), hours, days)?;

    db.with(|c| {
        c.execute(
            "UPDATE users SET last_login_at = ?1, failed_logins = 0, locked_until = NULL WHERE id = ?2",
            params![now(), user_id],
        )?;
        Ok(())
    })?;

    if remember {
        let _ = secrets::set(secrets::REMEMBER_TOKEN, &new.token);
    } else {
        let _ = secrets::delete(secrets::REMEMBER_TOKEN);
    }

    state.set_session(Some(ActiveSession {
        session_id: new.id,
        user_id,
        expires_at: new.expires_at,
        remember,
    }));

    let user = find_by_id(&db, user_id)?.ok_or(AppError::NotFound)?;
    audit::log(
        &db,
        audit::Event::new("LOGIN_SUCCESS", audit::CAT_AUTH)
            .actor(user_id, user.username.clone())
            .meta(serde_json::json!({ "method": method, "remember": remember })),
    );
    if rbac::is_privileged(&user.role) {
        audit::log(
            &db,
            audit::Event::new("ADMIN_LOGIN", audit::CAT_SECURITY)
                .severity(audit::SEV_NOTICE)
                .actor(user_id, user.username.clone())
                .meta(serde_json::json!({ "role": user.role })),
        );
    }

    session_info(&db, user_id, new.expires_at)
}

pub fn logout(state: &AppState) -> AppResult<()> {
    let db = state.db.clone();
    if let Some(active) = state.session_snapshot() {
        let _ = session::revoke(&db, active.session_id);
        if let Ok(Some(user)) = find_by_id(&db, active.user_id) {
            audit::log(
                &db,
                audit::Event::new("LOGOUT", audit::CAT_AUTH).actor(user.id, user.username),
            );
        }
    }
    let _ = secrets::delete(secrets::REMEMBER_TOKEN);
    state.set_session(None);
    if let Ok(mut g) = state.pending_login.lock() {
        *g = None;
    }
    Ok(())
}

/// Palauttaa istunnon avainsäilöön tallennetusta "muista minut" -tokenista.
pub fn restore_session(state: &AppState) -> AppResult<Option<SessionInfo>> {
    let Some(token) = secrets::get(secrets::REMEMBER_TOKEN) else {
        return Ok(None);
    };
    let db = state.db.clone();
    match session::validate(&db, &token) {
        Ok(valid) => {
            let user = match find_by_id(&db, valid.user_id)? {
                Some(u) if u.status == "ACTIVE" => u,
                _ => {
                    let _ = secrets::delete(secrets::REMEMBER_TOKEN);
                    return Ok(None);
                }
            };
            state.set_session(Some(ActiveSession {
                session_id: valid.id,
                user_id: valid.user_id,
                expires_at: valid.expires_at,
                remember: true,
            }));
            audit::log(
                &db,
                audit::Event::new("SESSION_RESTORED", audit::CAT_AUTH)
                    .actor(user.id, user.username.clone()),
            );
            Ok(Some(session_info(&db, valid.user_id, valid.expires_at)?))
        }
        Err(_) => {
            let _ = secrets::delete(secrets::REMEMBER_TOKEN);
            Ok(None)
        }
    }
}

// ===== Sähköpostin vahvistus =====

pub fn verify_email(db: &Db, code: &str) -> AppResult<i64> {
    let user_id = tokens::consume(db, tokens::KIND_VERIFY, code)?;
    db.with(|c| {
        c.execute(
            "UPDATE users SET email_verified = 1, updated_at = ?1 WHERE id = ?2",
            params![now(), user_id],
        )?;
        Ok(())
    })?;
    if let Some(user) = find_by_id(db, user_id)? {
        audit::log(
            db,
            audit::Event::new("EMAIL_VERIFIED", audit::CAT_AUTH)
                .severity(audit::SEV_NOTICE)
                .actor(user.id, user.username.clone())
                .target(user.id, user.username),
        );
    }
    Ok(user_id)
}

pub struct CodeDelivery {
    pub user_id: i64,
    pub username: String,
    pub email: String,
    pub language: String,
    pub code: String,
    pub ttl: i64,
}

pub fn prepare_verification_resend(db: &Db, email: &str) -> AppResult<Option<CodeDelivery>> {
    let normalized = util::normalize_email(email);
    ratelimit::check(db, &format!("verify:{normalized}"), &ratelimit::VERIFY_RESEND)?;

    // Olemassaolon paljastamista vältetään: palautetaan None ilman virhettä.
    let Some(user) = find_by_email(db, &normalized)? else {
        return Ok(None);
    };
    if user.email_verified {
        return Ok(None);
    }

    let hours = settings::get_i64(db, settings::VERIFY_TOKEN_HOURS, 1, 168);
    let issued = tokens::issue(db, user.id, tokens::KIND_VERIFY, hours * 3_600)?;

    audit::log(
        db,
        audit::Event::new("EMAIL_VERIFICATION_RESENT", audit::CAT_AUTH)
            .target(user.id, user.username.clone()),
    );

    Ok(Some(CodeDelivery {
        user_id: user.id,
        username: user.username,
        email: user.email,
        language: user.language,
        code: issued.token,
        ttl: hours,
    }))
}

// ===== Salasanan palautus =====

pub fn prepare_password_reset(db: &Db, email: &str) -> AppResult<Option<CodeDelivery>> {
    let normalized = util::normalize_email(email);
    ratelimit::check(db, &format!("reset:{normalized}"), &ratelimit::PASSWORD_RESET)?;

    let Some(user) = find_by_email(db, &normalized)? else {
        // Ei paljasteta onko osoite olemassa.
        audit::log(
            db,
            audit::Event::new("PASSWORD_RESET_REQUESTED", audit::CAT_SECURITY)
                .severity(audit::SEV_NOTICE)
                .meta(serde_json::json!({ "account_exists": false })),
        );
        return Ok(None);
    };

    let minutes = settings::get_i64(db, settings::RESET_TOKEN_MINUTES, 5, 1440);
    let issued = tokens::issue(db, user.id, tokens::KIND_RESET, minutes * 60)?;

    audit::log(
        db,
        audit::Event::new("PASSWORD_RESET_REQUESTED", audit::CAT_SECURITY)
            .severity(audit::SEV_NOTICE)
            .target(user.id, user.username.clone()),
    );

    Ok(Some(CodeDelivery {
        user_id: user.id,
        username: user.username,
        email: user.email,
        language: user.language,
        code: issued.token,
        ttl: minutes,
    }))
}

pub fn complete_password_reset(db: &Db, code: &str, new_password: &str) -> AppResult<i64> {
    util::validate_password(new_password)?;
    let user_id = tokens::consume(db, tokens::KIND_RESET, code)?;
    let hash = password::hash(new_password)?;

    db.with(|c| {
        c.execute(
            "UPDATE users SET password_hash = ?1, must_change_password = 0, failed_logins = 0,
                              locked_until = NULL, updated_at = ?2, password_changed_at = ?2
             WHERE id = ?3",
            params![hash, now(), user_id],
        )?;
        Ok(())
    })?;

    // Kaikki istunnot katkaistaan palautuksen jälkeen.
    let _ = session::revoke_all(db, user_id, None);

    if let Some(user) = find_by_id(db, user_id)? {
        audit::log(
            db,
            audit::Event::new("PASSWORD_RESET_COMPLETED", audit::CAT_SECURITY)
                .severity(audit::SEV_CRITICAL)
                .actor(user.id, user.username.clone())
                .target(user.id, user.username),
        );
    }
    Ok(user_id)
}

/// Kutsukoodilla asetettu ensimmäinen salasana.
pub fn complete_invite(db: &Db, code: &str, new_password: &str) -> AppResult<i64> {
    util::validate_password(new_password)?;
    let user_id = tokens::consume(db, tokens::KIND_INVITE, code)?;
    let hash = password::hash(new_password)?;
    db.with(|c| {
        c.execute(
            "UPDATE users SET password_hash = ?1, must_change_password = 0, email_verified = 1,
                              updated_at = ?2, password_changed_at = ?2
             WHERE id = ?3",
            params![hash, now(), user_id],
        )?;
        Ok(())
    })?;
    if let Some(user) = find_by_id(db, user_id)? {
        audit::log(
            db,
            audit::Event::new("INVITE_ACCEPTED", audit::CAT_AUTH)
                .severity(audit::SEV_NOTICE)
                .actor(user.id, user.username.clone()),
        );
    }
    Ok(user_id)
}

// ===== Salasanan vaihto =====

pub fn change_password(state: &AppState, current: &str, new_password: &str) -> AppResult<()> {
    let ctx = state.require_auth()?;
    let db = state.db.clone();
    let user = find_by_id(&db, ctx.user_id)?.ok_or(AppError::NotFound)?;

    match &user.password_hash {
        Some(h) => {
            if !password::verify(current, h) {
                audit::log(
                    &db,
                    audit::Event::new("PASSWORD_CHANGE_FAILED", audit::CAT_SECURITY)
                        .severity(audit::SEV_WARNING)
                        .failure()
                        .actor(user.id, user.username.clone()),
                );
                return Err(AppError::InvalidCredentials);
            }
        }
        None => {
            // Google-tili, jolle asetetaan salasana ensimmäistä kertaa.
        }
    }

    util::validate_password(new_password)?;
    if new_password == current {
        return Err(AppError::validation("password", "same_as_old"));
    }
    let hash = password::hash(new_password)?;

    db.with(|c| {
        c.execute(
            "UPDATE users SET password_hash = ?1, must_change_password = 0,
                              updated_at = ?2, password_changed_at = ?2 WHERE id = ?3",
            params![hash, now(), user.id],
        )?;
        Ok(())
    })?;

    let _ = session::revoke_all(&db, user.id, Some(ctx.session_id));

    audit::log(
        &db,
        audit::Event::new("PASSWORD_CHANGED", audit::CAT_SECURITY)
            .severity(audit::SEV_NOTICE)
            .actor(user.id, user.username.clone())
            .target(user.id, user.username),
    );
    Ok(())
}
