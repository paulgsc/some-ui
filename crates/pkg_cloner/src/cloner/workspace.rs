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
    /// Builds a package from its directory, using the directory name as the package name.
    ///
    /// Returns `None` when the path has no final component or that component is not valid UTF-8.
    #[must_use]
    pub fn new(path: PathBuf) -> Option<Self> {
        let name = path.file_name()?.to_str()?.to_string();
        Some(Self { name, path })
    }
}

/// Finds all packages (directories containing a package.json) in the workspaces directory.
///
/// Filters out build/cache directories (e.g. `.turbo`, `dist`, `node_modules`) that are
/// plain subdirectories but not real packages, so they never show up as template candidates.
///
/// # Errors
///
/// Returns an error if `workspaces` cannot be read, or if it contains no packages.
pub fn find_packages(workspaces: &Path) -> IoResult<Vec<Package>> {
    let entries = fs::read_dir(workspaces).map_err(|e| Error::new(e.kind(), format!("Failed to read workspaces directory {}: {}", workspaces.display(), e)))?;

    let packages: Vec<Package> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|file_type| file_type.is_dir()))
        .filter(|entry| entry.path().join("package.json").is_file())
        .filter_map(|entry| Package::new(entry.path()))
        .collect();

    if packages.is_empty() {
        return Err(Error::new(
            ErrorKind::NotFound,
            format!("No packages (directories containing a package.json) found in workspace directory: {}", workspaces.display()),
        ));
    }

    Ok(packages)
}

/// Creates a new package directory structure
///
/// # Errors
///
/// Returns an error if the package already exists and `force` is not set, if
/// `package_name` is not a valid npm package name, or if a directory cannot be created.
pub fn create_package_structure(workspaces: &Path, package_name: &str, force: bool) -> IoResult<PathBuf> {
    let new_package_path = workspaces.join(package_name);

    // Check if package already exists
    if new_package_path.exists() && !force {
        return Err(Error::new(
            ErrorKind::AlreadyExists,
            format!("Package '{package_name}' already exists. Use --force to overwrite."),
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
    use std::fs;

    #[test]
    fn test_find_packages_ignores_dirs_without_package_json() {
        let workspaces = tempfile::tempdir().unwrap();

        let real_package = workspaces.path().join("some-real-package");
        fs::create_dir_all(&real_package).unwrap();
        fs::write(real_package.join("package.json"), "{}").unwrap();

        // A build/cache dir that happens to sit alongside real packages but isn't one.
        fs::create_dir_all(workspaces.path().join(".turbo")).unwrap();

        let packages = find_packages(workspaces.path()).unwrap();

        assert_eq!(packages.len(), 1);
        assert_eq!(packages[0].name, "some-real-package");
    }

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
