use std::fs;
use std::path::Path;
use tauri::CommandResult;
use crate::error::AppError;

#[tauri::command]
pub async fn read_file(path: String) -> CommandResult<String, AppError> {
    fs::read_to_string(&path).map_err(|e| AppError::FileRead(e.to_string()))
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> CommandResult<(), AppError> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::FileWrite(e.to_string()))?;
    }
    fs::write(&path, content).map_err(|e| AppError::FileWrite(e.to_string()))
}

#[tauri::command]
pub async fn delete_file(path: String) -> CommandResult<(), AppError> {
    fs::remove_file(&path).map_err(|e| AppError::FileDelete(e.to_string()))
}

#[tauri::command]
pub async fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
pub async fn is_directory(path: String) -> bool {
    Path::new(&path).is_dir()
}

#[tauri::command]
pub async fn list_directory(path: String) -> CommandResult<Vec<FileEntry>, AppError> {
    let mut entries = Vec::new();
    for entry in walkdir::WalkDir::new(&path).max_depth(1).into_iter().filter_map(|e| e.ok()) {
        let p = entry.path();
        if p == Path::new(&path) { continue; }
        entries.push(FileEntry {
            name: p.file_name().unwrap_or_default().to_string_lossy().to_string(),
            path: p.to_string_lossy().to_string(),
            is_dir: p.is_dir(),
            is_file: p.is_file(),
        });
    }
    Ok(entries)
}

#[tauri::command]
pub async fn ensure_directory(path: String) -> CommandResult<(), AppError> {
    fs::create_dir_all(&path).map_err(|e| AppError::FileWrite(e.to_string()))
}

#[tauri::command]
pub async fn copy_path(source: String, destination: String) -> CommandResult<(), AppError> {
    fs::copy(&source, &destination).map_err(|e| AppError::FileCopy(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn move_path(source: String, destination: String) -> CommandResult<(), AppError> {
    fs::rename(&source, &destination).map_err(|e| AppError::FileMove(e.to_string()))
}

#[derive(serde::Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_file: bool,
}
