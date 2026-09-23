//! Sähköposti Resend-palvelun kautta.
//!
//! API-avain luetaan käyttöjärjestelmän avainsäilöstä eikä sitä koskaan kirjoiteta
//! tietokantaan, lokiin tai Discordiin. Koska kyseessä on työpöytäsovellus eikä
//! verkkopalvelin, vahvistus ja salasanan palautus käyttävät **koodia**, jonka
//! käyttäjä kirjoittaa sovellukseen — ei klikattavaa linkkiä.

use crate::db::models::EmailStatus;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::{secrets, settings, util};

pub struct Mail {
    pub to: String,
    pub subject: String,
    pub html: String,
    pub text: String,
}

pub fn api_key() -> Option<String> {
    secrets::get_with_env(secrets::RESEND_API_KEY, "RESEND_API_KEY")
}

pub fn is_configured(db: &Db) -> bool {
    api_key().is_some()
        && !settings::get(db, settings::EMAIL_SENDER_ADDRESS)
            .trim()
            .is_empty()
}

pub fn status(db: &Db) -> EmailStatus {
    EmailStatus {
        configured: is_configured(db),
        sender_name: settings::get(db, settings::EMAIL_SENDER_NAME),
        sender_email: settings::get(db, settings::EMAIL_SENDER_ADDRESS),
        last_success: settings::get(db, settings::EMAIL_LAST_SUCCESS).parse().ok(),
        last_failure: settings::get(db, settings::EMAIL_LAST_FAILURE).parse().ok(),
        last_error: {
            let e = settings::get(db, settings::EMAIL_LAST_ERROR);
            if e.is_empty() {
                None
            } else {
                Some(e)
            }
        },
        failure_count: settings::get(db, settings::EMAIL_FAILURE_COUNT)
            .parse()
            .unwrap_or(0),
        sent_count: settings::get(db, settings::EMAIL_SENT_COUNT)
            .parse()
            .unwrap_or(0),
    }
}

/// Lähettää viestin. Palauttaa selkeän virheen jos palvelua ei ole määritetty.
pub async fn send(db: &Db, mail: Mail) -> AppResult<()> {
    let key = api_key().ok_or(AppError::EmailNotConfigured)?;
    let sender_name = settings::get(db, settings::EMAIL_SENDER_NAME);
    let sender_address = settings::get(db, settings::EMAIL_SENDER_ADDRESS);
    if sender_address.trim().is_empty() {
        return Err(AppError::EmailNotConfigured);
    }
    let from = format!("{sender_name} <{sender_address}>");

    let body = serde_json::json!({
        "from": from,
        "to": [mail.to],
        "subject": mail.subject,
        "html": mail.html,
        "text": mail.text
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent(format!("MettisTool/{}", util::app_version()))
        .build()
        .map_err(|e| AppError::internal(format!("http-asiakas: {e}")))?;

    let result = client
        .post("https://api.resend.com/emails")
        .bearer_auth(&key)
        .json(&body)
        .send()
        .await;

    let ts = util::now();
    match result {
        Ok(res) if res.status().is_success() => {
            let _ = settings::set(db, settings::EMAIL_LAST_SUCCESS, &ts.to_string(), None);
            let _ = settings::set(db, settings::EMAIL_LAST_ERROR, "", None);
            settings::bump_counter(db, settings::EMAIL_SENT_COUNT);
            Ok(())
        }
        Ok(res) => {
            let code = res.status().as_u16();
            // Vastauksen runko voi sisältää osoitteita; talletetaan vain tilakoodi.
            let msg = format!("Resend vastasi HTTP {code}");
            let _ = settings::set(db, settings::EMAIL_LAST_FAILURE, &ts.to_string(), None);
            let _ = settings::set(db, settings::EMAIL_LAST_ERROR, &msg, None);
            settings::bump_counter(db, settings::EMAIL_FAILURE_COUNT);
            log::warn!("sähköpostin lähetys epäonnistui: {msg}");
            Err(AppError::Internal(msg))
        }
        Err(e) => {
            let msg = format!("yhteys Resendiin epäonnistui: {}", e.without_url());
            let _ = settings::set(db, settings::EMAIL_LAST_FAILURE, &ts.to_string(), None);
            let _ = settings::set(db, settings::EMAIL_LAST_ERROR, &msg, None);
            settings::bump_counter(db, settings::EMAIL_FAILURE_COUNT);
            Err(AppError::Internal(msg))
        }
    }
}

// ===== Viestipohjat =====

fn layout(title: &str, intro: &str, code: Option<&str>, note: &str, footer: &str) -> String {
    let code_block = match code {
        Some(c) => format!(
            r#"<div style="margin:28px 0;padding:20px;border:1px solid #252934;border-radius:8px;background:#0E1015;text-align:center">
                 <div style="font:600 11px/1 -apple-system,Segoe UI,sans-serif;letter-spacing:.14em;color:#7F8592;text-transform:uppercase">Koodi</div>
                 <div style="margin-top:12px;font:700 30px/1 Consolas,monospace;letter-spacing:.14em;color:#E8323C">{c}</div>
               </div>"#
        ),
        None => String::new(),
    };
    format!(
        r#"<!DOCTYPE html><html><body style="margin:0;padding:0;background:#08090C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#08090C;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#12151B;border:1px solid #252934;border-radius:10px">
<tr><td style="padding:28px 28px 0">
  <div style="font:650 19px/1 -apple-system,Segoe UI,sans-serif;color:#E8EAF0">Mettis<span style="color:#E8323C">Tool</span></div>
  <div style="margin-top:4px;font:600 10px/1 -apple-system,Segoe UI,sans-serif;letter-spacing:.14em;color:#555B68">PROFESSIONAL UTILITY SUITE</div>
</td></tr>
<tr><td style="padding:24px 28px 8px">
  <h1 style="margin:0 0 12px;font:600 18px/1.3 -apple-system,Segoe UI,sans-serif;color:#E8EAF0">{title}</h1>
  <p style="margin:0;font:400 14px/1.6 -apple-system,Segoe UI,sans-serif;color:#B9BEC9">{intro}</p>
  {code_block}
  <p style="margin:0;font:400 13px/1.6 -apple-system,Segoe UI,sans-serif;color:#7F8592">{note}</p>
</td></tr>
<tr><td style="padding:20px 28px 26px;border-top:1px solid #252934;margin-top:20px">
  <p style="margin:16px 0 0;font:400 12px/1.6 -apple-system,Segoe UI,sans-serif;color:#555B68">{footer}</p>
</td></tr>
</table>
</td></tr></table></body></html>"#
    )
}

fn is_finnish(lang: &str) -> bool {
    lang.starts_with("fi")
}

pub fn verification_mail(to: &str, username: &str, code: &str, hours: i64, lang: &str) -> Mail {
    if is_finnish(lang) {
        Mail {
            to: to.to_string(),
            subject: "Vahvista sähköpostiosoitteesi — MettisTool".into(),
            html: layout(
                "Vahvista sähköpostiosoitteesi",
                &format!("Hei {username}, kirjoita alla oleva koodi MettisToolin vahvistusnäkymään viimeistellaksesi tilisi."),
                Some(code),
                &format!("Koodi on voimassa {hours} tuntia ja toimii vain kerran."),
                "Jos et luonut tiliä MettisTooliin, voit jättää tämän viestin huomiotta. Emme koskaan kysy salasanaasi sähköpostitse.",
            ),
            text: format!("Vahvista sähköpostiosoitteesi MettisToolissa.\n\nKoodi: {code}\n\nVoimassa {hours} tuntia. Jos et luonut tiliä, jätä viesti huomiotta."),
        }
    } else {
        Mail {
            to: to.to_string(),
            subject: "Verify your email — MettisTool".into(),
            html: layout(
                "Verify your email address",
                &format!("Hi {username}, enter the code below in the MettisTool verification screen to finish setting up your account."),
                Some(code),
                &format!("The code is valid for {hours} hours and can be used once."),
                "If you did not create a MettisTool account, you can ignore this message. We never ask for your password by email.",
            ),
            text: format!("Verify your MettisTool email.\n\nCode: {code}\n\nValid for {hours} hours. If you did not create an account, ignore this message."),
        }
    }
}

pub fn reset_mail(to: &str, username: &str, code: &str, minutes: i64, lang: &str) -> Mail {
    if is_finnish(lang) {
        Mail {
            to: to.to_string(),
            subject: "Salasanan palautus — MettisTool".into(),
            html: layout(
                "Salasanan palautus",
                &format!("Hei {username}, pyysit salasanan palautusta. Kirjoita koodi sovellukseen ja aseta uusi salasana."),
                Some(code),
                &format!("Koodi on voimassa {minutes} minuuttia ja toimii vain kerran."),
                "Jos et pyytänyt palautusta, tiliäsi ei ole muutettu. Suosittelemme silti vaihtamaan salasanan varmuuden vuoksi.",
            ),
            text: format!("Salasanan palautus MettisToolissa.\n\nKoodi: {code}\n\nVoimassa {minutes} minuuttia."),
        }
    } else {
        Mail {
            to: to.to_string(),
            subject: "Password reset — MettisTool".into(),
            html: layout(
                "Password reset",
                &format!("Hi {username}, you requested a password reset. Enter the code in the app and choose a new password."),
                Some(code),
                &format!("The code is valid for {minutes} minutes and can be used once."),
                "If you did not request this, your account has not been changed.",
            ),
            text: format!("MettisTool password reset.\n\nCode: {code}\n\nValid for {minutes} minutes."),
        }
    }
}

pub fn invite_mail(to: &str, username: &str, role: &str, code: &str, lang: &str) -> Mail {
    if is_finnish(lang) {
        Mail {
            to: to.to_string(),
            subject: "Sinulle on luotu MettisTool-tunnus".into(),
            html: layout(
                "Tervetuloa MettisTooliin",
                &format!("Hei {username}, sinulle on luotu tunnus roolilla <b>{role}</b>. Avaa MettisTool, valitse \"Minulla on kutsukoodi\" ja aseta salasanasi tällä koodilla."),
                Some(code),
                "Koodi on voimassa 7 vuorokautta ja toimii vain kerran.",
                "Älä jaa koodia kenellekään. MettisTool ei koskaan kysy salasanaasi sähköpostitse.",
            ),
            text: format!("Sinulle on luotu MettisTool-tunnus (rooli {role}).\n\nKutsukoodi: {code}\n\nVoimassa 7 vuorokautta."),
        }
    } else {
        Mail {
            to: to.to_string(),
            subject: "Your MettisTool account has been created".into(),
            html: layout(
                "Welcome to MettisTool",
                &format!("Hi {username}, an account with the role <b>{role}</b> has been created for you. Open MettisTool, choose \"I have an invite code\" and set your password."),
                Some(code),
                "The code is valid for 7 days and can be used once.",
                "Never share this code. MettisTool will never ask for your password by email.",
            ),
            text: format!("A MettisTool account was created for you (role {role}).\n\nInvite code: {code}\n\nValid for 7 days."),
        }
    }
}

pub fn security_mail(to: &str, username: &str, what: &str, lang: &str) -> Mail {
    if is_finnish(lang) {
        Mail {
            to: to.to_string(),
            subject: "Turvallisuusilmoitus — MettisTool".into(),
            html: layout(
                "Tilisi turvallisuusasetuksia muutettiin",
                &format!("Hei {username}, tilillesi tehtiin seuraava muutos: <b>{what}</b>."),
                None,
                "Jos teit muutoksen itse, mitään ei tarvitse tehdä.",
                "Jos et tehnyt muutosta, vaihda salasanasi heti ja ota yhteyttä ylläpitoon.",
            ),
            text: format!(
                "Turvallisuusilmoitus: {what}. Jos et tehnyt muutosta, vaihda salasanasi heti."
            ),
        }
    } else {
        Mail {
            to: to.to_string(),
            subject: "Security notice — MettisTool".into(),
            html: layout(
                "A security setting changed",
                &format!("Hi {username}, the following change was made to your account: <b>{what}</b>."),
                None,
                "If this was you, no action is needed.",
                "If this was not you, change your password immediately and contact your administrator.",
            ),
            text: format!("Security notice: {what}. If this was not you, change your password immediately."),
        }
    }
}

pub fn test_mail(to: &str) -> Mail {
    Mail {
        to: to.to_string(),
        subject: "MettisTool — testiviesti".into(),
        html: layout(
            "Sähköposti toimii",
            "Tämä on MettisToolin hallintapaneelista lähetetty testiviesti. Jos luet tämän, Resend-määritykset ovat kunnossa.",
            None,
            "Voit sulkea tämän viestin.",
            "Lähetetty MettisToolin hallintapaneelista.",
        ),
        text: "MettisTool — testiviesti. Sähköpostiasetukset ovat kunnossa.".into(),
    }
}
