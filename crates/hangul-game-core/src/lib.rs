mod internal;

use internal::{GameConfig, GameEngine};
use wasm_bindgen::prelude::*;

/// Thin WASM wrapper - delegates all logic to GameEngine
#[wasm_bindgen]
pub struct HangulGameCore {
    engine: GameEngine,
}

#[wasm_bindgen]
impl HangulGameCore {
    /// Create a new game instance
    #[wasm_bindgen(constructor)]
    pub fn new(config_js: JsValue, mode: String) -> Result<HangulGameCore, JsValue> {
        let config: GameConfig = serde_wasm_bindgen::from_value(config_js).unwrap_or_else(|_| GameConfig::default());

        let engine = GameEngine::new(config, mode);

        Ok(Self { engine })
    }

    /// Start the game timer
    #[wasm_bindgen(js_name = startTimer)]
    pub fn start_timer(&mut self, current_time_ms: u64) {
        self.engine.start_timer(current_time_ms);
    }

    /// Process a key press - returns array of events
    #[wasm_bindgen(js_name = processKeyPress)]
    pub fn process_key_press(&mut self, key: String, pressed_at_ms: u64) -> JsValue {
        let batch = self.engine.process_input(key, pressed_at_ms);
        let events = batch.flatten();
        serde_wasm_bindgen::to_value(&events).unwrap_or(JsValue::NULL)
    }

    /// Check for expired characters - returns array of events
    #[wasm_bindgen(js_name = checkExpired)]
    pub fn check_expired(&mut self, current_time_ms: u64) -> JsValue {
        let batch = self.engine.tick(current_time_ms);
        let events = batch.flatten();
        serde_wasm_bindgen::to_value(&events).unwrap_or(JsValue::NULL)
    }

    /// Spawn a new character - returns array of events
    #[wasm_bindgen(js_name = spawnCharacter)]
    pub fn spawn_character(&mut self, revealed_at_ms: u64, available_cell_ids: Vec<String>) -> JsValue {
        let batch = self.engine.spawn_character(revealed_at_ms, available_cell_ids);
        let events = batch.flatten();
        serde_wasm_bindgen::to_value(&events).unwrap_or(JsValue::NULL)
    }

    /// Get current game status
    #[wasm_bindgen(js_name = getGameStatus)]
    pub fn get_game_status(&self, current_time_ms: u64) -> JsValue {
        let status = self.engine.get_status(current_time_ms);
        serde_wasm_bindgen::to_value(&status).unwrap_or(JsValue::NULL)
    }

    /// Get current game stats
    #[wasm_bindgen(js_name = getStats)]
    pub fn get_stats(&self) -> JsValue {
        let stats = self.engine.get_stats();
        serde_wasm_bindgen::to_value(&stats).unwrap_or(JsValue::NULL)
    }

    /// Get timing parameters
    #[wasm_bindgen(js_name = getTimingParams)]
    pub fn get_timing_params(&self) -> JsValue {
        let params = self.engine.get_timing_params();
        serde_wasm_bindgen::to_value(&params).unwrap_or(JsValue::NULL)
    }

    /// Get current time window
    #[wasm_bindgen(js_name = getCurrentTimeWindow)]
    pub fn get_current_time_window(&self) -> u32 {
        self.engine.get_timing_params().character_lifetime_ms
    }

    /// Get number of active reveals
    #[wasm_bindgen(js_name = getActiveCount)]
    pub fn get_active_count(&self) -> usize {
        self.engine.get_active_count()
    }

    /// Reset game state
    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.engine.reset();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_engine_creation() {
        let config = GameConfig::default();
        let engine = GameEngine::new(config.clone(), "endless".to_string());
        assert_eq!(engine.get_active_count(), 0);
    }

    #[test]
    fn test_spawn_and_match() {
        let config = GameConfig::default();
        let mut engine = GameEngine::new(config, "endless".to_string());
        engine.start_timer(1000);

        let cells = vec!["hex_0_0_0".to_string()];
        let _batch = engine.spawn_character(1000, cells);

        // A character occupied the only available cell.
        assert_eq!(engine.get_active_count(), 1);
    }

    #[test]
    fn test_fresh_engine_uses_full_lifetime() {
        // Regression: a freshly constructed engine must start with the full
        // (max) character lifetime, not the tiny time-window step.
        let config = GameConfig::default();
        let engine = GameEngine::new(config.clone(), "endless".to_string());
        assert_eq!(engine.get_timing_params().character_lifetime_ms, config.max_time_window_ms);
    }
}
