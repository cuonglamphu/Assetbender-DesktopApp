use std::path::PathBuf;
#[cfg(target_os = "macos")]
use std::path::Path;

/// Mirrors [Master-Mouse/lib/config/app_config.dart] paths for macOS + Windows.
pub fn app_data_root() -> PathBuf {
    dirs::config_dir().unwrap_or_else(|| PathBuf::from("."))
}

pub fn assets_flow_dir() -> PathBuf {
    app_data_root().join("AssetsFlow")
}

pub fn token_file_path() -> PathBuf {
    assets_flow_dir().join("auth_token.json")
}

pub fn installed_plugins_file() -> PathBuf {
    assets_flow_dir().join("installed_plugins.json")
}

pub fn pack_install_dir() -> PathBuf {
    app_data_root().join("AssetsFlowData")
}

/// Pack support zip name (Flutter uses support-files.zip in config).
#[allow(dead_code)]
pub fn support_files_zip_name() -> &'static str {
    "support-files.zip"
}

pub fn cep_extensions_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
        let user_dir = home
            .join("Library")
            .join("Application Support")
            .join("Adobe")
            .join("CEP")
            .join("extensions");
        if user_dir.exists() {
            return user_dir;
        }
        Path::new("/Library/Application Support/Adobe/CEP/extensions").to_path_buf()
    }
    #[cfg(target_os = "windows")]
    {
        // Override: ghi vào Program Files (cần admin / UAC) — đặt biến này nếu bắt buộc dùng thư mục hệ thống.
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
