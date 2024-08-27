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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::Mutex as StdMutex;

    struct TestWriter {
        contents: Arc<StdMutex<Vec<u8>>>,
    }

    impl TestWriter {
        fn new() -> Self {
            TestWriter {
                contents: Arc::new(StdMutex::new(Vec::new())),
            }
        }

        fn contents(&self) -> String {
            String::from_utf8(self.contents.lock().unwrap().clone()).unwrap()
        }
    }

    impl Write for TestWriter {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.contents.lock().unwrap().extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn test_log_levels() {
        let writer = TestWriter::new();
        let writer_clone = TestWriter {
            contents: Arc::clone(&writer.contents),
        };

        set_level(LogLevel::Debug);

        set_output(writer);
        error("This is an error");
        warn("This is a warning");
        info("This is info");
        debug("This is debug");
        trace("This is trace");

        let output = writer_clone.contents();

        let error_expected = format!(
            "{} - This is an error\n",
            "ERROR".red().bold()
            );

        let warn_expected = format!(
            "{} - This is a warning\n",
            "WARN".yellow().bold()
            );

        let info_expected = format!(
            "{} - This is info\n",
            "INFO".green().bold()
            );

        let debug_expected = format!(
            "{} - This is debug\n",
            "DEBUG".blue().bold()
            );

        assert!(output.contains(&error_expected), "Expected '{}' in output: {}", error_expected, output);
        assert!(output.contains(&warn_expected), "Expected '{}' in output: {}", warn_expected, output);
        assert!(output.contains(&info_expected), "Expected '{}' in output: {}", info_expected, output);
        assert!(output.contains(&debug_expected), "Expected '{}' in output: {}", debug_expected, output);
        assert!(!output.contains("TRACE - This is trace"), "Unexpected 'TRACE - This is trace' in output: {}", output);
    }


}

