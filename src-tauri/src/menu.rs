use tauri::{AppHandle, Emitter, menu::{Menu, MenuItem, Submenu, PredefinedMenuItem}};

pub fn create_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(app, "new", "New", true, Some("CmdOrCtrl+N"))?,
            &MenuItem::with_id(app, "open", "Open...", true, Some("CmdOrCtrl+O"))?,
            &MenuItem::with_id(app, "open_pdf", "Open PDF...", true, Some("CmdOrCtrl+Shift+O"))?,
            &MenuItem::with_id(app, "save", "Save", true, Some("CmdOrCtrl+S"))?,
            &MenuItem::with_id(app, "save_as", "Save As...", true, Some("CmdOrCtrl+Shift+S"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "print", "Print Preview", true, Some("CmdOrCtrl+P"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "import", "Import Document...", true, Some("CmdOrCtrl+I"))?,
            &Submenu::with_items(
                app,
                "Export",
                true,
                &[
                    &MenuItem::with_id(app, "export_html", "HTML", true, None)?,
                    &MenuItem::with_id(app, "export_pdf", "PDF", true, None)?,
                    &MenuItem::with_id(app, "export_docx", "DOCX", true, None)?,
                    &MenuItem::with_id(app, "export_latex", "LaTeX", true, None)?,
                    &MenuItem::with_id(app, "export_rtf", "RTF", true, None)?,
                    &MenuItem::with_id(app, "export_odt", "ODT", true, None)?,
                    &MenuItem::with_id(app, "export_epub", "EPUB", true, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "export_pptx", "PowerPoint (PPTX)", true, None)?,
                    &MenuItem::with_id(app, "export_csv", "CSV (Tables)", true, None)?,
                ],
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", "Quit", true, Some("CmdOrCtrl+Q"))?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &MenuItem::with_id(app, "undo", "Undo", true, Some("CmdOrCtrl+Z"))?,
            &MenuItem::with_id(app, "redo", "Redo", true, Some("CmdOrCtrl+Shift+Z"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "cut", "Cut", true, Some("CmdOrCtrl+X"))?,
            &MenuItem::with_id(app, "copy", "Copy", true, Some("CmdOrCtrl+C"))?,
            &MenuItem::with_id(app, "paste", "Paste", true, Some("CmdOrCtrl+V"))?,
            &MenuItem::with_id(app, "select_all", "Select All", true, Some("CmdOrCtrl+A"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "find", "Find & Replace", true, Some("CmdOrCtrl+F"))?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &MenuItem::with_id(app, "toggle_preview", "Toggle Preview", true, Some("CmdOrCtrl+Shift+V"))?,
            &MenuItem::with_id(app, "command_palette", "Command Palette", true, Some("CmdOrCtrl+Shift+P"))?,
            &PredefinedMenuItem::separator(app)?,
            &Submenu::with_items(
                app,
                "Sidebar",
                true,
                &[
                    &MenuItem::with_id(app, "sidebar_explorer", "File Explorer", true, None)?,
                    &MenuItem::with_id(app, "sidebar_git", "Git", true, None)?,
                    &MenuItem::with_id(app, "sidebar_snippets", "Snippets", true, None)?,
                    &MenuItem::with_id(app, "sidebar_templates", "Templates", true, None)?,
                ],
            )?,
            &MenuItem::with_id(app, "toggle_bottom_panel", "Bottom Panel (REPL)", true, None)?,
            &PredefinedMenuItem::separator(app)?,
            &Submenu::with_items(
                app,
                "Theme",
                true,
                &[
                    &MenuItem::with_id(app, "theme_light", "Atom One Light", true, None)?,
                    &MenuItem::with_id(app, "theme_dark", "Dark", true, None)?,
                    &MenuItem::with_id(app, "theme_solarized", "Solarized Light", true, None)?,
                    &MenuItem::with_id(app, "theme_monokai", "Monokai", true, None)?,
                    &MenuItem::with_id(app, "theme_github", "GitHub Light", true, None)?,
                ],
            )?,
        ],
    )?;

    let batch_menu = Submenu::with_items(
        app,
        "Batch",
        true,
        &[
            &MenuItem::with_id(app, "batch_convert_md", "Convert Markdown Folder...", true, None)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "batch_image", "Batch Image Conversion...", true, None)?,
            &MenuItem::with_id(app, "batch_audio", "Batch Audio Conversion...", true, None)?,
            &MenuItem::with_id(app, "batch_video", "Batch Video Conversion...", true, None)?,
        ],
    )?;

    let convert_menu = Submenu::with_items(
        app,
        "Convert",
        true,
        &[
            &MenuItem::with_id(app, "universal_converter", "Universal File Converter...", true, Some("CmdOrCtrl+Shift+C"))?,
        ],
    )?;

    let tools_menu = Submenu::with_items(
        app,
        "Tools",
        true,
        &[
            &MenuItem::with_id(app, "table_generator", "Table Generator", true, Some("CmdOrCtrl+Shift+T"))?,
            &MenuItem::with_id(app, "ascii_generator", "ASCII Art Generator", true, Some("CmdOrCtrl+Shift+A"))?,
        ],
    )?;

    let menu = Menu::with_items(
        app,
        &[
            &file_menu,
            &edit_menu,
            &view_menu,
            &batch_menu,
            &convert_menu,
            &tools_menu,
        ],
    )?;

    Ok(menu)
}

pub fn handle_menu_event(app: &AppHandle, event: menu::MenuEvent) {
    let id = event.id().as_ref();
    match id {
        "new" => { let _ = app.emit("file-new", ()); }
        "open" => { let _ = app.emit("menu-open", "open"); }
        "save" => { let _ = app.emit("file-save", ()); }
        "toggle_preview" => { let _ = app.emit("toggle-preview", ()); }
        "command_palette" => { let _ = app.emit("toggle-command-palette", ()); }
        "toggle_bottom_panel" => { let _ = app.emit("toggle-bottom-panel", ()); }
        "sidebar_explorer" => { let _ = app.emit("toggle-sidebar-panel", "explorer"); }
        "sidebar_git" => { let _ = app.emit("toggle-sidebar-panel", "git"); }
        "sidebar_snippets" => { let _ = app.emit("toggle-sidebar-panel", "snippets"); }
        "sidebar_templates" => { let _ = app.emit("toggle-sidebar-panel", "templates"); }
        "theme_light" => { let _ = app.emit("theme-changed", "atomonelight"); }
        "theme_dark" => { let _ = app.emit("theme-changed", "dark"); }
        "theme_solarized" => { let _ = app.emit("theme-changed", "solarized"); }
        "theme_monokai" => { let _ = app.emit("theme-changed", "monokai"); }
        "theme_github" => { let _ = app.emit("theme-changed", "github"); }
        "undo" => { let _ = app.emit("undo", ()); }
        "redo" => { let _ = app.emit("redo", ()); }
        "find" => { let _ = app.emit("toggle-find", ()); }
        "quit" => { app.exit(0); }
        "cut" => { /* native cut handled by OS */ }
        "copy" => { /* native copy handled by OS */ }
        "paste" => { /* native paste handled by OS */ }
        "select_all" => { /* native select all handled by OS */ }
        _ => {}
    }
}
