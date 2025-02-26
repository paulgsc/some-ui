use file_reader::config::PathPartError;
use file_reader::core::Path;
use std::path::Path as StdPath;
use thiserror::Error;

#[derive(Debug, Clone)]
pub enum WasmPkgDirPath {
    PkgDirPath(Path),
}

impl AsRef<StdPath> for WasmPkgDirPath {
    fn as_ref(&self) -> &StdPath {
        match self {
            WasmPkgDirPath::PkgDirPath(path) => StdPath::new(path.as_ref()),
        }
    }
}

#[derive(Debug, Error)]
pub enum PkgDirPathError {
    #[error("Invalid file extension: expected .json, got {extension}")]
    InvalidExtension { extension: String },
    #[error("Invalid filename: expected client_secret_file.json, got {filename}")]
    InvalidDirname { filename: String },
    #[error("Path error: {0}")]
    PathError(#[from] PathPartError),
}

impl WasmPkgDirPath {
    pub fn new(path: &str) -> Result<Self, PkgDirPathError> {
        let parsed_path = Path::parse(path)?;

        if parsed_path.extension().is_some() {
            return Err(PkgDirPathError::InvalidExtension {
                extension: parsed_path.extension().unwrap_or_default().to_string(),
            });
        }

        Ok(WasmPkgDirPath::PkgDirPath(parsed_path))
    }

    pub fn as_str(&self) -> &str {
        match self {
            WasmPkgDirPath::PkgDirPath(path) => path.as_ref(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Helper function to create test paths
    fn create_test_path(path_str: &str) -> Result<Path, PathPartError> {
        Path::parse(path_str)
    }

    #[test]
    fn test_valid_secret_file_path() {
        let path = create_test_path("/path/to/client_secret_file.json").unwrap();
        let result = WasmPkgDirPath::new(path);
        assert!(result.is_ok());
    }

    #[test]
    fn test_valid_secret_file_path_no_leading_slash() {
        let path = create_test_path("path/to/client_secret_file.json").unwrap();
        let result = WasmPkgDirPath::new(path);
        assert!(result.is_ok());
    }

    #[test]
    fn test_invalid_file_extension() {
        let path = create_test_path("/path/to/client_secret_file.txt").unwrap();
        let result = WasmPkgDirPath::new(path);

        match result {
            Err(PkgDirPathError::InvalidExtension { extension }) => {
                assert_eq!(extension, "txt");
            }
            _ => panic!("Expected InvalidExtension error"),
        }
    }

    #[test]
    fn test_no_file_extension() {
        let path = create_test_path("/path/to/client_secret_file").unwrap();
        let result = WasmPkgDirPath::new(path);

        match result {
            Err(PkgDirPathError::InvalidExtension { extension }) => {
                assert_eq!(extension, "no extension");
            }
            _ => panic!("Expected InvalidExtension error"),
        }
    }

    #[test]
    fn test_invalid_filename() {
        let path = create_test_path("/path/to/wrong_filename.json").unwrap();
        let result = WasmPkgDirPath::new(path);

        match result {
            Err(PkgDirPathError::InvalidDirname { filename }) => {
                assert_eq!(filename, "wrong_filename.json");
            }
            _ => panic!("Expected InvalidDirname error"),
        }
    }

    #[test]
    fn test_path_with_dots() {
        let path = create_test_path("/path/./to/../client_secret_file.json").unwrap();
        let result = WasmPkgDirPath::new(path);
        assert!(result.is_ok());
    }

    #[test]
    fn test_path_with_special_characters() {
        let path = create_test_path("/path with spaces/to/client_secret_file.json").unwrap();
        let result = WasmPkgDirPath::new(path);
        assert!(result.is_ok());
    }

    #[test]
    fn test_as_str_representation() {
        let path = create_test_path("/path/to/client_secret_file.json").unwrap();
        let secret_path = WasmPkgDirPath::new(path).unwrap();
        assert_eq!(secret_path.as_str(), "path/to/client_secret_file.json");
    }

    #[test]
    fn test_empty_path() {
        let path = create_test_path("").unwrap();
        let result = WasmPkgDirPath::new(path);

        match result {
            Err(PkgDirPathError::InvalidDirname { filename }) => {
                assert_eq!(filename, "no filename");
            }
            _ => panic!("Expected InvalidDirname error"),
        }
    }

    #[test]
    fn test_path_with_multiple_extensions() {
        let path = create_test_path("/path/to/client_secret_file.tar.json").unwrap();
        let result = WasmPkgDirPath::new(path);

        match result {
            Err(PkgDirPathError::InvalidDirname { filename }) => {
                assert_eq!(filename, "client_secret_file.tar.json");
            }
            _ => panic!("Expected InvalidDirname error"),
        }
    }

    #[test]
    fn test_path_case_sensitivity() {
        // Test uppercase extension
        let path = create_test_path("/path/to/client_secret_file.JSON").unwrap();
        let result = WasmPkgDirPath::new(path);
        assert!(result.is_err());

        // Test uppercase filename
        let path = create_test_path("/path/to/CLIENT_SECRET_FILE.json").unwrap();
        let result = WasmPkgDirPath::new(path);
        assert!(result.is_err());
    }

    #[test]
    fn test_root_path() {
        let path = create_test_path("/client_secret_file.json").unwrap();
        let result = WasmPkgDirPath::new(path);
        assert!(result.is_ok());
    }

    #[test]
    fn test_relative_dot_path() {
        let path = create_test_path("./client_secret").unwrap();
        let result = WasmPkgDirPath::new(path);
        assert!(result.is_ok());
    }
}
