// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() >= 5 && args[1] == "--assetbender-extract-zip" {
        env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
            .try_init()
            .ok();
        let zip = std::path::PathBuf::from(&args[2]);
        let dest = std::path::PathBuf::from(&args[3]);
        let result = std::path::PathBuf::from(&args[4]);
        match assetbender_mac_lib::cli_extract_zip(&zip, &dest) {
            Ok(paths) => {
                let json = serde_json::to_string(&paths).unwrap_or_else(|_| "[]".to_string());
                if let Err(e) = std::fs::write(&result, json) {
                    eprintln!("write result file: {e}");
                    std::process::exit(1);
                }
                std::process::exit(0);
            }
            Err(e) => {
                eprintln!("{e}");
                std::process::exit(1);
            }
        }
    }
    assetbender_mac_lib::run();
}
