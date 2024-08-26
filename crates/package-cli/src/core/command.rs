use std::process::Command;
use crate::error::{PackageError, Result};

pub fn run_pnpm_install() -> Result<()> {
    let status = Command::new("pnpm")
        .arg("install")
        .status()
        .map_err(|_| PackageError::CommandError)?;

    if !status.success() {
        Err(PackageError::CommandError)
    } else {
        Ok(())
    }
}

