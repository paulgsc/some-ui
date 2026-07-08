use crate::{find_closest_match, Package};
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

/// Prompts user to enter a new package name with validation.
///
/// Beyond rejecting exact duplicates, this flags names that are a near-miss of an
/// existing package (e.g. a plural/singular slip or a single-character typo) via
/// Levenshtein similarity, since an exact-match check alone lets those through silently
/// and produces a confusingly-named sibling package instead of the one the user meant.
pub fn get_new_package_name(existing_names: &[String], similarity_threshold: f64) -> IoResult<String> {
    let candidates: Vec<&str> = existing_names.iter().map(String::as_str).collect();

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

        if let Some(closest) = find_closest_match(&name, &candidates, similarity_threshold) {
            let proceed = confirm_action(&format!("'{name}' is very similar to the existing package '{closest}'. Did you mean to create a new, distinct package?"))?;
            if !proceed {
                continue;
            }
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
