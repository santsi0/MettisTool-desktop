//! Työkalujen käyttäjäkohtainen tila.
//!
//! Suosikit, käyttöhistoria, muistiinpanot ja tehtävät tallennetaan käyttäjän
//! omaan riviin SQLiteen — eivät selaimen localStorageen. Näin tiedot seuraavat
//! käyttäjää ja katoavat tilin mukana.

use crate::db::models::ToolUsageRow;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::util::{now, sanitize_line};
use rusqlite::params;
use tauri::State;

const MAX_VALUE_BYTES: usize = 512 * 1024;

fn clean_key(key: &str) -> AppResult<String> {
    let k = sanitize_line(key, 80);
    if k.is_empty()
        || !k
            .chars()
            .all(|c| c.is_alphanumeric() || c == '.' || c == '-' || c == '_')
    {
        return Err(AppError::validation("key", "invalid"));
    }
    Ok(k)
}

#[tauri::command]
pub fn tool_state_get(state: State<'_, AppState>, key: String) -> AppResult<Option<String>> {
    let ctx = state.require_auth()?;
    let key = clean_key(&key)?;
    state.db.with(|c| {
        Ok(c.query_row(
            "SELECT value FROM tool_state WHERE user_id = ?1 AND key = ?2",
            params![ctx.user_id, key],
            |r| r.get::<_, String>(0),
        )
        .ok())
    })
}

#[tauri::command]
pub fn tool_state_set(state: State<'_, AppState>, key: String, value: String) -> AppResult<()> {
    let ctx = state.require_auth()?;
    let key = clean_key(&key)?;
    if value.len() > MAX_VALUE_BYTES {
        return Err(AppError::validation("value", "too_large"));
    }
    state.db.with(|c| {
        c.execute(
            "INSERT INTO tool_state (user_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![ctx.user_id, key, value, now()],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub fn tool_state_delete(state: State<'_, AppState>, key: String) -> AppResult<()> {
    let ctx = state.require_auth()?;
    let key = clean_key(&key)?;
    state.db.with(|c| {
        c.execute(
            "DELETE FROM tool_state WHERE user_id = ?1 AND key = ?2",
            params![ctx.user_id, key],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub fn tool_state_all(state: State<'_, AppState>) -> AppResult<serde_json::Value> {
    let ctx = state.require_auth()?;
    state.db.with(|c| {
        let mut stmt = c.prepare("SELECT key, value FROM tool_state WHERE user_id = ?1")?;
        let it = stmt.query_map(params![ctx.user_id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?;
        let mut map = serde_json::Map::new();
        for row in it {
            let (k, v) = row?;
            map.insert(k, serde_json::Value::String(v));
        }
        Ok(serde_json::Value::Object(map))
    })
}

#[tauri::command]
pub fn tool_used(state: State<'_, AppState>, tool_id: String) -> AppResult<()> {
    let ctx = state.require_auth()?;
    let id = sanitize_line(&tool_id, 64);
    if id.is_empty() {
        return Ok(());
    }
    state.db.with(|c| {
        c.execute(
            "INSERT INTO tool_usage (user_id, tool_id, uses, last_used) VALUES (?1, ?2, 1, ?3)
             ON CONFLICT(user_id, tool_id) DO UPDATE SET uses = uses + 1, last_used = excluded.last_used",
            params![ctx.user_id, id, now()],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub fn tool_set_favorite(
    state: State<'_, AppState>,
    tool_id: String,
    favorite: bool,
) -> AppResult<()> {
    let ctx = state.require_auth()?;
    let id = sanitize_line(&tool_id, 64);
    state.db.with(|c| {
        c.execute(
            "INSERT INTO tool_usage (user_id, tool_id, uses, favorite) VALUES (?1, ?2, 0, ?3)
             ON CONFLICT(user_id, tool_id) DO UPDATE SET favorite = excluded.favorite",
            params![ctx.user_id, id, favorite as i64],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub fn tool_usage(state: State<'_, AppState>) -> AppResult<Vec<ToolUsageRow>> {
    let ctx = state.require_auth()?;
    state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT tool_id, uses, last_used, favorite FROM tool_usage
             WHERE user_id = ?1 ORDER BY last_used DESC NULLS LAST, uses DESC",
        )?;
        let it = stmt.query_map(params![ctx.user_id], |r| {
            Ok(ToolUsageRow {
                tool_id: r.get(0)?,
                uses: r.get(1)?,
                last_used: r.get(2)?,
                favorite: r.get::<_, i64>(3)? == 1,
            })
        })?;
        let mut out = Vec::new();
        for row in it {
            out.push(row?);
        }
        Ok(out)
    })
}

#[tauri::command]
pub fn tool_usage_clear(state: State<'_, AppState>, keep_favorites: bool) -> AppResult<()> {
    let ctx = state.require_auth()?;
    state.db.with(|c| {
        if keep_favorites {
            c.execute(
                "UPDATE tool_usage SET uses = 0, last_used = NULL WHERE user_id = ?1",
                params![ctx.user_id],
            )?;
        } else {
            c.execute(
                "DELETE FROM tool_usage WHERE user_id = ?1",
                params![ctx.user_id],
            )?;
        }
        Ok(())
    })
}
