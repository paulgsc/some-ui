#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

impl LogLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Error => "ERROR",
            LogLevel::Warn => "WARN",
            LogLevel::Info => "INFO",
            LogLevel::Debug => "DEBUG",
            LogLevel::Trace => "TRACE",
        }
    }

    pub fn as_color(&self) -> colored::Color {
        match self {
            LogLevel::Error => colored::Color::Red,
            LogLevel::Warn => colored::Color::Yellow,
            LogLevel::Info => colored::Color::Green,
            LogLevel::Debug => colored::Color::Blue,
            LogLevel::Trace => colored::Color::Magenta,
        }
    }
}
