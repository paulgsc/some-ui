// main.rs - Rust application entry point
use slint::ComponentHandle;

slint::include_modules!();

fn main() -> Result<(), slint::PlatformError> {
    let ui = MainWindow::new()?;

    // Initialize with some default data
    ui.set_stream_title("Some stream title...".into());
    ui.set_short_description("Some desc...".into());
    ui.set_stream_date_time("2024-06-15 14:00 PST".into());
    ui.set_host_name("Boyo PGDev".into());
    ui.set_host_role("NPC".into());

    // Set up callbacks for data handling
    // let ui_handle = ui.as_weak();
    // ui.on_save_configuration(move || {
    //     let ui = ui_handle.unwrap();
    //     println!("Saving configuration:");
    //     println!("  Title: {}", ui.get_stream_title());
    //     println!("  Description: {}", ui.get_short_description());
    //     println!("  Date/Time: {}", ui.get_stream_date_time());
    //     println!("  Host: {} ({})", ui.get_host_name(), ui.get_host_role());
    // });

    ui.run()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ui_creation() {
        // Test that the UI can be created without panicking
        let _ui = MainWindow::new().expect("Failed to create UI");
    }
}
