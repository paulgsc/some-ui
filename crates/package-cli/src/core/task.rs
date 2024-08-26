use std::fs;
use crate::config::Config;
use crate::core::command::run_pnpm_install;
use crate::core::repo::update_pnpm_workspace;
use crate::error::{PackageError, Result};
use walkdir::WalkDir;
use cli_logger::{init, set_level, LogLevel, error, warn, info, debug};

pub fn run_task() -> Result<()> {
    init();
    set_level(LogLevel::Debug);  
    info("Starting package creation task");

    let args: Vec<String> = std::env::args().collect();
    let package_name = match args.get(1) {
        Some(name) => name.to_string(),
        None => {
            let err_msg = "No package name specified";
            error(err_msg);
            return Err(PackageError::MissingArgument(err_msg.to_string()));
        }
    };

    debug(&format!("Creating package: {}", package_name));

    let config = Config::new(package_name.clone());

    create_package_dir(&config)?;
    copy_template_files(&config)?;
    update_pnpm_workspace(&config)?;
    run_pnpm_install()?;

    info(&format!("Package {} created successfully", package_name));
    Ok(())
}

fn create_package_dir(config: &Config) -> Result<()> {
    debug(&format!("Creating package directory: {:?}", config.package_dir));
    fs::create_dir_all(&config.package_dir)
        .map_err(|e| {
            let err_msg = format!("Failed to create directory {:?}: {}", config.package_dir, e);
            error(&err_msg);
            PackageError::DirectoryCreationError(err_msg)
        })
}

fn copy_template_files(config: &Config) -> Result<()> {
    info("Copying template files");
    for entry in WalkDir::new(&config.template_dir).into_iter().filter_map(|e| e.ok()) {
        let relative_path = entry.path().strip_prefix(&config.template_dir).unwrap();
        let target_path = config.package_dir.join(relative_path);

        if entry.file_type().is_dir() {
            debug(&format!("Creating directory: {:?}", target_path));
            fs::create_dir_all(&target_path)
                .map_err(|e| {
                    let err_msg = format!("Failed to create directory {:?}: {}", target_path, e);
                    error(&err_msg);
                    PackageError::DirectoryCreationError(err_msg)
                })?;
        } else {
            debug(&format!("Copying file: {:?} to {:?}", entry.path(), target_path));
            fs::copy(entry.path(), &target_path)
                .map_err(|e| {
                    let err_msg = format!("Failed to copy file to {:?}: {}", target_path, e);
                    error(&err_msg);
                    PackageError::FileCopyError(err_msg)
                })?;
        }
    }
    Ok(())
}
