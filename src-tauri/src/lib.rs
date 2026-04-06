mod auth;
mod install;
mod paths;
mod pkce;
mod updater_probe;

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use serde_json::json;
use tauri::image::Image;
use tauri::{AppHandle, Emitter, Manager};
use url::Url;

/// Defaults mirror [Master-Mouse/lib/config/app_config.dart] with `isDevelopment = false`.
pub fn default_base_url() -> String {
    std::env::var("ASSETBENDER_API_URL")
        .unwrap_or_else(|_| "https://api.assetbender.com".to_string())
}

pub fn default_frontend_url() -> String {
    std::env::var("ASSETBENDER_FRONTEND_URL")
        .unwrap_or_else(|_| "https://assetbender.com".to_string())
}

pub fn default_socket_url() -> String {
    std::env::var("ASSETBENDER_SOCKET_URL")
        .unwrap_or_else(|_| "wss://api.assetbender.com".to_string())
}

/// Trích `message` từ JSON lỗi API (vd. `{"success":false,"message":"..."}`).
fn parse_api_error_message(raw: &str) -> String {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(raw) {
        if let Some(m) = v.get("message").and_then(|x| x.as_str()) {
            let t = m.trim();
            if !t.is_empty() {
                return t.to_string();
            }
        }
    }
    let trimmed = raw.trim();
    if trimmed.starts_with('{') {
        return "Sign-in failed. Please try again.".to_string();
    }
    if trimmed.is_empty() {
        return "Sign-in failed.".to_string();
    }
    trimmed.to_string()
}

fn oauth_error_kind(message: &str) -> &'static str {
    let m = message.to_lowercase();
    if m.contains("maximum number of devices") || m.contains("too many devices") {
        return "device_limit";
    }
    if m.contains("expired")
        || m.contains("invalid_grant")
        || m.contains("link is invalid")
        || m.contains("invalid or expired")
    {
        return "expired";
    }
    if m.contains("state mismatch")
        || m.contains("missing oauth state")
        || m.contains("missing state")
        || m.contains("missing code verifier")
    {
        return "state_mismatch";
    }
    if m.contains("invalid sign-in link")
        || m.contains("url parse")
        || m.contains("no handler")
        || m.contains("incomplete")
    {
        return "invalid_link";
    }
    if m.contains("invalid token response") {
        return "invalid_response";
    }
    "api"
}

fn emit_oauth_error(app: &AppHandle, message: &str) {
    let kind = oauth_error_kind(message);
    let _ = app.emit(
        "oauth-error",
        json!({
            "message": message,
            "kind": kind,
        }),
    );
}

#[derive(Clone, Default)]
pub struct OauthState {
    pub code_verifier: Arc<Mutex<Option<String>>>,
}

/// Nhiều phiên download cài đặt song song — mỗi (kind, id) một cờ hủy.
/// Hủy qua `cancel_install_download` (không hỗ trợ pause/resume HTTP Range).
#[derive(Clone, Copy, Hash, Eq, PartialEq)]
enum InstallSessionKind {
    Plugin,
    Pack,
}

#[derive(Clone, Copy, Hash, Eq, PartialEq)]
struct InstallSessionKey(InstallSessionKind, i64);

#[derive(Clone)]
pub struct InstallDownloadCancel {
    sessions: Arc<Mutex<HashMap<InstallSessionKey, Arc<AtomicBool>>>>,
}

impl InstallDownloadCancel {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn start_session(&self, key: InstallSessionKey) -> Arc<AtomicBool> {
        let f = Arc::new(AtomicBool::new(false));
        self.sessions.lock().unwrap().insert(key, f.clone());
        f
    }

    fn end_session(&self, key: InstallSessionKey) {
        self.sessions.lock().unwrap().remove(&key);
    }

    pub fn cancel_install(&self, kind: &str, id: i64) {
        let Some(sk) = parse_install_session_kind(kind.trim()) else {
            return;
        };
        let key = InstallSessionKey(sk, id);
        if let Some(f) = self.sessions.lock().unwrap().get(&key) {
            f.store(true, Ordering::SeqCst);
        }
    }
}

fn parse_install_session_kind(s: &str) -> Option<InstallSessionKind> {
    match s {
        "plugin" => Some(InstallSessionKind::Plugin),
        "pack" => Some(InstallSessionKind::Pack),
        _ => None,
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfigPayload {
    pub base_url: String,
    pub frontend_url: String,
    pub socket_url: String,
    pub plugins_and_packs_path: String,
    pub refresh_token_path: String,
    pub logout_path: String,
    pub token_path: String,
}

/// Local paths aligned with the MotionBender CEP panel (`userData` + same folder names).
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DataPathsPayload {
    pub app_data_root: String,
    pub assets_flow_dir: String,
    pub pack_install_dir: String,
    pub cep_extensions_dir: String,
    pub cep_extension_id: String,
}

#[tauri::command]
fn get_data_paths() -> DataPathsPayload {
    DataPathsPayload {
        app_data_root: paths::app_data_root().to_string_lossy().into_owned(),
        assets_flow_dir: paths::assets_flow_dir().to_string_lossy().into_owned(),
        pack_install_dir: paths::pack_install_dir().to_string_lossy().into_owned(),
        cep_extensions_dir: paths::cep_extensions_dir().to_string_lossy().into_owned(),
        cep_extension_id: paths::CEP_EXTENSION_ID.to_string(),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OauthStartResponse {
    pub auth_url: String,
    pub state: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub extracted_paths: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PluginsAndPacksPayload {
    pub plugins: Vec<serde_json::Value>,
    pub packs: Vec<serde_json::Value>,
    pub inhouse_packs: Vec<serde_json::Value>,
}

#[tauri::command]
fn get_app_config() -> AppConfigPayload {
    let base = default_base_url();
    AppConfigPayload {
        plugins_and_packs_path: format!("{base}/plugins-and-packs"),
        refresh_token_path: format!("{base}/api/auth/refresh-token"),
        logout_path: format!("{base}/api/oauth2/logout"),
        token_path: format!("{base}/api/oauth2/token"),
        base_url: base,
        frontend_url: default_frontend_url(),
        socket_url: default_socket_url(),
    }
}

#[tauri::command]
fn session_get() -> Option<auth::TokenFilePayload> {
    auth::read_token_file()
}

#[tauri::command]
fn session_save_tokens(
    app: AppHandle,
    access_token: String,
    refresh_token: String,
) -> Result<auth::TokenFilePayload, String> {
    auth::save_tokens_to_store(&app, &access_token, &refresh_token)?;
    auth::token_payload_from_access_token(&access_token, &refresh_token)
}

#[tauri::command]
async fn session_refresh(app: AppHandle) -> Result<auth::TokenFilePayload, String> {
    let payload = auth::read_token_file().ok_or_else(|| "not logged in".to_string())?;
    let refresh = payload.refresh_token.clone();
    let base = default_base_url();
    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .post(format!("{base}/api/auth/refresh-token"))
        .header("Content-Type", "application/json")
        .json(&json!({ "refreshToken": refresh }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("refresh failed: {}", res.status()));
    }
    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let access = body
        .get("data")
        .and_then(|d| d.get("accessToken"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| "invalid refresh response".to_string())?;
    auth::save_tokens_to_store(&app, access, &payload.refresh_token)?;
    auth::token_payload_from_access_token(access, &payload.refresh_token)
}

#[tauri::command]
async fn session_logout(app: AppHandle) -> Result<(), String> {
    let payload = match auth::read_token_file() {
        Some(p) => p,
        None => {
            auth::clear_oauth_state();
            return Ok(());
        }
    };
    if payload.refresh_token.trim().is_empty() {
        log::warn!(
            "[session_logout] token file has empty refresh_token — clearing local session only"
        );
        auth::delete_token_file();
        auth::clear_oauth_state();
        let _ = app.emit("session-ended", ());
        return Ok(());
    }
    let base = default_base_url();
    let device_name = gethostname::gethostname().to_string_lossy().to_string();
    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .build()
        .map_err(|e| e.to_string())?;
    match client
        .post(format!("{base}/api/oauth2/logout"))
        .header("Authorization", format!("Bearer {}", payload.access_token))
        .header("Content-Type", "application/json")
        .json(&json!({
            "refreshToken": payload.refresh_token,
            "deviceIp": "",
            "deviceName": device_name,
        }))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {}
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            let snippet: String = body.chars().take(200).collect();
            log::warn!(
                "[session_logout] API returned {} — device may remain listed: {}",
                status,
                snippet
            );
            if snippet.contains("Missing require parameter") {
                log::warn!(
                    "[session_logout] Deploy Assetsflow-Backend oauth2 logout fix (allow empty deviceIp), or device rows are not removed server-side."
                );
            }
        }
        Err(e) => log::warn!("[session_logout] request failed: {}", e),
    }
    auth::delete_token_file();
    auth::clear_oauth_state();
    let _ = app.emit("session-ended", ());
    Ok(())
}

#[tauri::command]
fn oauth_start(state: tauri::State<'_, OauthState>) -> Result<OauthStartResponse, String> {
    let verifier = pkce::generate_code_verifier();
    let challenge = pkce::generate_code_challenge(&verifier);
    let oauth_state = pkce::generate_state();
    *state.code_verifier.lock().map_err(|e| e.to_string())? = Some(verifier);
    auth::save_oauth_state(&oauth_state)?;
    let frontend = default_frontend_url();
    let auth_url = format!(
        "{frontend}/oauth2/authorize?code_challenge={challenge}&state={oauth_state}"
    );
    Ok(OauthStartResponse {
        auth_url,
        state: oauth_state,
    })
}

async fn exchange_code_inner(
    app: &AppHandle,
    oauth: &OauthState,
    code: String,
    returned_state: String,
) -> Result<auth::TokenFilePayload, String> {
    let stored = auth::read_oauth_state().ok_or_else(|| "missing oauth state".to_string())?;
    if stored != returned_state {
        return Err("oauth state mismatch".into());
    }
    let verifier = oauth
        .code_verifier
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or_else(|| "missing code verifier".to_string())?;
    auth::clear_oauth_state();
    let base = default_base_url();
    let device_name = gethostname::gethostname().to_string_lossy().to_string();
    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .post(format!("{base}/api/oauth2/token"))
        .header("Content-Type", "application/json")
        .json(&json!({
            "authorizationCode": code,
            "codeVerifier": verifier,
            "deviceName": device_name,
            "deviceIp": "",
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if res.status() != reqwest::StatusCode::CREATED {
        let t = res.text().await.unwrap_or_default();
        let msg = parse_api_error_message(&t);
        return Err(msg);
    }
    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let access = body
        .get("data")
        .and_then(|d| d.get("accessToken"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| "invalid token response".to_string())?;
    let refresh = body
        .get("data")
        .and_then(|d| d.get("refreshToken"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| "invalid token response".to_string())?;
    auth::save_tokens_to_store(app, access, refresh)?;
    auth::token_payload_from_access_token(access, refresh)
}

#[tauri::command]
async fn oauth_exchange_code(
    app: AppHandle,
    state: tauri::State<'_, OauthState>,
    code: String,
    returned_state: String,
) -> Result<auth::TokenFilePayload, String> {
    match exchange_code_inner(&app, &state, code, returned_state).await {
        Ok(p) => Ok(p),
        Err(e) => {
            emit_oauth_error(&app, &e);
            Err(e)
        }
    }
}

#[tauri::command]
async fn handle_deep_link(
    app: AppHandle,
    state: tauri::State<'_, OauthState>,
    url: String,
) -> Result<Option<auth::TokenFilePayload>, String> {
    log::info!("[deep-link] handle_deep_link (invoke from UI): {}", url);
    let u = match Url::parse(&url) {
        Ok(u) => u,
        Err(e) => {
            let msg = format!("Invalid sign-in link: {e}");
            emit_oauth_error(&app, &msg);
            return Err(msg);
        }
    };
    let pairs: HashMap<String, String> = u.query_pairs().into_owned().collect();
    if let (Some(at), Some(rt)) = (pairs.get("accessToken"), pairs.get("refreshToken")) {
        if let Err(e) = auth::save_tokens_to_store(&app, at, rt) {
            emit_oauth_error(&app, &e);
            return Err(e);
        }
        let p = match auth::token_payload_from_access_token(at, rt) {
            Ok(p) => p,
            Err(e) => {
                emit_oauth_error(&app, &e);
                return Err(e);
            }
        };
        let _ = app.emit("oauth-complete", ());
        return Ok(Some(p));
    }
    if let Some(code) = pairs.get("code") {
        let st = match pairs.get("state").cloned() {
            Some(s) => s,
            None => {
                let msg = "missing state".to_string();
                emit_oauth_error(&app, &msg);
                return Err(msg);
            }
        };
        let p = match exchange_code_inner(&app, &state, code.clone(), st).await {
            Ok(p) => p,
            Err(e) => {
                emit_oauth_error(&app, &e);
                return Err(e);
            }
        };
        let _ = app.emit("oauth-complete", ());
        return Ok(Some(p));
    }
    let msg = "The sign-in link is invalid or incomplete. Please start sign-in again from the app."
        .to_string();
    emit_oauth_error(&app, &msg);
    Err(msg)
}

/// Tiến trình con sau UAC (`--assetbender-extract-zip`) — gọi từ `main.rs`.
pub fn cli_extract_zip(zip: &Path, dest: &Path) -> Result<Vec<String>, String> {
    install::extract_zip(zip, dest)
}

/// Download + giải nén chạy trên thread pool blocking để không chặn runtime async / WebView.
#[tauri::command]
async fn install_plugin_from_url(
    app: AppHandle,
    state: tauri::State<'_, InstallDownloadCancel>,
    link: String,
    id: i64,
    version: String,
) -> Result<InstallResult, String> {
    let key = InstallSessionKey(InstallSessionKind::Plugin, id);
    let cancel = state.start_session(key);
    let app = app.clone();
    let ctrl = (*state).clone();
    let result = tokio::task::spawn_blocking(move || {
        install_plugin_from_url_inner(app, link, id, version, cancel)
    })
    .await
    .map_err(|e| format!("install plugin task: {e}"))?;
    ctrl.end_session(key);
    result
}

fn install_plugin_from_url_inner(
    app: AppHandle,
    link: String,
    id: i64,
    version: String,
    cancel: Arc<AtomicBool>,
) -> Result<InstallResult, String> {
    let zip_path = install::temp_zip_path();
    log::info!("[install] plugin download: {}", link);
    install::download_to_file_blocking(&link, &zip_path, Some(cancel.as_ref()), |downloaded, total| {
        let _ = app.emit(
            "install-progress",
            json!({
                "kind": "plugin",
                "id": id,
                "downloaded": downloaded,
                "total": total,
            }),
        );
    })?;
    let dest = paths::cep_extensions_dir();
    log::info!(
        "[install] plugin CEP dest: {} (zip on disk: {})",
        dest.display(),
        zip_path.display()
    );
    let extracted = match install::extract_zip(&zip_path, &dest) {
        Ok(v) => v,
        Err(e) => {
            log::warn!("[install] extract_zip failed: {}", e);
            #[cfg(windows)]
            {
                if install::looks_like_permission_denied(&e) {
                    let result_path = install::temp_elev_result_path();
                    install::extract_zip_elevated_windows(&zip_path, &dest, &result_path)?
                } else {
                    return Err(e);
                }
            }
            #[cfg(not(windows))]
            {
                return Err(e);
            }
        }
    };
    let _ = std::fs::remove_file(&zip_path);
    install::merge_install_info(id, "plugin", &extracted, &version)?;
    Ok(InstallResult {
        extracted_paths: extracted,
    })
}

#[tauri::command]
async fn install_pack_from_url(
    app: AppHandle,
    state: tauri::State<'_, InstallDownloadCancel>,
    link: String,
    id: i64,
    version: String,
) -> Result<InstallResult, String> {
    let key = InstallSessionKey(InstallSessionKind::Pack, id);
    let cancel = state.start_session(key);
    let app = app.clone();
    let ctrl = (*state).clone();
    let result = tokio::task::spawn_blocking(move || {
        install_pack_from_url_inner(app, link, id, version, cancel)
    })
    .await
    .map_err(|e| format!("install pack task: {e}"))?;
    ctrl.end_session(key);
    result
}

fn install_pack_from_url_inner(
    app: AppHandle,
    link: String,
    id: i64,
    version: String,
    cancel: Arc<AtomicBool>,
) -> Result<InstallResult, String> {
    let zip_path = install::temp_zip_path();
    log::info!("[install] pack download: {}", link);
    install::download_to_file_blocking(&link, &zip_path, Some(cancel.as_ref()), |downloaded, total| {
        let _ = app.emit(
            "install-progress",
            json!({
                "kind": "pack",
                "id": id,
                "downloaded": downloaded,
                "total": total,
            }),
        );
    })?;
    let dest = paths::pack_install_dir();
    log::info!("[install] pack dest: {}", dest.display());
    std::fs::create_dir_all(&dest).map_err(|e| install::format_io_err("create_dir_all pack", &dest, &e))?;
    let extracted = install::extract_zip(&zip_path, &dest)?;
    let _ = std::fs::remove_file(&zip_path);
    install::merge_install_info(id, "pack", &extracted, &version)?;
    Ok(InstallResult {
        extracted_paths: extracted,
    })
}

#[tauri::command]
fn cancel_install_download(state: tauri::State<'_, InstallDownloadCancel>, kind: String, id: i64) {
    state.cancel_install(&kind, id);
}

#[tauri::command]
fn get_installed_manifest() -> Result<serde_json::Value, String> {
    let map = install::read_install_manifest_map()?;
    Ok(serde_json::Value::Object(map))
}

#[tauri::command]
fn uninstall_plugin(id: i64) -> Result<(), String> {
    install::uninstall_plugin(id)
}

#[tauri::command]
fn uninstall_pack(id: i64) -> Result<(), String> {
    install::uninstall_pack(id)
}

/// Fetches catalog server-side to avoid browser CORS on the API from the webview.
#[tauri::command]
async fn fetch_plugins_and_packs(product_type: String) -> Result<PluginsAndPacksPayload, String> {
    let payload = auth::read_token_file().ok_or_else(|| "not logged in".to_string())?;
    let base = default_base_url();
    let mut u = Url::parse(&format!("{base}/plugins-and-packs")).map_err(|e| e.to_string())?;
    u.query_pairs_mut()
        .append_pair("type", &product_type);
    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get(u)
        .header(
            "Authorization",
            format!("Bearer {}", payload.access_token),
        )
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("catalog HTTP {}", res.status()));
    }
    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let data = body
        .get("data")
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let empty_vec: Vec<serde_json::Value> = vec![];
    let plugins = data
        .get("plugins")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_else(|| empty_vec.clone());
    let packs = data
        .get("packs")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_else(|| empty_vec.clone());
    let inhouse_packs = data
        .get("inhousePacks")
        .or_else(|| data.get("inhouse_packs"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_else(|| empty_vec);
    Ok(PluginsAndPacksPayload {
        plugins,
        packs,
        inhouse_packs,
    })
}

/// Ghi log **terminal** (Rust) cho policy + force/soft — `console.info` trong WebView không ra đây.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCheckLogPayload {
    #[serde(default)]
    phase: Option<String>,
    outcome: String,
    app_version: Option<String>,
    minimum_version: Option<String>,
    below_minimum: bool,
    force_update: bool,
    updater_target: Option<String>,
    policy_ok: bool,
}

#[tauri::command]
fn log_update_check(payload: UpdateCheckLogPayload) {
    let phase = payload.phase.as_deref().unwrap_or("check");
    log::info!(
        "[update][{}] outcome={} app={:?} min={:?} below_min={} force={} updater={:?} policy_ok={}",
        phase,
        payload.outcome,
        payload.app_version,
        payload.minimum_version,
        payload.below_minimum,
        payload.force_update,
        payload.updater_target,
        payload.policy_ok
    );
}

/// Kiểm tra bản cập nhật qua [tauri-plugin-updater] (GitHub Releases + `latest.json` từ CI).
#[tauri::command]
async fn check_app_update(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(u)) => Ok(Some(u.version)),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn init_logging() {
    // `warn`: bớt spam DEBUG từ plugin khi JS gọi `check()` (xem log policy/force qua `log_update_check`).
    let default = "info,tauri_plugin_updater=warn,reqwest=warn";
    let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or(default))
        .format_timestamp_secs()
        .try_init();
}

/// Cold start: URL có thể đến từ `get_current()` hoặc `std::env::args` (Windows thường truyền `nameapp://...` trong argv).
#[cfg(desktop)]
fn collect_initial_deep_link_urls(app: &AppHandle) -> Vec<String> {
    use std::env;
    use tauri_plugin_deep_link::DeepLinkExt;
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    match app.deep_link().get_current() {
        Ok(Some(urls)) => {
            log::info!("[deep-link] get_current: {} URL(s)", urls.len());
            for u in urls {
                let s = u.to_string();
                log::info!("[deep-link] get_current item: {}", s);
                if seen.insert(s.clone()) {
                    out.push(s);
                }
            }
        }
        Ok(None) => log::info!("[deep-link] get_current: None"),
        Err(e) => log::warn!("[deep-link] get_current error: {}", e),
    }
    for a in env::args() {
        if a.to_ascii_lowercase().contains("nameapp:") {
            log::info!("[deep-link] argv candidate: {}", a);
            if seen.insert(a.clone()) {
                out.push(a);
            }
        }
    }
    out
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();
    log::info!("AssetBender process start");

    let mut builder = tauri::Builder::default()
        .manage(OauthState::default())
        .manage(InstallDownloadCancel::new());

    // Must be the first plugin: only one process/window; second launch forwards argv (e.g. nameapp://…) here.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            log::info!(
                "[deep-link] single-instance: second process blocked; argv={:?} cwd={}",
                argv,
                cwd
            );
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
                log::info!("[deep-link] single-instance: focused main window");
            } else {
                log::warn!("[deep-link] single-instance: no window label `main`");
            }
            let url = argv
                .iter()
                .find(|a| a.to_ascii_lowercase().contains("nameapp:"))
                .cloned();
            if let Some(url) = url {
                log::info!("[deep-link] single-instance: forwarding URL to running app: {}", url);
                let app = app.clone();
                let oauth = (*app.state::<OauthState>()).clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = process_deep_link_open(&app, &oauth, url).await {
                        log::warn!("[deep-link] single-instance handler error: {}", e);
                    }
                });
            } else {
                log::info!("[deep-link] single-instance: no nameapp URL in argv");
            }
        }));
    }

    builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                let probe_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    updater_probe::log_updater_endpoint_probe(&probe_handle).await;
                });

                // `bundle.icon` chỉ áp cho bộ cài; `tauri dev` / exe debug vẫn có thể hiện icon mặc định nếu không set ở đây.
                match Image::from_bytes(include_bytes!("../icons/32x32.png")) {
                    Ok(icon) => {
                        if let Some(w) = app.get_webview_window("main") {
                            if let Err(e) = w.set_icon(icon) {
                                log::warn!("[icon] set window icon: {}", e);
                            }
                        }
                    }
                    Err(e) => log::warn!("[icon] load 32x32.png: {}", e),
                }

                use tauri_plugin_deep_link::DeepLinkExt;
                // Windows/Linux: associate `nameapp://` with this executable (required for `start nameapp://...` and browser redirects).
                // macOS uses Info.plist from the bundle; register() is unsupported there.
                #[cfg(any(target_os = "windows", target_os = "linux"))]
                {
                    match app.deep_link().register("nameapp") {
                        Ok(()) => log::info!("[deep-link] register('nameapp') OK"),
                        Err(e) => log::warn!("[deep-link] register('nameapp') failed: {}", e),
                    }
                }

                let handle = app.handle().clone();
                let oauth = (*app.state::<OauthState>()).clone();

                log::info!(
                    "[deep-link] startup argv (all): {:?}",
                    std::env::args().collect::<Vec<_>>()
                );
                for url in collect_initial_deep_link_urls(&handle) {
                    log::info!("[deep-link] cold start dispatch: {}", url);
                    let h = handle.clone();
                    let o = oauth.clone();
                    tauri::async_runtime::spawn(async move {
                        match process_deep_link_open(&h, &o, url).await {
                            Ok(()) => log::info!("[deep-link] cold start handled OK"),
                            Err(e) => log::warn!("[deep-link] cold start handler error: {}", e),
                        }
                    });
                }

                app.deep_link().on_open_url(move |event| {
                    let urls = event.urls();
                    log::info!("[deep-link] on_open_url: {} URL(s)", urls.len());
                    for u in urls {
                        let s = u.to_string();
                        log::info!("[deep-link] on_open_url item: {}", s);
                        let h = handle.clone();
                        let oauth = oauth.clone();
                        tauri::async_runtime::spawn(async move {
                            match process_deep_link_open(&h, &oauth, s).await {
                                Ok(()) => log::info!("[deep-link] on_open_url handled OK"),
                                Err(err) => log::warn!("[deep-link] on_open_url error: {}", err),
                            }
                        });
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_config,
            get_data_paths,
            session_get,
            session_save_tokens,
            session_refresh,
            session_logout,
            oauth_start,
            oauth_exchange_code,
            handle_deep_link,
            fetch_plugins_and_packs,
            install_plugin_from_url,
            install_pack_from_url,
            cancel_install_download,
            get_installed_manifest,
            uninstall_plugin,
            uninstall_pack,
            check_app_update,
            log_update_check
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn process_deep_link_open(
    app: &AppHandle,
    oauth: &OauthState,
    url: String,
) -> Result<(), String> {
    let result = process_deep_link_open_inner(app, oauth, url).await;
    if let Err(ref e) = result {
        emit_oauth_error(app, e);
    }
    result
}

async fn process_deep_link_open_inner(
    app: &AppHandle,
    oauth: &OauthState,
    url: String,
) -> Result<(), String> {
    log::info!("[deep-link] process_deep_link_open raw: {}", url);
    let u = Url::parse(&url).map_err(|e| {
        log::warn!("[deep-link] URL parse error: {}", e);
        format!("Invalid sign-in link: {e}")
    })?;
    log::info!(
        "[deep-link] parsed scheme={} host={:?} path={} query_len={}",
        u.scheme(),
        u.host_str(),
        u.path(),
        u.query().map(|q| q.len()).unwrap_or(0)
    );
    let pairs: HashMap<String, String> = u.query_pairs().into_owned().collect();
    let keys: Vec<_> = pairs.keys().cloned().collect();
    log::info!("[deep-link] query keys: {:?}", keys);

    if let (Some(at), Some(rt)) = (pairs.get("accessToken"), pairs.get("refreshToken")) {
        log::info!("[deep-link] branch: accessToken + refreshToken");
        auth::save_tokens_to_store(app, at, rt)?;
        let _ = auth::token_payload_from_access_token(at, rt)?;
        let _ = app.emit("oauth-complete", ());
        return Ok(());
    }
    if let Some(code) = pairs.get("code") {
        log::info!("[deep-link] branch: OAuth code (len={})", code.len());
        let st = pairs
            .get("state")
            .cloned()
            .ok_or_else(|| {
                log::warn!("[deep-link] OAuth code present but state missing");
                "missing state".to_string()
            })?;
        let _ = exchange_code_inner(app, oauth, code.clone(), st).await?;
        let _ = app.emit("oauth-complete", ());
        return Ok(());
    }
    log::warn!(
        "[deep-link] no handler: expected accessToken+refreshToken or code+state; got keys {:?}",
        keys
    );
    Err(
        "The sign-in link is invalid, incomplete, or expired. Please start sign-in again from the app."
            .into(),
    )
}
