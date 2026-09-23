//! Kaksivaiheinen tunnistautuminen (TOTP, RFC 6238) ja palautuskoodit.
//!
//! TOTP-salaisuus tallennetaan käyttöjärjestelmän avainsäilöön, ei tietokantaan.
//! Palautuskoodeista tallennetaan vain Argon2id-tiiviste.

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::util::now;
use hmac::{Hmac, Mac};
use rusqlite::params;
use sha1::Sha1;

const B32: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP: i64 = 30;
const DIGITS: u32 = 6;

pub fn base32_encode(data: &[u8]) -> String {
    let mut out = String::new();
    let mut bits = 0u32;
    let mut value = 0u32;
    for &b in data {
        value = (value << 8) | b as u32;
        bits += 8;
        while bits >= 5 {
            out.push(B32[((value >> (bits - 5)) & 31) as usize] as char);
            bits -= 5;
        }
    }
    if bits > 0 {
        out.push(B32[((value << (5 - bits)) & 31) as usize] as char);
    }
    out
}

pub fn base32_decode(input: &str) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let mut bits = 0u32;
    let mut value = 0u32;
    for ch in input.chars().filter(|c| !c.is_whitespace() && *c != '=') {
        let idx = B32
            .iter()
            .position(|&b| b as char == ch.to_ascii_uppercase())?;
        value = (value << 5) | idx as u32;
        bits += 5;
        if bits >= 8 {
            out.push(((value >> (bits - 8)) & 0xFF) as u8);
            bits -= 8;
        }
    }
    Some(out)
}

pub fn generate_secret() -> String {
    base32_encode(&crate::util::random_bytes(20))
}

fn hotp(secret: &[u8], counter: u64) -> AppResult<u32> {
    let mut mac = Hmac::<Sha1>::new_from_slice(secret)
        .map_err(|e| AppError::internal(format!("hmac: {e}")))?;
    mac.update(&counter.to_be_bytes());
    let digest = mac.finalize().into_bytes();
    let offset = (digest[digest.len() - 1] & 0x0F) as usize;
    let code = ((digest[offset] as u32 & 0x7F) << 24)
        | ((digest[offset + 1] as u32) << 16)
        | ((digest[offset + 2] as u32) << 8)
        | (digest[offset + 3] as u32);
    Ok(code % 10u32.pow(DIGITS))
}

pub fn current_code(secret_b32: &str, at: i64) -> AppResult<String> {
    let secret = base32_decode(secret_b32).ok_or(AppError::InvalidTwoFactor)?;
    let counter = (at / STEP) as u64;
    Ok(format!(
        "{:0width$}",
        hotp(&secret, counter)?,
        width = DIGITS as usize
    ))
}

/// Hyväksyy koodin yhden aikaikkunan verran eteen ja taakse (kellon ryömintä).
pub fn verify(secret_b32: &str, code: &str) -> AppResult<bool> {
    let cleaned: String = code.chars().filter(|c| c.is_ascii_digit()).collect();
    if cleaned.len() != DIGITS as usize {
        return Ok(false);
    }
    let secret = base32_decode(secret_b32).ok_or(AppError::InvalidTwoFactor)?;
    if secret.len() < 10 {
        return Ok(false);
    }
    let counter = now() / STEP;
    for delta in [-1i64, 0, 1] {
        let c = (counter + delta).max(0) as u64;
        let expected = format!("{:0width$}", hotp(&secret, c)?, width = DIGITS as usize);
        if crate::util::ct_eq(&expected, &cleaned) {
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn otpauth_url(secret_b32: &str, account: &str) -> String {
    let issuer = "MettisTool";
    let label = urlencode(&format!("{issuer}:{account}"));
    format!(
        "otpauth://totp/{label}?secret={secret_b32}&issuer={issuer}&algorithm=SHA1&digits={DIGITS}&period={STEP}"
    )
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

// ===== Palautuskoodit =====

pub fn generate_recovery_codes(db: &Db, user_id: i64) -> AppResult<Vec<String>> {
    let mut codes = Vec::new();
    let ts = now();
    db.with(|c| {
        c.execute(
            "DELETE FROM recovery_codes WHERE user_id = ?1",
            params![user_id],
        )?;
        Ok(())
    })?;
    for _ in 0..10 {
        let raw = base32_encode(&crate::util::random_bytes(10));
        let code = format!("{}-{}", &raw[0..4], &raw[4..8]);
        let hash = super::password::hash(&code)?;
        db.with(|c| {
            c.execute(
                "INSERT INTO recovery_codes (user_id, code_hash, created_at) VALUES (?1, ?2, ?3)",
                params![user_id, hash, ts],
            )?;
            Ok(())
        })?;
        codes.push(code);
    }
    Ok(codes)
}

/// Tarkistaa palautuskoodin ja kuluttaa sen. Palauttaa true jos koodi kelpasi.
pub fn consume_recovery_code(db: &Db, user_id: i64, input: &str) -> AppResult<bool> {
    let normalized = input.trim().to_uppercase();
    let rows: Vec<(i64, String)> = db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT id, code_hash FROM recovery_codes WHERE user_id = ?1 AND used_at IS NULL",
        )?;
        let it = stmt.query_map(params![user_id], |r| Ok((r.get(0)?, r.get(1)?)))?;
        let mut out = Vec::new();
        for r in it {
            out.push(r?);
        }
        Ok(out)
    })?;

    for (id, hash) in rows {
        if super::password::verify(&normalized, &hash) {
            db.with(|c| {
                c.execute(
                    "UPDATE recovery_codes SET used_at = ?1 WHERE id = ?2",
                    params![now(), id],
                )?;
                Ok(())
            })?;
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn remaining_recovery_codes(db: &Db, user_id: i64) -> AppResult<i64> {
    db.with(|c| {
        Ok(c.query_row(
            "SELECT COUNT(*) FROM recovery_codes WHERE user_id = ?1 AND used_at IS NULL",
            params![user_id],
            |r| r.get(0),
        )?)
    })
}
