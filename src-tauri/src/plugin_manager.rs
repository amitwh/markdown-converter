use std::collections::HashMap;
use std::path::PathBuf;
use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct PluginMetadata {
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub builtin: bool,
}

pub struct PluginManager {
    plugins: HashMap<String, PluginMetadata>,
    enabled: Vec<String>,
}

impl PluginManager {
    pub fn new() -> Self {
        PluginManager {
            plugins: HashMap::new(),
            enabled: Vec::new(),
        }
    }

    pub fn load_plugins(&mut self, plugin_dir: PathBuf) -> Result<(), AppError> {
        if !plugin_dir.exists() {
            return Ok(());
        }

        for entry in walkdir::WalkDir::new(&plugin_dir)
            .max_depth(1)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let manifest_path = path.join("manifest.json");
            if manifest_path.exists() {
                let content = std::fs::read_to_string(&manifest_path)
                    .map_err(|e| AppError::Config(format!("Failed to read manifest: {}", e)))?;

                #[derive(serde::Deserialize)]
                struct RawPluginMetadata {
                    name: String,
                    version: String,
                    description: String,
                    author: String,
                    builtin: Option<bool>,
                }

                let raw: RawPluginMetadata = serde_json::from_str(&content)
                    .map_err(|e| AppError::Config(format!("Failed to parse manifest: {}", e)))?;

                let metadata = PluginMetadata {
                    name: raw.name,
                    version: raw.version,
                    description: raw.description,
                    author: raw.author,
                    builtin: raw.builtin.unwrap_or(false),
                };

                self.plugins.insert(metadata.name.clone(), metadata);
            }
        }

        Ok(())
    }

    pub fn enable_plugin(&mut self, name: &str) {
        if !self.enabled.contains(&name.to_string()) {
            self.enabled.push(name.to_string());
        }
    }

    pub fn disable_plugin(&mut self, name: &str) {
        self.enabled.retain(|n| n != name);
    }

    pub fn get_enabled(&self) -> Vec<String> {
        self.enabled.clone()
    }

    pub fn list_plugins(&self) -> Vec<PluginMetadata> {
        self.plugins.values().cloned().collect()
    }

    pub fn get_plugin(&self, name: &str) -> Option<PluginMetadata> {
        self.plugins.get(name).cloned()
    }
}

impl Default for PluginManager {
    fn default() -> Self {
        Self::new()
    }
}