#[cfg(test)]
mod tests {
    use super::super::config::Config;

    #[test]
    fn test_config_creation() {
        let config = Config::new("test-package".to_string());
        assert_eq!(config.package_name, "test-package");
        assert!(config.package_dir.ends_with("packages/test-package"));
    }
}

