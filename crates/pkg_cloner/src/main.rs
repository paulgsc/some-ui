use pkg_cloner::{confirm_action, copy_configs, create_package_structure, find_packages, get_new_package_name, select_template_package, Cli};
use std::process;

fn main() {
    if let Err(e) = run() {
        eprintln!("Error: {}", e);
        process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    // Parse and validate CLI arguments
    let cli = Cli::parse_and_validate()?;

    // Find all packages in workspace
    let packages = find_packages(&cli.workspaces)?;
    println!("Found {} package(s) in workspace", packages.len());

    // Get user selections
    let template_package = select_template_package(&packages)?;
    println!("\nUsing template: {}", template_package.name);

    let existing_names: Vec<String> = packages.iter().map(|p| p.name.clone()).collect();
    let new_package_name = get_new_package_name(&existing_names)?;

    // Show summary and confirm
    println!("\n=== Package Creation Summary ===");
    println!("Template: {}", template_package.name);
    println!("New package: {}", new_package_name);
    println!("Location: {}", cli.workspaces.join(&new_package_name).display());

    if !cli.force && !confirm_action("Create this package?")? {
        println!("Operation cancelled.");
        return Ok(());
    }

    // Create package structure
    let new_package_path = create_package_structure(&cli.workspaces, &new_package_name, cli.force)?;

    // Copy configuration files
    let copied_configs = copy_configs(&template_package.path, &new_package_path, &new_package_name)?;

    // Success message
    println!("\n✅ Successfully created new package: {}", new_package_name);
    println!("📍 Location: {}", new_package_path.display());
    println!("📄 Copied {} configuration file(s)", copied_configs.len());

    for config in copied_configs {
        println!("   - {}", config);
    }

    Ok(())
}
