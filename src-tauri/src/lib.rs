mod agent;
mod scanner;

use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[tauri::command]
fn scan_project(path: String) -> Result<scanner::ProjectGraph, String> {
    Ok(scanner::scan(&path))
}

#[tauri::command]
fn load_integration_overrides(
    path: String,
) -> Result<HashMap<String, serde_json::Value>, String> {
    let overrides_path = Path::new(&path)
        .join(".primeradiant")
        .join("integrations.json");

    if !overrides_path.exists() {
        return Ok(HashMap::new());
    }

    let content = fs::read_to_string(&overrides_path)
        .map_err(|e| format!("Failed to read overrides: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse overrides: {}", e))
}

#[tauri::command]
fn save_integration_overrides(
    path: String,
    overrides: HashMap<String, serde_json::Value>,
) -> Result<(), String> {
    let dir_path = Path::new(&path).join(".primeradiant");
    fs::create_dir_all(&dir_path)
        .map_err(|e| format!("Failed to create .primeradiant dir: {}", e))?;

    let overrides_path = dir_path.join("integrations.json");
    let content = serde_json::to_string_pretty(&overrides)
        .map_err(|e| format!("Failed to serialize overrides: {}", e))?;

    fs::write(&overrides_path, content)
        .map_err(|e| format!("Failed to write overrides: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_project,
            load_integration_overrides,
            save_integration_overrides,
            agent::run_agent,
            agent::send_to_agent,
            agent::abort_agent,
            agent::check_claude_installed,
            agent::run_shell,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
