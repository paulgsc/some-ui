mod difficulty;
mod matching;
mod spawning;

use crate::game_modes::{create_game_mode, GameMode};
use crate::types::internal::{ActiveReveal, KeyBufferEntry};
use crate::types::public::*;
use difficulty::{adjust_difficulty_faster, adjust_difficulty_slower, calculate_spawn_interval};
use matching::process_key_with_buffer;
use spawning::{hangul_to_qwerty, spawn_character_at_available_cell};
use wasm_bindgen::prelude::*;

/// Main game engine exposed to JavaScript
#[wasm_bindgen]
pub struct HangulGameCore {
    config: GameConfig,
    active_reveals: Vec<ActiveReveal>,
    current_time_window_ms: u32,
    stats: GameStats,
    key_buffer: Vec<KeyBufferEntry>,
    buffer_timeout_ms: u64,
    game_mode: Box<dyn GameMode>,
    game_timer_start_ms: u64,
    game_duration_ms: u64,
}

#[wasm_bindgen]
impl HangulGameCore {
    /// Create a new game instance
    #[wasm_bindgen(constructor)]
    pub fn new(config_js: JsValue, mode: String, game_duration_seconds: Option<u32>) -> Result<HangulGameCore, JsValue> {
        let config: GameConfig = serde_wasm_bindgen::from_value(config_js).unwrap_or_else(|_| GameConfig::default());

        let game_mode = create_game_mode(&mode);

        let game_duration_ms = game_duration_seconds.map(|s| s as u64 * 1000).unwrap_or(0); // 0 = no time limit

        Ok(Self {
            current_time_window_ms: config.max_time_window_ms,
            config,
            active_reveals: Vec::new(),
            stats: GameStats::new(),
            key_buffer: Vec::new(),
            buffer_timeout_ms: 300,
            game_mode,
            game_timer_start_ms: 0,
            game_duration_ms,
        })
    }

    /// Start the game timer
    #[wasm_bindgen(js_name = startTimer)]
    pub fn start_timer(&mut self, current_time_ms: u64) {
        self.game_timer_start_ms = current_time_ms;
        self.game_mode.initialize(&self.config);
    }

    /// Get current game status (completion, timeout, progress)
    #[wasm_bindgen(js_name = getGameStatus)]
    pub fn get_game_status(&self, current_time_ms: u64) -> JsValue {
        let is_complete = self.game_mode.is_complete();

        let elapsed_ms = if self.game_timer_start_ms > 0 {
            current_time_ms.saturating_sub(self.game_timer_start_ms)
        } else {
            0
        };

        let is_timed_out = if self.game_duration_ms > 0 { elapsed_ms >= self.game_duration_ms } else { false };

        let time_remaining_ms = if self.game_duration_ms > 0 {
            self.game_duration_ms.saturating_sub(elapsed_ms)
        } else {
            0
        };

        let status = GameStatus {
            is_complete,
            is_timed_out,
            time_remaining_ms,
            progress: self.game_mode.get_progress(),
        };

        serde_wasm_bindgen::to_value(&status).unwrap_or(JsValue::NULL)
    }

    /// Spawn a new character - uses game mode logic
    #[wasm_bindgen(js_name = spawnCharacter)]
    pub fn spawn_character(&mut self, revealed_at_ms: u64, available_cell_ids: Vec<String>) -> JsValue {
        // Get next character from game mode
        let hangul = match self.game_mode.get_next_character() {
            Some(ch) => ch,
            None => return JsValue::NULL, // No more characters available
        };

        // Get expected key for this character
        let expected_key = hangul_to_qwerty(&hangul);

        // Find available cell and create spawn
        match spawn_character_at_available_cell(hangul, expected_key, revealed_at_ms, available_cell_ids, &self.active_reveals) {
            Some(spawn_result) => {
                // Add to active reveals
                self.active_reveals.push(ActiveReveal {
                    hangul: spawn_result.hangul.clone(),
                    expected_key: spawn_result.expected_key.clone(),
                    revealed_at_ms: spawn_result.revealed_at_ms,
                    cell_id: spawn_result.cell_id.clone(),
                });

                serde_wasm_bindgen::to_value(&spawn_result).unwrap_or(JsValue::NULL)
            }
            None => JsValue::NULL,
        }
    }

    /// Process a key press
    #[wasm_bindgen(js_name = processKeyPress)]
    pub fn process_key_press(&mut self, key: String, pressed_at_ms: u64) -> JsValue {
        let show_romanization = self.stats.current_streak < self.config.hide_romanization_streak;

        let (mut result, actions) = process_key_with_buffer(
            key,
            pressed_at_ms,
            &mut self.key_buffer,
            &mut self.active_reveals,
            &mut self.stats,
            &self.config,
            self.buffer_timeout_ms,
            show_romanization,
        );

        // Process match actions
        if let Some((hangul, is_high_quality, show_rom)) = actions.should_call_on_match {
            result.counts_toward_completion = self.game_mode.on_match(&hangul, is_high_quality, show_rom);
        }

        // Adjust difficulty
        if actions.adjust_difficulty_faster {
            adjust_difficulty_faster(&mut self.current_time_window_ms, self.stats.current_streak, &self.config);
        }
        if actions.adjust_difficulty_slower {
            adjust_difficulty_slower(&mut self.current_time_window_ms, &self.config);
        }

        serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
    }

    /// Check for expired reveals
    #[wasm_bindgen(js_name = checkExpired)]
    pub fn check_expired(&mut self, current_time_ms: u64) -> JsValue {
        let mut expired_cells = Vec::new();

        self.active_reveals.retain(|reveal| {
            let age = current_time_ms.saturating_sub(reveal.revealed_at_ms);
            let is_expired = age > self.current_time_window_ms as u64;

            if is_expired {
                expired_cells.push(reveal.cell_id.clone());
                self.game_mode.on_miss(&reveal.hangul);
            }

            !is_expired
        });

        let count = expired_cells.len();
        let play_sound = count > 0;

        if count > 0 {
            self.stats.total_missed += count;
            self.stats.current_streak = 0;

            // Apply penalty
            let penalty = self.config.points_per_miss * count as i32;
            self.stats.score = (self.stats.score + penalty).max(0);

            // Slow down for each expiration
            for _ in 0..count {
                adjust_difficulty_slower(&mut self.current_time_window_ms, &self.config);
            }
        }

        let result = ExpiredResult {
            cell_ids: expired_cells,
            count,
            play_expire_sound: play_sound,
        };

        serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
    }

    /// Get current game stats
    #[wasm_bindgen(js_name = getStats)]
    pub fn get_stats(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.stats).unwrap_or(JsValue::NULL)
    }

    /// Get timing parameters
    #[wasm_bindgen(js_name = getTimingParams)]
    pub fn get_timing_params(&self) -> JsValue {
        let params = TimingParams {
            spawn_interval_ms: calculate_spawn_interval(self.current_time_window_ms, &self.config),
            character_lifetime_ms: self.current_time_window_ms,
            show_romanization: self.stats.current_streak < self.config.hide_romanization_streak,
        };

        serde_wasm_bindgen::to_value(&params).unwrap_or(JsValue::NULL)
    }

    /// Get current time window
    #[wasm_bindgen(js_name = getCurrentTimeWindow)]
    pub fn get_current_time_window(&self) -> u32 {
        self.current_time_window_ms
    }

    /// Get number of active reveals
    #[wasm_bindgen(js_name = getActiveCount)]
    pub fn get_active_count(&self) -> usize {
        self.active_reveals.len()
    }

    /// Reset game state
    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.active_reveals.clear();
        self.current_time_window_ms = self.config.max_time_window_ms;
        self.stats = GameStats::new();
        self.key_buffer.clear();
        self.game_mode.reset();
        self.game_timer_start_ms = 0;
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spawn_and_match() {
        let config = GameConfig::default();
        let config_js = serde_wasm_bindgen::to_value(&config).unwrap();
        let mut game = HangulGameCore::new(config_js, "endless".to_string(), None).unwrap();

        game.start_timer(1000);

        let cells = vec!["hex_0_0_0".to_string()];
        let spawn_js = game.spawn_character(1000, cells);
        assert!(!spawn_js.is_null());

        // Note: In endless mode with "random", the spawned character is determined by JS
        // This test would need to be updated for actual game usage
    }

    #[test]
    fn test_completion_mode() {
        let config = GameConfig::default();
        let config_js = serde_wasm_bindgen::to_value(&config).unwrap();
        let mut game = HangulGameCore::new(config_js, "completion".to_string(), None).unwrap();

        game.start_timer(1000);

        // Game should not be complete initially
        let status_js = game.get_game_status(1000);
        let status: GameStatus = serde_wasm_bindgen::from_value(status_js).unwrap();
        assert!(!status.is_complete);
        assert_eq!(status.progress.total_keys, 40); // All Korean characters
    }
}
