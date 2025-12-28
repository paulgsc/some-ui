use super::GameMode;
use super::{GameConfig, GameProgress};

/// Endless mode - game never completes, characters spawn infinitely
#[derive(Debug, Clone)]
pub struct EndlessMode;

impl EndlessMode {
    pub fn new() -> Self {
        Self
    }
}

impl GameMode for EndlessMode {
    fn initialize(&mut self, _config: &GameConfig) {
        // Nothing to initialize
    }

    fn get_next_character(&mut self) -> Option<String> {
        // Always return "random" to signal JS should pick randomly
        Some(String::from("random"))
    }

    fn on_match(&mut self, _hangul: &str, _is_high_quality: bool, _show_romanization: bool) -> bool {
        true // All matches count in endless mode
    }

    fn on_miss(&mut self, _hangul: &str) {
        // Misses handled by streak system
    }

    fn is_complete(&self) -> bool {
        false // Never completes
    }

    fn get_progress(&self) -> GameProgress {
        GameProgress {
            total_keys: 0,
            completed_keys: 0,
            remaining_keys: 0,
            completion_percentage: 0.0,
            keys_completed_list: vec![],
        }
    }

    fn reset(&mut self) {
        // Nothing to reset
    }
}
