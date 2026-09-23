//! Audit-loki.
//!
//! Jokainen turvallisuuteen vaikuttava tapahtuma kirjataan. Lokiin ei koskaan
//! tallenneta salasanoja, tiivisteitä, tokeneita, API-avaimia eikä webhook-osoitteita.

use crate::db::models::{AuditEntry, AuditFilter, Page};
use crate::db::Db;
use crate::error::AppResult;
use crate::util::{now, sanitize_line};
use rusqlite::params;

pub const CAT_AUTH: &str = "AUTH";
pub const CAT_SECURITY: &str = "SECURITY";
pub const CAT_ADMIN: &str = "ADMIN";
pub const CAT_SYSTEM: &str = "SYSTEM";

pub const SEV_INFO: &str = "INFO";
pub const SEV_NOTICE: &str = "NOTICE";
pub const SEV_WARNING: &str = "WARNING";
pub const SEV_CRITICAL: &str = "CRITICAL";

pub struct Event<'a> {
    pub event: &'a str,
    pub category: &'a str,
    pub severity: &'a str,
    pub success: bool,
    pub actor: Option<(i64, String)>,
    pub target: Option<(i64, String)>,
    pub meta: Option<serde_json::Value>,
}

impl<'a> Event<'a> {
    pub fn new(event: &'a str, category: &'a str) -> Self {
        Event {
            event,
            category,
            severity: SEV_INFO,
            success: true,
            actor: None,
            target: None,
            meta: None,
        }
    }
    pub fn severity(mut self, s: &'a str) -> Self {
        self.severity = s;
        self
    }
    pub fn failure(mut self) -> Self {
        self.success = false;
        self
    }
    pub fn actor(mut self, id: i64, name: impl Into<String>) -> Self {
        self.actor = Some((id, name.into()));
        self
    }
    pub fn actor_opt(mut self, actor: Option<(i64, String)>) -> Self {
        self.actor = actor;
        self
    }
    pub fn target(mut self, id: i64, name: impl Into<String>) -> Self {
        self.target = Some((id, name.into()));
        self
    }
    pub fn meta(mut self, v: serde_json::Value) -> Self {
        self.meta = Some(v);
        self
    }
}

/// Avaimet, joita ei koskaan kirjoiteta metatietoihin.
const FORBIDDEN_META_KEYS: [&str; 12] = [
    "password",
    "salasana",
    "password_hash",
    "hash",
    "token",
    "access_token",
    "refresh_token",
    "id_token",
    "secret",
    "api_key",
    "webhook",
    "code_verifier",
];

fn scrub(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (k, v) in map {
                let lower = k.to_lowercase();
                if FORBIDDEN_META_KEYS.iter().any(|f| lower.contains(f)) {
                    out.insert(k.clone(), serde_json::Value::String("[poistettu]".into()));
                } else {
                    out.insert(k.clone(), scrub(v));
                }
            }
            serde_json::Value::Object(out)
        }
        serde_json::Value::Array(items) => {
            serde_json::Value::Array(items.iter().map(scrub).collect())
        }
        serde_json::Value::String(s) => serde_json::Value::String(sanitize_line(s, 500)),
        other => other.clone(),
    }
}

/// Kirjaa tapahtuman ja välittää sen tarvittaessa Discordiin.
pub fn log(db: &Db, ev: Event<'_>) {
    let meta = ev.meta.as_ref().map(|m| scrub(m).to_string());
    let (actor_id, actor_name) = match &ev.actor {
        Some((id, name)) => (Some(*id), Some(sanitize_line(name, 64))),
        None => (None, None),
    };
    let (target_id, target_name) = match &ev.target {
        Some((id, name)) => (Some(*id), Some(sanitize_line(name, 64))),
        None => (None, None),
    };

    let result = if ev.success { "SUCCESS" } else { "FAILURE" };
    let version = crate::util::app_version();

    let write = db.with(|c| {
        c.execute(
            "INSERT INTO audit_log
                (ts, event, severity, category, result, actor_user_id, actor_name, target_user_id, target_name, app_version, meta)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                now(),
                ev.event,
                ev.severity,
                ev.category,
                result,
                actor_id,
                actor_name,
                target_id,
                target_name,
                version,
                meta
            ],
        )?;
        Ok(())
    });

    if let Err(e) = write {
        log::error!("audit-lokin kirjoitus epäonnistui: {e}");
        return;
    }

    crate::discord::notify(
        db,
        crate::discord::Message {
            event: ev.event.to_string(),
            category: ev.category.to_string(),
            severity: ev.severity.to_string(),
            success: ev.success,
            actor: actor_name,
            target: target_name,
        },
    );
}

pub fn query(db: &Db, filter: &AuditFilter) -> AppResult<Page<AuditEntry>> {
    let limit = filter.limit.clamp(1, 500);
    let offset = filter.offset.max(0);

    let mut where_parts: Vec<String> = Vec::new();
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(cat) = &filter.category {
        if !cat.is_empty() && cat != "ALL" {
            where_parts.push("category = ?".into());
            args.push(Box::new(cat.clone()));
        }
    }
    if let Some(sev) = &filter.severity {
        if !sev.is_empty() && sev != "ALL" {
            where_parts.push("severity = ?".into());
            args.push(Box::new(sev.clone()));
        }
    }
    if let Some(since) = filter.since {
        where_parts.push("ts >= ?".into());
        args.push(Box::new(since));
    }
    if let Some(search) = &filter.search {
        let s = search.trim();
        if !s.is_empty() {
            where_parts.push(
                "(event LIKE ? OR IFNULL(actor_name,'') LIKE ? OR IFNULL(target_name,'') LIKE ?)"
                    .into(),
            );
            let pattern = format!("%{}%", s.replace('%', "").replace('_', ""));
            args.push(Box::new(pattern.clone()));
            args.push(Box::new(pattern.clone()));
            args.push(Box::new(pattern));
        }
    }

    let where_sql = if where_parts.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_parts.join(" AND "))
    };

    db.with(|c| {
        let params_ref: Vec<&dyn rusqlite::ToSql> = args.iter().map(|b| b.as_ref()).collect();

        let total: i64 = c.query_row(
            &format!("SELECT COUNT(*) FROM audit_log {where_sql}"),
            params_ref.as_slice(),
            |r| r.get(0),
        )?;

        let sql = format!(
            "SELECT id, ts, event, severity, category, result, actor_name, actor_user_id,
                    target_name, target_user_id, app_version, meta
             FROM audit_log {where_sql}
             ORDER BY ts DESC, id DESC
             LIMIT {limit} OFFSET {offset}"
        );
        let mut stmt = c.prepare(&sql)?;
        let it = stmt.query_map(params_ref.as_slice(), |r| {
            Ok(AuditEntry {
                id: r.get(0)?,
                ts: r.get(1)?,
                event: r.get(2)?,
                severity: r.get(3)?,
                category: r.get(4)?,
                result: r.get(5)?,
                actor_name: r.get(6)?,
                actor_user_id: r.get(7)?,
                target_name: r.get(8)?,
                target_user_id: r.get(9)?,
                app_version: r.get(10)?,
                meta: r.get(11)?,
            })
        })?;
        let mut items = Vec::new();
        for row in it {
            items.push(row?);
        }
        Ok(Page { items, total })
    })
}

/// Poistaa vanhat merkinnät säilytysajan jälkeen (oletus 365 vrk).
pub fn prune(db: &Db, keep_days: i64) -> AppResult<usize> {
    db.with(|c| {
        let n = c.execute(
            "DELETE FROM audit_log WHERE ts < ?1",
            params![now() - keep_days * 86_400],
        )?;
        Ok(n)
    })
}
