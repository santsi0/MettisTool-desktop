//! Kertakäyttöiset tokenit: sähköpostivahvistus, salasanan palautus ja kutsut.
//!
//! Tietokantaan tallennetaan vain SHA-256-tiiviste. Raakatoken näkyy ainoastaan
//! sähköpostissa; sitä ei kirjoiteta lokiin eikä lähetetä Discordiin.

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::util::{now, sha256_hex};
use rusqlite::params;

pub const KIND_VERIFY: &str = "VERIFY_EMAIL";
pub const KIND_RESET: &str = "PASSWORD_RESET";
pub const KIND_INVITE: &str = "INVITE";

pub struct IssuedToken {
    pub token: String,
    pub expires_at: i64,
}

/// Selkeä aakkosto ilman sekoittuvia merkkejä (ei I, L, O, U).
const CODE_ALPHABET: &[u8] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// Työpöytäsovelluksessa ei ole palvelinta, jolle sähköpostin linkki osoittaisi.
/// Siksi käytetään koodia, jonka käyttäjä kirjoittaa sovellukseen: turvallinen,
/// toimii ilman verkkopalvelinta eikä vaadi protokollakäsittelijän rekisteröintiä.
pub fn generate_code(groups: usize) -> String {
    let bytes = crate::util::random_bytes(groups * 4);
    let mut parts = Vec::with_capacity(groups);
    for g in 0..groups {
        let chunk: String = (0..4)
            .map(|i| CODE_ALPHABET[(bytes[g * 4 + i] as usize) % CODE_ALPHABET.len()] as char)
            .collect();
        parts.push(chunk);
    }
    parts.join("-")
}

/// Normalisoi käyttäjän kirjoittaman koodin: isot kirjaimet, väliviivat pois,
/// sekoittuvat merkit korjataan.
pub fn normalize_code(input: &str) -> String {
    input
        .trim()
        .to_uppercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .map(|c| match c {
            'I' | 'L' => '1',
            'O' => '0',
            'U' => 'V',
            other => other,
        })
        .collect()
}

fn code_storage_form(code: &str) -> String {
    normalize_code(code)
}

/// Luo uuden tokenin ja mitätöi saman tyypin aiemmat käyttämättömät tokenit.
pub fn issue(db: &Db, user_id: i64, kind: &str, ttl_seconds: i64) -> AppResult<IssuedToken> {
    let groups = if kind == KIND_RESET { 3 } else { 2 };
    let token = generate_code(groups);
    let hash = sha256_hex(&code_storage_form(&token));
    let created = now();
    let expires = created + ttl_seconds;

    db.with(|c| {
        c.execute(
            "UPDATE auth_tokens SET used_at = ?1 WHERE user_id = ?2 AND kind = ?3 AND used_at IS NULL",
            params![created, user_id, kind],
        )?;
        c.execute(
            "INSERT INTO auth_tokens (user_id, kind, token_hash, created_at, expires_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![user_id, kind, hash, created, expires],
        )?;
        Ok(())
    })?;

    Ok(IssuedToken {
        token,
        expires_at: expires,
    })
}

/// Tarkistaa tokenin ja merkitsee sen käytetyksi. Palauttaa käyttäjän tunnisteen.
pub fn consume(db: &Db, kind: &str, raw_token: &str) -> AppResult<i64> {
    let raw = code_storage_form(raw_token);
    if raw.is_empty() || raw.len() > 64 {
        return Err(AppError::TokenInvalid);
    }
    let hash = sha256_hex(&raw);
    let ts = now();

    db.with_mut(|c| {
        let tx = c.transaction()?;
        let row: Option<(i64, i64, i64, Option<i64>)> = tx
            .query_row(
                "SELECT id, user_id, expires_at, used_at FROM auth_tokens
                 WHERE token_hash = ?1 AND kind = ?2",
                params![hash, kind],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .ok();

        let (id, user_id, expires_at, used_at) = match row {
            Some(v) => v,
            None => return Err(AppError::TokenInvalid),
        };
        if used_at.is_some() {
            return Err(AppError::TokenInvalid);
        }
        if expires_at < ts {
            return Err(AppError::TokenExpired);
        }

        tx.execute(
            "UPDATE auth_tokens SET used_at = ?1 WHERE id = ?2",
            params![ts, id],
        )?;
        tx.commit()?;
        Ok(user_id)
    })
}

/// Poistaa vanhentuneet tokenit. Ajetaan käynnistyksessä ja ajoittain.
pub fn cleanup(db: &Db) -> AppResult<usize> {
    db.with(|c| {
        let n = c.execute(
            "DELETE FROM auth_tokens WHERE expires_at < ?1 OR used_at IS NOT NULL",
            params![now() - 7 * 86_400],
        )?;
        Ok(n)
    })
}

/// Kuinka monta käyttämätöntä tokenia käyttäjällä on annetun ajan sisällä.
/// Käytetään lähetysrajoituksen tukena.
pub fn recent_count(db: &Db, user_id: i64, kind: &str, since: i64) -> AppResult<i64> {
    db.with(|c| {
        Ok(c.query_row(
            "SELECT COUNT(*) FROM auth_tokens WHERE user_id = ?1 AND kind = ?2 AND created_at > ?3",
            params![user_id, kind, since],
            |r| r.get(0),
        )?)
    })
}
