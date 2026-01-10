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

    /// Update the target code with new content (e.g., when loading more chunks).
    /// Preserves game state and validates cursor position.
    pub fn update_target(&mut self, new_target_code: &str) {
        let new_units = canonicalize(new_target_code);

        // Validate that new target extends (not replaces) the old one
        // This ensures chunked loading doesn't break existing progress
        let old_len = self.target_units.len();
        if new_units.len() >= old_len {
            // Verify existing units match (paranoid check)
            let prefix_matches = self.target_units.iter().zip(new_units.iter()).all(|(old, new)| old == new);

            if prefix_matches {
                self.target_units = new_units;
                // Recalculate consecutive errors with new target
                self.state.consecutive_errors = validation::calculate_consecutive_errors(&self.state.user_units, &self.target_units);
            } else {
                // This shouldn't happen with proper chunked loading
                // But if it does, reset to be safe
                eprintln!("Warning: Target update has mismatched prefix, resetting state");
                self.target_units = new_units;
                self.state.reset();
            }
        } else {
            // Shrinking target is unusual - reset to be safe
            eprintln!("Warning: Target shrunk, resetting state");
            self.target_units = new_units;
            self.state.reset();
        }
    }

    /// Get the current target length (useful for chunked loading UI)
    pub fn target_length(&self) -> usize {
        self.target_units.len()
    }

    pub fn start(&mut self, timestamp: f64) {
        self.state.start(timestamp);
    }

    pub fn reset(&mut self) {
        self.state.reset();
    }

    pub fn handle_input(&mut self, input: &str) -> InputChangeResult {
        let new_units = canonicalize(input);

        // Handle backspace case
        if new_units.len() < self.state.user_units.len() {
            return self.handle_backspace(input, new_units);
        }

        // Handle forward typing case
        self.handle_forward_input(input, new_units)
    }

    fn handle_backspace(&mut self, input: &str, new_units: Vec<CanonicalUnit>) -> InputChangeResult {
        // Recalculate consecutive errors after backspace
        let consecutive_errors = validation::calculate_consecutive_errors(&new_units, &self.target_units);

        self.state.raw_input = input.to_string();
        self.state.user_units = new_units;
        self.state.cursor = self.state.user_units.len();
        self.state.consecutive_errors = consecutive_errors;

        InputChangeResult {
            accepted: true,
            show_error_alert: consecutive_errors >= self.max_consecutive_errors,
            total_errors: self.state.total_errors,
            consecutive_errors,
        }
    }

    fn handle_forward_input(&mut self, input: &str, new_units: Vec<CanonicalUnit>) -> InputChangeResult {
        // Validate the input change
        let validation_result = validation::validate_input(
            &self.state.user_units,
            &new_units,
            &self.target_units,
            self.state.consecutive_errors,
            self.max_consecutive_errors,
        );

        // Update total errors
        self.state.total_errors += validation_result.new_errors;

        // Recalculate consecutive errors from the entire sequence
        let consecutive_errors = validation::calculate_consecutive_errors(&new_units, &self.target_units);
        self.state.consecutive_errors = consecutive_errors;

        // Block if validation says so
        if validation_result.should_block {
            return InputChangeResult {
                accepted: false,
                show_error_alert: true,
                total_errors: self.state.total_errors,
                consecutive_errors: self.state.consecutive_errors,
            };
        }

        // Update state
        self.state.raw_input = input.to_string();
        self.state.user_units = new_units;
        self.state.cursor = self.state.user_units.len();

        InputChangeResult {
            accepted: true,
            show_error_alert: consecutive_errors >= self.max_consecutive_errors,
            total_errors: self.state.total_errors,
            consecutive_errors,
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
