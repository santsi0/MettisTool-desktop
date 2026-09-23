//! Varmuuskopiot.
//!
//! Käyttää SQLiten `VACUUM INTO` -komentoa, joka tekee eheän kopion myös silloin
//! kun tietokanta on käytössä. Palautus vaatii aina käyttäjän vahvistuksen ja
//! sovelluksen uudelleenkäynnistyksen.

use crate::db::models::BackupRow;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::util::{app_version, now};
use rusqlite::params;
use std::path::{Path, PathBuf};

pub const KEEP_AUTO_BACKUPS: usize = 7;

pub fn backup_dir(app_data: &Path) -> PathBuf {
    app_data.join("backups")
}

fn timestamp_name(kind: &str) -> String {
    let ts = chrono::Local::now().format("%Y%m%d-%H%M%S");
    format!("mettistool-{}-{ts}.db", kind.to_lowercase())
}

pub fn create(db: &Db, app_data: &Path, kind: &str, by: Option<(i64, String)>) -> AppResult<BackupRow> {
    let dir = backup_dir(app_data);
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(timestamp_name(kind));
    let path_str = path.to_string_lossy().to_string();

    db.with(|c| {
        // VACUUM INTO ei hyväksy parametreja, joten polku lainausmerkitään huolella.
        let escaped = path_str.replace('\'', "''");
        c.execute_batch(&format!("VACUUM INTO '{escaped}'"))
            .map_err(|e| AppError::internal(format!("varmuuskopiointi epäonnistui: {e}")))?;
        Ok(())
    })?;

    let size = std::fs::metadata(&path).map(|m| m.len() as i64).unwrap_or(0);
    let ts = now();
    let version = app_version();

    let id = db.with(|c| {
        c.execute(
            "INSERT INTO backups (path, created_at, size, kind, app_version) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![path_str, ts, size, kind, version],
        )?;
        Ok(c.last_insert_rowid())
    })?;

    crate::audit::log(
        db,
        crate::audit::Event::new("BACKUP_CREATED", crate::audit::CAT_SYSTEM)
            .severity(crate::audit::SEV_NOTICE)
            .actor_opt(by)
            .meta(serde_json::json!({ "kind": kind, "size": size })),
    );

    if kind == "AUTO" {
        prune_auto(db, &dir);
    }

    Ok(BackupRow {
        id,
        path: path_str,
        created_at: ts,
        size,
        kind: kind.to_string(),
        app_version: Some(version),
    })
}

fn prune_auto(db: &Db, dir: &Path) {
    let rows: Vec<(i64, String)> = db
        .with(|c| {
            let mut stmt = c.prepare(
                "SELECT id, path FROM backups WHERE kind = 'AUTO' ORDER BY created_at DESC",
            )?;
            let it = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
            let mut out = Vec::new();
            for row in it {
                out.push(row?);
            }
            Ok(out)
        })
        .unwrap_or_default();

    for (id, path) in rows.into_iter().skip(KEEP_AUTO_BACKUPS) {
        let p = PathBuf::from(&path);
        if p.starts_with(dir) {
            let _ = std::fs::remove_file(&p);
        }
        let _ = db.with(|c| {
            c.execute("DELETE FROM backups WHERE id = ?1", params![id])?;
            Ok(())
        });
    }
}

pub fn list(db: &Db) -> AppResult<Vec<BackupRow>> {
    db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT id, path, created_at, size, kind, app_version FROM backups ORDER BY created_at DESC LIMIT 100",
        )?;
        let it = stmt.query_map([], |r| {
            Ok(BackupRow {
                id: r.get(0)?,
                path: r.get(1)?,
                created_at: r.get(2)?,
                size: r.get(3)?,
                kind: r.get(4)?,
                app_version: r.get(5)?,
            })
        })?;
        let mut out = Vec::new();
        for row in it {
            let b: BackupRow = row?;
            if std::path::Path::new(&b.path).exists() {
                out.push(b);
            }
        }
        Ok(out)
    })
}

/// Palauttaa varmuuskopion. Nykyinen tietokanta varmuuskopioidaan ensin,
/// jotta virheellinen palautus ei hävitä dataa peruuttamattomasti.
pub fn restore(db_path: &Path, backup_path: &Path, app_data: &Path) -> AppResult<()> {
    if !backup_path.exists() {
        return Err(AppError::NotFound);
    }

    // Tarkistetaan että tiedosto on kelvollinen SQLite-tietokanta ja sisältää skeemamme.
    {
        let probe = rusqlite::Connection::open(backup_path)
            .map_err(|_| AppError::Conflict("invalid_backup".into()))?;
        let ok: i64 = probe
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='users'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if ok == 0 {
            return Err(AppError::Conflict("invalid_backup".into()));
        }
    }

    let safety = backup_dir(app_data).join(format!(
        "ennen-palautusta-{}.db",
        chrono::Local::now().format("%Y%m%d-%H%M%S")
    ));
    std::fs::create_dir_all(backup_dir(app_data))?;
    if db_path.exists() {
        std::fs::copy(db_path, &safety)?;
    }

    // WAL- ja SHM-tiedostot poistetaan, jotta palautettu tila on varmasti oikea.
    for suffix in ["-wal", "-shm"] {
        let extra = PathBuf::from(format!("{}{}", db_path.to_string_lossy(), suffix));
        let _ = std::fs::remove_file(extra);
    }
    std::fs::copy(backup_path, db_path)?;
    Ok(())
}

/// Käyttäjän omien tietojen vienti (GDPR-tyylinen kopio).
pub fn export_user_data(db: &Db, user_id: i64) -> AppResult<serde_json::Value> {
    let user = crate::auth::public_user(db, user_id)?;
    let tool_state: Vec<(String, String)> = db.with(|c| {
        let mut stmt = c.prepare("SELECT key, value FROM tool_state WHERE user_id = ?1")?;
        let it = stmt.query_map(params![user_id], |r| Ok((r.get(0)?, r.get(1)?)))?;
        let mut out = Vec::new();
        for row in it {
            out.push(row?);
        }
        Ok(out)
    })?;
    let usage: Vec<(String, i64, Option<i64>, i64)> = db.with(|c| {
        let mut stmt =
            c.prepare("SELECT tool_id, uses, last_used, favorite FROM tool_usage WHERE user_id = ?1")?;
        let it = stmt.query_map(params![user_id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
        })?;
        let mut out = Vec::new();
        for row in it {
            out.push(row?);
        }
        Ok(out)
    })?;

    Ok(serde_json::json!({
        "exportedAt": now(),
        "appVersion": app_version(),
        "user": user,
        "toolState": tool_state.into_iter().map(|(k, v)| serde_json::json!({"key": k, "value": v})).collect::<Vec<_>>(),
        "toolUsage": usage.into_iter().map(|(id, uses, last, fav)| serde_json::json!({
            "toolId": id, "uses": uses, "lastUsed": last, "favorite": fav == 1
        })).collect::<Vec<_>>()
    }))
}
