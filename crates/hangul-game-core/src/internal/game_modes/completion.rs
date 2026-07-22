use super::{ChallengeSeed, GameConfig, GameMode, GameProgress};
use rand::seq::SliceRandom;
use rand::thread_rng;
use std::collections::HashSet;

/// Completion mode - player must master every challenge in the pool to complete.
#[derive(Debug, Clone)]
pub struct CompletionMode {
    all: Vec<ChallengeSeed>,
    completed: HashSet<String>,
    incomplete: Vec<ChallengeSeed>,
}

impl CompletionMode {
    pub fn new(all: Vec<ChallengeSeed>) -> Self {
        let incomplete = all.clone();
        Self {
            all,
            completed: HashSet::new(),
            incomplete,
        }
    }
}

impl GameMode for CompletionMode {
    fn initialize(&mut self, _config: &GameConfig) {
        self.reset();
    }

    fn get_next_challenge(&self) -> Option<ChallengeSeed> {
        if self.incomplete.is_empty() {
            return None; // All challenges mastered, no more spawns
        }

        // Return a random incomplete challenge
        self.incomplete.choose(&mut thread_rng()).cloned()
    }

    fn on_match(&mut self, identity: &str, is_high_quality: bool, _show_romanization: bool) -> bool {
        // Mastery of a challenge depends only on its own match history: whether *this* match was
        // high-quality (fast enough to beat correctness_threshold_ms). It must not depend on
        // show_romanization, which reflects a *global* streak built across all challenges and has
        // no logical connection to this specific one (Rem. 6.1).
        if is_high_quality && !self.completed.contains(identity) {
            self.completed.insert(identity.to_string());

            // Remove from incomplete pool
            self.incomplete.retain(|seed| seed.identity != identity);
            true // Counts toward completion
        } else {
            false // Not yet mastered - doesn't complete the challenge
        }
    }

    fn on_miss(&self, _identity: &str) {
        // Misses just reset streak, handled by main game logic
    }

    fn is_complete(&self) -> bool {
        self.completed.len() == self.all.len()
    }

    fn get_progress(&self) -> GameProgress {
        let total = self.all.len();
        let completed = self.completed.len();
        let remaining = total - completed;
        let percentage = if total > 0 { (completed as f32 / total as f32) * 100.0 } else { 0.0 };

        let mut keys_list: Vec<String> = self.completed.iter().cloned().collect();
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
        self.completed.clear();
        self.incomplete = self.all.clone();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::internal::Stimulus;

    fn mode_with(identities: &[&str]) -> CompletionMode {
        CompletionMode::new(
            identities
                .iter()
                .map(|s| ChallengeSeed {
                    stimulus: Stimulus::Glyph { text: (*s).to_string() },
                    answer_keys: vec![(*s).to_string()],
                    answer_glyphs: vec![(*s).to_string()],
                    identity: (*s).to_string(),
                })
                .collect(),
        )
    }

    #[test]
    fn high_quality_match_counts_toward_completion_even_while_romanization_is_shown() {
        // A challenge can be mastered on its own merit even though the global
        // streak (built on other challenges) hasn't yet hidden romanization.
        let mut mode = mode_with(&["ㄱ", "ㄴ"]);

        let counted = mode.on_match("ㄱ", true, true);

        assert!(counted);
        assert_eq!(mode.get_progress().completed_keys, 1);
    }

    #[test]
    fn low_quality_match_does_not_count_even_when_romanization_is_hidden() {
        // A slow match on THIS challenge must not be mastered just because a
        // streak built on OTHER challenges happens to have hidden romanization.
        let mut mode = mode_with(&["ㄱ", "ㄴ"]);

        let counted = mode.on_match("ㄱ", false, false);

        assert!(!counted);
        assert_eq!(mode.get_progress().completed_keys, 0);
    }

    #[test]
    fn repeated_high_quality_match_of_same_challenge_does_not_double_count() {
        let mut mode = mode_with(&["ㄱ", "ㄴ"]);
        mode.on_match("ㄱ", true, true);

        let counted_again = mode.on_match("ㄱ", true, true);

        assert!(!counted_again);
        assert_eq!(mode.get_progress().completed_keys, 1);
    }

    #[test]
    fn is_complete_tracks_zero_partial_and_full_progress() {
        let mut mode = mode_with(&["ㄱ", "ㄴ"]);
        assert!(!mode.is_complete());

        mode.on_match("ㄱ", true, true);
        assert!(!mode.is_complete());

        mode.on_match("ㄴ", true, true);
        assert!(mode.is_complete());
    }

    #[test]
    fn reset_clears_completed_and_restores_incomplete_pool() {
        let mut mode = mode_with(&["ㄱ", "ㄴ"]);
        mode.on_match("ㄱ", true, true);
        assert_eq!(mode.get_progress().completed_keys, 1);

        mode.reset();

        let progress = mode.get_progress();
        assert_eq!(progress.completed_keys, 0);
        assert_eq!(progress.remaining_keys, 2);
    }
}
