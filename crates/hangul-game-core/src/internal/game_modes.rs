use super::{content_domain::ContentDomain, ChallengeSeed, GameConfig, GameProgress, Stimulus};

mod completion;
mod endless;
mod vocabulary;

pub use completion::CompletionMode;
pub use endless::EndlessMode;
pub use vocabulary::VocabularyMode;

/// Trait defining how a game mode behaves. Generalized (canon Def. 6.1) from
/// `get_next_character() -> Option<String>` to `get_next_challenge() -> Option<ChallengeSeed>`,
/// and `on_match`/`on_miss`'s `hangul: &str` to `identity: &str` - the completed/missed
/// challenge's stable bookkeeping key, not necessarily its display glyph. `EndlessMode` and
/// `CompletionMode` are degenerate instances (canon Prop. 6.1): both always hand back a length-1,
/// `Glyph`-stimulus challenge, recovering today's behavior exactly.
pub trait GameMode {
    /// Called when initializing the game
    fn initialize(&mut self, config: &GameConfig);

    /// Get the next challenge to spawn (returns None if no more challenges available). `&self`
    /// (canon Axiom 12.1, ADR 0004 #750): drawing a random entry from an existing pool reads
    /// state, it does not transition it - no implementation mutates `self` here.
    fn get_next_challenge(&self) -> Option<ChallengeSeed>;

    /// Handle a successful match - returns whether it counts toward completion
    fn on_match(&mut self, identity: &str, is_high_quality: bool, show_romanization: bool) -> bool;

    /// Handle a miss. `&self` (canon Axiom 12.1, ADR 0004 #750): every implementation's body is a
    /// no-op today (misses are handled by the shared streak/difficulty logic in `GameEngine`), so
    /// nothing here actually transitions `self`.
    fn on_miss(&self, identity: &str);

    /// Check if game is complete
    fn is_complete(&self) -> bool;

    /// Get progress information
    fn get_progress(&self) -> GameProgress;

    /// Reset the mode
    fn reset(&mut self);
}

/// Builds the Korean single-jamo pool as `ChallengeSeed`s (canon Prop. 6.1's degenerate-instance
/// substitution: `Challenge { stimulus: Glyph(j), answer: (κ(j),) }` for each jamo `j`). `D` is
/// only ever touched here, at factory time - `EndlessMode`/`CompletionMode`/`VocabularyMode` are
/// all plain `Vec<ChallengeSeed>` consumers, with no `ContentDomain` generic of their own.
fn korean_seed_pool<D: ContentDomain>() -> Vec<ChallengeSeed> {
    D::completion_alphabet()
        .into_iter()
        .map(|jamo| ChallengeSeed {
            stimulus: Stimulus::Glyph { text: jamo.clone() },
            answer_keys: vec![D::key_for(&jamo)],
            answer_glyphs: vec![jamo.clone()],
            identity: jamo,
        })
        .collect()
}

/// Factory function to create game modes, parametrized over a content domain (canon Def. 11.1)
/// rather than closing over Korean jamo directly. `word_pool` backs `"vocabulary"`/
/// `"vocabulary-endless"` and is ignored by every other mode.
pub fn create_game_mode<D: ContentDomain>(mode: &str, word_pool: Vec<ChallengeSeed>) -> Box<dyn GameMode> {
    match mode {
        "completion" => Box::new(CompletionMode::new(korean_seed_pool::<D>())),
        "vocabulary" => Box::new(VocabularyMode::new(word_pool, false)),
        "vocabulary-endless" => Box::new(VocabularyMode::new(word_pool, true)),
        _ => Box::new(EndlessMode::new(korean_seed_pool::<D>())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::internal::content_domain::Korean;

    #[test]
    fn completion_string_creates_completion_mode_with_all_forty_characters() {
        let mode = create_game_mode::<Korean>("completion", vec![]);

        let progress = mode.get_progress();
        assert_eq!(progress.total_keys, 40);
        assert_eq!(progress.completed_keys, 0);
        assert!(!mode.is_complete());
    }

    #[test]
    fn unknown_mode_string_falls_back_to_endless() {
        let mode = create_game_mode::<Korean>("not-a-real-mode", vec![]);

        assert!(!mode.is_complete());
        let Some(seed) = mode.get_next_challenge() else {
            panic!("endless mode always has a next challenge");
        };
        assert!(Korean::completion_alphabet().contains(&seed.identity));
        assert_eq!(mode.get_progress().total_keys, 0);
    }

    #[test]
    fn empty_string_also_falls_back_to_endless() {
        let mode = create_game_mode::<Korean>("", vec![]);
        assert!(!mode.is_complete());
        assert_eq!(mode.get_progress().total_keys, 0);
    }
}
