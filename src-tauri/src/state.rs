//! Sovelluksen jaettu tila.
//!
//! Aktiivinen istunto elää vain Rustin muistissa. Käyttöliittymä ei saa
//! istuntotokenia missään vaiheessa, joten sitä ei voi varastaa selainpuolelta.

use crate::db::Db;
use crate::error::{AppError, AppResult};
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug)]
pub struct ActiveSession {
    pub session_id: i64,
    pub user_id: i64,
    pub expires_at: i64,
    /// Raakatoken pidetään muistissa vain jos "muista minut" on valittu,
    /// jotta se voidaan poistaa avainsäilöstä uloskirjautumisen yhteydessä.
    pub remember: bool,
}

/// Kirjautuminen odottaa toista vaihetta (TOTP).
#[derive(Clone, Debug)]
pub struct PendingLogin {
    pub user_id: i64,
    pub remember: bool,
    pub created_at: i64,
    pub attempts: u32,
}

/// Käynnissä oleva Google-kirjautuminen.
pub struct OAuthFlow {
    pub state: String,
    pub pkce_verifier: String,
    pub redirect_uri: String,
    pub created_at: i64,
    pub link_to_user: Option<i64>,
}

/// Yhden komennon ajaksi ratkaistu kutsujan konteksti.
#[derive(Clone, Debug)]
pub struct AuthContext {
    pub user_id: i64,
    pub username: String,
    pub role: String,
    pub session_id: i64,
}

pub type OAuthResultSlot = Arc<Mutex<Option<crate::auth::oauth::OAuthCallback>>>;

pub struct AppState {
    pub db: Arc<Db>,
    pub session: Mutex<Option<ActiveSession>>,
    pub pending_login: Mutex<Option<PendingLogin>>,
    pub oauth: Mutex<Option<OAuthFlow>>,
    pub oauth_result: OAuthResultSlot,
    pub started_at: i64,
}

impl AppState {
    pub fn new(db: Db) -> Self {
        AppState {
            db: Arc::new(db),
            session: Mutex::new(None),
            pending_login: Mutex::new(None),
            oauth: Mutex::new(None),
            oauth_result: Arc::new(Mutex::new(None)),
            started_at: crate::util::now(),
        }
    }

    /// Kahva, jonka taustasäie täyttää kun selain palaa takaisinkutsuosoitteeseen.
    pub fn oauth_result_handle(&self) -> OAuthResultSlot {
        Arc::clone(&self.oauth_result)
    }

    pub fn set_session(&self, s: Option<ActiveSession>) {
        if let Ok(mut guard) = self.session.lock() {
            *guard = s;
        }
    }

    pub fn session_snapshot(&self) -> Option<ActiveSession> {
        self.session.lock().ok().and_then(|g| g.clone())
    }

    /// Ratkaisee kutsujan ja tarkistaa samalla, että tili on yhä voimassa.
    /// Rooli luetaan aina tietokannasta, joten roolimuutos astuu voimaan heti.
    pub fn require_auth(&self) -> AppResult<AuthContext> {
        let active = self.session_snapshot().ok_or(AppError::NotAuthenticated)?;
        if active.expires_at < crate::util::now() {
            self.set_session(None);
            return Err(AppError::NotAuthenticated);
        }

        let row: Option<(String, String, String)> = self.db.with(|c| {
            Ok(c.query_row(
                "SELECT username, role, status FROM users WHERE id = ?1",
                rusqlite::params![active.user_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .ok())
        })?;

        let (username, role, status) = row.ok_or(AppError::NotAuthenticated)?;
        if status != "ACTIVE" {
            self.set_session(None);
            return Err(AppError::AccountDisabled);
        }

        crate::auth::session::touch(&self.db, active.session_id);

        Ok(AuthContext {
            user_id: active.user_id,
            username,
            role,
            session_id: active.session_id,
        })
    }

    pub fn require_permission(&self, permission: &str) -> AppResult<AuthContext> {
        let ctx = self.require_auth()?;
        crate::rbac::require_permission(&self.db, ctx.user_id, &ctx.role, permission)?;
        Ok(ctx)
    }

    pub fn require_owner(&self) -> AppResult<AuthContext> {
        let ctx = self.require_auth()?;
        if ctx.role != crate::rbac::ROLE_OWNER {
            return Err(AppError::Forbidden);
        }
        Ok(ctx)
    }
}
