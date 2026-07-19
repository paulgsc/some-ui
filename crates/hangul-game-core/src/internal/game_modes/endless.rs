use super::GameMode;
use super::ALL_JAMO;
use super::{GameConfig, GameProgress};
use rand::seq::SliceRandom;
use rand::thread_rng;

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
        // Draw a genuine jamo from the engine's own alphabet instead of the
        // "random" sentinel no host-layer code ever consumed.
        ALL_JAMO.choose(&mut thread_rng()).map(|hangul| (*hangul).to_string())
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::internal::spawning::hangul_to_qwerty;

    #[test]
    fn get_next_character_never_returns_the_unconsumed_random_sentinel() {
        let mut mode = EndlessMode::new();

        for _ in 0..200 {
            let Some(hangul) = mode.get_next_character() else {
                panic!("endless mode always has a next character");
            };
            assert_ne!(hangul, "random");
            assert!(!hangul_to_qwerty(&hangul).is_empty(), "spawned {hangul} has no qwerty mapping and can never be matched");
        }
    }
}
