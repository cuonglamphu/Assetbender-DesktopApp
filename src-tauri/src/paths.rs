//! Application data and CEP install locations.
//!
//! **Alignment with MotionBender (CEP):** [`app_data_root`] uses [`dirs::config_dir`], which
//! matches Adobe CEP `SystemPath.USER_DATA` (the same path as `csi.getSystemPath("userData")`
//! in the panel). Under that root, `AssetsFlow` / `AssetsFlowData` therefore match the
//! desktop app and the CEP extension on both macOS and Windows for typical installs.
//!
//! To confirm on a machine, compare `app_data_root()` (or log it once at startup) with the
//! `userData` path shown in the extension.
//!
//! **CEP install override:** set `ASSETBENDER_CEP_DIR` on **macOS or Windows** to force the
//! folder where plugin ZIPs are extracted (must remain readable by Adobe CEP).
//!
//! Folder and file **names** (`ASSETS_FLOW_*`, `AUTH_TOKEN_FILE_NAME`, …) are mirrored in
//! MotionBender `src/constants/assetbenderPaths.ts` — change both sides together.

use std::path::PathBuf;

// Keep in sync with MotionBender `src/constants/assetbenderPaths.ts`.
pub const ASSETS_FLOW_DIR_NAME: &str = "AssetsFlow";
pub const ASSETS_FLOW_DATA_DIR_NAME: &str = "AssetsFlowData";
pub const AUTH_TOKEN_FILE_NAME: &str = "auth_token.json";
pub const INSTALLED_PLUGINS_FILE_NAME: &str = "installed_plugins.json";

/// Mirrors [Master-Mouse/lib/config/app_config.dart] paths for macOS + Windows.
pub fn app_data_root() -> PathBuf {
    dirs::config_dir().unwrap_or_else(|| PathBuf::from("."))
}

pub fn assets_flow_dir() -> PathBuf {
    app_data_root().join(ASSETS_FLOW_DIR_NAME)
}

pub fn token_file_path() -> PathBuf {
    assets_flow_dir().join(AUTH_TOKEN_FILE_NAME)
}

pub fn installed_plugins_file() -> PathBuf {
    assets_flow_dir().join(INSTALLED_PLUGINS_FILE_NAME)
}

pub fn pack_install_dir() -> PathBuf {
    app_data_root().join(ASSETS_FLOW_DATA_DIR_NAME)
}

/// Pack support zip name (Flutter uses support-files.zip in config).
#[allow(dead_code)]
pub fn support_files_zip_name() -> &'static str {
    "support-files.zip"
}

/// CEP extension folder name inside `cep_extensions_dir` — must match MotionBender `cep.config` / `CEP_EXTENSION_ID`.
pub const CEP_EXTENSION_ID: &str = "com.MotionBender.cep";

pub fn cep_extensions_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        if let Ok(dir) = std::env::var("ASSETBENDER_CEP_DIR") {
            if !dir.is_empty() {
                return PathBuf::from(dir);
            }
        }
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
        // Always use the per-user CEP folder (same as Adobe + MotionBender); install creates it if missing.
        home.join("Library")
            .join("Application Support")
            .join("Adobe")
            .join("CEP")
            .join("extensions")
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(dir) = std::env::var("ASSETBENDER_CEP_DIR") {
            if !dir.is_empty() {
                return PathBuf::from(dir);
            }
        }
        // Mặc định: %APPDATA%\Adobe\CEP\extensions — Adobe CEP đọc được, không cần quyền admin (tránh OS error 5).
        app_data_root()
            .join("Adobe")
            .join("CEP")
            .join("extensions")
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        app_data_root().join("CEP").join("extensions")
    }
}
