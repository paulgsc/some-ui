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

    fn on_match(&mut self, identity: &str, is_high_quality: bool, show_romanization: bool) -> bool {
        // Mastery requires both speed (is_high_quality) and that the QWERTY hint was not on
        // screen for this match (!show_romanization, canon Rem. 6.2): a correct-but-hinted match
        // is not evidence of recall, since the player could simply copy what's displayed. This
        // gate is a single, global game-state signal - one hint-visibility setting for the whole
        // board - so mastery credit for one jamo can indeed be affected by streak built on
        // others; that coupling is this mechanism's whole point (it is not the defect Rem. 6.1
        // took it for), not an accident to engineer away.
        if is_high_quality && !show_romanization && !self.completed.contains(identity) {
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
    fn high_quality_match_does_not_count_toward_completion_while_romanization_is_shown() {
        // A visible hint means "correct" isn't evidence of recall - it must not master the
        // challenge no matter how fast the match was.
        let mut mode = mode_with(&["ㄱ", "ㄴ"]);

        let counted = mode.on_match("ㄱ", true, true);

        assert!(!counted);
        assert_eq!(mode.get_progress().completed_keys, 0);
    }

    #[test]
    fn high_quality_match_counts_toward_completion_once_romanization_is_hidden() {
        let mut mode = mode_with(&["ㄱ", "ㄴ"]);

        let counted = mode.on_match("ㄱ", true, false);

        assert!(counted);
        assert_eq!(mode.get_progress().completed_keys, 1);
    }

    #[test]
    fn low_quality_match_does_not_count_even_when_romanization_is_hidden() {
        let mut mode = mode_with(&["ㄱ", "ㄴ"]);

        let counted = mode.on_match("ㄱ", false, false);

        assert!(!counted);
        assert_eq!(mode.get_progress().completed_keys, 0);
    }

    #[test]
    fn repeated_high_quality_match_of_same_challenge_does_not_double_count() {
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
