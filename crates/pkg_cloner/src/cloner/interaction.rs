use crate::Package;
use dialoguer::{theme::ColorfulTheme, Input, Select};
use std::io::{Error, ErrorKind, Result as IoResult};

/// Prompts user to select a template package from available packages
pub fn select_template_package(packages: &[Package]) -> IoResult<&Package> {
    if packages.len() == 1 {
        println!("Using the only available package as template: {}", packages[0].name);
        return Ok(&packages[0]);
    }

    let package_names: Vec<&str> = packages.iter().map(|p| p.name.as_str()).collect();

    let selection = Select::with_theme(&ColorfulTheme::default())
        .with_prompt("Select a package to use as template")
        .items(&package_names)
        .default(0)
        .interact()
        .map_err(|e| Error::new(ErrorKind::Other, format!("Failed to get user selection: {}", e)))?;

    Ok(&packages[selection])
}

/// Prompts user to enter a new package name with validation
pub fn get_new_package_name(existing_names: &[String]) -> IoResult<String> {
    loop {
        let name: String = Input::with_theme(&ColorfulTheme::default())
            .with_prompt("Enter new package name")
            .interact_text()
            .map_err(|e| Error::new(ErrorKind::Other, format!("Failed to get user input: {}", e)))?;

        let name = name.trim().to_lowercase();

        if name.is_empty() {
            println!("Package name cannot be empty. Please try again.");
            continue;
        }

        if existing_names.contains(&name) {
            println!("Package '{}' already exists. Please choose a different name.", name);
            continue;
        }

        return Ok(name);
    }
}

/// Asks user for confirmation
pub fn confirm_action(message: &str) -> IoResult<bool> {
    dialoguer::Confirm::with_theme(&ColorfulTheme::default())
        .with_prompt(message)
        .default(true)
        .interact()
        .map_err(|e| Error::new(ErrorKind::Other, format!("Failed to get confirmation: {}", e)))
}
