use serde::{Deserialize, Serialize};

use crate::leetype;
use crate::leetype::{stats, validation};
use leetype::TypingState;
use leetype::{canonicalize, CanonicalUnit};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct InputChangeResult {
    pub accepted: bool,
    pub show_error_alert: bool,
    pub total_errors: usize,
    pub consecutive_errors: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct GameStats {
    pub progress: f64,
    pub accuracy: f64,
    pub wpm: usize,
    pub elapsed_time: f64,
    pub total_errors: usize,
    pub consecutive_errors: usize,
    pub show_error_alert: bool,
    pub cursor: usize,
    pub is_complete: bool,
}

// Pure Rust implementation
pub struct TypingGameCore {
    state: TypingState,
    target_units: Vec<CanonicalUnit>,
    max_consecutive_errors: usize,
}

impl TypingGameCore {
    pub fn new(target_code: &str, max_consecutive_errors: Option<usize>) -> Self {
        let target_units = canonicalize(target_code);
        Self {
            state: TypingState::new(),
            target_units,
            max_consecutive_errors: max_consecutive_errors.unwrap_or(3),
        }
    }

    pub fn start(&mut self, timestamp: f64) {
        self.state.start(timestamp);
    }

    pub fn reset(&mut self) {
        self.state.reset();
    }

    pub fn handle_input(&mut self, input: &str) -> InputChangeResult {
        let new_units = canonicalize(input);

        // Check for backspace
        if new_units.len() < self.state.user_units.len() {
            let chars_deleted = self.state.user_units.len() - new_units.len();

            // Decrement consecutive errors by the number of characters deleted
            // but don't go below 0
            self.state.consecutive_errors = self.state.consecutive_errors.saturating_sub(chars_deleted);

            self.state.raw_input = input.to_string();
            self.state.user_units = new_units;
            self.state.cursor = self.state.user_units.len();

            return InputChangeResult {
                accepted: true,
                show_error_alert: false,
                total_errors: self.state.total_errors,
                consecutive_errors: self.state.consecutive_errors,
            };
        }

        // Validate input
        let validation = validation::validate_input(
            &self.state.user_units,
            &new_units,
            &self.target_units,
            self.state.consecutive_errors,
            self.max_consecutive_errors,
        );

        if validation.should_block {
            return InputChangeResult {
                accepted: false,
                show_error_alert: true,
                total_errors: self.state.total_errors,
                consecutive_errors: self.state.consecutive_errors,
            };
        }

        // Update state
        self.state.total_errors += validation.new_errors;

        if validation.new_errors > 0 {
            self.state.consecutive_errors += validation.new_errors;
        } else if validation.is_valid {
            self.state.consecutive_errors = 0;
        }

        self.state.raw_input = input.to_string();
        self.state.user_units = new_units;
        self.state.cursor = self.state.user_units.len();

        let show_alert = self.state.consecutive_errors >= self.max_consecutive_errors;

        InputChangeResult {
            accepted: true,
            show_error_alert: show_alert,
            total_errors: self.state.total_errors,
            consecutive_errors: self.state.consecutive_errors,
        }
    }

    pub fn get_stats(&self, current_timestamp: f64) -> GameStats {
        let elapsed_time = self.state.start_time.map(|start| (current_timestamp - start) / 1000.0).unwrap_or(0.0);

        let chars_typed = stats::count_chars(&self.state.user_units);
        let progress = stats::calculate_progress(self.state.user_units.len(), self.target_units.len());
        let accuracy = stats::calculate_accuracy(chars_typed, self.state.total_errors);
        let wpm = stats::calculate_wpm(chars_typed, elapsed_time);
        let is_complete = validation::check_completion(&self.state.user_units, &self.target_units);
        let show_alert = self.state.consecutive_errors >= self.max_consecutive_errors;
        let cursor = self.state.cursor;

        GameStats {
            progress,
            accuracy,
            wpm,
            elapsed_time,
            total_errors: self.state.total_errors,
            consecutive_errors: self.state.consecutive_errors,
            show_error_alert: show_alert,
            cursor,
            is_complete,
        }
    }

    pub fn get_user_input(&self) -> String {
        self.state.raw_input.clone()
    }

    pub fn get_target_units(&self) -> &[CanonicalUnit] {
        &self.target_units
    }

    pub fn get_user_units(&self) -> &[CanonicalUnit] {
        &self.state.user_units
    }

    pub fn get_cursor(&self) -> usize {
        self.state.cursor
    }
}
