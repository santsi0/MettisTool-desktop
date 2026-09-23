//! Istunnot.
//!
//! Istuntotokenista tallennetaan vain SHA-256-tiiviste. Käyttöliittymä ei koskaan
//! näe tokenia: aktiivinen istunto pidetään Rustin muistissa, ja "muista minut"
//! -token säilytetään käyttöjärjestelmän avainsäilössä.

use crate::db::models::SessionRow;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::util::{now, random_token, sha256_hex};
use rusqlite::params;

pub struct NewSession {
    pub id: i64,
    pub token: String,
    pub expires_at: i64,
}

pub struct ValidSession {
    pub id: i64,
    pub user_id: i64,
    pub expires_at: i64,
}

pub fn create(db: &Db, user_id: i64, remember: bool, device: &str, hours: i64, remember_days: i64) -> AppResult<NewSession> {
    let token = random_token(32);
    let hash = sha256_hex(&token);
    let ts = now();
    let expires = if remember {
        ts + remember_days * 86_400
    } else {
        ts + hours * 3_600
    };

    let id = db.with(|c| {
        c.execute(
            "INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_seen_at, remember, device)
             VALUES (?1, ?2, ?3, ?4, ?3, ?5, ?6)",
            params![user_id, hash, ts, expires, remember as i64, device],
        )?;
        Ok(c.last_insert_rowid())
    })?;

    Ok(NewSession {
        id,
        token,
        expires_at: expires,
    })
}

pub fn validate(db: &Db, raw_token: &str) -> AppResult<ValidSession> {
    let hash = sha256_hex(raw_token);
    let ts = now();

    let found: Option<(i64, i64, i64, Option<i64>)> = db.with(|c| {
        Ok(c.query_row(
            "SELECT id, user_id, expires_at, revoked_at FROM sessions WHERE token_hash = ?1",
            params![hash],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .ok())
    })?;

    let (id, user_id, expires_at, revoked_at) = found.ok_or(AppError::NotAuthenticated)?;
    if revoked_at.is_some() || expires_at < ts {
        return Err(AppError::NotAuthenticated);
    }

    db.with(|c| {
        c.execute(
            "UPDATE sessions SET last_seen_at = ?1 WHERE id = ?2",
            params![ts, id],
        )?;
        Ok(())
    })?;

    Ok(ValidSession {
        id,
        user_id,
        expires_at,
    })
}

pub fn touch(db: &Db, session_id: i64) {
    let _ = db.with(|c| {
        c.execute(
            "UPDATE sessions SET last_seen_at = ?1 WHERE id = ?2",
            params![now(), session_id],
        )?;
        Ok(())
    });
}

pub fn revoke(db: &Db, session_id: i64) -> AppResult<()> {
    db.with(|c| {
        c.execute(
            "UPDATE sessions SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL",
            params![now(), session_id],
        )?;
        Ok(())
    })
}

pub fn revoke_all(db: &Db, user_id: i64, except: Option<i64>) -> AppResult<usize> {
    db.with(|c| {
        let n = match except {
            Some(keep) => c.execute(
                "UPDATE sessions SET revoked_at = ?1 WHERE user_id = ?2 AND id != ?3 AND revoked_at IS NULL",
                params![now(), user_id, keep],
            )?,
            None => c.execute(
                "UPDATE sessions SET revoked_at = ?1 WHERE user_id = ?2 AND revoked_at IS NULL",
                params![now(), user_id],
            )?,
        };
        Ok(n)
    })
}

pub fn list(db: &Db, user_id: i64, current: Option<i64>) -> AppResult<Vec<SessionRow>> {
    db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT id, created_at, last_seen_at, expires_at, device
             FROM sessions
             WHERE user_id = ?1 AND revoked_at IS NULL AND expires_at > ?2
             ORDER BY last_seen_at DESC",
        )?;
        let it = stmt.query_map(params![user_id, now()], |r| {
            let id: i64 = r.get(0)?;
            Ok(SessionRow {
                id,
                created_at: r.get(1)?,
                last_seen_at: r.get(2)?,
                expires_at: r.get(3)?,
                device: r.get(4)?,
                current: Some(id) == current,
            })
        })?;
        let mut out = Vec::new();
        for row in it {
            out.push(row?);
        }
        Ok(out)
    })
}

pub fn cleanup(db: &Db) {
    let _ = db.with(|c| {
        c.execute(
            "DELETE FROM sessions WHERE expires_at < ?1 OR (revoked_at IS NOT NULL AND revoked_at < ?1)",
            params![now() - 7 * 86_400],
        )?;
        Ok(())
    });
}
