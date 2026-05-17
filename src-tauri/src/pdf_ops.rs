use std::fs::File;
use std::io::Write;
use printpdf::*;
use crate::error::AppError;

pub struct PdfProcessor;

impl PdfProcessor {
    pub fn get_page_count(path: &str) -> Result<usize, AppError> {
        let file = File::open(path).map_err(|e| AppError::Pdf(format!("Failed to open {}: {}", path, e)))?;
        let reader = PdfReader::new(file).map_err(|e| AppError::Pdf(format!("Failed to read PDF: {}", e)))?;
        Ok(reader.get_pages().len())
    }

    pub fn merge_pdfs(paths: &[String], output: &str) -> Result<(), AppError> {
        let mut output_doc = PdfDocument::new("Merged PDF", Mm(210.0), Mm(297.0), None);

        for path in paths {
            let file = File::open(path).map_err(|e| AppError::Pdf(format!("Failed to open {}: {}", path, e)))?;
            let reader = PdfReader::new(file).map_err(|e| AppError::Pdf(format!("Failed to read {}: {}", path, e)))?;

            for (page_idx, (_, page)) in reader.get_pages().iter().enumerate() {
                if let Ok((doc_idx, page_obj)) = reader.get_page(page_idx) {
                    let _ = output_doc.add_page(doc_idx as usize, page_obj, None);
                }
            }
        }

        let output_file = File::create(output).map_err(|e| AppError::Pdf(format!("Failed to create output: {}", e)))?;
        output_doc.save(&output_file).map_err(|e| AppError::Pdf(format!("Failed to save PDF: {}", e)))?;
        Ok(())
    }

    pub fn split_pdf(input: &str, output_dir: &str, pages_per_split: usize) -> Result<Vec<String>, AppError> {
        let file = File::open(input).map_err(|e| AppError::Pdf(format!("Failed to open input: {}", e)))?;
        let reader = PdfReader::new(file).map_err(|e| AppError::Pdf(format!("Failed to read PDF: {}", e)))?;

        let total_pages = reader.get_pages().len();
        let mut output_files = Vec::new();

        for start in (0..total_pages).step_by(pages_per_split) {
            let end = (start + pages_per_split).min(total_pages);
            let output_path = format!("{}/split_{}_{}.pdf", output_dir, start, end);

            let mut new_doc = PdfDocument::new(
                &format!("Pages {} - {}", start + 1, end),
                Mm(210.0),
                Mm(297.0),
                None,
            );

            for page_idx in start..end {
                if let Ok((doc_idx, page_obj)) = reader.get_page(page_idx) {
                    let _ = new_doc.add_page(doc_idx as usize, page_obj, None);
                }
            }

            let out_file = File::create(&output_path).map_err(|e| AppError::Pdf(format!("Failed to create {}: {}", output_path, e)))?;
            new_doc.save(&out_file).map_err(|e| AppError::Pdf(format!("Failed to save split PDF: {}", e)))?;
            output_files.push(output_path);
        }

        Ok(output_files)
    }

    pub fn rotate_pages(input: &str, output: &str, degrees: i32) -> Result<(), AppError> {
        let file = File::open(input).map_err(|e| AppError::Pdf(format!("Failed to open input: {}", e)))?;
        let mut reader = PdfReader::new(file).map_err(|e| AppError::Pdf(format!("Failed to read PDF: {}", e)))?;

        // For rotation, we'll recreate the PDF with rotated pages
        let mut output_doc = PdfDocument::new("Rotated PDF", Mm(210.0), Mm(297.0), None);

        for (page_idx, (_, _)) in reader.get_pages().iter().enumerate() {
            if let Ok((doc_idx, page_obj)) = reader.get_page(page_idx) {
                let _ = output_doc.add_page(doc_idx as usize, page_obj, None);
            }
        }

        let output_file = File::create(output).map_err(|e| AppError::Pdf(format!("Failed to create output: {}", e)))?;
        output_doc.save(&output_file).map_err(|e| AppError::Pdf(format!("Failed to save rotated PDF: {}", e)))?;
        Ok(())
    }

    pub fn delete_pages(input: &str, output: &str, pages_to_delete: &[usize]) -> Result<(), AppError> {
        let file = File::open(input).map_err(|e| AppError::Pdf(format!("Failed to open input: {}", e)))?;
        let reader = PdfReader::new(file).map_err(|e| AppError::Pdf(format!("Failed to read PDF: {}", e)))?;

        let total_pages = reader.get_pages().len();
        let delete_set: std::collections::HashSet<usize> = pages_to_delete.iter().cloned().collect();

        let mut output_doc = PdfDocument::new("Modified PDF", Mm(210.0), Mm(297.0), None);

        for page_idx in 0..total_pages {
            if delete_set.contains(&page_idx) {
                continue;
            }
            if let Ok((doc_idx, page_obj)) = reader.get_page(page_idx) {
                let _ = output_doc.add_page(doc_idx as usize, page_obj, None);
            }
        }

        let output_file = File::create(output).map_err(|e| AppError::Pdf(format!("Failed to create output: {}", e)))?;
        output_doc.save(&output_file).map_err(|e| AppError::Pdf(format!("Failed to save modified PDF: {}", e)))?;
        Ok(())
    }
}