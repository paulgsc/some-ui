use std::io::Write;
use std::sync::Mutex;

pub struct LogOutput {
    writer: Mutex<Box<dyn Write + Send>>,
}

impl LogOutput {
    pub fn new(writer: Box<dyn Write + Send>) -> Self {
        LogOutput {
            writer: Mutex::new(writer),
        }
    }

    pub fn write(&self, message: String) -> std::io::Result<()> {
        let mut writer = self.writer.lock().unwrap();
        writer.write_all(message.as_bytes())?;
        writer.flush()
    }
}
