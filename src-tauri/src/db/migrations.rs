//! Tietokannan skeema ja migraatiot.
//!
//! Versiointi tapahtuu SQLiten `user_version`-pragmalla. Jokainen migraatio ajetaan
//! transaktiossa, joten keskeytynyt päivitys ei jätä tietokantaa puolitiehen.

use rusqlite::Connection;

pub const CURRENT_VERSION: i64 = 1;

const M1: &str = r#"
-- ===== Käyttäjät =====
CREATE TABLE users (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    username             TEXT    NOT NULL,
    username_lower       TEXT    NOT NULL UNIQUE,
    email                TEXT    NOT NULL,
    email_lower          TEXT    NOT NULL UNIQUE,
    password_hash        TEXT,                                  -- NULL = vain OAuth-kirjautuminen
    role                 TEXT    NOT NULL DEFAULT 'USER',       -- USER | MODERATOR | ADMIN | OWNER
    status               TEXT    NOT NULL DEFAULT 'ACTIVE',     -- ACTIVE | DISABLED
    email_verified       INTEGER NOT NULL DEFAULT 0,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    totp_enabled         INTEGER NOT NULL DEFAULT 0,
    failed_logins        INTEGER NOT NULL DEFAULT 0,
    locked_until         INTEGER,
    language             TEXT    NOT NULL DEFAULT 'fi',
    theme                TEXT    NOT NULL DEFAULT 'dark',
    accent               TEXT    NOT NULL DEFAULT 'crimson',
    created_at           INTEGER NOT NULL,
    updated_at           INTEGER NOT NULL,
    last_login_at        INTEGER,
    password_changed_at  INTEGER
);
CREATE INDEX idx_users_role    ON users(role);
CREATE INDEX idx_users_status  ON users(status);
CREATE INDEX idx_users_created ON users(created_at);

-- ===== Kirjautumistavat =====
CREATE TABLE oauth_identities (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider     TEXT    NOT NULL,                              -- google
    subject      TEXT    NOT NULL,                              -- palveluntarjoajan pysyvä tunniste
    email        TEXT,
    display_name TEXT,
    created_at   INTEGER NOT NULL,
    last_used_at INTEGER,
    UNIQUE(provider, subject)
);
CREATE INDEX idx_oauth_user ON oauth_identities(user_id);

-- ===== Istunnot =====
CREATE TABLE sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT    NOT NULL UNIQUE,                       -- SHA-256, ei koskaan raakatokenia
    created_at   INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    remember     INTEGER NOT NULL DEFAULT 0,
    device       TEXT,
    revoked_at   INTEGER
);
CREATE INDEX idx_sessions_user    ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ===== Kertakäyttötokenit (vahvistus, palautus, kutsu) =====
CREATE TABLE auth_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT    NOT NULL,                                -- VERIFY_EMAIL | PASSWORD_RESET | INVITE
    token_hash TEXT    NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at    INTEGER,
    meta       TEXT
);
CREATE INDEX idx_tokens_user ON auth_tokens(user_id, kind);

-- ===== Palautuskoodit (2FA) =====
CREATE TABLE recovery_codes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    used_at   INTEGER
);
CREATE INDEX idx_recovery_user ON recovery_codes(user_id);

-- ===== Oikeudet =====
CREATE TABLE permissions (
    name        TEXT PRIMARY KEY,
    description TEXT NOT NULL
);
CREATE TABLE role_permissions (
    role       TEXT NOT NULL,
    permission TEXT NOT NULL REFERENCES permissions(name) ON DELETE CASCADE,
    PRIMARY KEY (role, permission)
);
CREATE TABLE user_permissions (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission TEXT    NOT NULL REFERENCES permissions(name) ON DELETE CASCADE,
    granted    INTEGER NOT NULL DEFAULT 1,                      -- 1 = myönnetty, 0 = nimenomaisesti evätty
    PRIMARY KEY (user_id, permission)
);

-- ===== Audit-loki =====
CREATE TABLE audit_log (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ts             INTEGER NOT NULL,
    event          TEXT    NOT NULL,
    severity       TEXT    NOT NULL DEFAULT 'INFO',             -- INFO | NOTICE | WARNING | CRITICAL
    category       TEXT    NOT NULL DEFAULT 'SYSTEM',           -- AUTH | SECURITY | ADMIN | SYSTEM
    result         TEXT    NOT NULL DEFAULT 'SUCCESS',          -- SUCCESS | FAILURE
    actor_user_id  INTEGER,
    actor_name     TEXT,
    target_user_id INTEGER,
    target_name    TEXT,
    app_version    TEXT,
    meta           TEXT
);
CREATE INDEX idx_audit_ts       ON audit_log(ts DESC);
CREATE INDEX idx_audit_event    ON audit_log(event);
CREATE INDEX idx_audit_category ON audit_log(category);
CREATE INDEX idx_audit_actor    ON audit_log(actor_user_id);

-- ===== Asetukset (ei salaisuuksia — ne menevät käyttöjärjestelmän avainsäilöön) =====
CREATE TABLE settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by INTEGER
);

-- ===== Kutsurajoitukset =====
CREATE TABLE rate_limits (
    key          TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    count        INTEGER NOT NULL
);

-- ===== Ilmoitukset =====
CREATE TABLE notifications (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    ts      INTEGER NOT NULL,
    kind    TEXT    NOT NULL,
    title   TEXT    NOT NULL,
    body    TEXT,
    read_at INTEGER
);
CREATE INDEX idx_notif_user ON notifications(user_id, ts DESC);

-- ===== Työkalujen käyttäjäkohtainen tila =====
CREATE TABLE tool_state (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key        TEXT    NOT NULL,
    value      TEXT    NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
);

-- ===== Työkalujen käyttöhistoria =====
CREATE TABLE tool_usage (
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool_id  TEXT    NOT NULL,
    uses     INTEGER NOT NULL DEFAULT 0,
    last_used INTEGER,
    favorite INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, tool_id)
);
CREATE INDEX idx_usage_last ON tool_usage(user_id, last_used DESC);

-- ===== Varmuuskopiot =====
CREATE TABLE backups (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    path       TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    size       INTEGER NOT NULL,
    kind       TEXT    NOT NULL DEFAULT 'MANUAL',               -- MANUAL | AUTO
    app_version TEXT
);
"#;

/// Oikeuksien perusjoukko ja roolien oletukset.
const SEED_PERMISSIONS: &[(&str, &str)] = &[
    ("VIEW_USERS", "Katsele käyttäjiä"),
    ("EDIT_USERS", "Muokkaa käyttäjätietoja"),
    ("DELETE_USERS", "Poista käyttäjiä"),
    ("RESET_PASSWORDS", "Nollaa käyttäjien salasanoja"),
    ("MANAGE_ROLES", "Muuta käyttäjien rooleja"),
    ("MANAGE_ADMINS", "Luo ja hallitse ylläpitotilejä"),
    ("VIEW_AUDIT_LOGS", "Katsele audit-lokeja"),
    ("MANAGE_EMAIL", "Hallitse sähköpostiasetuksia"),
    ("MANAGE_DISCORD", "Hallitse Discord-lokitusta"),
    ("MANAGE_SETTINGS", "Hallitse sovellusasetuksia"),
    ("MANAGE_SECURITY", "Hallitse turvallisuusasetuksia"),
    ("MANAGE_SYSTEM", "Hallitse järjestelmää ja varmuuskopioita"),
];

const ROLE_DEFAULTS: &[(&str, &[&str])] = &[
    ("MODERATOR", &["VIEW_USERS", "VIEW_AUDIT_LOGS"]),
    (
        "ADMIN",
        &[
            "VIEW_USERS",
            "EDIT_USERS",
            "RESET_PASSWORDS",
            "VIEW_AUDIT_LOGS",
            "MANAGE_EMAIL",
            "MANAGE_DISCORD",
            "MANAGE_SETTINGS",
        ],
    ),
    // OWNER saa kaikki oikeudet koodissa — ei tarvitse rivejä.
];

pub fn run(conn: &mut Connection) -> rusqlite::Result<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;

    if version < 1 {
        let tx = conn.transaction()?;
        tx.execute_batch(M1)?;

        for (name, desc) in SEED_PERMISSIONS {
            tx.execute(
                "INSERT INTO permissions (name, description) VALUES (?1, ?2)",
                rusqlite::params![name, desc],
            )?;
        }
        for (role, perms) in ROLE_DEFAULTS {
            for p in perms.iter() {
                tx.execute(
                    "INSERT INTO role_permissions (role, permission) VALUES (?1, ?2)",
                    rusqlite::params![role, p],
                )?;
            }
        }
        tx.pragma_update(None, "user_version", 1i64)?;
        tx.commit()?;
        log::info!("tietokannan migraatio 1 suoritettu");
    }

    Ok(())
}

pub fn all_permissions() -> Vec<(&'static str, &'static str)> {
    SEED_PERMISSIONS.to_vec()
}
