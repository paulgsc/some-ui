use std::path::PathBuf;

pub struct Config {
    pub package_name: String,
    pub package_dir: PathBuf,
    pub template_dir: PathBuf,
    pub workspace_file: PathBuf,
}

impl Config {
    pub fn new(package_name: String) -> Self {
        let package_dir = PathBuf::from(format!("packages/{}", &package_name));
        let template_dir = PathBuf::from("template");
        let workspace_file = PathBuf::from("pnpm-workspace.yaml");

        Self {
            package_name,
            package_dir,
            template_dir,
            workspace_file,
        }
    }
}

