use std::fs;
use tauri::CommandResult;
use crate::error::AppError;

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub fn get_recent_files() -> CommandResult<Vec<String>, AppError> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| AppError::Config("Cannot find config directory".to_string()))?;
    let recent_path = config_dir.join("markdown-converter").join("recent-files.json");
    if recent_path.exists() {
        let content = fs::read_to_string(&recent_path).map_err(|e| AppError::FileRead(e.to_string()))?;
        let files: Vec<String> = serde_json::from_str(&content).unwrap_or_default();
        Ok(files)
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub fn save_recent_files(files: Vec<String>) -> CommandResult<(), AppError> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| AppError::Config("Cannot find config directory".to_string()))?;
    let app_dir = config_dir.join("markdown-converter");
    fs::create_dir_all(&app_dir).map_err(|e| AppError::FileWrite(e.to_string()))?;
    let recent_path = app_dir.join("recent-files.json");
    let content = serde_json::to_string_pretty(&files).map_err(|e| AppError::Config(e.to_string()))?;
    fs::write(&recent_path, content).map_err(|e| AppError::FileWrite(e.to_string()))?;
    Ok(())
}
