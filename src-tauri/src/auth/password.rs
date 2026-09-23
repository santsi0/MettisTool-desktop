//! Salasanojen tiivistys Argon2id-algoritmilla.
//!
//! Salasanoja ei tallenneta, lokiteta eikä lähetetä koskaan missään muodossa —
//! ainoastaan Argon2id-tiiviste (PHC-merkkijono) päätyy tietokantaan.

use crate::error::{AppError, AppResult};
use argon2::password_hash::{
    rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
};
use argon2::{Algorithm, Argon2, Params, Version};

/// OWASP:n suositusparametrit (2024): 19 MiB muistia, 2 kierrosta, 1 rinnakkaisuus.
fn argon2() -> AppResult<Argon2<'static>> {
    let params = Params::new(19_456, 2, 1, None)
        .map_err(|e| AppError::internal(format!("argon2-parametrit: {e}")))?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

pub fn hash(password: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = argon2()?
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| AppError::internal(format!("salasanan tiivistys epäonnistui: {e}")))?;
    Ok(hash.to_string())
}

pub fn verify(password: &str, stored_hash: &str) -> bool {
    match PasswordHash::new(stored_hash) {
        Ok(parsed) => argon2()
            .map(|a| a.verify_password(password.as_bytes(), &parsed).is_ok())
            .unwrap_or(false),
        Err(_) => false,
    }
}

/// Tekee saman työmäärän kuin oikea tarkistus, vaikka käyttäjää ei olisi olemassa.
/// Näin hyökkääjä ei voi päätellä vastausajasta, onko sähköposti rekisteröity.
pub fn dummy_verify(password: &str) {
    const DUMMY: &str = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$D9YZ1uZ8vJmZ0o1GZQm5Y1t5Rr4sFq8j0kQ0Q6sX0mU";
    let _ = verify(password, DUMMY);
}

/// Onko tiiviste luotu vanhemmilla parametreilla? Silloin se päivitetään kirjautumisen yhteydessä.
pub fn needs_rehash(stored_hash: &str) -> bool {
    match PasswordHash::new(stored_hash) {
        Ok(p) => {
            if p.algorithm.as_str() != "argon2id" {
                return true;
            }
            let m = p
                .params
                .get("m")
                .and_then(|v| v.decimal().ok())
                .unwrap_or(0);
            let t = p
                .params
                .get("t")
                .and_then(|v| v.decimal().ok())
                .unwrap_or(0);
            m < 19_456 || t < 2
        }
        Err(_) => true,
    }
}
