//! Log chi tiết khi kiểm tra endpoint updater (HTTP status + đoạn body). Plugin upstream
//! chỉ log "did not respond with a successful status code" mà không ghi status/URL.

use percent_encoding::{AsciiSet, CONTROLS, percent_encode};
use tauri::AppHandle;
use tauri::utils::platform::bundle_type;
use tauri_utils::config::BundleType;

const CONTROLS_ADD: &AsciiSet = &CONTROLS.add(b'+');

fn installer_name_for_template() -> &'static str {
    match bundle_type() {
        Some(BundleType::Deb) => "deb",
        Some(BundleType::Rpm) => "rpm",
        Some(BundleType::AppImage) => "appimage",
        Some(BundleType::Msi) => "msi",
        Some(BundleType::Nsis) => "nsis",
        // Plugin maps cả .app và .dmg -> Installer::App
        Some(BundleType::App | BundleType::Dmg) => "app",
        _ => "unknown",
    }
}

fn updater_os_str() -> Option<&'static str> {
    if cfg!(target_os = "linux") {
        Some("linux")
    } else if cfg!(target_os = "macos") {
        Some("darwin")
    } else if cfg!(target_os = "windows") {
        Some("windows")
    } else {
        None
    }
}

fn updater_arch_str() -> Option<&'static str> {
    if cfg!(target_arch = "x86") {
        Some("i686")
    } else if cfg!(target_arch = "x86_64") {
        Some("x86_64")
    } else if cfg!(target_arch = "arm") {
        Some("armv7")
    } else if cfg!(target_arch = "aarch64") {
        Some("aarch64")
    } else if cfg!(target_arch = "riscv64") {
        Some("riscv64")
    } else {
        None
    }
}

/// Giống bước thay placeholder trong `tauri-plugin-updater` (URL trong tauri.conf.json).
pub fn resolve_endpoint_template(template: &str, app: &AppHandle) -> Result<url::Url, String> {
    let version = app.package_info().version.to_string();
    let encoded_version = percent_encode(version.as_bytes(), CONTROLS_ADD).to_string();
    let target = updater_os_str().ok_or_else(|| "unsupported OS for updater".to_string())?;
    let arch = updater_arch_str().ok_or_else(|| "unsupported arch for updater".to_string())?;
    let installer = installer_name_for_template();

    template
        .to_string()
        .replace("%7B%7Bcurrent_version%7D%7D", &encoded_version)
        .replace("%7B%7Btarget%7D%7D", target)
        .replace("%7B%7Barch%7D%7D", arch)
        .replace("%7B%7Bbundle_type%7D%7D", installer)
        .replace("{{current_version}}", &encoded_version)
        .replace("{{target}}", target)
        .replace("{{arch}}", arch)
        .replace("{{bundle_type}}", installer)
        .parse()
        .map_err(|e: url::ParseError| e.to_string())
}

fn endpoints_from_embedded_conf() -> Result<Vec<String>, String> {
    let v: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).map_err(|e| e.to_string())?;
    let arr = v
        .get("plugins")
        .and_then(|p| p.get("updater"))
        .and_then(|u| u.get("endpoints"))
        .and_then(|e| e.as_array())
        .ok_or_else(|| "missing plugins.updater.endpoints".to_string())?;
    arr.iter()
        .map(|x| {
            x.as_str()
                .map(String::from)
                .ok_or_else(|| "endpoint is not a string".to_string())
        })
        .collect()
}

/// GET từng endpoint đã resolve, log HTTP status + content-type + vài trăm ký tự body.
pub async fn log_updater_endpoint_probe(app: &AppHandle) {
    let endpoints = match endpoints_from_embedded_conf() {
        Ok(e) => e,
        Err(e) => {
            log::warn!("[updater] probe: không đọc endpoints: {e}");
            return;
        }
    };

    let client = match reqwest::Client::builder()
        .user_agent("AssetBender-updater-probe")
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            log::warn!("[updater] probe: reqwest client: {e}");
            return;
        }
    };

    for raw in endpoints {
        let url = match resolve_endpoint_template(&raw, app) {
            Ok(u) => u,
            Err(e) => {
                log::warn!("[updater] probe: resolve URL ({raw}): {e}");
                continue;
            }
        };
        let url_str = url.to_string();
        match client.get(url_str.clone()).send().await {
            Ok(res) => {
                let status = res.status();
                let ct = res
                    .headers()
                    .get(reqwest::header::CONTENT_TYPE)
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("")
                    .to_string();
                let body = res.text().await.unwrap_or_default();
                let snip: String = body.chars().take(600).collect();
                if status.is_success() {
                    log::info!(
                        "[updater] probe OK: GET {url_str} -> HTTP {} {} | content-type: {ct} | body_prefix: {snip:?}",
                        status.as_u16(),
                        status.canonical_reason().unwrap_or("")
                    );
                } else {
                    log::warn!(
                        "[updater] probe FAIL: GET {url_str} -> HTTP {} {} | content-type: {ct} | body_prefix: {snip:?}",
                        status.as_u16(),
                        status.canonical_reason().unwrap_or("")
                    );
                }
            }
            Err(e) => {
                log::warn!("[updater] probe: GET {url_str} failed: {e}");
            }
        }
    }
}
