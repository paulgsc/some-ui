use serde_json::{json, Value};
use std::fs;
use std::io::{Error, ErrorKind, Result as IoResult};
use std::path::{Path, PathBuf};

/// Patterns for config files to copy
const CONFIG_PATTERNS: &[&str] = &[
    "tsconfig*.json",
    "package.json",
    "*.config.js",
    "*.config.ts",
    ".eslintrc*",
    ".prettierrc*",
    ".gitignore",
    ".npmignore",
    ".editorconfig",
    "jest.config.*",
    "vitest.config.*",
];

/// Files that need special content processing
const NEEDS_PROCESSING: &[&str] = &["package.json"];

/// Find all config files in a directory matching our patterns
///
/// # Errors
///
/// Returns an error if `dir` cannot be read.
pub fn find_config_files(dir: &Path) -> IoResult<Vec<PathBuf>> {
    let mut found = Vec::new();

    let entries = fs::read_dir(dir).map_err(|e| Error::new(e.kind(), format!("Failed to read directory {}: {}", dir.display(), e)))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(filename) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };

        if matches_any_pattern(filename) {
            found.push(path);
        }
    }

    Ok(found)
}

/// Check if filename matches any of our config patterns
fn matches_any_pattern(filename: &str) -> bool {
    CONFIG_PATTERNS.iter().any(|pattern| {
        if pattern.contains('*') {
            // Simple glob matching
            let parts: Vec<&str> = pattern.split('*').collect();
            match parts.len() {
                1 => filename == parts[0],
                2 => filename.starts_with(parts[0]) && filename.ends_with(parts[1]),
                _ => {
                    // More complex pattern - check all parts in order
                    let mut pos = 0;
                    for (i, part) in parts.iter().enumerate() {
                        if part.is_empty() {
                            continue;
                        }
                        if i == 0 {
                            if !filename[pos..].starts_with(part) {
                                return false;
                            }
                            pos += part.len();
                        } else if i == parts.len() - 1 {
                            return filename[pos..].ends_with(part);
                        } else if let Some(idx) = filename[pos..].find(part) {
                            pos += idx + part.len();
                        } else {
                            return false;
                        }
                    }
                    true
                }
            }
        } else {
            filename == *pattern
        }
    })
}

/// Check if a file needs content processing
fn needs_processing(filename: &str) -> bool {
    NEEDS_PROCESSING.contains(&filename)
}

/// Updates package.json content with new package name
///
/// # Errors
///
/// Returns an error if `content` is not valid JSON, if its root is not an object,
/// or if the updated document cannot be re-serialized.
pub fn update_package_json(content: &str, new_package_name: &str) -> IoResult<String> {
    let mut json: Value = serde_json::from_str(content).map_err(|e| Error::new(ErrorKind::InvalidData, format!("Invalid JSON in package.json: {e}")))?;

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

    serde_json::to_string_pretty(&json).map_err(|e| Error::new(ErrorKind::InvalidData, format!("Failed to serialize JSON: {e}")))
}

/// Copies a single config file from source to destination
///
/// # Errors
///
/// Returns an error if `source` has no valid filename, or if reading, rewriting,
/// or writing the file fails.
pub fn copy_config_file(source: &Path, dest_dir: &Path, new_package_name: &str) -> IoResult<()> {
    let filename = source
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| Error::new(ErrorKind::InvalidData, "Invalid filename"))?;

    let dest = dest_dir.join(filename);

    if needs_processing(filename) {
        let content = fs::read_to_string(source).map_err(|e| Error::new(e.kind(), format!("Failed to read {}: {}", source.display(), e)))?;

        let updated_content = update_package_json(&content, new_package_name)?;

        fs::write(&dest, updated_content).map_err(|e| Error::new(e.kind(), format!("Failed to write {}: {}", dest.display(), e)))?;
    } else {
        fs::copy(source, &dest).map_err(|e| Error::new(e.kind(), format!("Failed to copy {} to {}: {}", source.display(), dest.display(), e)))?;
    }

    println!("Copied {filename}");
    Ok(())
}

/// Copies all config files from template to new package
///
/// # Errors
///
/// Returns an error if the template contains no config files, or if any individual
/// file fails to copy.
pub fn copy_configs(template_package: &Path, new_package_path: &Path, new_package_name: &str) -> IoResult<Vec<String>> {
    let config_files = find_config_files(template_package)?;

    if config_files.is_empty() {
        return Err(Error::new(ErrorKind::NotFound, "No configuration files found in template package"));
    }

    let mut copied = Vec::new();
    for file in config_files {
        copy_config_file(&file, new_package_path, new_package_name)?;
        if let Some(filename) = file.file_name().and_then(|n| n.to_str()) {
            copied.push(filename.to_string());
        }
    }

    Ok(copied)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pattern_matching() {
        assert!(matches_any_pattern("tsconfig.json"));
        assert!(matches_any_pattern("tsconfig.build.json"));
        assert!(matches_any_pattern("vite.config.js"));
        assert!(matches_any_pattern("vite.config.ts"));
        assert!(matches_any_pattern("rollup.config.js"));
        assert!(matches_any_pattern(".eslintrc"));
        assert!(matches_any_pattern(".eslintrc.json"));
        assert!(matches_any_pattern(".gitignore"));
        assert!(matches_any_pattern("jest.config.js"));

        assert!(!matches_any_pattern("README.md"));
        assert!(!matches_any_pattern("src/index.ts"));
    }
}
