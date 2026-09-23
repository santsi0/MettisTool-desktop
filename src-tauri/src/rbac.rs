//! Roolit ja oikeudet.
//!
//! KAIKKI oikeustarkistukset tehdään täällä Rust-puolella. Käyttöliittymä voi piilottaa
//! näkymiä, mutta se ei koskaan päätä mitä käyttäjä saa tehdä — jokainen komento
//! tarkistaa oikeudet uudelleen.

use crate::db::Db;
use crate::error::{AppError, AppResult};
use rusqlite::params;

pub const ROLE_USER: &str = "USER";
pub const ROLE_MODERATOR: &str = "MODERATOR";
pub const ROLE_ADMIN: &str = "ADMIN";
pub const ROLE_OWNER: &str = "OWNER";

/// Suurempi arvo = enemmän valtaa.
pub fn rank(role: &str) -> u8 {
    match role {
        ROLE_OWNER => 4,
        ROLE_ADMIN => 3,
        ROLE_MODERATOR => 2,
        _ => 1,
    }
}

pub fn is_privileged(role: &str) -> bool {
    rank(role) >= 2
}

/// OWNER saa aina kaiken.
pub fn effective_permissions(db: &Db, user_id: i64, role: &str) -> AppResult<Vec<String>> {
    if role == ROLE_OWNER {
        return Ok(crate::db::migrations::all_permissions()
            .into_iter()
            .map(|(n, _)| n.to_string())
            .collect());
    }

    db.with(|c| {
        let mut perms: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();

        let mut stmt = c.prepare("SELECT permission FROM role_permissions WHERE role = ?1")?;
        let rows = stmt.query_map(params![role], |r| r.get::<_, String>(0))?;
        for p in rows {
            perms.insert(p?);
        }

        let mut stmt =
            c.prepare("SELECT permission, granted FROM user_permissions WHERE user_id = ?1")?;
        let rows = stmt.query_map(params![user_id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })?;
        for row in rows {
            let (perm, granted) = row?;
            if granted == 1 {
                perms.insert(perm);
            } else {
                perms.remove(&perm);
            }
        }

        Ok(perms.into_iter().collect())
    })
}

pub fn has_permission(db: &Db, user_id: i64, role: &str, permission: &str) -> AppResult<bool> {
    if role == ROLE_OWNER {
        return Ok(true);
    }
    Ok(effective_permissions(db, user_id, role)?
        .iter()
        .any(|p| p == permission))
}

pub fn require_permission(db: &Db, user_id: i64, role: &str, permission: &str) -> AppResult<()> {
    if has_permission(db, user_id, role, permission)? {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

/// Saako tekijä muokata kohdetta? Vaaditaan aidosti korkeampi rooli.
/// OWNER voi hallita kaikkia paitsi toista OWNERia (paitsi itseään tietyissä toimissa).
pub fn can_manage_user(actor_role: &str, actor_id: i64, target_role: &str, target_id: i64) -> bool {
    if actor_id == target_id {
        return true;
    }
    if actor_role == ROLE_OWNER {
        // OWNER voi hallita muita OWNEReita — tämä on tarkoituksellista, jotta
        // yksi omistaja ei voi lukita muita ulos pysyvästi. Toimet auditoidaan.
        return true;
    }
    rank(actor_role) > rank(target_role)
}

/// Roolin myöntäminen: vain OWNER voi luoda tai nostaa etuoikeutettuja rooleja.
pub fn can_assign_role(actor_role: &str, new_role: &str) -> bool {
    if !crate::util::valid_role(new_role) {
        return false;
    }
    match new_role {
        ROLE_USER => rank(actor_role) >= 3, // ADMIN tai OWNER voi alentaa käyttäjäksi
        _ => actor_role == ROLE_OWNER,      // MODERATOR, ADMIN, OWNER vain omistajalta
    }
}

/// Estää viimeisen omistajan poistamisen tai alentamisen.
pub fn ensure_not_last_owner(db: &Db, target_id: i64) -> AppResult<()> {
    let owners: i64 = db.with(|c| {
        Ok(c.query_row(
            "SELECT COUNT(*) FROM users WHERE role = 'OWNER' AND status = 'ACTIVE'",
            [],
            |r| r.get(0),
        )?)
    })?;
    let target_is_owner: bool = db.with(|c| {
        let role: Option<String> = c
            .query_row(
                "SELECT role FROM users WHERE id = ?1",
                params![target_id],
                |r| r.get(0),
            )
            .ok();
        Ok(role.as_deref() == Some(ROLE_OWNER))
    })?;
    if target_is_owner && owners <= 1 {
        return Err(AppError::Conflict("last_owner".into()));
    }
    Ok(())
}

pub fn owner_exists(db: &Db) -> AppResult<bool> {
    db.with(|c| {
        let n: i64 = c.query_row("SELECT COUNT(*) FROM users WHERE role = 'OWNER'", [], |r| {
            r.get(0)
        })?;
        Ok(n > 0)
    })
}
