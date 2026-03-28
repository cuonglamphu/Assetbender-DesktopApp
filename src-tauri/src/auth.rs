use base64::{engine::general_purpose::URL_SAFE, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::AppHandle;

use crate::paths;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TokenFilePayload {
    pub access_token: String,
    pub refresh_token: String,
    pub name: String,
    pub email: String,
    pub id: String,
    #[serde(default)]
    pub is_inhouse_editor: bool,
    pub timestamp: String,
}

/// JWT uses base64url without padding (RFC 7515). After restoring `=`, decode with `URL_SAFE`
/// (accepts padding); `URL_SAFE_NO_PAD` must not be used on padded input — it returns "Invalid padding".
fn decode_jwt_segment(segment: &str) -> Result<Vec<u8>, String> {
    let segment = segment.trim();
    if segment.is_empty() {
        return Err("empty jwt segment".into());
    }
    let rem = segment.len() % 4;
    let padded = if rem == 0 {
        segment.to_string()
    } else if rem == 1 {
        return Err("invalid jwt segment length (base64 mod 4 == 1)".into());
    } else if rem == 2 {
        format!("{segment}==")
    } else {
        format!("{segment}=")
    };
    URL_SAFE
        .decode(padded.as_bytes())
        .map_err(|e| e.to_string())
}

pub fn decode_jwt_payload_fixed(token: &str) -> Result<serde_json::Value, String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return Err("invalid jwt".into());
    }
    let bytes = decode_jwt_segment(parts[1])?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

pub fn token_payload_from_access_token(
    access_token: &str,
    refresh_token: &str,
) -> Result<TokenFilePayload, String> {
    let claims = decode_jwt_payload_fixed(access_token)?;
    let user = claims
        .get("user")
        .ok_or_else(|| "missing user claim".to_string())?;
    let name = user
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("User")
        .to_string();
    let email = user
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let id = user
        .get("id")
        .map(|v| {
            if let Some(s) = v.as_str() {
                s.to_string()
            } else {
                v.to_string()
            }
        })
        .unwrap_or_default();
    let is_inhouse_editor = user
        .get("isInhouseEditer")
        .or_else(|| user.get("isInhouseEditor"))
        .and_then(|v| v.as_i64())
        == Some(1);
    Ok(TokenFilePayload {
        access_token: access_token.to_string(),
        refresh_token: refresh_token.to_string(),
        name,
        email,
        id,
        is_inhouse_editor,
        timestamp: format!(
            "{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0)
        ),
    })
}

pub fn write_token_file(payload: &TokenFilePayload) -> Result<(), String> {
    let dir = paths::assets_flow_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(
        paths::token_file_path(),
        serde_json::to_string_pretty(payload).unwrap(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read_token_file() -> Option<TokenFilePayload> {
    let path = paths::token_file_path();
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn delete_token_file() {
    let _ = fs::remove_file(paths::token_file_path());
}

pub fn oauth_state_path() -> std::path::PathBuf {
    paths::assets_flow_dir().join("oauth_state.txt")
}

pub fn save_oauth_state(state: &str) -> Result<(), String> {
    let dir = paths::assets_flow_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(oauth_state_path(), state).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read_oauth_state() -> Option<String> {
    fs::read_to_string(oauth_state_path()).ok()
}

pub fn clear_oauth_state() {
    let _ = fs::remove_file(oauth_state_path());
}

pub fn save_tokens_to_store(_app: &AppHandle, access: &str, refresh: &str) -> Result<(), String> {
    let payload = token_payload_from_access_token(access, refresh)?;
    write_token_file(&payload)
}
