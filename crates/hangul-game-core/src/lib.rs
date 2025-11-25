use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// ============================================================================
// PUBLIC API TYPES (exposed to JS via serde-wasm-bindgen)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameConfig {
    pub min_time_window_ms: u32,
    pub max_time_window_ms: u32,
    pub correctness_threshold_ms: u32,
    pub speed_increase_every_n_correct: usize,
    pub time_window_step_ms: u32,
    pub hide_romanization_streak: usize,
    pub points_per_correct: i32,
    pub points_per_miss: i32,
    pub streak_bonus_divisor: usize,
}

impl Default for GameConfig {
    fn default() -> Self {
        Self {
            min_time_window_ms: 1500,
            max_time_window_ms: 4000,
            correctness_threshold_ms: 500,
            speed_increase_every_n_correct: 3,
            time_window_step_ms: 200,
            hide_romanization_streak: 5,
            points_per_correct: 10,
            points_per_miss: -5,
            streak_bonus_divisor: 5,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStats {
    pub score: i32,
    pub current_streak: usize,
    pub best_streak: usize,
    pub total_correct: usize,
    pub total_missed: usize,
}

impl GameStats {
    fn new() -> Self {
        Self {
            score: 0,
            current_streak: 0,
            best_streak: 0,
            total_correct: 0,
            total_missed: 0,
        }
    }

    pub fn accuracy(&self) -> f64 {
        let total = self.total_correct + self.total_missed;
        if total == 0 {
            0.0
        } else {
            (self.total_correct as f64 / total as f64) * 100.0
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnResult {
    pub cell_id: String,
    pub hangul: String,
    pub expected_key: String,
    pub revealed_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchResult {
    pub matched: bool,
    pub cell_id: String,
    pub hangul: String,
    pub time_gap_ms: u32,
    pub points: i32,
    pub is_high_quality: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpiredResult {
    pub cell_ids: Vec<String>,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimingParams {
    pub spawn_interval_ms: u32,
    pub character_lifetime_ms: u32,
    pub show_romanization: bool,
}

// ============================================================================
// INTERNAL TYPES (not exposed to JS)
// ============================================================================

#[derive(Debug, Clone)]
struct ActiveReveal {
    hangul: String,
    expected_key: String,
    revealed_at_ms: u64,
    cell_id: String,
}

// ============================================================================
// GAME CORE
// ============================================================================

#[wasm_bindgen]
pub struct HangulGameCore {
    config: GameConfig,
    active_reveals: Vec<ActiveReveal>,
    current_time_window_ms: u32,
    stats: GameStats,
}

#[wasm_bindgen]
impl HangulGameCore {
    #[wasm_bindgen(constructor)]
    pub fn new(config_js: JsValue) -> Result<HangulGameCore, JsValue> {
        let config: GameConfig = serde_wasm_bindgen::from_value(config_js).unwrap_or_else(|_| GameConfig::default());

        Ok(Self {
            current_time_window_ms: config.max_time_window_ms,
            config,
            active_reveals: Vec::new(),
            stats: GameStats::new(),
        })
    }

    /// Spawn a new character at an available cell
    /// Returns SpawnResult if successful, null if grid is full
    #[wasm_bindgen(js_name = spawnCharacter)]
    pub fn spawn_character(&mut self, hangul: String, expected_key: String, revealed_at_ms: u64, available_cell_ids: Vec<String>) -> JsValue {
        // Find first available cell (not in active_reveals)
        let cell_id = available_cell_ids.into_iter().find(|id| !self.active_reveals.iter().any(|r| &r.cell_id == id));

        match cell_id {
            Some(cell_id) => {
                let reveal = ActiveReveal {
                    hangul: hangul.clone(),
                    expected_key: expected_key.clone(),
                    revealed_at_ms,
                    cell_id: cell_id.clone(),
                };

                self.active_reveals.push(reveal);

                let result = SpawnResult {
                    cell_id,
                    hangul,
                    expected_key,
                    revealed_at_ms,
                };

                serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
            }
            None => JsValue::NULL,
        }
    }

    /// Process a key press
    /// Returns MatchResult
    #[wasm_bindgen(js_name = processKeyPress)]
    pub fn process_key_press(&mut self, keys_pressed: String, pressed_at_ms: u64) -> JsValue {
        // Find first matching reveal
        let matched_idx = self.active_reveals.iter().position(|r| r.expected_key == keys_pressed);

        let result = match matched_idx {
            Some(idx) => {
                let reveal = self.active_reveals.swap_remove(idx);
                let time_gap = pressed_at_ms.saturating_sub(reveal.revealed_at_ms);
                let is_high_quality = time_gap <= self.config.correctness_threshold_ms as u64;

                // Update stats
                self.stats.total_correct += 1;
                self.stats.current_streak += 1;
                self.stats.best_streak = self.stats.best_streak.max(self.stats.current_streak);

                // Calculate points
                let streak_bonus = (self.stats.current_streak / self.config.streak_bonus_divisor) as i32;
                let points = self.config.points_per_correct + streak_bonus;
                self.stats.score += points;

                // Adjust difficulty on high quality hits
                if is_high_quality {
                    self.adjust_difficulty_faster();
                }

                MatchResult {
                    matched: true,
                    cell_id: reveal.cell_id,
                    hangul: reveal.hangul,
                    time_gap_ms: time_gap as u32,
                    points,
                    is_high_quality,
                }
            }
            None => {
                // Wrong key - reset streak and slow down
                self.stats.current_streak = 0;
                self.adjust_difficulty_slower();

                MatchResult {
                    matched: false,
                    cell_id: String::new(),
                    hangul: String::new(),
                    time_gap_ms: 0,
                    points: 0,
                    is_high_quality: false,
                }
            }
        };

        serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
    }

    /// Check for expired reveals and remove them
    /// Returns ExpiredResult with cell IDs
    #[wasm_bindgen(js_name = checkExpired)]
    pub fn check_expired(&mut self, current_time_ms: u64) -> JsValue {
        let mut expired_cells = Vec::new();

        // Use retain to filter and collect in one pass
        self.active_reveals.retain(|reveal| {
            let age = current_time_ms.saturating_sub(reveal.revealed_at_ms);
            let is_expired = age > self.current_time_window_ms as u64;

            if is_expired {
                expired_cells.push(reveal.cell_id.clone());
            }

            !is_expired
        });

        // Update stats for each expiration
        let count = expired_cells.len();
        if count > 0 {
            self.stats.total_missed += count;
            self.stats.current_streak = 0;

            // Apply penalty
            let penalty = self.config.points_per_miss * count as i32;
            self.stats.score = (self.stats.score + penalty).max(0);

            // Slow down for each expiration
            for _ in 0..count {
                self.adjust_difficulty_slower();
            }
        }

        let result = ExpiredResult { cell_ids: expired_cells, count };

        serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
    }

    /// Get current game stats
    #[wasm_bindgen(js_name = getStats)]
    pub fn get_stats(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.stats).unwrap_or(JsValue::NULL)
    }

    /// Get timing parameters for spawn/lifetime
    #[wasm_bindgen(js_name = getTimingParams)]
    pub fn get_timing_params(&self) -> JsValue {
        let params = TimingParams {
            spawn_interval_ms: self.calculate_spawn_interval(),
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
    }
}

// ============================================================================
// PRIVATE METHODS
// ============================================================================

impl HangulGameCore {
    fn adjust_difficulty_faster(&mut self) {
        if self.stats.current_streak % self.config.speed_increase_every_n_correct == 0 {
            self.current_time_window_ms = self
                .current_time_window_ms
                .saturating_sub(self.config.time_window_step_ms)
                .max(self.config.min_time_window_ms);
        }
    }

    fn adjust_difficulty_slower(&mut self) {
        self.current_time_window_ms = (self.current_time_window_ms + self.config.time_window_step_ms).min(self.config.max_time_window_ms);
    }

    fn calculate_spawn_interval(&self) -> u32 {
        let ratio = self.current_time_window_ms as f32 / self.config.max_time_window_ms as f32;
        let base_interval = 1500;
        let min_interval = 800;
        let max_interval = 2500;

        let interval = (base_interval as f32 * ratio) as u32;
        interval.clamp(min_interval, max_interval)
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
        let mut game = HangulGameCore::new(config_js).unwrap();

        let cells = vec!["hex_0_0_0".to_string()];
        let spawn_js = game.spawn_character("ㄱ".to_string(), "r".to_string(), 1000, cells);
        assert!(!spawn_js.is_null());

        let match_js = game.process_key_press("r".to_string(), 1200);
        let result: MatchResult = serde_wasm_bindgen::from_value(match_js).unwrap();
        assert!(result.matched);
        assert_eq!(result.time_gap_ms, 200);
    }

    #[test]
    fn test_expiration() {
        let config = GameConfig::default();
        let config_js = serde_wasm_bindgen::to_value(&config).unwrap();
        let mut game = HangulGameCore::new(config_js).unwrap();

        let cells = vec!["hex_0_0_0".to_string()];
        game.spawn_character("ㄱ".to_string(), "r".to_string(), 1000, cells);

        let expired_js = game.check_expired(6000);
        let result: ExpiredResult = serde_wasm_bindgen::from_value(expired_js).unwrap();
        assert_eq!(result.count, 1);
    }

    #[test]
    fn test_streak_bonus() {
        let config = GameConfig::default();
        let config_js = serde_wasm_bindgen::to_value(&config).unwrap();
        let mut game = HangulGameCore::new(config_js).unwrap();

        // Build streak
        for i in 0..5 {
            let cell_id = format!("hex_{}_0_0", i);
            game.spawn_character("ㄱ".to_string(), "r".to_string(), 1000, vec![cell_id]);
            game.process_key_press("r".to_string(), 1100);
        }

        let stats_js = game.get_stats();
        let stats: GameStats = serde_wasm_bindgen::from_value(stats_js).unwrap();
        assert_eq!(stats.current_streak, 5);
        assert!(stats.score > 50); // Should have bonus
    }
}
