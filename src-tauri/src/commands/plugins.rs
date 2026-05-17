use crate::error::AppError;
use crate::plugin_manager::PluginMetadata;

#[tauri::command]
pub fn list_plugins() -> Vec<PluginMetadata> {
    // This would be connected to the app state in a full implementation
    // For now, return the built-in plugins
    vec![
        PluginMetadata {
            name: "writing-studio".to_string(),
            version: "1.0.0".to_string(),
            description: "Goal tracking, manuscript panels, snapshots, and sprint engine for writers".to_string(),
            author: "ConcreteInfo".to_string(),
            builtin: true,
        }
    ]
}

#[tauri::command]
pub fn get_plugin(name: String) -> Option<PluginMetadata> {
    match name.as_str() {
        "writing-studio" => Some(PluginMetadata {
            name: "writing-studio".to_string(),
            version: "1.0.0".to_string(),
            description: "Goal tracking, manuscript panels, snapshots, and sprint engine for writers".to_string(),
            author: "ConcreteInfo".to_string(),
            builtin: true,
        }),
        _ => None,
    }
}