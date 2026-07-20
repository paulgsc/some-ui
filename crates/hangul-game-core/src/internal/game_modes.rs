use super::{content_domain::ContentDomain, GameConfig, GameProgress};

mod completion;
mod endless;

pub use completion::CompletionMode;
pub use endless::EndlessMode;

/// Trait defining how a game mode behaves
pub trait GameMode {
    /// Called when initializing the game
    fn initialize(&mut self, config: &GameConfig);

    /// Get the next character to spawn (returns None if no more characters available)
    fn get_next_character(&mut self) -> Option<String>;

    /// Handle a successful match - returns whether it counts toward completion
    fn on_match(&mut self, hangul: &str, is_high_quality: bool, show_romanization: bool) -> bool;

    /// Handle a miss
    fn on_miss(&mut self, hangul: &str);

    /// Check if game is complete
    fn is_complete(&self) -> bool;

    /// Get progress information
    fn get_progress(&self) -> GameProgress;

    /// Reset the mode
    fn reset(&mut self);
}

/// Factory function to create game modes, parametrized over a content domain (canon Def. 11.1)
/// rather than closing over Korean jamo directly.
pub fn create_game_mode<D: ContentDomain>(mode: &str) -> Box<dyn GameMode> {
    match mode {
        "completion" => Box::new(CompletionMode::new(D::completion_alphabet())),
        _ => Box::new(EndlessMode::new(D::completion_alphabet())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::internal::content_domain::Korean;

    #[test]
    fn completion_string_creates_completion_mode_with_all_forty_characters() {
        let mode = create_game_mode::<Korean>("completion");

        let progress = mode.get_progress();
        assert_eq!(progress.total_keys, 40);
        assert_eq!(progress.completed_keys, 0);
        assert!(!mode.is_complete());
    }

    #[test]
    fn unknown_mode_string_falls_back_to_endless() {
        let mut mode = create_game_mode::<Korean>("not-a-real-mode");

        assert!(!mode.is_complete());
        let Some(next) = mode.get_next_character() else {
            panic!("endless mode always has a next character");
        };
        assert!(Korean::completion_alphabet().contains(&next));
        assert_eq!(mode.get_progress().total_keys, 0);
    }

    #[test]
    fn empty_string_also_falls_back_to_endless() {
        let mode = create_game_mode::<Korean>("");
        assert!(!mode.is_complete());
        assert_eq!(mode.get_progress().total_keys, 0);
    }
}
