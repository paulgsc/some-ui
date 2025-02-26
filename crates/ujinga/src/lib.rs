pub mod file_path;

use file_path::{PkgDirPathError, WasmPkgDirPath};

pub struct WasmClient {
    pub file_dir_path: WasmPkgDirPath,
}

impl WasmClient {
    pub fn new(dir_path: &str) -> Result<Self, PkgDirPathError> {
        let file_dir_path = WasmPkgDirPath::new(dir_path)?;

        Ok(Self { file_dir_path })
    }
}
