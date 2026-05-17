pub mod menu;
pub mod tray;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            crate::commands::file::read_file,
            crate::commands::file::write_file,
            crate::commands::file::delete_file,
            crate::commands::file::path_exists,
            crate::commands::file::is_directory,
            crate::commands::file::list_directory,
            crate::commands::file::ensure_directory,
            crate::commands::file::copy_path,
            crate::commands::file::move_path,
            crate::commands::export::export_markdown,
            crate::commands::export::check_pandoc_available,
            crate::commands::git::git_status,
            crate::commands::git::git_stage,
            crate::commands::git::git_commit,
            crate::commands::git::git_log,
            crate::commands::git::git_diff,
            crate::commands::app::get_app_version,
            crate::commands::app::get_recent_files,
            crate::commands::app::save_recent_files,
            crate::commands::pdf::get_pdf_page_count,
            crate::commands::pdf::merge_pdfs,
            crate::commands::pdf::split_pdf,
            crate::commands::pdf::rotate_pdf,
            crate::commands::pdf::delete_pdf_pages,
            crate::commands::dialog::open_file_dialog,
            crate::commands::dialog::save_file_dialog,
            crate::commands::dialog::select_folder_dialog,
        ])
        .setup(|app| {
            log::info!("MarkdownConverter starting up");

            // Set up native menu
            let menu = crate::menu::create_menu(app.handle())?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| crate::menu::handle_menu_event(app, event));

            // Set up system tray
            let _ = crate::tray::create_tray(app.handle());

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let _ = window.emit("file-save", ());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}