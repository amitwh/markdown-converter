use tauri::CommandResult;
use crate::error::AppError;
use crate::pdf_ops::PdfProcessor;

#[tauri::command]
pub async fn get_pdf_page_count(path: String) -> CommandResult<usize, AppError> {
    PdfProcessor::get_page_count(&path)
}

#[tauri::command]
pub async fn merge_pdfs(paths: Vec<String>, output: String) -> CommandResult<String, AppError> {
    PdfProcessor::merge_pdfs(&paths, &output)?;
    Ok(output)
}

#[tauri::command]
pub async fn split_pdf(input: String, output_dir: String, pages_per_split: usize) -> CommandResult<Vec<String>, AppError> {
    PdfProcessor::split_pdf(&input, &output_dir, pages_per_split)
}

#[tauri::command]
pub async fn rotate_pdf(input: String, output: String, degrees: i32) -> CommandResult<(), AppError> {
    PdfProcessor::rotate_pages(&input, &output, degrees)
}

#[tauri::command]
pub async fn delete_pdf_pages(input: String, output: String, pages: Vec<usize>) -> CommandResult<(), AppError> {
    PdfProcessor::delete_pages(&input, &output, &pages)
}