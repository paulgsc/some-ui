use super::CanonicalUnit;

pub struct TypingState {
    pub raw_input: String,
    pub user_units: Vec<CanonicalUnit>,
    pub total_errors: usize,
    pub consecutive_errors: usize,
    pub start_time: Option<f64>,
}

impl TypingState {
    pub fn new() -> Self {
        Self {
            raw_input: String::new(),
            user_units: Vec::new(),
            total_errors: 0,
            consecutive_errors: 0,
            start_time: None,
        }
    }

    pub fn reset(&mut self) {
        self.raw_input.clear();
        self.user_units.clear();
        self.total_errors = 0;
        self.consecutive_errors = 0;
        self.start_time = None;
    }

    pub fn start(&mut self, timestamp: f64) {
        self.reset();
        self.start_time = Some(timestamp);
    }
}
