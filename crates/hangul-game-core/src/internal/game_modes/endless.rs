use rand::{seq::SliceRandom, thread_rng};

use super::{GameConfig, GameMode, GameProgress};

/// Endless mode - game never completes, characters spawn infinitely from whatever alphabet its
/// content domain (canon Def. 11.1) provides.
#[derive(Debug, Clone)]
pub struct EndlessMode {
    alphabet: Vec<String>,
}

impl EndlessMode {
    pub fn new(alphabet: Vec<String>) -> Self {
        Self { alphabet }
    }
}

impl GameMode for EndlessMode {
    fn initialize(&mut self, _config: &GameConfig) {
        // Nothing to initialize
    }

    fn get_next_character(&mut self) -> Option<String> {
        // Draw a genuine token from the domain's own alphabet instead of the
        // "random" sentinel no host-layer code ever consumed.
        self.alphabet.choose(&mut thread_rng()).cloned()
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
    use crate::internal::content_domain::{ContentDomain, Korean};

    #[test]
    fn get_next_character_never_returns_the_unconsumed_random_sentinel() {
        let mut mode = EndlessMode::new(Korean::completion_alphabet());

        for _ in 0..200 {
            let Some(hangul) = mode.get_next_character() else {
                panic!("endless mode always has a next character");
            };
            assert_ne!(hangul, "random");
            assert!(!Korean::key_for(&hangul).is_empty(), "spawned {hangul} has no qwerty mapping and can never be matched");
        }
    }
}
