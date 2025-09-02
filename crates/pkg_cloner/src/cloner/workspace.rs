use std::fs;
use std::io::{Error, ErrorKind, Result as IoResult};
use std::path::{Path, PathBuf};

/// Represents a package in the workspace
#[derive(Debug, Clone)]
pub struct Package {
    pub name: String,
    pub path: PathBuf,
}

impl Package {
    pub fn new(path: PathBuf) -> Option<Self> {
        let name = path.file_name()?.to_str()?.to_string();
        Some(Package { name, path })
    }
}

/// Finds all packages (directories) in the workspaces directory
pub fn find_packages(workspaces: &Path) -> IoResult<Vec<Package>> {
    let entries = fs::read_dir(workspaces).map_err(|e| Error::new(e.kind(), format!("Failed to read workspaces directory {}: {}", workspaces.display(), e)))?;

    let packages: Vec<Package> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
        .filter_map(|entry| Package::new(entry.path()))
        .collect();

    if packages.is_empty() {
        return Err(Error::new(
            ErrorKind::NotFound,
            format!("No packages found in workspace directory: {}", workspaces.display()),
        ));
    }

    Ok(packages)
}

/// Creates a new package directory structure
pub fn create_package_structure(workspaces: &Path, package_name: &str, force: bool) -> IoResult<PathBuf> {
    let new_package_path = workspaces.join(package_name);

    // Check if package already exists
    if new_package_path.exists() && !force {
        return Err(Error::new(
            ErrorKind::AlreadyExists,
            format!("Package '{}' already exists. Use --force to overwrite.", package_name),
        ));
    }

    // Validate package name
    if !is_valid_package_name(package_name) {
        return Err(Error::new(
            ErrorKind::InvalidInput,
            "Package name must contain only alphanumeric characters, hyphens, and underscores",
        ));
    }

    // Create package directory
    fs::create_dir_all(&new_package_path).map_err(|e| Error::new(e.kind(), format!("Failed to create package directory {}: {}", new_package_path.display(), e)))?;

    // Create src directory
    let src_path = new_package_path.join("src");
    fs::create_dir_all(&src_path).map_err(|e| Error::new(e.kind(), format!("Failed to create src directory {}: {}", src_path.display(), e)))?;

    Ok(new_package_path)
}

/// Validates package name according to npm naming conventions
fn is_valid_package_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 214
        && name.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.')
        && !name.starts_with('.')
        && !name.starts_with('-')
        && name.to_lowercase() == name
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_package_names() {
        assert!(is_valid_package_name("my-package"));
        assert!(is_valid_package_name("my_package"));
        assert!(is_valid_package_name("mypackage"));
        assert!(is_valid_package_name("my-package-123"));
    }

    #[test]
    fn test_invalid_package_names() {
        assert!(!is_valid_package_name(""));
        assert!(!is_valid_package_name("My-Package"));
        assert!(!is_valid_package_name(".my-package"));
        assert!(!is_valid_package_name("-my-package"));
        assert!(!is_valid_package_name("my package"));
    }
}
