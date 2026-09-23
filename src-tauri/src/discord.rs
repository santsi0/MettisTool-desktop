//! Valinnainen Discord-webhook-lokitus.
//!
//! Discordiin lähetetään VAIN tapahtuman tyyppi, aikaleima, vakavuus ja nimet.
//! Ei koskaan salasanoja, tiivisteitä, tokeneita, API-avaimia, vahvistuskoodeja
//! eikä tiedostojen sisältöä. Jos Discord ei vastaa, sovellus jatkaa normaalisti —
//! lokitus ei ole koskaan este paikallisten työkalujen käytölle.

use crate::db::models::DiscordStatus;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::{secrets, settings, util};

pub struct Message {
    pub event: String,
    pub category: String,
    pub severity: String,
    pub success: bool,
    pub actor: Option<String>,
    pub target: Option<String>,
}

fn color_for(severity: &str, success: bool) -> u32 {
    if !success {
        return 0xE0_52_60;
    }
    match severity {
        "CRITICAL" => 0xE8_32_3C,
        "WARNING" => 0xD9_A4_41,
        "NOTICE" => 0x4C_8D_D9,
        _ => 0x3F_B3_7F,
    }
}

fn should_send(level: &str, category: &str, severity: &str) -> bool {
    if severity == "CRITICAL" {
        return true;
    }
    match level {
        "ALL" => true,
        "AUTH" => category == "AUTH" || severity == "WARNING",
        "SECURITY" => category == "SECURITY" || severity == "WARNING",
        "ADMIN" => category == "ADMIN" || severity == "WARNING",
        "SYSTEM" => category == "SYSTEM",
        _ => false,
    }
}

fn webhook() -> Option<String> {
    secrets::get_with_env(secrets::DISCORD_WEBHOOK, "METTISTOOL_DISCORD_WEBHOOK")
        .filter(|w| w.starts_with("https://") && w.contains("discord"))
}

/// Lähettää taustalla. Ei koskaan estä kutsuvaa toimintoa.
pub fn notify(db: &Db, msg: Message) {
    if !settings::get_bool(db, settings::DISCORD_ENABLED) {
        return;
    }
    let level = settings::get(db, settings::DISCORD_LEVEL);
    if !should_send(&level, &msg.category, &msg.severity) {
        return;
    }
    let Some(url) = webhook() else { return };

    let payload = build_payload(&msg);
    let db_path = db.path.clone();

    tauri::async_runtime::spawn(async move {
        let outcome = post(&url, payload).await;
        // Tilastot päivitetään omalla yhteydellä, jottei lukkoa pidetä awaitin yli.
        if let Ok(conn) = rusqlite::Connection::open(&db_path) {
            let ts = util::now();
            let (key, ok) = match outcome {
                Ok(_) => (settings::DISCORD_LAST_SUCCESS, true),
                Err(ref e) => {
                    log::warn!("Discord-lokitus epäonnistui: {e}");
                    (settings::DISCORD_LAST_FAILURE, false)
                }
            };
            let _ = conn.execute(
                "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                rusqlite::params![key, ts.to_string(), ts],
            );
            if !ok {
                let _ = conn.execute(
                    "INSERT INTO settings (key, value, updated_at) VALUES (?1, '1', ?2)
                     ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT),
                                                    updated_at = excluded.updated_at",
                    rusqlite::params![settings::DISCORD_FAILURE_COUNT, ts],
                );
            }
        }
    });
}

fn build_payload(msg: &Message) -> serde_json::Value {
    let mut fields = vec![
        serde_json::json!({ "name": "Tapahtuma", "value": util::sanitize_line(&msg.event, 100), "inline": true }),
        serde_json::json!({ "name": "Luokka", "value": util::sanitize_line(&msg.category, 32), "inline": true }),
        serde_json::json!({ "name": "Tulos", "value": if msg.success { "onnistui" } else { "epäonnistui" }, "inline": true }),
    ];
    if let Some(actor) = &msg.actor {
        fields.push(serde_json::json!({ "name": "Tekijä", "value": util::sanitize_line(actor, 64), "inline": true }));
    }
    if let Some(target) = &msg.target {
        fields.push(serde_json::json!({ "name": "Kohde", "value": util::sanitize_line(target, 64), "inline": true }));
    }

    serde_json::json!({
        "username": "MettisTool",
        "embeds": [{
            "title": format!("{} · {}", msg.severity, msg.event),
            "color": color_for(&msg.severity, msg.success),
            "fields": fields,
            "footer": { "text": format!("MettisTool {}", util::app_version()) },
            "timestamp": chrono::Utc::now().to_rfc3339()
        }]
    })
}

async fn post(url: &str, payload: serde_json::Value) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .user_agent(format!("MettisTool/{}", util::app_version()))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .post(url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("yhteys epäonnistui: {}", e.without_url()))?;

    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!("HTTP {}", res.status().as_u16()))
    }
}

/// Testiviesti hallintapaneelista.
pub async fn send_test(db_path: std::path::PathBuf, url: String) -> AppResult<()> {
    let payload = build_payload(&Message {
        event: "DISCORD_TEST".into(),
        category: "SYSTEM".into(),
        severity: "INFO".into(),
        success: true,
        actor: Some("hallintapaneeli".into()),
        target: None,
    });
    post(&url, payload)
        .await
        .map_err(|e| AppError::Internal(format!("Discord: {e}")))?;
    if let Ok(conn) = rusqlite::Connection::open(&db_path) {
        let ts = util::now();
        let _ = conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            rusqlite::params![settings::DISCORD_LAST_SUCCESS, ts.to_string(), ts],
        );
    }
    Ok(())
}

pub fn status(db: &Db) -> DiscordStatus {
    let hook = webhook();
    DiscordStatus {
        enabled: settings::get_bool(db, settings::DISCORD_ENABLED),
        configured: hook.is_some(),
        webhook_masked: hook.as_deref().map(util::mask_url),
        level: settings::get(db, settings::DISCORD_LEVEL),
        last_success: settings::get(db, settings::DISCORD_LAST_SUCCESS).parse().ok(),
        last_failure: settings::get(db, settings::DISCORD_LAST_FAILURE).parse().ok(),
        failure_count: settings::get(db, settings::DISCORD_FAILURE_COUNT)
            .parse()
            .unwrap_or(0),
    }
}
