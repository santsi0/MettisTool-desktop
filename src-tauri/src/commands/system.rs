//! Järjestelmäkomennot: ikkuna, päivitystarkistus ja käynnistysasetus.

use crate::error::{AppError, AppResult};
use crate::util;
use serde::Serialize;
use tauri::Manager;

/// Repositorio, josta päivityksiä haetaan. Sovellus ei koskaan asenna mitään
/// itse — se kertoo vain, onko uudempi versio olemassa.
const UPDATE_REPO: &str = "santsi0/MettisTool-desktop";

/// Frontend kutsuu tämän kun käyttöliittymä on piirretty — ikkuna näytetään
/// vasta silloin, jottei käyttäjä näe tyhjää valkoista ruutua.
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

// ===== Päivitykset =====

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub download_url: Option<String>,
    pub notes: Option<String>,
}

/// Vertaa versionumeroita osa kerrallaan, jottei "1.10.0" jää "1.9.0":n taakse.
fn is_newer(candidate: &str, current: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        v.split('.')
            .map(|p| {
                p.chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect::<String>()
                    .parse()
                    .unwrap_or(0)
            })
            .collect()
    };
    let (a, b) = (parse(candidate), parse(current));
    for i in 0..a.len().max(b.len()) {
        let x = a.get(i).copied().unwrap_or(0);
        let y = b.get(i).copied().unwrap_or(0);
        if x != y {
            return x > y;
        }
    }
    false
}

#[tauri::command]
pub async fn check_updates() -> AppResult<UpdateInfo> {
    let current = util::app_version();
    let none = |current: String| UpdateInfo {
        current_version: current,
        latest_version: None,
        update_available: false,
        download_url: None,
        notes: None,
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .user_agent(format!("MettisTool/{current}"))
        .build()
        .map_err(|e| AppError::internal(format!("http: {e}")))?;

    let url = format!("https://api.github.com/repos/{UPDATE_REPO}/releases/latest");
    let res = match client.get(&url).send().await {
        Ok(r) => r,
        // Päivitystarkistus ei saa kaataa mitään: ilman verkkoa vastataan
        // yksinkertaisesti "ei päivitystä".
        Err(_) => return Ok(none(current)),
    };
    if !res.status().is_success() {
        return Ok(none(current));
    }

    #[derive(serde::Deserialize)]
    struct Release {
        tag_name: String,
        html_url: String,
        body: Option<String>,
    }
    let release: Release = match res.json().await {
        Ok(r) => r,
        Err(_) => return Ok(none(current)),
    };

    let latest = release.tag_name.trim_start_matches('v').to_string();
    let available = is_newer(&latest, &current);

    Ok(UpdateInfo {
        current_version: current,
        latest_version: Some(latest),
        update_available: available,
        download_url: available.then_some(release.html_url),
        notes: release.body.map(|b| util::sanitize_line(&b, 2000)),
    })
}

// ===== Käynnistysasetus =====
//
// Tila luetaan käyttöjärjestelmältä eikä tietokannasta: jos käyttäjä poistaa
// automaattikäynnistyksen järjestelmän asetuksista, sovellus näyttää sen heti
// oikein sen sijaan että väittäisi muuta.

#[tauri::command]
pub fn set_autostart(enabled: bool) -> AppResult<bool> {
    #[cfg(any(windows, target_os = "macos", target_os = "linux"))]
    {
        use tauri_plugin_autostart::ManagerExt;
        if let Some(app) = crate::app_handle() {
            let manager = app.autolaunch();
            let result = if enabled {
                manager.enable()
            } else {
                manager.disable()
            };
            if let Err(e) = result {
                log::warn!("käynnistysasetuksen muutos epäonnistui: {e}");
                return Ok(!enabled);
            }
        }
    }
    Ok(enabled)
}

#[tauri::command]
pub fn autostart_enabled() -> AppResult<bool> {
    #[cfg(any(windows, target_os = "macos", target_os = "linux"))]
    {
        use tauri_plugin_autostart::ManagerExt;
        if let Some(app) = crate::app_handle() {
            return Ok(app.autolaunch().is_enabled().unwrap_or(false));
        }
    }
    #[allow(unreachable_code)]
    Ok(false)
}
