use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tracing::info;
use tracing_subscriber;
use ujinga::WasmClient;

#[derive(Serialize, Deserialize)]
struct PackageJson {
    name: String,
    version: String,
    #[serde(flatten)]
    other: serde_json::Value,
}

fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let npm_scope = "your-scope";
    const SOURCES_DIR: &str = "foo/foo";
    const PACKAGES_DIR: &str = "foo/bar";

    info!("Retrieving dir path...");

    let sources_client = WasmClient::new(SOURCES_DIR).context(format!("Failed to initialize WasmClient for `{SOURCES_DIR}`"))?;
    let pkgs_client = WasmClient::new(PACKAGES_DIR).context(format!("Failed to initialize WasmClient for `{PACKAGES_DIR}`"))?;
    println!("succesfully retrieved dir path...");

    let crate_dirs = get_crate_directories(&sources_client.file_dir_path.as_ref()).context("Failed to retrieve crate directories")?;
    for crate_path in crate_dirs {
        process_crate(&crate_path, &pkgs_client.file_dir_path.as_ref(), npm_scope).context(format!("Failed processing crate at `{}`", crate_path.display()))?;
    }

    info!("\n=== WASM build completed ===");
    Ok(())
}

fn get_crate_directories(base_dir: &Path) -> Result<Vec<PathBuf>> {
    Ok(fs::read_dir(base_dir)?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
        .map(|entry| entry.path())
        .collect())
}

fn process_crate(crate_path: &Path, wasm_packages_dir: &Path, npm_scope: &str) -> Result<()> {
    let crate_name = crate_path.file_name().unwrap().to_string_lossy().to_string();
    println!("\n=== Processing {} ===", crate_name);

    if !crate_path.join("Cargo.toml").exists() {
        println!("Skipping {}: No Cargo.toml found", crate_name);
        return Ok(());
    }

    let wasm_package_dir = wasm_packages_dir.join(format!("wasm-{}", crate_name));

    build_wasm_package(crate_path, npm_scope)?;
    let temp_pkg_dir = crate_path.join("pkg");
    let pkg_json = update_package_json(&temp_pkg_dir, npm_scope, &crate_name)?;

    copy_directory_contents(&temp_pkg_dir, &wasm_package_dir)?;
    save_package_json(&wasm_package_dir, &pkg_json)?;
    generate_readme(&wasm_package_dir, npm_scope, &crate_name)?;

    fs::remove_dir_all(&temp_pkg_dir).context("Failed to remove temporary pkg directory")?;
    println!("Successfully built and packaged {}", crate_name);
    Ok(())
}

fn build_wasm_package(crate_path: &Path, npm_scope: &str) -> Result<()> {
    println!("Building WASM for {}...", crate_path.display());
    let build_result = Command::new("wasm-pack")
        .current_dir(crate_path)
        .args(["build", "--scope", npm_scope, "--target", "bundler", "--out-dir", "pkg"])
        .status()
        .context("Failed to execute wasm-pack")?;

    if !build_result.success() {
        anyhow::bail!("wasm-pack build failed for {}", crate_path.display());
    }
    Ok(())
}

fn update_package_json(temp_pkg_dir: &Path, npm_scope: &str, crate_name: &str) -> Result<PackageJson> {
    let pkg_json_path = temp_pkg_dir.join("package.json");
    let pkg_json_content = fs::read_to_string(&pkg_json_path).context("Failed to read package.json")?;
    let mut pkg_json: PackageJson = serde_json::from_str(&pkg_json_content).context("Failed to parse package.json")?;

    pkg_json.name = format!("@{}/wasm-{}", npm_scope, crate_name);
    Ok(pkg_json)
}

fn save_package_json(wasm_package_dir: &Path, pkg_json: &PackageJson) -> Result<()> {
    let new_pkg_json = serde_json::to_string_pretty(pkg_json).context("Failed to serialize package.json")?;
    fs::write(wasm_package_dir.join("package.json"), new_pkg_json).context("Failed to write package.json")
}

fn generate_readme(wasm_package_dir: &Path, npm_scope: &str, crate_name: &str) -> Result<()> {
    let readme_content = format!(
        "# @{}/wasm-{}\n\nThis package is auto-generated from the Rust crate `{}` using wasm-pack.\n\n**DO NOT EDIT DIRECTLY**\n",
        npm_scope, crate_name, crate_name
    );
    fs::write(wasm_package_dir.join("README.md"), readme_content).context("Failed to write README.md")
}

fn copy_directory_contents(src: &Path, dst: &PathBuf) -> Result<()> {
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_name = entry.file_name();
        let src_path = entry.path();
        let dst_path = dst.join(&file_name);

        if src_path.is_dir() {
            copy_directory_contents(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}
