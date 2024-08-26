use std::fs::{self, File};
use std::io::{Read, Write};
use crate::config::Config;
use crate::error::Result;

pub fn update_pnpm_workspace(config: &Config) -> Result<()> {
    let mut workspace_content = String::new();
    File::open(&config.workspace_file)?.read_to_string(&mut workspace_content)?;
    
    if !workspace_content.contains(&format!("packages/{}", config.package_name)) {
        workspace_content.push_str(&format!("\n  - packages/{}", config.package_name));
        let mut file = File::create(&config.workspace_file)?;
        file.write_all(workspace_content.as_bytes())?;
    }
    
    Ok(())
}

