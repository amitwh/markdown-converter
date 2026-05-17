use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("File read error: {0}")]
    FileRead(String),
    #[error("File write error: {0}")]
    FileWrite(String),
    #[error("File delete error: {0}")]
    FileDelete(String),
    #[error("File copy error: {0}")]
    FileCopy(String),
    #[error("File move error: {0}")]
    FileMove(String),
    #[error("Export error: {0}")]
    Export(String),
    #[error("Git error: {0}")]
    Git(String),
    #[error("PDF error: {0}")]
    Pdf(String),
    #[error("Config error: {0}")]
    Config(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
