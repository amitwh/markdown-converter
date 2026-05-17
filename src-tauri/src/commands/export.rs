use std::process::Command;
use tauri::CommandResult;
use crate::error::AppError;

#[tauri::command]
pub async fn export_markdown(
    input_path: String,
    output_path: String,
    format: String,
    options: ExportOptions,
) -> CommandResult<String, AppError> {
    let mut args = vec![input_path.clone(), "-o".to_string(), output_path.clone()];

    match format.as_str() {
        "pdf" => {
            args.push("--pdf-engine=xelatex".to_string());
            if options.standalone.unwrap_or(false) {
                args.push("-s".to_string());
            }
        },
        "docx" => {
            args.push("--to=docx".to_string());
            if options.standalone.unwrap_or(false) {
                args.push("-s".to_string());
            }
        },
        "html" => {
            args.push("--to=html".to_string());
            if options.standalone.unwrap_or(false) {
                args.push("-s".to_string());
            }
        },
        _ => {
            args.push(format!("--to={}", format));
        }
    }

    let output = Command::new("pandoc")
        .args(&args)
        .output()
        .map_err(|e| AppError::Export(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Export(stderr.to_string()));
    }

    Ok(output_path)
}

#[derive(serde::Deserialize)]
pub struct ExportOptions {
    pub standalone: Option<bool>,
    pub template: Option<String>,
}

#[tauri::command]
pub async fn check_pandoc_available() -> CommandResult<bool, AppError> {
    let output = Command::new("pandoc")
        .arg("--version")
        .output();
    Ok(output.is_ok())
}
