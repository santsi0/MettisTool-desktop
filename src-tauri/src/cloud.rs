//! Pilvi-istunto: tunnistautuminen, profiili, auditointi ja laitetiedot.
//!
//! Tämä on `supabase`-moduulin päällä oleva kerros, jota IPC-komennot kutsuvat.
//! Vastuunjako:
//!
//!   supabase.rs  puhuu HTTP:tä oikein
//!   cloud.rs     pitää istunnon kasassa ja kääntää tulokset käyttöliittymälle
//!   tietokanta   päättää kuka saa tehdä mitä (RLS)
//!
//! Pääsytoken ei koskaan poistu tästä prosessista. Virkistystoken menee
//! käyttöjärjestelmän avainsäilöön vain jos käyttäjä valitsi "muista minut".

use crate::error::{AppError, AppResult};
use crate::supabase::{Client, Session, SignUpOutcome};
use crate::{secrets, util};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// Laitetunnus on satunnainen ja luodaan kerran asennusta kohden. Se ei ole
/// laitteiston sormenjälki eikä sido käyttäjää koneeseen — sen ainoa tehtävä on
/// erottaa saman tilin istunnot toisistaan hallintanäkymässä.
const DEVICE_KEY: &str = "device_key";

// ===== Käyttöliittymälle menevät muodot =====

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub username: String,
    #[serde(default)]
    pub email: String,
    pub role: String,
    pub status: String,
    pub language: String,
    #[serde(default)]
    pub must_change_password: bool,
    #[serde(default)]
    pub created_at: String,
    /// Roolin ylittävät poikkeukset. Tyhjä = pelkkä rooli ratkaisee.
    #[serde(default)]
    pub permissions: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudSession {
    pub user: Profile,
    pub expires_at: i64,
    pub app_version: String,
}

/// Rekisteröitymisen tulos käyttöliittymälle.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignUpResult {
    pub requires_verification: bool,
    pub email: String,
}

// ===== Istunnon hallinta =====

pub struct Cloud {
    client: Client,
    session: Mutex<Option<Session>>,
}

impl Cloud {
    pub fn new() -> AppResult<Cloud> {
        Ok(Cloud {
            client: Client::new()?,
            session: Mutex::new(None),
        })
    }

    fn store(&self, s: Option<Session>) {
        if let Ok(mut g) = self.session.lock() {
            *g = s;
        }
    }

    fn snapshot(&self) -> Option<Session> {
        self.session.lock().ok().and_then(|g| g.clone())
    }

    pub fn is_signed_in(&self) -> bool {
        self.snapshot().is_some()
    }

    /// Palauttaa voimassa olevan pääsytokenin ja uusii sen tarvittaessa.
    ///
    /// Lukko otetaan ja vapautetaan ennen jokaista `await`ia — muuten tästä
    /// tulisi future, jota Tauri ei voi ajaa.
    async fn token(&self) -> AppResult<String> {
        let current = self.snapshot().ok_or(AppError::NotAuthenticated)?;
        if !current.needs_refresh() {
            return Ok(current.access_token);
        }

        match self.client.refresh(&current.refresh_token).await {
            Ok(fresh) => {
                let token = fresh.access_token.clone();
                if secrets::exists(secrets::REMEMBER_TOKEN) {
                    let _ = secrets::set(secrets::REMEMBER_TOKEN, &fresh.refresh_token);
                }
                self.store(Some(fresh));
                Ok(token)
            }
            Err(e) => {
                // Virkistys epäonnistui: istunto on mennyttä, ei jätetä
                // vanhentunutta tokenia muistiin.
                self.store(None);
                let _ = secrets::delete(secrets::REMEMBER_TOKEN);
                Err(match e {
                    AppError::Internal(_) => e, // verkkovirhe — kerrotaan sellaisena
                    _ => AppError::NotAuthenticated,
                })
            }
        }
    }

    // ===== Kirjautuminen =====

    pub async fn sign_up(
        &self,
        email: &str,
        password: &str,
        username: &str,
        language: &str,
    ) -> AppResult<SignUpResult> {
        let email = util::normalize_email(email);
        let username = util::validate_username(username)?;

        match self
            .client
            .sign_up(&email, password, &username, language)
            .await?
        {
            SignUpOutcome::Session(s) => {
                self.store(Some(*s));
                Ok(SignUpResult {
                    requires_verification: false,
                    email,
                })
            }
            SignUpOutcome::NeedsVerification => Ok(SignUpResult {
                requires_verification: true,
                email,
            }),
        }
    }

    /// Vahvistaa rekisteröitymisen kertakoodilla ja kirjaa käyttäjän sisään.
    pub async fn verify_signup(&self, email: &str, code: &str) -> AppResult<CloudSession> {
        let email = util::normalize_email(email);
        let s = self
            .client
            .verify_otp(&email, code.trim(), "signup")
            .await?;
        self.store(Some(s));
        self.finish_sign_in(false).await
    }

    pub async fn resend_code(&self, email: &str, kind: &str) -> AppResult<()> {
        let email = util::normalize_email(email);
        self.client.resend(&email, kind).await
    }

    pub async fn sign_in(
        &self,
        email: &str,
        password: &str,
        remember: bool,
    ) -> AppResult<CloudSession> {
        let email = util::normalize_email(email);
        let s = self.client.sign_in(&email, password).await?;
        self.store(Some(s));
        self.finish_sign_in(remember).await
    }

    /// Yritetään jatkaa edellistä istuntoa avainsäilön virkistystokenilla.
    pub async fn restore(&self) -> AppResult<Option<CloudSession>> {
        let Some(refresh) = secrets::get(secrets::REMEMBER_TOKEN) else {
            return Ok(None);
        };
        match self.client.refresh(&refresh).await {
            Ok(s) => {
                self.store(Some(s));
                match self.finish_sign_in(true).await {
                    Ok(session) => Ok(Some(session)),
                    Err(_) => {
                        self.store(None);
                        let _ = secrets::delete(secrets::REMEMBER_TOKEN);
                        Ok(None)
                    }
                }
            }
            Err(_) => {
                let _ = secrets::delete(secrets::REMEMBER_TOKEN);
                Ok(None)
            }
        }
    }

    /// Yhteinen loppuosa kaikille kirjautumistavoille: hae profiili, tarkista
    /// tilin tila, tallenna "muista minut" ja kirjaa tapahtuma.
    async fn finish_sign_in(&self, remember: bool) -> AppResult<CloudSession> {
        let profile = self.me().await?;

        if profile.status != "ACTIVE" {
            self.sign_out().await.ok();
            return Err(AppError::AccountDisabled);
        }

        if remember {
            if let Some(s) = self.snapshot() {
                let _ = secrets::set(secrets::REMEMBER_TOKEN, &s.refresh_token);
            }
        } else {
            let _ = secrets::delete(secrets::REMEMBER_TOKEN);
        }

        self.register_device().await;
        self.audit("LOGIN_SUCCESS", "AUTH", "INFO", true, None)
            .await;

        let expires_at = self.snapshot().map(|s| s.expires_at).unwrap_or_default();
        Ok(CloudSession {
            user: profile,
            expires_at,
            app_version: util::app_version(),
        })
    }

    pub async fn sign_out(&self) -> AppResult<()> {
        let token = self.snapshot().map(|s| s.access_token);
        self.store(None);
        let _ = secrets::delete(secrets::REMEMBER_TOKEN);
        if let Some(t) = token {
            let _ = self.client.sign_out(&t).await;
        }
        Ok(())
    }

    pub async fn request_password_reset(&self, email: &str) -> AppResult<()> {
        let email = util::normalize_email(email);
        self.client.request_password_reset(&email).await
    }

    /// Palautuskoodi vaihdetaan istunnoksi, jonka läpi uusi salasana asetetaan.
    pub async fn reset_password(
        &self,
        email: &str,
        code: &str,
        new_password: &str,
    ) -> AppResult<()> {
        let email = util::normalize_email(email);
        let s = self
            .client
            .verify_otp(&email, code.trim(), "recovery")
            .await?;
        let token = s.access_token.clone();
        self.store(Some(s));
        self.client
            .update_user(&token, serde_json::json!({ "password": new_password }))
            .await?;
        self.audit("PASSWORD_RESET_COMPLETED", "SECURITY", "NOTICE", true, None)
            .await;
        Ok(())
    }

    pub async fn change_password(&self, new_password: &str) -> AppResult<()> {
        let token = self.token().await?;
        self.client
            .update_user(&token, serde_json::json!({ "password": new_password }))
            .await?;
        self.audit("PASSWORD_CHANGED", "SECURITY", "NOTICE", true, None)
            .await;
        Ok(())
    }

    // ===== Profiili =====

    pub async fn me(&self) -> AppResult<Profile> {
        let token = self.token().await?;
        let value: serde_json::Value = self
            .client
            .rpc(&token, "me", &serde_json::json!({}))
            .await?;
        if value.is_null() {
            return Err(AppError::NotAuthenticated);
        }
        serde_json::from_value(value)
            .map_err(|e| AppError::internal(format!("profiilin jäsennys: {e}")))
    }

    pub async fn set_language(&self, language: &str) -> AppResult<()> {
        let token = self.token().await?;
        let id = self.snapshot().map(|s| s.user_id).unwrap_or_default();
        self.client
            .update(
                &token,
                "profiles",
                &format!("id=eq.{id}"),
                &serde_json::json!({ "language": language }),
            )
            .await
    }

    // ===== Auditointi =====

    /// Kirjaa tapahtuman. Ei koskaan kaada kutsuvaa toimintoa: jos loki ei mene
    /// perille, käyttäjän toiminto silti onnistuu.
    pub async fn audit(
        &self,
        event: &str,
        category: &str,
        severity: &str,
        success: bool,
        meta: Option<serde_json::Value>,
    ) {
        let Ok(token) = self.token().await else {
            return;
        };
        let Some(s) = self.snapshot() else { return };

        let row = serde_json::json!({
            "event": event,
            "category": category,
            "severity": severity,
            "result": if success { "SUCCESS" } else { "FAILURE" },
            "actor_id": s.user_id,
            "app_version": util::app_version(),
            "os": std::env::consts::OS,
            "meta": meta,
        });

        if let Err(e) = self.client.insert(&token, "audit_log", &row).await {
            log::warn!("audit-kirjaus epäonnistui: {e}");
        }
    }

    /// Kirjaa työkalun avaamisen. Kutsutaan jokaisesta avauksesta, joten tämä
    /// on tarkoituksella kevyt eikä odota vastausta virheettömyydeltä.
    pub async fn log_tool(&self, tool_id: &str) {
        let Ok(token) = self.token().await else {
            return;
        };
        let Some(s) = self.snapshot() else { return };
        let row = serde_json::json!({ "user_id": s.user_id, "tool_id": tool_id });
        let _ = self.client.insert(&token, "tool_usage", &row).await;
    }

    // ===== Laite =====

    fn device_key() -> String {
        if let Some(k) = secrets::get(DEVICE_KEY) {
            return k;
        }
        let k = util::random_token(16);
        let _ = secrets::set(DEVICE_KEY, &k);
        k
    }

    async fn register_device(&self) {
        let Ok(token) = self.token().await else {
            return;
        };
        let Some(s) = self.snapshot() else { return };

        let row = serde_json::json!({
            "user_id": s.user_id,
            "device_key": Self::device_key(),
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
            "app_version": util::app_version(),
            "last_seen_at": "now()",
        });
        // Sama laite voi kirjautua uudelleen: päivitetään rivi jos se on jo olemassa.
        let req = self
            .client
            .insert_upsert(&token, "devices", &row, "user_id,device_key")
            .await;
        if let Err(e) = req {
            log::warn!("laitetiedon kirjaus epäonnistui: {e}");
        }
    }

    // ===== Asetukset =====

    /// Sovelluksen globaalit asetukset. Luku on sallittu kaikille kirjautuneille.
    pub async fn settings(&self) -> AppResult<Vec<(String, String)>> {
        #[derive(Deserialize)]
        struct Row {
            key: String,
            value: String,
        }
        let token = self.token().await?;
        let rows: Vec<Row> = self
            .client
            .select(&token, "app_settings", "select=key,value")
            .await?;
        Ok(rows.into_iter().map(|r| (r.key, r.value)).collect())
    }

    /// Kirjoitus on omistajan RPC — palvelin torjuu muut.
    pub async fn set_setting(&self, key: &str, value: &str) -> AppResult<()> {
        let token = self.token().await?;
        let _: serde_json::Value = self
            .client
            .rpc(
                &token,
                "owner_set_setting",
                &serde_json::json!({ "k": key, "v": value }),
            )
            .await?;
        Ok(())
    }

    // ===== Hallinta =====

    pub async fn admin_stats(&self) -> AppResult<serde_json::Value> {
        let token = self.token().await?;
        self.client
            .rpc(&token, "admin_stats", &serde_json::json!({}))
            .await
    }

    pub async fn list_users(&self, limit: u32, offset: u32) -> AppResult<Vec<Profile>> {
        let token = self.token().await?;
        let q = format!(
            "select=id,username,role,status,language,must_change_password,created_at\
             &order=created_at.desc&limit={limit}&offset={offset}"
        );
        self.client.select(&token, "profiles", &q).await
    }

    pub async fn set_user_role(&self, user_id: &str, role: &str) -> AppResult<()> {
        let token = self.token().await?;
        let _: serde_json::Value = self
            .client
            .rpc(
                &token,
                "admin_set_role",
                &serde_json::json!({ "target": user_id, "new_role": role }),
            )
            .await?;
        Ok(())
    }

    pub async fn set_user_status(&self, user_id: &str, status: &str) -> AppResult<()> {
        let token = self.token().await?;
        let _: serde_json::Value = self
            .client
            .rpc(
                &token,
                "admin_set_status",
                &serde_json::json!({ "target": user_id, "new_status": status }),
            )
            .await?;
        Ok(())
    }

    pub async fn audit_list(
        &self,
        limit: u32,
        offset: u32,
        filter: Option<&str>,
    ) -> AppResult<serde_json::Value> {
        let token = self.token().await?;
        let mut q = format!("select=*&order=ts.desc&limit={limit}&offset={offset}");
        if let Some(f) = filter {
            if !f.is_empty() {
                q.push('&');
                q.push_str(f);
            }
        }
        let rows: Vec<serde_json::Value> = self.client.select(&token, "audit_log", &q).await?;
        Ok(serde_json::Value::Array(rows))
    }
}
