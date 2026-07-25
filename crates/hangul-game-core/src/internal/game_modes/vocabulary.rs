use rand::seq::SliceRandom;
use rand::thread_rng;
use std::collections::HashSet;

use super::{ChallengeSeed, GameConfig, GameMode, GameProgress};

/// A word-list mode spawning challenges (stimulus + multi-token answer) from a curated pool
/// (ADR 0001 §2(c)/#423). Structurally identical to `CompletionMode`/`EndlessMode` - it introduces
/// no new spawn/match/tick machinery (canon Prop. 6.2): `endless == false` drains the pool exactly
/// like `CompletionMode`; `endless == true` redraws forever, including already-mastered words,
/// exactly like `EndlessMode`.
#[derive(Debug, Clone)]
pub struct VocabularyMode {
    all: Vec<ChallengeSeed>,
    completed: HashSet<String>,
    incomplete: Vec<ChallengeSeed>,
    endless: bool,
}

impl VocabularyMode {
    pub fn new(pool: Vec<ChallengeSeed>, endless: bool) -> Self {
        let incomplete = pool.clone();
        Self {
            all: pool,
            completed: HashSet::new(),
            incomplete,
            endless,
        }
    }
}

impl GameMode for VocabularyMode {
    fn initialize(&mut self, _config: &GameConfig) {
        self.reset();
    }

    fn get_next_challenge(&self) -> Option<ChallengeSeed> {
        if self.endless {
            return self.all.choose(&mut thread_rng()).cloned();
        }

        if self.incomplete.is_empty() {
            return None;
        }
        self.incomplete.choose(&mut thread_rng()).cloned()
    }

    fn on_match(&mut self, identity: &str, is_high_quality: bool, show_romanization: bool) -> bool {
        // Same hint-visibility gate as CompletionMode (canon Rem. 6.2): a match made while the
        // QWERTY hint is on screen isn't evidence of recall, in either variant.
        if self.endless {
            return !show_romanization;
        }

        if is_high_quality && !show_romanization && !self.completed.contains(identity) {
            self.completed.insert(identity.to_string());
            self.incomplete.retain(|seed| seed.identity != identity);
            true
        } else {
            false
        }
    }

    fn on_miss(&self, _identity: &str) {
        // Misses just reset streak, handled by main game logic
    }

    fn is_complete(&self) -> bool {
        !self.endless && !self.all.is_empty() && self.completed.len() == self.all.len()
    }

    fn get_progress(&self) -> GameProgress {
        let total = self.all.len();
        let completed = self.completed.len();
        let remaining = total.saturating_sub(completed);
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

    fn seed(word: &str) -> ChallengeSeed {
        ChallengeSeed {
            stimulus: Stimulus::Icon { name: word.to_string() },
            answer_keys: vec!["t".to_string(), "k".to_string()],
            answer_glyphs: vec!["ㅅ".to_string(), "ㅏ".to_string()],
            identity: word.to_string(),
        }
    }

    #[test]
    fn drains_pool_as_words_are_mastered() {
        let mut mode = VocabularyMode::new(vec![seed("사과"), seed("포도")], false);
        assert!(!mode.is_complete());

        assert!(mode.on_match("사과", true, false));
        assert!(!mode.is_complete());

        assert!(mode.on_match("포도", true, false));
        assert!(mode.is_complete());

        assert!(mode.get_next_challenge().is_none());
    }

    #[test]
    fn endless_variant_never_completes_and_keeps_offering_mastered_words() {
        let mut mode = VocabularyMode::new(vec![seed("사과")], true);

        assert!(mode.on_match("사과", true, false));
        assert!(!mode.is_complete());
        assert!(mode.get_next_challenge().is_some());
    }

    #[test]
    fn low_quality_match_does_not_count_toward_completion() {
        let mut mode = VocabularyMode::new(vec![seed("사과")], false);

        assert!(!mode.on_match("사과", false, false));
        assert!(!mode.is_complete());
    }

    #[test]
    fn high_quality_match_does_not_count_while_romanization_is_shown() {
        let mut mode = VocabularyMode::new(vec![seed("사과")], false);

        assert!(!mode.on_match("사과", true, true));
        assert!(!mode.is_complete());
    }

    #[test]
    fn endless_variant_does_not_count_a_match_while_romanization_is_shown() {
        let mut mode = VocabularyMode::new(vec![seed("사과")], true);

        assert!(!mode.on_match("사과", true, true));
    }

    #[test]
    fn reset_restores_the_full_pool() {
        let mut mode = VocabularyMode::new(vec![seed("사과"), seed("포도")], false);
        mode.on_match("사과", true, false);

        mode.reset();

        let progress = mode.get_progress();
        assert_eq!(progress.completed_keys, 0);
        assert_eq!(progress.remaining_keys, 2);
    }
}
