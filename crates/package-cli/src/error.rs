use thiserror::Error;

#[derive(Error, Debug)]
pub enum PackageError {
    #[error("Failed to create directory: {0}")]
    DirectoryCreationError(String),
    #[error("Failed to copy file to {0}")]
    FileCopyError(String),
    #[error("Failed to run pnpm install")]
    CommandError,
}

pub type Result<T> = std::result::Result<T, PackageError>;

