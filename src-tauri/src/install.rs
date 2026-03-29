use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde_json::{json, Map, Value};
use zip::ZipArchive;

use crate::paths;

pub fn format_io_err(context: &str, path: &Path, e: &io::Error) -> String {
    format!(
        "{} at {}: {} (kind={:?}, raw_os_error={:?})",
        context,
        path.display(),
        e,
        e.kind(),
        e.raw_os_error()
    )
}

#[allow(dead_code)]
pub async fn download_to_file(url: &str, dest: &Path) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .build()
        .map_err(|e| e.to_string())?;
    let res = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {} from {}", res.status(), url));
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format_io_err("create_dir_all", parent, &e))?;
    }
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    fs::write(dest, bytes).map_err(|e| format_io_err("write", dest, &e))?;
    Ok(())
}

/// `cancel`: mỗi chunk kiểm tra — dừng tải, xóa file tạm, trả lỗi `download cancelled`.
pub fn download_to_file_blocking<F>(
    url: &str,
    dest: &Path,
    cancel: Option<&AtomicBool>,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(u64, Option<u64>),
{
    let client = reqwest::blocking::Client::builder()
        .use_rustls_tls()
        .build()
        .map_err(|e| e.to_string())?;
    let mut res = client.get(url).send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {} from {}", res.status(), url));
    }
    let total = res.content_length();
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format_io_err("create_dir_all", parent, &e))?;
    }
    let mut file = File::create(dest).map_err(|e| format_io_err("create temp zip", dest, &e))?;
    let mut downloaded: u64 = 0;
    let mut buf = [0u8; 8192];
    // Giảm emit event (UI giật); luôn emit lần cuối sau khi tải xong.
    let mut last_emit = Instant::now();
    const EMIT_MIN_INTERVAL: Duration = Duration::from_millis(75);
    loop {
        if cancel.is_some_and(|c| c.load(Ordering::SeqCst)) {
            drop(file);
            let _ = fs::remove_file(dest);
            return Err("download cancelled".to_string());
        }
        let n = res.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])
            .map_err(|e| format_io_err("write download chunk", dest, &e))?;
        downloaded += n as u64;
        if last_emit.elapsed() >= EMIT_MIN_INTERVAL {
            last_emit = Instant::now();
            on_progress(downloaded, total);
        }
    }
    on_progress(downloaded, total);
    Ok(())
}

pub fn extract_zip(zip_path: &Path, out_dir: &Path) -> Result<Vec<String>, String> {
    log::info!(
        "[install] extract_zip: zip={} -> out_dir={}",
        zip_path.display(),
        out_dir.display()
    );
    fs::create_dir_all(out_dir).map_err(|e| format_io_err("create_dir_all CEP root", out_dir, &e))?;
    let file = File::open(zip_path).map_err(|e| format_io_err("open zip", zip_path, &e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("open zip archive: {e}"))?;
    let mut extracted = Vec::new();
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("zip entry {i}: {e}"))?;
        let outpath = match file.enclosed_name() {
            Some(p) => out_dir.join(p),
            None => continue,
        };
        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath)
                .map_err(|e| format_io_err("mkdir (zip dir entry)", &outpath, &e))?;
        } else {
            if let Some(p) = outpath.parent() {
                fs::create_dir_all(p).map_err(|e| format_io_err("mkdir parent", p, &e))?;
            }
            let mut outfile = File::create(&outpath)
                .map_err(|e| format_io_err("create extracted file", &outpath, &e))?;
            io::copy(&mut file, &mut outfile)
                .map_err(|e| format_io_err("write extracted file", &outpath, &e))?;
            extracted.push(outpath.to_string_lossy().to_string());
        }
    }
    log::info!("[install] extract_zip: {} file(s) written", extracted.len());
    Ok(extracted)
}

#[cfg(windows)]
pub fn looks_like_permission_denied(err: &str) -> bool {
    let e = err.to_lowercase();
    e.contains("permission denied")
        || e.contains("access is denied")
        || e.contains("raw_os_error=some(5)")
        || e.contains("kind=permissiondenied")
}

/// Gọi bản thân exe với UAC; tiến trình con ghi JSON danh sách path vào `result_json`.
#[cfg(windows)]
pub fn extract_zip_elevated_windows(
    zip_path: &Path,
    out_dir: &Path,
    result_json: &Path,
) -> Result<Vec<String>, String> {
    use std::process::Command;

    fn ps_escape(s: &str) -> String {
        s.replace('\'', "''")
    }

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let cmd = format!(
        "$p = Start-Process -FilePath '{}' -ArgumentList '--assetbender-extract-zip','{}','{}','{}' -Verb RunAs -Wait -PassThru; exit $p.ExitCode",
        ps_escape(&exe.to_string_lossy()),
        ps_escape(&zip_path.to_string_lossy()),
        ps_escape(&out_dir.to_string_lossy()),
        ps_escape(&result_json.to_string_lossy()),
    );
    log::info!(
        "[install] extract_zip_elevated_windows: zip={} dest={} result={}",
        zip_path.display(),
        out_dir.display(),
        result_json.display()
    );
    let status = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-Command",
            &cmd,
        ])
        .status()
        .map_err(|e| format!("start elevated process: {e}"))?;
    if !status.success() {
        return Err(format!(
            "elevated extract exited with {:?} (user may have declined UAC)",
            status.code()
        ));
    }
    let raw = std::fs::read_to_string(result_json)
        .map_err(|e| format!("read elevated result file {}: {e}", result_json.display()))?;
    let _ = std::fs::remove_file(result_json);
    serde_json::from_str(&raw).map_err(|e| format!("parse elevated result JSON: {e}"))
}

pub fn merge_install_info(
    id: i64,
    kind: &str,
    paths: &[String],
    version: &str,
) -> Result<(), String> {
    let path = paths::installed_plugins_file();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format_io_err("create_dir_all install json", parent, &e))?;
    }
    let mut map: Map<String, Value> = if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|e| format_io_err("read install json", &path, &e))?;
        serde_json::from_str(&raw).unwrap_or_default()
    } else {
        Map::new()
    };
    let key = format!("{kind}-{id}");
    map.insert(
        key.clone(),
        Value::Array(paths.iter().map(|p| json!(p)).collect()),
    );
    map.insert(format!("{key}-version"), json!(version));
    fs::write(&path, serde_json::to_string_pretty(&map).unwrap())
        .map_err(|e| format_io_err("write install json", &path, &e))?;
    Ok(())
}

pub fn temp_zip_path() -> PathBuf {
    std::env::temp_dir().join(format!(
        "assetbender-download-{}.zip",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ))
}

#[cfg(windows)]
pub fn temp_elev_result_path() -> PathBuf {
    std::env::temp_dir().join(format!(
        "assetbender-elev-result-{}.json",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ))
}

/// Đọc toàn bộ `installed_plugins.json` (giống Flutter `checkInstalledJson`).
pub fn read_install_manifest_map() -> Result<Map<String, Value>, String> {
    let path = paths::installed_plugins_file();
    if !path.exists() {
        return Ok(Map::new());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format_io_err("read install json", &path, &e))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse install json: {e}"))
}

pub fn write_install_manifest_map(map: &Map<String, Value>) -> Result<(), String> {
    let path = paths::installed_plugins_file();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format_io_err("create_dir_all install json", parent, &e))?;
    }
    fs::write(&path, serde_json::to_string_pretty(map).unwrap())
        .map_err(|e| format_io_err("write install json", &path, &e))
}

fn remove_install_keys(map: &mut Map<String, Value>, kind: &str, id: i64) {
    let key = format!("{kind}-{id}");
    map.remove(&key);
    map.remove(&format!("{key}-version"));
}

/// Thư mục extension trực tiếp dưới `cep_dir` (folder đầu tiên trong zip).
fn cep_extension_roots(cep_dir: &Path, paths: &[String]) -> Vec<PathBuf> {
    let cep = cep_dir.canonicalize().unwrap_or_else(|_| cep_dir.to_path_buf());
    let mut set = HashSet::new();
    for p in paths {
        let pb = PathBuf::from(p);
        let path = pb.canonicalize().unwrap_or(pb);
        if let Ok(rel) = path.strip_prefix(&cep) {
            if let Some(c) = rel.components().next() {
                set.insert(cep.join(c));
            }
        }
    }
    set.into_iter().collect()
}

fn pack_root_dir(pack_base: &Path, paths: &[String]) -> Option<PathBuf> {
    let first = paths.first()?;
    let pb = PathBuf::from(first);
    let base = pack_base.canonicalize().unwrap_or_else(|_| pack_base.to_path_buf());
    let path = pb.canonicalize().unwrap_or(pb);
    let rel = path.strip_prefix(&base).ok()?;
    let c = rel.components().next()?;
    Some(base.join(c))
}

/// Xóa file/thư mục đã cài và cập nhật JSON (giống Flutter uninstall).
pub fn uninstall_plugin(id: i64) -> Result<(), String> {
    let mut map = read_install_manifest_map()?;
    let key = format!("plugin-{id}");
    let paths_val = map.get(&key).cloned();
    remove_install_keys(&mut map, "plugin", id);
    write_install_manifest_map(&map)?;

    let Some(paths_val) = paths_val else {
        return Ok(());
    };
    let arr: Vec<String> = match paths_val {
        Value::Array(a) => a
            .into_iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        _ => return Ok(()),
    };
    if arr.is_empty() {
        return Ok(());
    }
    let cep = paths::cep_extensions_dir();
    log::info!("[install] uninstall_plugin {id}: {} path(s), cep={}", arr.len(), cep.display());
    for root in cep_extension_roots(&cep, &arr) {
        if root.exists() {
            log::info!("[install] remove_dir_all {}", root.display());
            fs::remove_dir_all(&root).map_err(|e| format_io_err("remove_dir_all plugin", &root, &e))?;
        }
    }
    Ok(())
}

pub fn uninstall_pack(id: i64) -> Result<(), String> {
    let mut map = read_install_manifest_map()?;
    let key = format!("pack-{id}");
    let paths_val = map.get(&key).cloned();
    remove_install_keys(&mut map, "pack", id);
    write_install_manifest_map(&map)?;

    let Some(paths_val) = paths_val else {
        return Ok(());
    };
    let arr: Vec<String> = match paths_val {
        Value::Array(a) => a
            .into_iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        _ => return Ok(()),
    };
    if arr.is_empty() {
        return Ok(());
    }
    let pack_base = paths::pack_install_dir();
    log::info!("[install] uninstall_pack {id}: {} path(s)", arr.len());
    if let Some(root) = pack_root_dir(&pack_base, &arr) {
        if root.exists() {
            log::info!("[install] remove_dir_all {}", root.display());
            fs::remove_dir_all(&root).map_err(|e| format_io_err("remove_dir_all pack", &root, &e))?;
        }
    } else {
        for p in &arr {
            let path = PathBuf::from(p);
            if path.is_file() {
                let _ = fs::remove_file(&path);
            }
        }
    }
    Ok(())
}
