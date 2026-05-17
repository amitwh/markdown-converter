use tauri::CommandResult;
use crate::error::AppError;

#[tauri::command]
pub async fn get_pdf_page_count(path: String) -> CommandResult<usize, AppError> {
    // Placeholder — actual implementation in pdf_ops.rs
    Ok(0)
}

#[tauri::command]
pub async fn merge_pdfs(paths: Vec<String>, output: String) -> CommandResult<String, AppError> {
    Ok(output)
}

#[tauri::command]
pub async fn split_pdf(input: String, output_dir: String, pages_per_split: usize) -> CommandResult<Vec<String>, AppError> {
    Ok(Vec::new())
}

#[tauri::command]
pub async fn rotate_pdf(input: String, output: String, degrees: i32) -> CommandResult<(), AppError> {
    Ok(())
}

#[tauri::command]
pub async fn delete_pdf_pages(input: String, output: String, pages: Vec<usize>) -> CommandResult<(), AppError> {
    Ok(())
}
