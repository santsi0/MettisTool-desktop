//! Supabase-asiakas: tunnistautuminen (GoTrue) ja tietokanta (PostgREST).
//!
//! Sovellus on epäluotettava asiakas. Se kantaa mukanaan vain julkista
//! anon-avainta, eikä yksikään oikeustarkistus ole täällä — ne ovat tietokannan
//! RLS-säännöissä. Tämän moduulin tehtävä on puhua HTTP:tä oikein ja pitää
//! tokenit poissa käyttöliittymästä.
//!
//! Pääsytoken elää vain Rustin muistissa. Virkistystoken tallennetaan
//! käyttöjärjestelmän avainsäilöön, ei koskaan tietokantaan tai tiedostoon.

use crate::error::{AppError, AppResult};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use std::sync::OnceLock;
use std::time::Duration;

const CONFIG_JSON: &str = include_str!("../supabase.json");

/// Pääsytoken uusitaan tämän verran ennen vanhenemista, jottei kesken
/// olevaa pyyntöä hylätä.
const REFRESH_MARGIN_SECS: i64 = 60;
const TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Deserialize)]
struct RawConfig {
    url: String,
    #[serde(rename = "anonKey")]
    anon_key: String,
}

pub struct Config {
    pub url: String,
    pub anon_key: String,
}

pub fn config() -> &'static Config {
    static CELL: OnceLock<Config> = OnceLock::new();
    CELL.get_or_init(|| {
        let raw: RawConfig = serde_json::from_str(CONFIG_JSON).expect("supabase.json on viallinen");
        Config {
            url: raw.url.trim_end_matches('/').to_string(),
            anon_key: raw.anon_key,
        }
    })
}

// ===== Istunto =====

#[derive(Clone, Debug)]
pub struct Session {
    pub access_token: String,
    pub refresh_token: String,
    /// Unix-aika, jolloin pääsytoken vanhenee.
    pub expires_at: i64,
    pub user_id: String,
    pub email: String,
}

impl Session {
    pub fn needs_refresh(&self) -> bool {
        crate::util::now() + REFRESH_MARGIN_SECS >= self.expires_at
    }
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: i64,
    user: UserObject,
}

#[derive(Deserialize)]
struct UserObject {
    id: String,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    email_confirmed_at: Option<String>,
}

impl TokenResponse {
    fn into_session(self) -> Session {
        Session {
            access_token: self.access_token,
            refresh_token: self.refresh_token,
            expires_at: crate::util::now() + self.expires_in,
            user_id: self.user.id,
            email: self.user.email.unwrap_or_default(),
        }
    }
}

/// Rekisteröitymisen lopputulos: joko istunto heti tai odotus vahvistuskoodille.
pub enum SignUpOutcome {
    Session(Box<Session>),
    NeedsVerification,
}

// ===== Virheiden kääntäminen =====

/// `code` on GoTrussa luku (`"code":400`) ja PostgRESTissä merkkijono
/// (`"code":"42501"`). Ilman tätä koko virhejäsennys kaatuisi ja jokainen
/// virhe näkyisi käyttäjälle geneerisenä sisäisenä virheenä.
#[derive(Deserialize)]
#[serde(untagged)]
enum Scalar {
    Text(String),
    Number(i64),
}

impl Scalar {
    fn into_string(self) -> String {
        match self {
            Scalar::Text(s) => s,
            Scalar::Number(n) => n.to_string(),
        }
    }
}

#[derive(Deserialize, Default)]
struct ApiError {
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    error_description: Option<String>,
    #[serde(default)]
    error_code: Option<String>,
    #[serde(default)]
    msg: Option<String>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    code: Option<Scalar>,
}

/// Supabasen virhekoodit käännetään sovelluksen omiksi, jotta käyttöliittymä
/// näyttää saman viestin riippumatta siitä, mistä virhe tuli.
fn map_error(status: u16, body: &str) -> AppError {
    let e: ApiError = serde_json::from_str(body).unwrap_or_default();
    let code = e
        .error_code
        .or_else(|| e.code.map(Scalar::into_string))
        .or(e.error)
        .unwrap_or_default()
        .to_lowercase();
    let msg = e
        .error_description
        .or(e.msg)
        .or(e.message)
        .unwrap_or_default()
        .to_lowercase();

    match (status, code.as_str()) {
        (400 | 401, c) if c.contains("invalid_credentials") => AppError::InvalidCredentials,
        (_, c) if c.contains("email_not_confirmed") => AppError::EmailNotVerified,
        (_, c) if c.contains("user_already_exists") || c.contains("email_exists") => {
            AppError::Conflict("email".into())
        }
        (_, c) if c.contains("weak_password") => AppError::validation("password", "weak"),
        (_, c) if c.contains("otp_expired") || c.contains("token_expired") => {
            AppError::TokenExpired
        }
        (_, c) if c.contains("otp_disabled") || c.contains("invalid_token") => {
            AppError::TokenInvalid
        }
        (_, c) if c.contains("over_email_send_rate_limit") || c.contains("over_request_rate") => {
            AppError::RateLimited { retry_after: 60 }
        }
        (401 | 403, _) => {
            // PostgREST palauttaa 42501 kun RLS estää — se on oikeusvirhe,
            // ei tunnistautumisvirhe.
            if code == "42501" || msg.contains("permission denied") {
                AppError::Forbidden
            } else {
                AppError::NotAuthenticated
            }
        }
        (404, _) => AppError::NotFound,
        (429, _) => AppError::RateLimited { retry_after: 60 },
        _ => {
            if msg.contains("invalid login") {
                AppError::InvalidCredentials
            } else {
                // Yksityiskohdat lokiin, ei käyttöliittymään.
                AppError::internal(format!(
                    "supabase {status}: {}",
                    crate::util::sanitize_line(body, 200)
                ))
            }
        }
    }
}

// ===== Asiakas =====

pub struct Client {
    http: reqwest::Client,
}

impl Client {
    pub fn new() -> AppResult<Client> {
        let http = reqwest::Client::builder()
            .timeout(TIMEOUT)
            .user_agent(format!("MettisTool/{}", crate::util::app_version()))
            .build()
            .map_err(|e| AppError::internal(format!("http-asiakas: {e}")))?;
        Ok(Client { http })
    }

    fn auth(&self, path: &str) -> String {
        format!("{}/auth/v1/{}", config().url, path)
    }

    fn rest(&self, path: &str) -> String {
        format!("{}/rest/v1/{}", config().url, path)
    }

    async fn send<T: DeserializeOwned>(&self, req: reqwest::RequestBuilder) -> AppResult<T> {
        let res = req
            .header("apikey", config().anon_key.as_str())
            .send()
            .await
            .map_err(|e| AppError::internal(format!("verkko: {}", e.without_url())))?;
        let status = res.status().as_u16();
        let body = res
            .text()
            .await
            .map_err(|_| AppError::internal("vastausta ei voitu lukea"))?;

        if !(200..300).contains(&status) {
            return Err(map_error(status, &body));
        }
        if body.trim().is_empty() {
            // 204 No Content — kutsuja odottaa tyhjää arvoa.
            return serde_json::from_str("null")
                .map_err(|_| AppError::internal("tyhjä vastaus ei kelpaa tähän"));
        }
        serde_json::from_str(&body)
            .map_err(|e| AppError::internal(format!("vastauksen jäsennys: {e}")))
    }

    // --- Tunnistautuminen ---

    /// Luo tilin. Käyttäjänimi ja kieli menevät metatietoihin, joista
    /// tietokannan liipaisin rakentaa profiilin.
    pub async fn sign_up(
        &self,
        email: &str,
        password: &str,
        username: &str,
        language: &str,
    ) -> AppResult<SignUpOutcome> {
        #[derive(Deserialize)]
        struct SignUpResponse {
            #[serde(default)]
            access_token: Option<String>,
            #[serde(default)]
            refresh_token: Option<String>,
            #[serde(default)]
            expires_in: Option<i64>,
            #[serde(default)]
            id: Option<String>,
            #[serde(default)]
            email: Option<String>,
            #[serde(default)]
            user: Option<UserObject>,
        }

        let body = serde_json::json!({
            "email": email,
            "password": password,
            "data": { "username": username, "language": language }
        });

        let r: SignUpResponse = self
            .send(self.http.post(self.auth("signup")).json(&body))
            .await?;

        match (r.access_token, r.refresh_token, r.expires_in) {
            (Some(at), Some(rt), Some(exp)) => {
                let (id, mail) = match r.user {
                    Some(u) => (u.id, u.email.unwrap_or_default()),
                    None => (r.id.unwrap_or_default(), r.email.unwrap_or_default()),
                };
                Ok(SignUpOutcome::Session(Box::new(Session {
                    access_token: at,
                    refresh_token: rt,
                    expires_at: crate::util::now() + exp,
                    user_id: id,
                    email: mail,
                })))
            }
            _ => Ok(SignUpOutcome::NeedsVerification),
        }
    }

    pub async fn sign_in(&self, email: &str, password: &str) -> AppResult<Session> {
        let body = serde_json::json!({ "email": email, "password": password });
        let r: TokenResponse = self
            .send(
                self.http
                    .post(self.auth("token?grant_type=password"))
                    .json(&body),
            )
            .await?;
        Ok(r.into_session())
    }

    /// Vahvistaa sähköpostiin lähetetyn kertakoodin.
    /// `kind` on "signup", "email_change" tai "recovery".
    pub async fn verify_otp(&self, email: &str, token: &str, kind: &str) -> AppResult<Session> {
        let body = serde_json::json!({ "email": email, "token": token, "type": kind });
        let r: TokenResponse = self
            .send(self.http.post(self.auth("verify")).json(&body))
            .await?;
        Ok(r.into_session())
    }

    /// Lähettää vahvistuskoodin uudelleen.
    pub async fn resend(&self, email: &str, kind: &str) -> AppResult<()> {
        let body = serde_json::json!({ "email": email, "type": kind });
        let _: serde_json::Value = self
            .send(self.http.post(self.auth("resend")).json(&body))
            .await?;
        Ok(())
    }

    /// Käynnistää salasanan palautuksen. Vastaus on aina onnistunut, jottei
    /// tilin olemassaolo paljastu.
    pub async fn request_password_reset(&self, email: &str) -> AppResult<()> {
        let body = serde_json::json!({ "email": email });
        let _: serde_json::Value = self
            .send(self.http.post(self.auth("recover")).json(&body))
            .await?;
        Ok(())
    }

    pub async fn refresh(&self, refresh_token: &str) -> AppResult<Session> {
        let body = serde_json::json!({ "refresh_token": refresh_token });
        let r: TokenResponse = self
            .send(
                self.http
                    .post(self.auth("token?grant_type=refresh_token"))
                    .json(&body),
            )
            .await?;
        Ok(r.into_session())
    }

    pub async fn sign_out(&self, access_token: &str) -> AppResult<()> {
        let _: serde_json::Value = self
            .send(
                self.http
                    .post(self.auth("logout"))
                    .bearer_auth(access_token),
            )
            .await?;
        Ok(())
    }

    /// Vaihtaa kirjautuneen käyttäjän salasanan tai sähköpostin.
    pub async fn update_user(&self, access_token: &str, patch: serde_json::Value) -> AppResult<()> {
        let _: serde_json::Value = self
            .send(
                self.http
                    .put(self.auth("user"))
                    .bearer_auth(access_token)
                    .json(&patch),
            )
            .await?;
        Ok(())
    }

    // --- Tietokanta (PostgREST) ---

    /// `query` on PostgRESTin hakumerkkijono ilman kysymysmerkkiä,
    /// esim. `select=id,username&order=created_at.desc&limit=50`.
    pub async fn select<T: DeserializeOwned>(
        &self,
        access_token: &str,
        table: &str,
        query: &str,
    ) -> AppResult<Vec<T>> {
        let url = if query.is_empty() {
            self.rest(table)
        } else {
            format!("{}?{}", self.rest(table), query)
        };
        self.send(self.http.get(&url).bearer_auth(access_token))
            .await
    }

    pub async fn insert(
        &self,
        access_token: &str,
        table: &str,
        rows: &serde_json::Value,
    ) -> AppResult<()> {
        let _: serde_json::Value = self
            .send(
                self.http
                    .post(self.rest(table))
                    .bearer_auth(access_token)
                    .header("Prefer", "return=minimal")
                    .json(rows),
            )
            .await?;
        Ok(())
    }

    /// Lisää rivin ja päivittää sen, jos annettu yksilöivä sarakejoukko on jo
    /// olemassa. Käytetään esimerkiksi laiterivin pitämiseen ajan tasalla.
    pub async fn insert_upsert(
        &self,
        access_token: &str,
        table: &str,
        rows: &serde_json::Value,
        on_conflict: &str,
    ) -> AppResult<()> {
        let url = format!("{}?on_conflict={}", self.rest(table), on_conflict);
        let _: serde_json::Value = self
            .send(
                self.http
                    .post(&url)
                    .bearer_auth(access_token)
                    .header("Prefer", "resolution=merge-duplicates,return=minimal")
                    .json(rows),
            )
            .await?;
        Ok(())
    }

    pub async fn update(
        &self,
        access_token: &str,
        table: &str,
        filter: &str,
        patch: &serde_json::Value,
    ) -> AppResult<()> {
        let url = format!("{}?{}", self.rest(table), filter);
        let _: serde_json::Value = self
            .send(
                self.http
                    .patch(&url)
                    .bearer_auth(access_token)
                    .header("Prefer", "return=minimal")
                    .json(patch),
            )
            .await?;
        Ok(())
    }

    /// Kutsuu funktiota ilman istuntoa. Vain `public_status()` on sallittu
    /// anonille — muut torjutaan tietokannassa.
    pub async fn rpc_anon<T: DeserializeOwned>(
        &self,
        function: &str,
        args: &serde_json::Value,
    ) -> AppResult<T> {
        self.send(
            self.http
                .post(self.rest(&format!("rpc/{function}")))
                .json(args),
        )
        .await
    }

    /// Kutsuu tietokannan funktiota. Kaikki oikeustarkistukset tehdään siellä.
    pub async fn rpc<T: DeserializeOwned>(
        &self,
        access_token: &str,
        function: &str,
        args: &serde_json::Value,
    ) -> AppResult<T> {
        self.send(
            self.http
                .post(self.rest(&format!("rpc/{function}")))
                .bearer_auth(access_token)
                .json(args),
        )
        .await
    }
}
