//! Kutsurajoitus liukuvalla aikaikkunalla.
//!
//! Suojaa kirjautumisen arvailulta, sähköpostien massalähetykseltä ja
//! palautuslinkkien väärinkäytöltä.

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::util::now;
use rusqlite::params;

pub struct Limit {
    pub max: i64,
    pub window: i64,
}

pub const LOGIN: Limit = Limit { max: 10, window: 300 };
pub const REGISTER: Limit = Limit { max: 5, window: 3_600 };
pub const VERIFY_RESEND: Limit = Limit { max: 3, window: 900 };
pub const PASSWORD_RESET: Limit = Limit { max: 3, window: 900 };
pub const EMAIL_SEND: Limit = Limit { max: 30, window: 3_600 };
pub const TOTP_ATTEMPT: Limit = Limit { max: 8, window: 300 };
pub const OAUTH: Limit = Limit { max: 10, window: 600 };

/// Kirjaa yrityksen ja palauttaa virheen jos raja ylittyy.
pub fn check(db: &Db, key: &str, limit: &Limit) -> AppResult<()> {
    let ts = now();
    db.with_mut(|c| {
        let tx = c.transaction()?;
        let row: Option<(i64, i64)> = tx
            .query_row(
                "SELECT window_start, count FROM rate_limits WHERE key = ?1",
                params![key],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .ok();

        let (start, count) = match row {
            Some((s, n)) if ts - s < limit.window => (s, n),
            _ => (ts, 0),
        };

        if count >= limit.max {
            let retry = (start + limit.window - ts).max(1);
            tx.commit()?;
            return Err(AppError::RateLimited { retry_after: retry });
        }

        tx.execute(
            "INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
             ON CONFLICT(key) DO UPDATE SET window_start = ?2, count = ?3",
            params![key, start, count + 1],
        )?;
        tx.commit()?;
        Ok(())
    })
}

/// Nollaa laskurin onnistuneen toiminnon jälkeen.
pub fn reset(db: &Db, key: &str) {
    let _ = db.with(|c| {
        c.execute("DELETE FROM rate_limits WHERE key = ?1", params![key])?;
        Ok(())
    });
}

pub fn cleanup(db: &Db) {
    let _ = db.with(|c| {
        c.execute(
            "DELETE FROM rate_limits WHERE window_start < ?1",
            params![now() - 86_400],
        )?;
        Ok(())
    });
}
