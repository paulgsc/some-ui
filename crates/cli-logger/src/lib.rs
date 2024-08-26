use chrono::Local;
use colored::*;
use std::io::{self, Write};
use std::sync::Mutex;

mod formatter;
mod levels;
mod output;

use formatter::LogFormatter;
pub use levels::LogLevel;
use output::LogOutput;

lazy_static::lazy_static! {
    static ref LOGGER: Mutex<Logger> = Mutex::new(Logger::new());
}

pub struct Logger {
    level: LogLevel,
    formatter: LogFormatter,
    output: LogOutput,
}

impl Logger {
    fn new() -> Self {
        Logger {
            level: LogLevel::Info,
            formatter: LogFormatter::new(),
            output: LogOutput::new(Box::new(io::stdout())),
        }
    }

    pub fn set_level(&mut self, level: LogLevel) {
        self.level = level;
    }

    pub fn set_output<W: Write + Send + 'static>(&mut self, writer: W) {
        self.output = LogOutput::new(Box::new(writer));
    }

    fn log(&self, level: LogLevel, message: &str) {
        if level >= self.level {
            let formatted = self.formatter.format(level, message);
            let _ = self.output.write(formatted);
        }
    }
}

pub fn init() {
    // Initialize the logger (if needed)
}

pub fn set_level(level: LogLevel) {
    LOGGER.lock().unwrap().set_level(level);
}

pub fn set_output<W: Write + Send + 'static>(writer: W) {
    LOGGER.lock().unwrap().set_output(writer);
}

macro_rules! log {
    ($level:expr, $($arg:tt)*) => {
        LOGGER.lock().unwrap().log($level, &format!($($arg)*));
    };
}

pub fn error(message: &str) {
    log!(LogLevel::Error, "{}", message);
}

pub fn warn(message: &str) {
    log!(LogLevel::Warn, "{}", message);
}

pub fn info(message: &str) {
    log!(LogLevel::Info, "{}", message);
}

pub fn debug(message: &str) {
    log!(LogLevel::Debug, "{}", message);
}

pub fn trace(message: &str) {
    log!(LogLevel::Trace, "{}", message);
}

