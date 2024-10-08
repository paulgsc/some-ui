use super::levels::LogLevel;
use chrono::Local;
use colored::*;

pub struct LogFormatter;

impl LogFormatter {
    pub fn new() -> Self {
        LogFormatter
    }

    pub fn format(&self, level: LogLevel, message: &str) -> String {
        let level_str = level.as_str().color(level.as_color()).bold();
        format!("{} - {}\n", level_str, message)
    }
}
