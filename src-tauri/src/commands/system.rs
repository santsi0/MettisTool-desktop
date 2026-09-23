//! Järjestelmäkomennot: ikkuna, ilmoitukset, päivitystarkistus ja käynnistysasetus.

use crate::db::models::{NotificationRow, UpdateInfo};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::{settings, util};
use rusqlite::params;
use tauri::{Manager, State};

/// Frontend kutsuu tämän kun käyttöliittymä on piirretty — ikkuna näytetään vasta silloin.
#[tauri::command]
pub fn app_ready(app: tauri::AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub fn window_minimize_to_tray(app: tauri::AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn open_data_folder(app: tauri::AppHandle) -> AppResult<String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::internal(format!("sovelluskansiota ei löydy: {e}")))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.to_string_lossy().to_string())
}

// ===== Ilmoitukset =====

pub fn push(db: &crate::db::Db, user_id: Option<i64>, kind: &str, title: &str, body: Option<&str>) {
    let _ = db.with(|c| {
        c.execute(
            "INSERT INTO notifications (user_id, ts, kind, title, body) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                user_id,
                util::now(),
                kind,
                util::sanitize_line(title, 120),
                body.map(|b| util::sanitize_line(b, 400))
            ],
        )?;
        Ok(())
    });
}

#[tauri::command]
pub fn notifications_list(state: State<'_, AppState>) -> AppResult<Vec<NotificationRow>> {
    let ctx = state.require_auth()?;
    state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT id, ts, kind, title, body, read_at FROM notifications
             WHERE user_id = ?1 OR user_id IS NULL
             ORDER BY ts DESC LIMIT 100",
        )?;
        let it = stmt.query_map(params![ctx.user_id], |r| {
            Ok(NotificationRow {
                id: r.get(0)?,
                ts: r.get(1)?,
                kind: r.get(2)?,
                title: r.get(3)?,
                body: r.get(4)?,
                read: r.get::<_, Option<i64>>(5)?.is_some(),
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
pub fn notifications_mark_read(state: State<'_, AppState>, id: Option<i64>) -> AppResult<()> {
    let ctx = state.require_auth()?;
    state.db.with(|c| {
        match id {
            Some(nid) => c.execute(
                "UPDATE notifications SET read_at = ?1 WHERE id = ?2 AND (user_id = ?3 OR user_id IS NULL)",
                params![util::now(), nid, ctx.user_id],
            )?,
            None => c.execute(
                "UPDATE notifications SET read_at = ?1 WHERE read_at IS NULL AND (user_id = ?2 OR user_id IS NULL)",
                params![util::now(), ctx.user_id],
            )?,
        };
        Ok(())
    })
}

// ===== Päivitykset =====

/// Tarkistaa GitHubin julkaisut. Ei koskaan asenna mitään itse eikä korvaa
/// sovellusta ilman käyttäjän toimia — palauttaa vain tiedon uudesta versiosta.
#[tauri::command]
pub async fn check_updates(state: State<'_, AppState>) -> AppResult<UpdateInfo> {
    let current = util::app_version();
    let repo = settings::get(&state.db, settings::UPDATE_REPO);
    let repo = repo.trim();

    if repo.is_empty() || !settings::get_bool(&state.db, settings::UPDATE_CHECK) {
        return Ok(UpdateInfo {
            current_version: current,
            latest_version: None,
            update_available: false,
            download_url: None,
            notes: None,
            checked_at: util::now(),
        });
    }
    if !repo
        .chars()
        .all(|c| c.is_alphanumeric() || c == '/' || c == '-' || c == '_' || c == '.')
    {
        return Err(AppError::validation("repo", "invalid"));
    }

    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .user_agent(format!("MettisTool/{current}"))
        .build()
        .map_err(|e| AppError::internal(format!("http: {e}")))?;

    let res = client.get(&url).send().await?;
    if !res.status().is_success() {
        return Ok(UpdateInfo {
            current_version: current,
            latest_version: None,
            update_available: false,
            download_url: None,
            notes: None,
            checked_at: util::now(),
        });
    }

    #[derive(serde::Deserialize)]
    struct Release {
        tag_name: String,
        html_url: String,
        body: Option<String>,
    }
    let release: Release = res
        .json()
        .await
        .map_err(|_| AppError::internal("julkaisutietoja ei voitu lukea"))?;

    let latest = release.tag_name.trim_start_matches('v').to_string();
    let available = is_newer(&latest, &current);

    Ok(UpdateInfo {
        current_version: current,
        latest_version: Some(latest),
        update_available: available,
        download_url: Some(release.html_url),
        notes: release.body.map(|b| util::sanitize_line(&b, 800)),
        checked_at: util::now(),
    })
}

fn parse_version(v: &str) -> Vec<u32> {
    v.split(['.', '-', '+'])
        .take(3)
        .map(|p| p.parse::<u32>().unwrap_or(0))
        .collect()
}

fn is_newer(candidate: &str, current: &str) -> bool {
    let a = parse_version(candidate);
    let b = parse_version(current);
    for i in 0..3 {
        let x = a.get(i).copied().unwrap_or(0);
        let y = b.get(i).copied().unwrap_or(0);
        if x != y {
            return x > y;
        }
    }
    false
}

// ===== Käynnistysasetus =====

#[tauri::command]
pub fn set_autostart(state: State<'_, AppState>, enabled: bool) -> AppResult<bool> {
    let ctx = state.require_auth()?;
    settings::set_bool(&state.db, settings::AUTOSTART, enabled, Some(ctx.user_id))?;

    #[cfg(any(windows, target_os = "macos"))]
    {
        use tauri_plugin_autostart::ManagerExt;
        // Kahva haetaan globaalista sovelluskahvasta setup-vaiheessa tallennetusta tilasta.
        if let Some(app) = crate::app_handle() {
            let manager = app.autolaunch();
            let result = if enabled {
                manager.enable()
            } else {
                manager.disable()
            };
            if let Err(e) = result {
                log::warn!("käynnistysasetuksen muutos epäonnistui: {e}");
                return Ok(false);
            }
        }
    }
    Ok(enabled)
}

#[tauri::command]
pub fn autostart_enabled(state: State<'_, AppState>) -> AppResult<bool> {
    Ok(settings::get_bool(&state.db, settings::AUTOSTART))
}
