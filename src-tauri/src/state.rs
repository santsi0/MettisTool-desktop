//! Sovelluksen jaettu tila.
//!
//! Versiossa 2 tila on kaksiosainen: pilvi-istunto (tunnistautuminen, roolit,
//! auditointi) ja paikallinen työkaludata. Mitään oikeustarkistusta ei tehdä
//! täällä — `require_auth` kertoo vain kuka on kirjautunut. Sen, mitä hän saa
//! tehdä, päättää tietokanta RLS-säännöillä jokaisessa kutsussa erikseen.

use crate::cloud::{Cloud, Profile};
use crate::error::{AppError, AppResult};
use crate::toolstore::ToolStore;
use std::sync::Arc;

pub struct AppState {
    pub cloud: Arc<Cloud>,
    pub tools: Arc<ToolStore>,
    pub started_at: i64,
}

impl AppState {
    pub fn new(cloud: Cloud, tools: ToolStore) -> Self {
        AppState {
            cloud: Arc::new(cloud),
            tools: Arc::new(tools),
            started_at: crate::util::now(),
        }
    }

    /// Kirjautuneen käyttäjän tunnus paikallista tallennusta varten.
    ///
    /// Tämä ei ole oikeustarkistus: se kertoo vain, kenen omaan työkaludataan
    /// kirjoitetaan. Pilven puolella jokainen kutsu tarkistetaan uudelleen.
    pub fn user_id(&self) -> AppResult<String> {
        self.cloud.user_id().ok_or(AppError::NotAuthenticated)
    }

    /// Tuore profiili pilvestä. Rooli luetaan aina palvelimelta, joten
    /// roolimuutos astuu voimaan heti eikä vanha rooli jää muistiin.
    pub async fn profile(&self) -> AppResult<Profile> {
        self.cloud.me().await
    }
}
