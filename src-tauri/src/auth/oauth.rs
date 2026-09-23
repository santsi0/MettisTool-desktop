//! Google-kirjautuminen (OAuth 2.0 Authorization Code + PKCE).
//!
//! Sovellus EI koskaan kysy eikä tallenna Googlen salasanaa. Tunnistautuminen
//! tapahtuu käyttäjän omassa selaimessa Googlen virallisella sivulla, ja sovellus
//! vastaanottaa vain kertakäyttöisen valtuutuskoodin paikalliseen takaisinkutsu-
//! osoitteeseen (127.0.0.1). Koodi vaihdetaan tunnisteiksi suoraan Googlen
//! token-päätepisteessä TLS-yhteydellä; pääsytokenia ei tallenneta levylle.

use crate::error::{AppError, AppResult};
use crate::state::{AppState, OAuthFlow};
use crate::util::{now, random_token};
use base64::Engine as _;
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::time::Duration;

const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT: &str = "https://openidconnect.googleapis.com/v1/userinfo";
const FLOW_TIMEOUT_SECS: u64 = 180;

#[derive(Debug, Clone)]
pub struct OAuthCallback {
    pub code: Option<String>,
    pub state: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GoogleUser {
    pub subject: String,
    pub email: String,
    pub email_verified: bool,
    pub name: Option<String>,
}

pub fn client_id() -> Option<String> {
    crate::secrets::get_with_env(crate::secrets::GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID")
}

pub fn client_secret() -> Option<String> {
    crate::secrets::get_with_env(crate::secrets::GOOGLE_CLIENT_SECRET, "GOOGLE_CLIENT_SECRET")
}

pub fn is_configured() -> bool {
    client_id().is_some() && client_secret().is_some()
}

fn pkce_challenge(verifier: &str) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// Aloittaa kirjautumisen: varaa paikallisen portin, käynnistää odottavan säikeen
/// ja palauttaa osoitteen, joka avataan käyttäjän omassa selaimessa.
pub fn begin(state: &AppState, link_to_user: Option<i64>) -> AppResult<String> {
    let client = client_id().ok_or(AppError::OAuthNotConfigured)?;
    if client_secret().is_none() {
        return Err(AppError::OAuthNotConfigured);
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| AppError::OAuthFailed(format!("paikallista porttia ei saatu: {e}")))?;
    let port = listener
        .local_addr()
        .map_err(|e| AppError::OAuthFailed(e.to_string()))?
        .port();
    listener
        .set_nonblocking(false)
        .map_err(|e| AppError::OAuthFailed(e.to_string()))?;

    let csrf_state = random_token(24);
    let verifier = random_token(48);
    let challenge = pkce_challenge(&verifier);
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");

    if let Ok(mut flow) = state.oauth.lock() {
        *flow = Some(OAuthFlow {
            state: csrf_state.clone(),
            pkce_verifier: verifier,
            redirect_uri: redirect_uri.clone(),
            created_at: now(),
            link_to_user,
        });
    }
    if let Ok(mut result) = state.oauth_result.lock() {
        *result = None;
    }

    let slot = state.oauth_result_handle();
    std::thread::spawn(move || {
        let outcome = wait_for_callback(listener);
        if let Ok(mut guard) = slot.lock() {
            *guard = Some(outcome);
        }
    });

    let url = format!(
        "{AUTH_ENDPOINT}?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=select_account",
        urlencode(&client),
        urlencode(&redirect_uri),
        urlencode("openid email profile"),
        urlencode(&csrf_state),
        urlencode(&challenge)
    );
    Ok(url)
}

fn html_response(title: &str, body: &str) -> String {
    let page = format!(
        r#"<!DOCTYPE html><html lang="fi"><head><meta charset="utf-8"><title>MettisTool</title>
<style>body{{margin:0;height:100vh;display:grid;place-items:center;background:#08090C;color:#E8EAF0;
font:15px/1.6 -apple-system,Segoe UI,sans-serif}}.c{{text-align:center;max-width:420px;padding:32px;
border:1px solid #252934;border-radius:10px;background:#12151B}}h1{{font-size:18px;margin:0 0 10px}}
p{{margin:0;color:#7F8592;font-size:13.5px}}.m{{color:#E8323C;font-weight:600;letter-spacing:.12em;
font-size:11px;text-transform:uppercase;margin-bottom:14px}}</style></head>
<body><div class="c"><div class="m">MettisTool</div><h1>{title}</h1><p>{body}</p></div></body></html>"#
    );
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n{}",
        page.as_bytes().len(),
        page
    )
}

fn wait_for_callback(listener: TcpListener) -> OAuthCallback {
    let deadline = std::time::Instant::now() + Duration::from_secs(FLOW_TIMEOUT_SECS);

    loop {
        if std::time::Instant::now() > deadline {
            return OAuthCallback {
                code: None,
                state: String::new(),
                error: Some("timeout".into()),
            };
        }

        let _ = listener.set_nonblocking(true);
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut request_line = String::new();
                {
                    let mut reader = BufReader::new(&stream);
                    let _ = reader.read_line(&mut request_line);
                }

                let target = request_line.split_whitespace().nth(1).unwrap_or("/");
                let parsed = parse_callback(target);

                let response = if parsed.code.is_some() {
                    html_response(
                        "Kirjautuminen onnistui",
                        "Voit sulkea tämän välilehden ja palata MettisTooliin.",
                    )
                } else {
                    html_response(
                        "Kirjautuminen keskeytyi",
                        "Palaa MettisTooliin ja yritä uudelleen.",
                    )
                };
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();
                return parsed;
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(e) => {
                return OAuthCallback {
                    code: None,
                    state: String::new(),
                    error: Some(format!("kuuntelu epäonnistui: {e}")),
                };
            }
        }
    }
}

fn parse_callback(target: &str) -> OAuthCallback {
    let query = target.split_once('?').map(|(_, q)| q).unwrap_or("");
    let mut code = None;
    let mut state = String::new();
    let mut error = None;

    for pair in query.split('&') {
        let Some((k, v)) = pair.split_once('=') else { continue };
        let value = percent_decode(v);
        match k {
            "code" => code = Some(value),
            "state" => state = value,
            "error" => error = Some(value),
            _ => {}
        }
    }
    OAuthCallback { code, state, error }
}

fn percent_decode(input: &str) -> String {
    let bytes = input.replace('+', " ").into_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&format!("{}{}", bytes[i + 1] as char, bytes[i + 2] as char), 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// Vaihtaa valtuutuskoodin käyttäjätietoihin. Tokenit elävät vain tämän funktion ajan.
pub async fn exchange(code: &str, verifier: &str, redirect_uri: &str) -> AppResult<GoogleUser> {
    let client_id = client_id().ok_or(AppError::OAuthNotConfigured)?;
    let client_secret = client_secret().ok_or(AppError::OAuthNotConfigured)?;

    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(format!("MettisTool/{}", crate::util::app_version()))
        .build()
        .map_err(|e| AppError::OAuthFailed(format!("http-asiakas: {e}")))?;

    let form = [
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("code", code),
        ("code_verifier", verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri),
    ];

    let res = http
        .post(TOKEN_ENDPOINT)
        .form(&form)
        .send()
        .await
        .map_err(|e| AppError::OAuthFailed(format!("token-pyyntö epäonnistui: {}", e.without_url())))?;

    if !res.status().is_success() {
        return Err(AppError::OAuthFailed(format!(
            "Google vastasi HTTP {}",
            res.status().as_u16()
        )));
    }

    #[derive(serde::Deserialize)]
    struct TokenResponse {
        access_token: String,
    }
    let token: TokenResponse = res
        .json()
        .await
        .map_err(|_| AppError::OAuthFailed("token-vastausta ei voitu lukea".into()))?;

    // Käyttäjätiedot haetaan suoraan Googlelta TLS-yhteydellä juuri saadulla
    // pääsytokenilla, joten tiedon alkuperä on varmistettu.
    let res = http
        .get(USERINFO_ENDPOINT)
        .bearer_auth(&token.access_token)
        .send()
        .await
        .map_err(|e| AppError::OAuthFailed(format!("käyttäjätietojen haku epäonnistui: {}", e.without_url())))?;

    if !res.status().is_success() {
        return Err(AppError::OAuthFailed(format!(
            "käyttäjätiedot: HTTP {}",
            res.status().as_u16()
        )));
    }

    #[derive(serde::Deserialize)]
    struct UserInfo {
        sub: String,
        email: Option<String>,
        email_verified: Option<bool>,
        name: Option<String>,
    }
    let info: UserInfo = res
        .json()
        .await
        .map_err(|_| AppError::OAuthFailed("käyttäjätietoja ei voitu lukea".into()))?;

    let email = info
        .email
        .ok_or_else(|| AppError::OAuthFailed("Google ei palauttanut sähköpostiosoitetta".into()))?;

    Ok(GoogleUser {
        subject: info.sub,
        email,
        email_verified: info.email_verified.unwrap_or(false),
        name: info.name,
    })
}
