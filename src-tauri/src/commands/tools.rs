//! Työkalujen oma data.
//!
//! Tämä on ainoa komentoryhmä, joka kirjoittaa käyttäjän koneelle. Työkalut
//! eivät näe istuntoa eivätkä tokeneita — ne saavat vain oman avaimensa alta
//! luettavan tilan. Avaimena on Supabasen UUID, joten kaksi eri tiliä samalla
//! koneella eivät näe toistensa muistiinpanoja.
//!
//! Työkalun avaaminen kirjataan lisäksi pilveen tilastoja varten. Se tapahtuu
//! taustalla eikä koskaan estä työkalun käyttöä.

use crate::error::AppResult;
use crate::state::AppState;
use crate::toolstore::ToolUsageRow;
use std::collections::HashMap;
use tauri::State;

#[tauri::command]
pub fn tool_state_get(state: State<'_, AppState>, key: String) -> AppResult<Option<String>> {
    let user = state.user_id()?;
    state.tools.get(&user, &key)
}

#[tauri::command]
pub fn tool_state_set(state: State<'_, AppState>, key: String, value: String) -> AppResult<()> {
    let user = state.user_id()?;
    state.tools.set(&user, &key, &value)
}

#[tauri::command]
pub fn tool_state_delete(state: State<'_, AppState>, key: String) -> AppResult<()> {
    let user = state.user_id()?;
    state.tools.delete(&user, &key)
}

#[tauri::command]
pub fn tool_state_all(state: State<'_, AppState>) -> AppResult<HashMap<String, String>> {
    let user = state.user_id()?;
    state.tools.all(&user)
}

/// Työkalu avattiin. Paikallinen laskuri päivittyy heti; pilveen kirjaus
/// lähtee taustalle eikä sen onnistumista odoteta.
#[tauri::command]
pub async fn tool_used(state: State<'_, AppState>, tool_id: String) -> AppResult<()> {
    let user = state.user_id()?;
    state.tools.touch(&user, &tool_id)?;

    let cloud = state.cloud.clone();
    tauri::async_runtime::spawn(async move {
        cloud.log_tool(&tool_id).await;
    });
    Ok(())
}

#[tauri::command]
pub fn tool_set_favorite(
    state: State<'_, AppState>,
    tool_id: String,
    favorite: bool,
) -> AppResult<()> {
    let user = state.user_id()?;
    state.tools.set_favorite(&user, &tool_id, favorite)
}

#[tauri::command]
pub fn tool_usage(state: State<'_, AppState>) -> AppResult<Vec<ToolUsageRow>> {
    let user = state.user_id()?;
    state.tools.usage(&user)
}

#[tauri::command]
pub fn tool_usage_clear(state: State<'_, AppState>, keep_favorites: bool) -> AppResult<()> {
    let user = state.user_id()?;
    state.tools.clear_usage(&user, keep_favorites)
}
