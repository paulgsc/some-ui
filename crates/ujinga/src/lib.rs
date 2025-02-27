pub mod file_path;

use file_path::{PkgDirPathError, WasmPkgDirPath};
use std::path::PathBuf;

pub struct WasmClient {
    pub file_dir_path: WasmPkgDirPath,
    pub system_path: PathBuf,
}

impl WasmClient {
    pub fn new(dir_path: &str) -> Result<Self, PkgDirPathError> {
        let file_dir_path = WasmPkgDirPath::new(dir_path)?;
        let system_path = PathBuf::from(&file_dir_path.as_ref());

        if !system_path.exists() {
            return Err(PkgDirPathError::NoSuchDirectoryFound { path: dir_path });
        }

        Ok(Self { file_dir_path, system_path })
    }
}
