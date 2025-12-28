use serde_json::{json, Value};
use std::fs;
use std::io::{Error, ErrorKind, Result as IoResult};
use std::path::Path;

#[derive(Clone, Eq, PartialEq)]
pub enum ConfigFile {
    Tsconfig,
    PackageJson,
    RollupConfig,
    EslintConfig,
    TsconfigBuildConfig,
    ViteConfig,
    JestConfig,
    GitIgnore,
}

impl ConfigFile {
    /// Returns the filename for this config file
    pub fn filename(&self) -> &str {
        match self {
            Self::Tsconfig => "tsconfig.json",
            Self::PackageJson => "package.json",
            Self::RollupConfig => "rollup.config.js",
            Self::EslintConfig => "eslint.config.js",
            Self::TsconfigBuildConfig => "tsconfig.build.json",
            Self::ViteConfig => "vite.config.js",
            Self::JestConfig => "jest.config.js",
            Self::GitIgnore => ".gitignore",
        }
    }

    /// Returns all available config files
    pub fn all() -> Vec<Self> {
        vec![
            Self::Tsconfig,
            Self::PackageJson,
            Self::RollupConfig,
            Self::EslintConfig,
            Self::TsconfigBuildConfig,
            Self::ViteConfig,
            Self::JestConfig,
            Self::GitIgnore,
        ]
    }

    /// Checks if this config file exists in the given directory
    pub fn exists_in(&self, dir: &Path) -> bool {
        dir.join(self.filename()).exists()
    }

    /// Returns whether this config file needs special processing
    pub fn needs_processing(&self) -> bool {
        matches!(self, Self::PackageJson)
    }
}

/// Updates package.json content with new package name
pub fn update_package_json(content: &str, new_package_name: &str) -> IoResult<String> {
    let mut json: Value = serde_json::from_str(content).map_err(|e| Error::new(ErrorKind::InvalidData, format!("Invalid JSON in package.json: {}", e)))?;

    if let Some(obj) = json.as_object_mut() {
        obj.insert("name".to_string(), json!(new_package_name));

        // Update description if it exists and contains the old package name
        if let Some(description) = obj.get("description").and_then(|v| v.as_str()) {
            if let Some(old_name) = obj.get("name").and_then(|v| v.as_str()) {
                if description.contains(old_name) {
                    let new_description = description.replace(old_name, new_package_name);
                    obj.insert("description".to_string(), json!(new_description));
                }
            }
        }
    } else {
        return Err(Error::new(ErrorKind::InvalidData, "package.json root is not an object"));
    }

    serde_json::to_string_pretty(&json).map_err(|e| Error::new(ErrorKind::InvalidData, format!("Failed to serialize JSON: {}", e)))
}

/// Copies a single config file from source to destination
pub fn copy_config_file(source_dir: &Path, dest_dir: &Path, config: &ConfigFile, new_package_name: &str) -> IoResult<()> {
    let source = source_dir.join(config.filename());
    let dest = dest_dir.join(config.filename());

    if !source.exists() {
        return Ok(()); // Skip non-existent files
    }

    if config.needs_processing() {
        let content = fs::read_to_string(&source).map_err(|e| Error::new(e.kind(), format!("Failed to read {}: {}", source.display(), e)))?;

        let updated_content = update_package_json(&content, new_package_name)?;

        fs::write(&dest, updated_content).map_err(|e| Error::new(e.kind(), format!("Failed to write {}: {}", dest.display(), e)))?;
    } else {
        fs::copy(&source, &dest).map_err(|e| Error::new(e.kind(), format!("Failed to copy {} to {}: {}", source.display(), dest.display(), e)))?;
    }

    println!("Copied {}", config.filename());
    Ok(())
}

/// Copies all available config files from template to new package
pub fn copy_configs(template_package: &Path, new_package_path: &Path, new_package_name: &str) -> IoResult<Vec<ConfigFile>> {
    let mut copied_configs = Vec::new();

    for config in ConfigFile::all() {
        if config.exists_in(template_package) {
            copy_config_file(template_package, new_package_path, &config, new_package_name)?;
            copied_configs.push(config);
        }
    }

    if copied_configs.is_empty() {
        return Err(Error::new(ErrorKind::NotFound, "No configuration files found in template package"));
    }

    Ok(copied_configs)
}
