use std::fs;
use crate::config::Config;
use crate::core::command::run_pnpm_install;
use crate::core::repo::update_pnpm_workspace;
use crate::error::{PackageError, Result};
use walkdir::WalkDir;

pub fn run_task() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let package_name = match args.get(1) {
        Some(name) => name.to_string(),
        None => {
            eprintln!("Please specify a package name.");
            std::process::exit(1);
        }
    };

    let config = Config::new(package_name.clone());

    create_package_dir(&config)?;
    copy_template_files(&config)?;
    update_pnpm_workspace(&config)?;
    run_pnpm_install()?;

    println!("Package {} created successfully.", package_name);
    Ok(())
}

fn create_package_dir(config: &Config) -> Result<()> {
    fs::create_dir_all(&config.package_dir)
        .map_err(|_| PackageError::DirectoryCreationError(config.package_dir.to_string_lossy().into()))
}

fn copy_template_files(config: &Config) -> Result<()> {
    for entry in WalkDir::new(&config.template_dir).into_iter().filter_map(|e| e.ok()) {
        let relative_path = entry.path().strip_prefix(&config.template_dir).unwrap();
        let target_path = config.package_dir.join(relative_path);

        if entry.file_type().is_dir() {
            fs::create_dir_all(&target_path)
                .map_err(|_| PackageError::DirectoryCreationError(target_path.to_string_lossy().into()))?;
        } else {
            fs::copy(entry.path(), &target_path)
                .map_err(|_| PackageError::FileCopyError(target_path.to_string_lossy().into()))?;
        }
    }
    Ok(())
}

