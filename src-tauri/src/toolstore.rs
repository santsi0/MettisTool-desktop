//! Paikallinen työkaludata.
//!
//! Versiossa 2 tämä on ainoa asia, joka jää käyttäjän koneelle: muistiinpanot,
//! tehtävät, suosikit ja keskeneräiset syötteet. Tilit, roolit, audit-loki ja
//! asetukset ovat Supabasessa.
//!
//! Käyttäjä tunnistetaan Supabasen UUID:llä. Tiedosto on eri kuin version 1
//! `mettistool.db`, joten vanha data jää koskemattomana talteen.

use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS tool_state (
    user_id    TEXT    NOT NULL,
    key        TEXT    NOT NULL,
    value      TEXT    NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS tool_usage (
    user_id   TEXT    NOT NULL,
    tool_id   TEXT    NOT NULL,
    uses      INTEGER NOT NULL DEFAULT 0,
    last_used INTEGER,
    favorite  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_usage_user ON tool_usage(user_id, last_used DESC);
";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolUsageRow {
    pub tool_id: String,
    pub uses: i64,
    pub last_used: Option<i64>,
    pub favorite: bool,
}

pub struct ToolStore {
    conn: Mutex<Connection>,
}

impl ToolStore {
    pub fn open(path: &Path) -> AppResult<ToolStore> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let conn = Connection::open(path)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.execute_batch(SCHEMA)?;
        Ok(ToolStore {
            conn: Mutex::new(conn),
        })
    }

    fn lock(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|_| AppError::Internal("työkalutietokannan lukko rikki".into()))
    }

    // ===== Työkalujen oma tila =====

    pub fn get(&self, user: &str, key: &str) -> AppResult<Option<String>> {
        let c = self.lock()?;
        let mut stmt = c.prepare("SELECT value FROM tool_state WHERE user_id = ?1 AND key = ?2")?;
        let mut rows = stmt.query(params![user, key])?;
        match rows.next()? {
            Some(r) => Ok(Some(r.get(0)?)),
            None => Ok(None),
        }
    }

    pub fn set(&self, user: &str, key: &str, value: &str) -> AppResult<()> {
        let c = self.lock()?;
        c.execute(
            "INSERT INTO tool_state (user_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![user, key, value, crate::util::now()],
        )?;
        Ok(())
    }

    pub fn delete(&self, user: &str, key: &str) -> AppResult<()> {
        let c = self.lock()?;
        c.execute(
            "DELETE FROM tool_state WHERE user_id = ?1 AND key = ?2",
            params![user, key],
        )?;
        Ok(())
    }

    /// Arvot palautetaan sellaisenaan. Käyttöliittymä tallensi ne
    /// `JSON.stringify`llä ja jäsentää itse, joten purkaminen täällä
    /// tuottaisi vain kaksinkertaisen muunnoksen.
    pub fn all(&self, user: &str) -> AppResult<HashMap<String, String>> {
        let c = self.lock()?;
        let mut stmt = c.prepare("SELECT key, value FROM tool_state WHERE user_id = ?1")?;
        let rows = stmt.query_map(params![user], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?;

        let mut map = HashMap::new();
        for row in rows {
            let (k, v) = row?;
            map.insert(k, v);
        }
        Ok(map)
    }

    // ===== Käyttötilastot ja suosikit =====

    pub fn touch(&self, user: &str, tool_id: &str) -> AppResult<()> {
        let c = self.lock()?;
        c.execute(
            "INSERT INTO tool_usage (user_id, tool_id, uses, last_used) VALUES (?1, ?2, 1, ?3)
             ON CONFLICT(user_id, tool_id) DO UPDATE SET uses = uses + 1, last_used = excluded.last_used",
            params![user, tool_id, crate::util::now()],
        )?;
        Ok(())
    }

    pub fn set_favorite(&self, user: &str, tool_id: &str, on: bool) -> AppResult<()> {
        let c = self.lock()?;
        c.execute(
            "INSERT INTO tool_usage (user_id, tool_id, favorite) VALUES (?1, ?2, ?3)
             ON CONFLICT(user_id, tool_id) DO UPDATE SET favorite = excluded.favorite",
            params![user, tool_id, if on { 1 } else { 0 }],
        )?;
        Ok(())
    }

    pub fn usage(&self, user: &str) -> AppResult<Vec<ToolUsageRow>> {
        let c = self.lock()?;
        let mut stmt = c.prepare(
            "SELECT tool_id, uses, last_used, favorite FROM tool_usage
             WHERE user_id = ?1 ORDER BY favorite DESC, last_used DESC",
        )?;
        let rows = stmt.query_map(params![user], |r| {
            Ok(ToolUsageRow {
                tool_id: r.get(0)?,
                uses: r.get(1)?,
                last_used: r.get(2)?,
                favorite: r.get::<_, i64>(3)? != 0,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn clear_usage(&self, user: &str, keep_favorites: bool) -> AppResult<()> {
        let c = self.lock()?;
        if keep_favorites {
            c.execute(
                "UPDATE tool_usage SET uses = 0, last_used = NULL WHERE user_id = ?1 AND favorite = 1",
                params![user],
            )?;
            c.execute(
                "DELETE FROM tool_usage WHERE user_id = ?1 AND favorite = 0",
                params![user],
            )?;
        } else {
            c.execute("DELETE FROM tool_usage WHERE user_id = ?1", params![user])?;
        }
        Ok(())
    }

    /// Käyttäjän kaiken paikallisen datan poisto. Kutsutaan kun tili poistetaan
    /// tai käyttäjä haluaa tyhjentää koneensa.
    pub fn forget_user(&self, user: &str) -> AppResult<()> {
        let c = self.lock()?;
        c.execute("DELETE FROM tool_state WHERE user_id = ?1", params![user])?;
        c.execute("DELETE FROM tool_usage WHERE user_id = ?1", params![user])?;
        Ok(())
    }
}
