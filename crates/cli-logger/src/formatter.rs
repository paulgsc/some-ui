use super::levels::LogLevel;
use chrono::Local;
use colored::*;

pub struct LogFormatter;

impl LogFormatter {
    pub fn new() -> Self {
        LogFormatter
    }

    pub fn format(&self, level: LogLevel, message: &str) -> String {
        let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
        let level_str = level.as_str().color(level.as_color()).bold();
        format!("[{}] {} - {}\n", timestamp, level_str, message)
    }
}
