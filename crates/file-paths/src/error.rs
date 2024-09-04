// DISCLAIMER:
// This code is adapted from the Turborepo project, originally licensed under the MIT License.
// The original source can be found at: https://github.com/vercel/turborepo
// 
// The adaptations in this file are modified for specific use cases, but retain the core structure
// and principles of the original work. The MIT License governing this code allows for 
// copying, modification, and distribution, provided that the original license and copyright 
// notice are retained.



#[derive(Debug, Error, Diagnostic)]
pub enum PathError {
    #[error("Path is non-UTF-8: {0}")]
    InvalidUnicode(String),
    #[error("Failed to convert path")]
    FromPathBufError(#[from] camino::FromPathBufError),
    #[error("path is malformed: {0}")]
    MalformedPath(String),
    #[error("Path is not safe for windows: {0}")]
    WindowsUnsafePath(String),
    #[error("Path is not absolute: {0}")]
    NotAbsolute(String),
    #[error("Path is not absolute: {0}")]
    NotRelative(String),
    #[error("Path {0} is not parent of {1}")]
    NotParent(String, String),
    #[error("IO Error {0}")]
    IO(#[from] io::Error),
    #[error("{0} is not a prefix for {1}")]
    PrefixError(String, String),
}

impl From<std::string::FromUtf8Error> for PathError {
    fn from(value: std::string::FromUtf8Error) -> Self {
        PathError::InvalidUnicode(value.utf8_error().to_string())
    }
}

impl PathError {
    pub fn is_io_error(&self, kind: io::ErrorKind) -> bool {
        matches!(self, PathError::IO(err) if err.kind() == kind)
    }
}



