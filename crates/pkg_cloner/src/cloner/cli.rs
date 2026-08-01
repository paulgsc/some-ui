use clap::Parser;
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    author,
    version,
    about = "A tool for cloning package configurations in JavaScript/TypeScript workspaces",
    long_about = "Creates new packages by copying configuration files from existing template packages"
)]
pub struct Cli {
    /// Path to the workspaces directory
    #[arg(short, long, value_name = "DIR")]
    pub workspaces: PathBuf,

    /// Minimum similarity threshold for string matching (0.0-1.0)
    #[arg(long, default_value = "0.75", value_name = "THRESHOLD")]
    pub similarity_threshold: f64,

    /// Force overwrite existing packages
    #[arg(short, long)]
    pub force: bool,
}

impl Cli {
    /// Parses the process arguments and validates them beyond what clap can check.
    ///
    /// # Errors
    ///
    /// Returns an error if the workspaces path does not exist or is not a directory,
    /// or if the similarity threshold falls outside `0.0..=1.0`.
    pub fn parse_and_validate() -> Result<Self, Box<dyn std::error::Error>> {
        let cli = Self::parse();

        // Validate workspaces directory exists
        if !cli.workspaces.exists() {
            return Err(format!("Workspaces directory does not exist: {}", cli.workspaces.display()).into());
        }

        if !cli.workspaces.is_dir() {
            return Err(format!("Workspaces path is not a directory: {}", cli.workspaces.display()).into());
        }

        // Validate similarity threshold
        if !(0.0..=1.0).contains(&cli.similarity_threshold) {
            return Err("Similarity threshold must be between 0.0 and 1.0".into());
        }

        Ok(cli)
    }
}
