use super::{GameConfig, GameMode, GameProgress};
use rand::seq::SliceRandom;
use rand::thread_rng;
use std::collections::HashSet;

/// Completion mode - player must master all characters to complete
#[derive(Debug, Clone)]
pub struct CompletionMode {
    all_characters: Vec<String>,
    completed_characters: HashSet<String>,
    incomplete_characters: Vec<String>,
}

impl CompletionMode {
    pub fn new(all_characters: Vec<String>) -> Self {
        let incomplete = all_characters.clone();
        Self {
            all_characters,
            completed_characters: HashSet::new(),
            incomplete_characters: incomplete,
        }
    }
}

impl GameMode for CompletionMode {
    fn initialize(&mut self, _config: &GameConfig) {
        self.reset();
    }

    fn get_next_character(&mut self) -> Option<String> {
        if self.incomplete_characters.is_empty() {
            return None; // All characters mastered, no more spawns
        }

        // Return a random incomplete character
        self.incomplete_characters.choose(&mut thread_rng()).cloned()
    }

    fn on_match(&mut self, hangul: &str, _is_high_quality: bool, show_romanization: bool) -> bool {
        // Only count toward completion if romanization is hidden (true mastery)
        if !show_romanization && !self.completed_characters.contains(hangul) {
            self.completed_characters.insert(hangul.to_string());

            // Remove from incomplete pool
            self.incomplete_characters.retain(|ch| ch != hangul);
            true // Counts toward completion
        } else {
            false // Just builds streak, doesn't complete the character
        }
    }

    fn on_miss(&mut self, _hangul: &str) {
        // Misses just reset streak, handled by main game logic
    }

    fn is_complete(&self) -> bool {
        self.completed_characters.len() == self.all_characters.len()
    }

    fn get_progress(&self) -> GameProgress {
        let total = self.all_characters.len();
        let completed = self.completed_characters.len();
        let remaining = total - completed;
        let percentage = if total > 0 { (completed as f32 / total as f32) * 100.0 } else { 0.0 };

        let mut keys_list: Vec<String> = self.completed_characters.iter().cloned().collect();
        keys_list.sort();

        GameProgress {
            total_keys: total,
            completed_keys: completed,
            remaining_keys: remaining,
            completion_percentage: percentage,
            keys_completed_list: keys_list,
        }
    }

    fn reset(&mut self) {
        self.completed_characters.clear();
        self.incomplete_characters = self.all_characters.clone();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mode_with(chars: &[&str]) -> CompletionMode {
        CompletionMode::new(chars.iter().map(|s| (*s).to_string()).collect())
    }

    #[test]
    fn match_while_romanization_shown_does_not_count_toward_completion() {
        let mut mode = mode_with(&["ㄱ", "ㄴ"]);

        let counted = mode.on_match("ㄱ", true, true);

        assert!(!counted);
        assert_eq!(mode.get_progress().completed_keys, 0);
    }

    #[test]
    fn match_while_romanization_hidden_counts_toward_completion() {
        let mut mode = mode_with(&["ㄱ", "ㄴ"]);

        let counted = mode.on_match("ㄱ", true, false);

        assert!(counted);
        assert_eq!(mode.get_progress().completed_keys, 1);
    }

    #[test]
    fn repeated_hidden_match_of_same_character_does_not_double_count() {
        let mut mode = mode_with(&["ㄱ", "ㄴ"]);
        mode.on_match("ㄱ", true, false);

        let counted_again = mode.on_match("ㄱ", true, false);

        assert!(!counted_again);
        assert_eq!(mode.get_progress().completed_keys, 1);
    }

    #[test]
    fn is_complete_tracks_zero_partial_and_full_progress() {
        let mut mode = mode_with(&["ㄱ", "ㄴ"]);
        assert!(!mode.is_complete());

        mode.on_match("ㄱ", true, false);
        assert!(!mode.is_complete());

        mode.on_match("ㄴ", true, false);
        assert!(mode.is_complete());
    }

    #[test]
    fn reset_clears_completed_and_restores_incomplete_pool() {
        let mut mode = mode_with(&["ㄱ", "ㄴ"]);
        mode.on_match("ㄱ", true, false);
        assert_eq!(mode.get_progress().completed_keys, 1);

        mode.reset();

        let progress = mode.get_progress();
        assert_eq!(progress.completed_keys, 0);
        assert_eq!(progress.remaining_keys, 2);
    }
}
