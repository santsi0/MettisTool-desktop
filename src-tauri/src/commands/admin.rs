//! Hallintapaneelin komennot.
//!
//! Jokainen komento tarkistaa oikeudet Rust-puolella. Käyttöliittymän piilottamat
//! painikkeet eivät ole turvamekanismi — tämä on.

use crate::db::models::*;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::{audit, auth, backup, discord, email, rbac, secrets, settings, util};
use rusqlite::params;
use tauri::{Manager, State};

fn app_data_dir(app: &tauri::AppHandle) -> AppResult<std::path::PathBuf> {
    app.path()
        .app_data_dir()
        .map_err(|e| AppError::internal(format!("sovelluskansiota ei löydy: {e}")))
}

// ===== Yleiskatsaus =====

#[tauri::command]
pub fn admin_stats(state: State<'_, AppState>) -> AppResult<AdminStats> {
    state.require_permission("VIEW_USERS")?;
    let db = &state.db;
    let week = util::now() - 7 * 86_400;

    db.with(|c| {
        let ts = util::now();
        let count = |sql: &str| -> rusqlite::Result<i64> { c.query_row(sql, [], |r| r.get(0)) };
        let count1 = |sql: &str, a: i64| -> rusqlite::Result<i64> {
            c.query_row(sql, params![a], |r| r.get(0))
        };
        let count2 = |sql: &str, a: i64, b: i64| -> rusqlite::Result<i64> {
            c.query_row(sql, params![a, b], |r| r.get(0))
        };

        let total = count("SELECT COUNT(*) FROM users")?;
        let verified = count("SELECT COUNT(*) FROM users WHERE email_verified = 1")?;
        let disabled = count("SELECT COUNT(*) FROM users WHERE status != 'ACTIVE'")?;
        let locked = count1(
            "SELECT COUNT(*) FROM users WHERE locked_until IS NOT NULL AND locked_until > ?1",
            ts,
        )?;
        let owners = count("SELECT COUNT(*) FROM users WHERE role = 'OWNER'")?;
        let admins = count("SELECT COUNT(*) FROM users WHERE role = 'ADMIN'")?;
        let moderators = count("SELECT COUNT(*) FROM users WHERE role = 'MODERATOR'")?;
        let sessions = count1(
            "SELECT COUNT(*) FROM sessions WHERE revoked_at IS NULL AND expires_at > ?1",
            ts,
        )?;
        let registrations = count1("SELECT COUNT(*) FROM users WHERE created_at > ?1", week)?;
        let logins = count1(
            "SELECT COUNT(*) FROM audit_log WHERE event = 'LOGIN_SUCCESS' AND ts > ?1",
            week,
        )?;
        let failed = count1(
            "SELECT COUNT(*) FROM audit_log WHERE event = 'LOGIN_FAILED' AND ts > ?1",
            week,
        )?;
        let security = count1(
            "SELECT COUNT(*) FROM audit_log WHERE category = 'SECURITY' AND ts > ?1",
            week,
        )?;

        // 14 päivän aikasarja
        let mut daily = Vec::new();
        for offset in (0..14).rev() {
            let day_start = ts - offset * 86_400;
            let start = day_start - (day_start % 86_400);
            let end = start + 86_400;
            let day = chrono::DateTime::from_timestamp(start, 0)
                .map(|d| d.format("%Y-%m-%d").to_string())
                .unwrap_or_default();
            daily.push(DailyPoint {
                day,
                registrations: count2(
                    "SELECT COUNT(*) FROM users WHERE created_at >= ?1 AND created_at < ?2",
                    start,
                    end,
                )?,
                logins: count2(
                    "SELECT COUNT(*) FROM audit_log WHERE event='LOGIN_SUCCESS' AND ts >= ?1 AND ts < ?2",
                    start,
                    end,
                )?,
                failed: count2(
                    "SELECT COUNT(*) FROM audit_log WHERE event='LOGIN_FAILED' AND ts >= ?1 AND ts < ?2",
                    start,
                    end,
                )?,
            });
        }

        Ok(AdminStats {
            total_users: total,
            verified_users: verified,
            unverified_users: total - verified,
            disabled_users: disabled,
            locked_users: locked,
            owners,
            admins,
            moderators,
            active_sessions: sessions,
            registrations_7d: registrations,
            logins_7d: logins,
            failed_logins_7d: failed,
            security_events_7d: security,
            daily,
        })
    })
}

// ===== Käyttäjälistaus =====

#[tauri::command]
pub fn list_users(state: State<'_, AppState>, filter: UserFilter) -> AppResult<Page<PublicUser>> {
    state.require_permission("VIEW_USERS")?;
    let db = &state.db;
    let limit = filter.limit.clamp(1, 200);
    let offset = filter.offset.max(0);

    let mut clauses: Vec<String> = Vec::new();
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(search) = filter
        .search
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        clauses.push("(username_lower LIKE ? OR email_lower LIKE ?)".into());
        let pattern = format!(
            "%{}%",
            search.to_lowercase().replace('%', "").replace('_', "")
        );
        args.push(Box::new(pattern.clone()));
        args.push(Box::new(pattern));
    }
    if let Some(role) = filter.role.as_ref().filter(|r| util::valid_role(r)) {
        clauses.push("role = ?".into());
        args.push(Box::new(role.clone()));
    }
    if let Some(status) = filter
        .status
        .as_ref()
        .filter(|s| !s.is_empty() && *s != "ALL")
    {
        clauses.push("status = ?".into());
        args.push(Box::new(status.clone()));
    }
    if let Some(verified) = filter.verified {
        clauses.push("email_verified = ?".into());
        args.push(Box::new(verified as i64));
    }

    let where_sql = if clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    };

    let ids: Vec<i64> = db.with(|c| {
        let p: Vec<&dyn rusqlite::ToSql> = args.iter().map(|b| b.as_ref()).collect();
        let sql = format!(
            "SELECT id FROM users {where_sql} ORDER BY
                CASE role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 WHEN 'MODERATOR' THEN 2 ELSE 3 END,
                created_at DESC
             LIMIT {limit} OFFSET {offset}"
        );
        let mut stmt = c.prepare(&sql)?;
        let it = stmt.query_map(p.as_slice(), |r| r.get::<_, i64>(0))?;
        let mut out = Vec::new();
        for row in it {
            out.push(row?);
        }
        Ok(out)
    })?;

    let total: i64 = db.with(|c| {
        let p: Vec<&dyn rusqlite::ToSql> = args.iter().map(|b| b.as_ref()).collect();
        Ok(c.query_row(
            &format!("SELECT COUNT(*) FROM users {where_sql}"),
            p.as_slice(),
            |r| r.get(0),
        )?)
    })?;

    let mut items = Vec::with_capacity(ids.len());
    for id in ids {
        items.push(auth::public_user(db, id)?);
    }
    Ok(Page { items, total })
}

#[tauri::command]
pub fn get_user(state: State<'_, AppState>, user_id: i64) -> AppResult<PublicUser> {
    state.require_permission("VIEW_USERS")?;
    auth::public_user(&state.db, user_id)
}

// ===== Käyttäjien luonti =====

#[tauri::command]
pub async fn admin_create_user(
    state: State<'_, AppState>,
    input: CreateUserInput,
) -> AppResult<PublicUser> {
    let ctx = state.require_auth()?;
    let db = &state.db;

    if !util::valid_role(&input.role) {
        return Err(AppError::validation("role", "invalid"));
    }

    // Etuoikeutettujen roolien luonti on vain omistajalla.
    if rbac::is_privileged(&input.role) {
        if ctx.role != rbac::ROLE_OWNER {
            return Err(AppError::Forbidden);
        }
        rbac::require_permission(db, ctx.user_id, &ctx.role, "MANAGE_ADMINS")?;
    } else {
        rbac::require_permission(db, ctx.user_id, &ctx.role, "EDIT_USERS")?;
    }
    if !rbac::can_assign_role(&ctx.role, &input.role) {
        return Err(AppError::Forbidden);
    }

    // Joko väliaikainen salasana tai kutsukoodi — ei molempia.
    let temp_password = input.password.as_deref().filter(|p| !p.is_empty());
    if temp_password.is_none() && !input.send_invite {
        return Err(AppError::validation("password", "required"));
    }

    let user_id = auth::create_user(
        db,
        auth::NewUser {
            username: &input.username,
            email: &input.email,
            password: temp_password,
            role: &input.role,
            email_verified: input.mark_verified,
            must_change_password: input.require_password_change && temp_password.is_some(),
            language: "fi",
        },
    )?;

    audit::log(
        db,
        audit::Event::new(
            if rbac::is_privileged(&input.role) {
                "ADMIN_CREATED"
            } else {
                "ACCOUNT_CREATED"
            },
            audit::CAT_ADMIN,
        )
        .severity(if rbac::is_privileged(&input.role) {
            audit::SEV_CRITICAL
        } else {
            audit::SEV_NOTICE
        })
        .actor(ctx.user_id, ctx.username.clone())
        .target(user_id, input.username.clone())
        .meta(serde_json::json!({
            "role": input.role,
            "invite": input.send_invite,
            "verified": input.mark_verified
        })),
    );

    if input.send_invite {
        let code = auth::tokens::issue(db, user_id, auth::tokens::KIND_INVITE, 7 * 86_400)?;
        if email::is_configured(db) {
            let mail = email::invite_mail(
                &input.email,
                &input.username,
                &input.role,
                &code.token,
                "fi",
            );
            let _ = email::send(db, mail).await;
        }
    }

    auth::public_user(db, user_id)
}

// ===== Käyttäjän muokkaus =====

fn load_target(state: &AppState, user_id: i64) -> AppResult<auth::UserRow> {
    auth::find_by_id(&state.db, user_id)?.ok_or(AppError::NotFound)
}

fn ensure_can_manage(ctx: &crate::state::AuthContext, target: &auth::UserRow) -> AppResult<()> {
    if !rbac::can_manage_user(&ctx.role, ctx.user_id, &target.role, target.id) {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

#[tauri::command]
pub fn set_user_role(
    state: State<'_, AppState>,
    user_id: i64,
    role: String,
) -> AppResult<PublicUser> {
    let ctx = state.require_permission("MANAGE_ROLES")?;
    let target = load_target(&state, user_id)?;
    ensure_can_manage(&ctx, &target)?;

    if !rbac::can_assign_role(&ctx.role, &role) {
        return Err(AppError::Forbidden);
    }
    if target.role == rbac::ROLE_OWNER && role != rbac::ROLE_OWNER {
        rbac::ensure_not_last_owner(&state.db, user_id)?;
    }
    if ctx.user_id == user_id && role != ctx.role {
        // Oman roolin alentaminen estetään vahingossa tapahtuvan lukituksen takia.
        return Err(AppError::Conflict("cannot_change_own_role".into()));
    }

    state.db.with(|c| {
        c.execute(
            "UPDATE users SET role = ?1, updated_at = ?2 WHERE id = ?3",
            params![role, util::now(), user_id],
        )?;
        Ok(())
    })?;

    audit::log(
        &state.db,
        audit::Event::new("ROLE_CHANGED", audit::CAT_ADMIN)
            .severity(audit::SEV_CRITICAL)
            .actor(ctx.user_id, ctx.username.clone())
            .target(user_id, target.username.clone())
            .meta(serde_json::json!({ "from": target.role, "to": role })),
    );
    auth::public_user(&state.db, user_id)
}

#[tauri::command]
pub fn set_user_status(
    state: State<'_, AppState>,
    user_id: i64,
    enabled: bool,
) -> AppResult<PublicUser> {
    let ctx = state.require_permission("EDIT_USERS")?;
    let target = load_target(&state, user_id)?;
    ensure_can_manage(&ctx, &target)?;
    if !enabled {
        rbac::ensure_not_last_owner(&state.db, user_id)?;
        if ctx.user_id == user_id {
            return Err(AppError::Conflict("cannot_disable_self".into()));
        }
    }

    let status = if enabled { "ACTIVE" } else { "DISABLED" };
    state.db.with(|c| {
        c.execute(
            "UPDATE users SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, util::now(), user_id],
        )?;
        Ok(())
    })?;
    if !enabled {
        let _ = auth::session::revoke_all(&state.db, user_id, None);
    }

    audit::log(
        &state.db,
        audit::Event::new(
            if enabled {
                "ACCOUNT_ENABLED"
            } else {
                "ACCOUNT_DISABLED"
            },
            audit::CAT_ADMIN,
        )
        .severity(audit::SEV_WARNING)
        .actor(ctx.user_id, ctx.username.clone())
        .target(user_id, target.username.clone()),
    );
    auth::public_user(&state.db, user_id)
}

#[tauri::command]
pub fn set_user_lock(
    state: State<'_, AppState>,
    user_id: i64,
    locked: bool,
) -> AppResult<PublicUser> {
    let ctx = state.require_permission("EDIT_USERS")?;
    let target = load_target(&state, user_id)?;
    ensure_can_manage(&ctx, &target)?;

    let until = if locked {
        Some(util::now() + settings::get_i64(&state.db, settings::LOCKOUT_MINUTES, 1, 10_080) * 60)
    } else {
        None
    };

    state.db.with(|c| {
        c.execute(
            "UPDATE users SET locked_until = ?1, failed_logins = 0, updated_at = ?2 WHERE id = ?3",
            params![until, util::now(), user_id],
        )?;
        Ok(())
    })?;

    audit::log(
        &state.db,
        audit::Event::new(
            if locked {
                "ACCOUNT_LOCKED"
            } else {
                "ACCOUNT_UNLOCKED"
            },
            audit::CAT_SECURITY,
        )
        .severity(audit::SEV_WARNING)
        .actor(ctx.user_id, ctx.username.clone())
        .target(user_id, target.username.clone()),
    );
    auth::public_user(&state.db, user_id)
}

#[tauri::command]
pub fn verify_user_email(state: State<'_, AppState>, user_id: i64) -> AppResult<PublicUser> {
    let ctx = state.require_permission("EDIT_USERS")?;
    let target = load_target(&state, user_id)?;
    ensure_can_manage(&ctx, &target)?;

    state.db.with(|c| {
        c.execute(
            "UPDATE users SET email_verified = 1, updated_at = ?1 WHERE id = ?2",
            params![util::now(), user_id],
        )?;
        Ok(())
    })?;
    audit::log(
        &state.db,
        audit::Event::new("EMAIL_VERIFIED", audit::CAT_ADMIN)
            .severity(audit::SEV_NOTICE)
            .actor(ctx.user_id, ctx.username.clone())
            .target(user_id, target.username.clone())
            .meta(serde_json::json!({ "by_admin": true })),
    );
    auth::public_user(&state.db, user_id)
}

#[tauri::command]
pub async fn admin_send_verification(state: State<'_, AppState>, user_id: i64) -> AppResult<()> {
    state.require_permission("EDIT_USERS")?;
    let target = load_target(&state, user_id)?;
    if !email::is_configured(&state.db) {
        return Err(AppError::EmailNotConfigured);
    }
    let hours = settings::get_i64(&state.db, settings::VERIFY_TOKEN_HOURS, 1, 168);
    let issued = auth::tokens::issue(&state.db, user_id, auth::tokens::KIND_VERIFY, hours * 3_600)?;
    let mail = email::verification_mail(
        &target.email,
        &target.username,
        &issued.token,
        hours,
        &target.language,
    );
    email::send(&state.db, mail).await
}

#[tauri::command]
pub async fn admin_reset_password(state: State<'_, AppState>, user_id: i64) -> AppResult<()> {
    let ctx = state.require_permission("RESET_PASSWORDS")?;
    let target = load_target(&state, user_id)?;
    ensure_can_manage(&ctx, &target)?;
    if !email::is_configured(&state.db) {
        return Err(AppError::EmailNotConfigured);
    }

    let minutes = settings::get_i64(&state.db, settings::RESET_TOKEN_MINUTES, 5, 1440);
    let issued = auth::tokens::issue(&state.db, user_id, auth::tokens::KIND_RESET, minutes * 60)?;
    let mail = email::reset_mail(
        &target.email,
        &target.username,
        &issued.token,
        minutes,
        &target.language,
    );
    email::send(&state.db, mail).await?;

    audit::log(
        &state.db,
        audit::Event::new("ADMIN_ACTION", audit::CAT_ADMIN)
            .severity(audit::SEV_WARNING)
            .actor(ctx.user_id, ctx.username.clone())
            .target(user_id, target.username.clone())
            .meta(serde_json::json!({ "action": "password_reset_sent" })),
    );
    Ok(())
}

#[tauri::command]
pub fn force_password_change(state: State<'_, AppState>, user_id: i64) -> AppResult<PublicUser> {
    let ctx = state.require_permission("RESET_PASSWORDS")?;
    let target = load_target(&state, user_id)?;
    ensure_can_manage(&ctx, &target)?;

    state.db.with(|c| {
        c.execute(
            "UPDATE users SET must_change_password = 1, updated_at = ?1 WHERE id = ?2",
            params![util::now(), user_id],
        )?;
        Ok(())
    })?;
    let _ = auth::session::revoke_all(&state.db, user_id, None);

    audit::log(
        &state.db,
        audit::Event::new("ADMIN_ACTION", audit::CAT_ADMIN)
            .severity(audit::SEV_WARNING)
            .actor(ctx.user_id, ctx.username.clone())
            .target(user_id, target.username.clone())
            .meta(serde_json::json!({ "action": "force_password_change" })),
    );
    auth::public_user(&state.db, user_id)
}

#[tauri::command]
pub fn revoke_user_sessions(state: State<'_, AppState>, user_id: i64) -> AppResult<usize> {
    let ctx = state.require_permission("EDIT_USERS")?;
    let target = load_target(&state, user_id)?;
    ensure_can_manage(&ctx, &target)?;
    let n = auth::session::revoke_all(&state.db, user_id, None)?;
    audit::log(
        &state.db,
        audit::Event::new("SESSIONS_REVOKED", audit::CAT_ADMIN)
            .severity(audit::SEV_NOTICE)
            .actor(ctx.user_id, ctx.username.clone())
            .target(user_id, target.username.clone())
            .meta(serde_json::json!({ "count": n })),
    );
    Ok(n)
}

#[tauri::command]
pub fn delete_user(state: State<'_, AppState>, user_id: i64) -> AppResult<()> {
    let ctx = state.require_permission("DELETE_USERS")?;
    let target = load_target(&state, user_id)?;
    ensure_can_manage(&ctx, &target)?;
    rbac::ensure_not_last_owner(&state.db, user_id)?;
    if ctx.user_id == user_id {
        return Err(AppError::Conflict("cannot_delete_self".into()));
    }
    // Vain omistaja voi poistaa etuoikeutetun tilin.
    if rbac::is_privileged(&target.role) && ctx.role != rbac::ROLE_OWNER {
        return Err(AppError::Forbidden);
    }

    state.db.with(|c| {
        c.execute("DELETE FROM users WHERE id = ?1", params![user_id])?;
        Ok(())
    })?;
    let _ = secrets::delete(&secrets::totp_key(user_id));

    audit::log(
        &state.db,
        audit::Event::new("ACCOUNT_DELETED", audit::CAT_ADMIN)
            .severity(audit::SEV_CRITICAL)
            .actor(ctx.user_id, ctx.username.clone())
            .target(user_id, target.username.clone())
            .meta(serde_json::json!({ "role": target.role })),
    );
    Ok(())
}

// ===== Oikeudet =====

#[tauri::command]
pub fn list_permissions(
    state: State<'_, AppState>,
    user_id: i64,
) -> AppResult<Vec<PermissionInfo>> {
    state.require_permission("VIEW_USERS")?;
    let target = load_target(&state, user_id)?;
    let effective = rbac::effective_permissions(&state.db, user_id, &target.role)?;

    let role_perms: Vec<String> = state.db.with(|c| {
        let mut stmt = c.prepare("SELECT permission FROM role_permissions WHERE role = ?1")?;
        let it = stmt.query_map(params![target.role], |r| r.get::<_, String>(0))?;
        let mut out = Vec::new();
        for row in it {
            out.push(row?);
        }
        Ok(out)
    })?;

    Ok(crate::db::migrations::all_permissions()
        .into_iter()
        .map(|(name, desc)| PermissionInfo {
            granted: target.role == rbac::ROLE_OWNER || effective.iter().any(|p| p == name),
            from_role: target.role == rbac::ROLE_OWNER || role_perms.iter().any(|p| p == name),
            name: name.to_string(),
            description: desc.to_string(),
        })
        .collect())
}

#[tauri::command]
pub fn set_user_permission(
    state: State<'_, AppState>,
    user_id: i64,
    permission: String,
    granted: bool,
) -> AppResult<()> {
    // Vain omistaja voi muokata yksittäisiä oikeuksia.
    let ctx = state.require_owner()?;
    let target = load_target(&state, user_id)?;
    if target.role == rbac::ROLE_OWNER {
        return Err(AppError::Conflict("owner_has_all".into()));
    }
    if !crate::db::migrations::all_permissions()
        .iter()
        .any(|(n, _)| *n == permission)
    {
        return Err(AppError::validation("permission", "unknown"));
    }

    state.db.with(|c| {
        c.execute(
            "INSERT INTO user_permissions (user_id, permission, granted) VALUES (?1, ?2, ?3)
             ON CONFLICT(user_id, permission) DO UPDATE SET granted = excluded.granted",
            params![user_id, permission, granted as i64],
        )?;
        Ok(())
    })?;

    audit::log(
        &state.db,
        audit::Event::new("PERMISSION_CHANGED", audit::CAT_ADMIN)
            .severity(audit::SEV_CRITICAL)
            .actor(ctx.user_id, ctx.username.clone())
            .target(user_id, target.username.clone())
            .meta(serde_json::json!({ "permission": permission, "granted": granted })),
    );
    Ok(())
}

// ===== Audit =====

#[tauri::command]
pub fn audit_list(state: State<'_, AppState>, filter: AuditFilter) -> AppResult<Page<AuditEntry>> {
    state.require_permission("VIEW_AUDIT_LOGS")?;
    audit::query(&state.db, &filter)
}

#[tauri::command]
pub fn audit_export(state: State<'_, AppState>, filter: AuditFilter) -> AppResult<String> {
    let ctx = state.require_permission("VIEW_AUDIT_LOGS")?;
    let mut f = filter;
    f.limit = 5000;
    let page = audit::query(&state.db, &f)?;
    audit::log(
        &state.db,
        audit::Event::new("ADMIN_ACTION", audit::CAT_ADMIN)
            .actor(ctx.user_id, ctx.username.clone())
            .meta(serde_json::json!({ "action": "audit_export", "rows": page.items.len() })),
    );
    let mut out = String::from("aika;tapahtuma;vakavuus;luokka;tulos;tekija;kohde;versio\n");
    for e in page.items {
        let ts = chrono::DateTime::from_timestamp(e.ts, 0)
            .map(|d| d.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_default();
        out.push_str(&format!(
            "{};{};{};{};{};{};{};{}\n",
            ts,
            e.event,
            e.severity,
            e.category,
            e.result,
            e.actor_name.unwrap_or_default(),
            e.target_name.unwrap_or_default(),
            e.app_version.unwrap_or_default()
        ));
    }
    Ok(out)
}

#[tauri::command]
pub fn audit_prune(state: State<'_, AppState>, keep_days: i64) -> AppResult<usize> {
    let ctx = state.require_owner()?;
    let days = keep_days.clamp(30, 3650);
    let n = audit::prune(&state.db, days)?;
    audit::log(
        &state.db,
        audit::Event::new("ADMIN_ACTION", audit::CAT_ADMIN)
            .severity(audit::SEV_WARNING)
            .actor(ctx.user_id, ctx.username.clone())
            .meta(serde_json::json!({ "action": "audit_prune", "removed": n, "keep_days": days })),
    );
    Ok(n)
}

// ===== Sähköpostiasetukset =====

#[tauri::command]
pub fn email_status(state: State<'_, AppState>) -> AppResult<EmailStatus> {
    state.require_permission("MANAGE_EMAIL")?;
    Ok(email::status(&state.db))
}

#[tauri::command]
pub fn email_configure(
    state: State<'_, AppState>,
    api_key: Option<String>,
    sender_name: Option<String>,
    sender_email: Option<String>,
) -> AppResult<EmailStatus> {
    let ctx = state.require_permission("MANAGE_EMAIL")?;

    if let Some(key) = api_key.as_ref().map(|k| k.trim()).filter(|k| !k.is_empty()) {
        if !key.starts_with("re_") || key.len() < 16 {
            return Err(AppError::validation("apiKey", "invalid_format"));
        }
        secrets::set(secrets::RESEND_API_KEY, key)?;
    }
    if let Some(name) = sender_name {
        settings::set(
            &state.db,
            settings::EMAIL_SENDER_NAME,
            &util::sanitize_line(&name, 64),
            Some(ctx.user_id),
        )?;
    }
    if let Some(addr) = sender_email {
        let validated = util::validate_email(&addr)?;
        settings::set(
            &state.db,
            settings::EMAIL_SENDER_ADDRESS,
            &validated,
            Some(ctx.user_id),
        )?;
    }

    audit::log(
        &state.db,
        audit::Event::new("SETTINGS_CHANGED", audit::CAT_ADMIN)
            .severity(audit::SEV_NOTICE)
            .actor(ctx.user_id, ctx.username.clone())
            .meta(serde_json::json!({ "area": "email", "apiKeyUpdated": api_key.is_some() })),
    );
    Ok(email::status(&state.db))
}

#[tauri::command]
pub fn email_clear_key(state: State<'_, AppState>) -> AppResult<EmailStatus> {
    let ctx = state.require_permission("MANAGE_EMAIL")?;
    secrets::delete(secrets::RESEND_API_KEY)?;
    audit::log(
        &state.db,
        audit::Event::new("SETTINGS_CHANGED", audit::CAT_ADMIN)
            .severity(audit::SEV_WARNING)
            .actor(ctx.user_id, ctx.username.clone())
            .meta(serde_json::json!({ "area": "email", "action": "api_key_removed" })),
    );
    Ok(email::status(&state.db))
}

#[tauri::command]
pub async fn email_test(state: State<'_, AppState>, to: String) -> AppResult<()> {
    let ctx = state.require_permission("MANAGE_EMAIL")?;
    let address = util::validate_email(&to)?;
    crate::auth::ratelimit::check(&state.db, "email:test", &crate::auth::ratelimit::EMAIL_SEND)?;
    let result = email::send(&state.db, email::test_mail(&address)).await;
    audit::log(
        &state.db,
        audit::Event::new("EMAIL_TEST", audit::CAT_ADMIN)
            .actor(ctx.user_id, ctx.username.clone())
            .meta(serde_json::json!({ "ok": result.is_ok() })),
    );
    result
}

// ===== Discord =====

#[tauri::command]
pub fn discord_status(state: State<'_, AppState>) -> AppResult<DiscordStatus> {
    state.require_permission("MANAGE_DISCORD")?;
    Ok(discord::status(&state.db))
}

#[tauri::command]
pub fn discord_configure(
    state: State<'_, AppState>,
    webhook: Option<String>,
    enabled: Option<bool>,
    level: Option<String>,
) -> AppResult<DiscordStatus> {
    let ctx = state.require_permission("MANAGE_DISCORD")?;

    if let Some(url) = webhook.as_ref().map(|w| w.trim()).filter(|w| !w.is_empty()) {
        let parsed =
            url::Url::parse(url).map_err(|_| AppError::validation("webhook", "invalid"))?;
        let host = parsed.host_str().unwrap_or_default();
        if parsed.scheme() != "https"
            || !(host == "discord.com"
                || host == "discordapp.com"
                || host.ends_with(".discord.com"))
        {
            return Err(AppError::validation("webhook", "not_discord"));
        }
        secrets::set(secrets::DISCORD_WEBHOOK, url)?;
    }
    if let Some(on) = enabled {
        settings::set_bool(&state.db, settings::DISCORD_ENABLED, on, Some(ctx.user_id))?;
    }
    if let Some(lvl) = level {
        if !matches!(
            lvl.as_str(),
            "AUTH" | "SECURITY" | "ADMIN" | "SYSTEM" | "ALL"
        ) {
            return Err(AppError::validation("level", "invalid"));
        }
        settings::set(&state.db, settings::DISCORD_LEVEL, &lvl, Some(ctx.user_id))?;
    }

    audit::log(
        &state.db,
        audit::Event::new("SETTINGS_CHANGED", audit::CAT_ADMIN)
            .severity(audit::SEV_NOTICE)
            .actor(ctx.user_id, ctx.username.clone())
            .meta(serde_json::json!({ "area": "discord", "webhookUpdated": webhook.is_some() })),
    );
    Ok(discord::status(&state.db))
}

#[tauri::command]
pub fn discord_clear(state: State<'_, AppState>) -> AppResult<DiscordStatus> {
    let ctx = state.require_permission("MANAGE_DISCORD")?;
    secrets::delete(secrets::DISCORD_WEBHOOK)?;
    settings::set_bool(
        &state.db,
        settings::DISCORD_ENABLED,
        false,
        Some(ctx.user_id),
    )?;
    Ok(discord::status(&state.db))
}

#[tauri::command]
pub async fn discord_test(state: State<'_, AppState>) -> AppResult<()> {
    state.require_permission("MANAGE_DISCORD")?;
    let url =
        secrets::get(secrets::DISCORD_WEBHOOK).ok_or(AppError::validation("webhook", "missing"))?;
    let path = state.db.path.clone();
    discord::send_test(path, url).await
}

// ===== Google =====

#[tauri::command]
pub fn google_status(state: State<'_, AppState>) -> AppResult<GoogleStatus> {
    state.require_permission("MANAGE_SECURITY")?;
    Ok(GoogleStatus {
        enabled: settings::get_bool(&state.db, settings::GOOGLE_LOGIN_ENABLED),
        configured: auth::oauth::is_configured(),
        client_id_masked: auth::oauth::client_id().as_deref().map(util::mask_secret),
    })
}

#[tauri::command]
pub fn google_configure(
    state: State<'_, AppState>,
    client_id: Option<String>,
    client_secret: Option<String>,
    enabled: Option<bool>,
) -> AppResult<GoogleStatus> {
    let ctx = state.require_permission("MANAGE_SECURITY")?;

    if let Some(id) = client_id
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        if !id.ends_with(".apps.googleusercontent.com") {
            return Err(AppError::validation("clientId", "invalid_format"));
        }
        secrets::set(secrets::GOOGLE_CLIENT_ID, id)?;
    }
    if let Some(sec) = client_secret
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        if sec.len() < 10 {
            return Err(AppError::validation("clientSecret", "invalid_format"));
        }
        secrets::set(secrets::GOOGLE_CLIENT_SECRET, sec)?;
    }
    if let Some(on) = enabled {
        if on && !auth::oauth::is_configured() {
            return Err(AppError::OAuthNotConfigured);
        }
        settings::set_bool(
            &state.db,
            settings::GOOGLE_LOGIN_ENABLED,
            on,
            Some(ctx.user_id),
        )?;
    }

    audit::log(
        &state.db,
        audit::Event::new("SETTINGS_CHANGED", audit::CAT_SECURITY)
            .severity(audit::SEV_CRITICAL)
            .actor(ctx.user_id, ctx.username.clone())
            .meta(serde_json::json!({ "area": "google_oauth" })),
    );
    Ok(GoogleStatus {
        enabled: settings::get_bool(&state.db, settings::GOOGLE_LOGIN_ENABLED),
        configured: auth::oauth::is_configured(),
        client_id_masked: auth::oauth::client_id().as_deref().map(util::mask_secret),
    })
}

#[tauri::command]
pub fn google_clear(state: State<'_, AppState>) -> AppResult<()> {
    let ctx = state.require_permission("MANAGE_SECURITY")?;
    secrets::delete(secrets::GOOGLE_CLIENT_ID)?;
    secrets::delete(secrets::GOOGLE_CLIENT_SECRET)?;
    settings::set_bool(
        &state.db,
        settings::GOOGLE_LOGIN_ENABLED,
        false,
        Some(ctx.user_id),
    )?;
    Ok(())
}

// ===== Asetukset =====

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppResult<serde_json::Value> {
    state.require_permission("MANAGE_SETTINGS")?;
    settings::all(&state.db)
}

#[tauri::command]
pub fn set_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> AppResult<serde_json::Value> {
    let ctx = state.require_permission("MANAGE_SETTINGS")?;
    if !settings::is_writable(&key) {
        return Err(AppError::validation("key", "not_writable"));
    }
    // Turvallisuusasetukset vaativat erillisen oikeuden.
    if key.starts_with("security.") {
        rbac::require_permission(&state.db, ctx.user_id, &ctx.role, "MANAGE_SECURITY")?;
    }
    let clean = util::sanitize_line(&value, 200);
    settings::set(&state.db, &key, &clean, Some(ctx.user_id))?;

    audit::log(
        &state.db,
        audit::Event::new("SETTINGS_CHANGED", audit::CAT_ADMIN)
            .severity(audit::SEV_NOTICE)
            .actor(ctx.user_id, ctx.username.clone())
            .meta(serde_json::json!({ "key": key, "value": clean })),
    );
    settings::all(&state.db)
}

// ===== Järjestelmä ja varmuuskopiot =====

#[tauri::command]
pub fn system_info(state: State<'_, AppState>) -> AppResult<serde_json::Value> {
    state.require_permission("MANAGE_SYSTEM")?;
    let db_stats = state.db.stats()?;
    Ok(serde_json::json!({
        "appVersion": util::app_version(),
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "startedAt": state.started_at,
        "database": db_stats,
        "email": email::status(&state.db),
        "discord": discord::status(&state.db),
        "googleConfigured": auth::oauth::is_configured()
    }))
}

#[tauri::command]
pub fn backup_list(state: State<'_, AppState>) -> AppResult<Vec<BackupRow>> {
    state.require_permission("MANAGE_SYSTEM")?;
    backup::list(&state.db)
}

#[tauri::command]
pub fn backup_create(app: tauri::AppHandle, state: State<'_, AppState>) -> AppResult<BackupRow> {
    let ctx = state.require_permission("MANAGE_SYSTEM")?;
    let dir = app_data_dir(&app)?;
    backup::create(
        &state.db,
        &dir,
        "MANUAL",
        Some((ctx.user_id, ctx.username.clone())),
    )
}

#[tauri::command]
pub fn backup_restore(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> AppResult<()> {
    let ctx = state.require_owner()?;
    let dir = app_data_dir(&app)?;
    let db_path = state.db.path.clone();

    audit::log(
        &state.db,
        audit::Event::new("BACKUP_RESTORED", audit::CAT_SYSTEM)
            .severity(audit::SEV_CRITICAL)
            .actor(ctx.user_id, ctx.username.clone())
            .meta(serde_json::json!({ "source": util::sanitize_line(&path, 200) })),
    );

    backup::restore(&db_path, std::path::Path::new(&path), &dir)?;
    Ok(())
}

#[tauri::command]
pub fn database_stats(state: State<'_, AppState>) -> AppResult<DbStats> {
    state.require_permission("MANAGE_SYSTEM")?;
    state.db.stats()
}
