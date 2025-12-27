use super::{GameConfig, GameProgress};

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

/// Factory function to create game modes
pub fn create_game_mode(mode: &str) -> Box<dyn GameMode> {
    match mode {
        "completion" => {
            // All Korean characters from the keyboard mapping
            let all_chars = vec![
                "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ", "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ",
                "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
            ]
            .into_iter()
            .map(String::from)
            .collect();

            Box::new(CompletionMode::new(all_chars))
        }
        _ => Box::new(EndlessMode::new()),
    }
}
