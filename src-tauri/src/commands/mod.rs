//! Kaikki IPC-komennot. Frontend pääsee taustalogiikkaan vain näiden kautta.
//!
//! Vaihe 1 kattaa tunnistautumisen, työkalut ja järjestelmän. Tili- ja
//! hallintakomennot palaavat vaiheissa 2 ja 3, kun ne on käännetty
//! Supabase-kerrokselle. Vanhat tiedostot ovat yhä repossa mallina, mutta
//! niitä ei käännetä mukaan.

pub mod auth;
pub mod system;
pub mod tools;
