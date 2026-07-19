use super::{GameConfig, GameProgress};

mod completion;
mod endless;

pub use completion::CompletionMode;
pub use endless::EndlessMode;

/// All Korean jamo the engine knows how to spawn and match. This is the
/// single pool backing both `CompletionMode`'s mastery set and
/// `EndlessMode`'s random draws (Cor. 2.2.1 in the progression canon).
const ALL_JAMO: &[&str] = &[
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ", "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ",
    "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
];

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

/// Factory function to create game modes
pub fn create_game_mode(mode: &str) -> Box<dyn GameMode> {
    match mode {
        "completion" => {
            let all_chars = ALL_JAMO.iter().copied().map(String::from).collect();

            Box::new(CompletionMode::new(all_chars))
        }
        _ => Box::new(EndlessMode::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn completion_string_creates_completion_mode_with_all_forty_characters() {
        let mode = create_game_mode("completion");

        let progress = mode.get_progress();
        assert_eq!(progress.total_keys, 40);
        assert_eq!(progress.completed_keys, 0);
        assert!(!mode.is_complete());
    }

    #[test]
    fn unknown_mode_string_falls_back_to_endless() {
        let mut mode = create_game_mode("not-a-real-mode");

        assert!(!mode.is_complete());
        let Some(next) = mode.get_next_character() else {
            panic!("endless mode always has a next character");
        };
        assert!(ALL_JAMO.contains(&next.as_str()));
        assert_eq!(mode.get_progress().total_keys, 0);
    }

    #[test]
    fn empty_string_also_falls_back_to_endless() {
        let mode = create_game_mode("");
        assert!(!mode.is_complete());
        assert_eq!(mode.get_progress().total_keys, 0);
    }
}
