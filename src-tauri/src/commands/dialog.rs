use tauri_plugin_dialog::DialogExt;
use tauri::CommandResult;
use crate::error::AppError;

#[tauri::command]
pub async fn open_file_dialog(app: tauri::AppHandle) -> CommandResult<Option<String>, AppError> {
    let file = app.dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown"])
        .add_filter("All Files", &["*"]);
    let result = file.blocking_pick_file();
    Ok(result.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn save_file_dialog(app: tauri::AppHandle, default_name: Option<String>) -> CommandResult<Option<String>, AppError> {
    let file = app.dialog()
        .file()
        .set_file_name(default_name.unwrap_or_else(|| "untitled.md".to_string()));
    let result = file.blocking_save_file();
    Ok(result.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn select_folder_dialog(app: tauri::AppHandle) -> CommandResult<Option<String>, AppError> {
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|p| p.to_string()))
}
