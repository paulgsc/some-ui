use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Serialize, Deserialize)]
struct PackageJson {
    name: String,
    version: String,
    #[serde(flatten)]
    other: serde_json::Value,
}

fn main() -> Result<()> {
    // Configuration
    let repo_root = std::env::current_dir()?;
    let wasm_sources_dir = repo_root.join("wasm-sources");
    let wasm_packages_dir = repo_root.join("wasm-packages");
    let npm_scope = "your-scope"; // Replace with your scope

    // Ensure the wasm-packages directory exists
    if !wasm_packages_dir.exists() {
        fs::create_dir_all(&wasm_packages_dir)?;
    }

    // Get all Rust crates from wasm-sources
    let crate_dirs = fs::read_dir(&wasm_sources_dir)?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
        .map(|entry| entry.path());

    // Process each crate
    for crate_path in crate_dirs {
        let crate_name = crate_path.file_name().unwrap().to_string_lossy().to_string();

        println!("\n=== Processing {} ===", crate_name);

        // Check if this is a valid Rust crate (has Cargo.toml)
        if !crate_path.join("Cargo.toml").exists() {
            println!("Skipping {}: Not a valid Rust crate (no Cargo.toml found)", crate_name);
            continue;
        }

        let wasm_package_dir = wasm_packages_dir.join(format!("wasm-{}", crate_name));

        // Create wasm package directory if it doesn't exist
        if !wasm_package_dir.exists() {
            println!("Creating new WASM package for {}", crate_name);
            fs::create_dir_all(&wasm_package_dir)?;
        } else {
            println!("Updating existing WASM package for {}", crate_name);
        }

        // Build WASM package with wasm-pack
        println!("Building WASM for {}...", crate_name);
        let build_result = Command::new("wasm-pack")
            .current_dir(&crate_path)
            .args(&["build", "--scope", npm_scope, "--target", "bundler", "--out-dir", "pkg"])
            .status()
            .context("Failed to execute wasm-pack")?;

        if !build_result.success() {
            println!("Error building {}: wasm-pack build failed", crate_name);
            continue;
        }

        // Temporary pkg directory created by wasm-pack
        let temp_pkg_dir = crate_path.join("pkg");

        // Read the generated package.json
        let pkg_json_path = temp_pkg_dir.join("package.json");
        let pkg_json_content = fs::read_to_string(&pkg_json_path).context("Failed to read package.json")?;

        let mut pkg_json: PackageJson = serde_json::from_str(&pkg_json_content).context("Failed to parse package.json")?;

        // Modify package.json to fit pnpm workspace
        pkg_json.name = format!("@{}/wasm-{}", npm_scope, crate_name);

        // Copy all files from temp pkg dir to the wasm package dir
        copy_directory_contents(&temp_pkg_dir, &wasm_package_dir)?;

        // Update package.json
        let new_pkg_json = serde_json::to_string_pretty(&pkg_json).context("Failed to serialize package.json")?;

        fs::write(wasm_package_dir.join("package.json"), new_pkg_json).context("Failed to write package.json")?;

        // Add a README indicating this is auto-generated
        let readme_content = format!(
            "# @{}/wasm-{}\n\nThis package is auto-generated from the Rust crate `{}` using wasm-pack.\n\n**DO NOT EDIT DIRECTLY**\n",
            npm_scope, crate_name, crate_name
        );

        fs::write(wasm_package_dir.join("README.md"), readme_content).context("Failed to write README.md")?;

        // Clean up temp pkg directory
        fs::remove_dir_all(&temp_pkg_dir).context("Failed to remove temporary pkg directory")?;

        println!("Successfully built and packaged {}", crate_name);
    }

    println!("\n=== WASM build completed ===");
    Ok(())
}

// Helper function to copy directory contents
fn copy_directory_contents(src: &Path, dst: &PathBuf) -> Result<()> {
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_name = entry.file_name();
        let src_path = entry.path();
        let dst_path = dst.join(&file_name);

        if src_path.is_dir() {
            if !dst_path.exists() {
                fs::create_dir_all(&dst_path)?;
            }
            copy_directory_contents(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}
