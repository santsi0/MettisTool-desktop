//! Tietokantayhteys ja mallit.

pub mod migrations;
pub mod models;

use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

pub struct Db {
    conn: Mutex<Connection>,
    pub path: std::path::PathBuf,
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let mut conn = Connection::open(path)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "trusted_schema", "OFF")?;
        migrations::run(&mut conn)?;
        Ok(Db {
            conn: Mutex::new(conn),
            path: path.to_path_buf(),
        })
    }

    /// Lukitse yhteys. Lukkoa ei saa pitää `await`-pisteen yli.
    pub fn lock(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|_| AppError::Internal("tietokannan lukko rikki".into()))
    }

    pub fn with<T>(&self, f: impl FnOnce(&Connection) -> AppResult<T>) -> AppResult<T> {
        let guard = self.lock()?;
        f(&guard)
    }

    pub fn with_mut<T>(&self, f: impl FnOnce(&mut Connection) -> AppResult<T>) -> AppResult<T> {
        let mut guard = self.lock()?;
        f(&mut guard)
    }

    /// Eheystarkistus ja tilastot ylläpitonäkymää varten.
    pub fn stats(&self) -> AppResult<models::DbStats> {
        self.with(|c| {
            let page_count: i64 = c.query_row("PRAGMA page_count", [], |r| r.get(0))?;
            let page_size: i64 = c.query_row("PRAGMA page_size", [], |r| r.get(0))?;
            let integrity: String = c
                .query_row("PRAGMA quick_check(1)", [], |r| r.get(0))
                .unwrap_or_else(|_| "unknown".into());
            let users: i64 = c.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))?;
            let audit: i64 = c.query_row("SELECT COUNT(*) FROM audit_log", [], |r| r.get(0))?;
            let sessions: i64 = c.query_row(
                "SELECT COUNT(*) FROM sessions WHERE revoked_at IS NULL AND expires_at > ?1",
                rusqlite::params![crate::util::now()],
                |r| r.get(0),
            )?;
            Ok(models::DbStats {
                size_bytes: page_count * page_size,
                integrity_ok: integrity == "ok",
                users,
                audit_entries: audit,
                active_sessions: sessions,
                schema_version: migrations::CURRENT_VERSION,
                path: self.path.to_string_lossy().to_string(),
            })
        })
    }
}
