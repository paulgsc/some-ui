use wasm_bindgen::prelude::*;

mod game_core;
mod leetype;

pub use game_core::TypingGameCore;
pub use leetype::{canonicalize, CanonicalUnit};

// Axiom 11.1 (crates/hangul-game-core/docs/hangul-progression-canon.typ,
// §11.2): this is the crate's only file allowed to reference wasm_bindgen -
// enforced by scripts/check-wasm-bindgen-boundary.sh in CI.

// WASM wrapper that delegates to the core
#[wasm_bindgen]
pub struct TypingGame {
    core: TypingGameCore,
}

#[wasm_bindgen]
impl TypingGame {
    #[wasm_bindgen(constructor)]
    pub fn new(target_code: &str, max_consecutive_errors: Option<usize>) -> Self {
        Self {
            core: TypingGameCore::new(target_code, max_consecutive_errors),
        }
    }

    pub fn start(&mut self, timestamp: f64) {
        self.core.start(timestamp);
    }

    pub fn reset(&mut self) {
        self.core.reset();
    }

    /// Complete current chunk and get stats before transitioning
    #[wasm_bindgen]
    pub fn complete_chunk(&mut self, current_timestamp: f64) -> JsValue {
        let stats = self.core.complete_chunk(current_timestamp);
        serde_wasm_bindgen::to_value(&stats).unwrap()
    }

    /// Start next chunk with new target (bounded memory - discards old chunk)
    #[wasm_bindgen]
    pub fn start_next_chunk(&mut self, new_target_code: &str) {
        self.core.start_next_chunk(new_target_code);
    }

    /// Reset entire game (all chunks, all cumulative stats)
    #[wasm_bindgen]
    pub fn reset_game(&mut self) {
        self.core.reset_game();
    }

    /// Get cumulative stats (chars_typed, errors) across all completed chunks
    #[wasm_bindgen]
    pub fn get_cumulative_stats(&self) -> JsValue {
        let (chars, errors) = self.core.get_cumulative_stats();
        serde_wasm_bindgen::to_value(&(chars, errors)).unwrap()
    }

    /// Get the current target length (useful for tracking chunk loading)
    #[wasm_bindgen]
    pub fn target_length(&self) -> usize {
        self.core.target_length()
    }

    pub fn handle_input(&mut self, input: &str) -> JsValue {
        let result = self.core.handle_input(input);
        serde_wasm_bindgen::to_value(&result).unwrap()
    }

    pub fn get_stats(&self, current_timestamp: f64) -> JsValue {
        let stats = self.core.get_stats(current_timestamp);
        serde_wasm_bindgen::to_value(&stats).unwrap()
    }

    pub fn get_user_input(&self) -> String {
        self.core.get_user_input()
    }

    pub fn get_cursor(&self) -> usize {
        self.core.get_cursor()
    }

    pub fn get_target_units(&self) -> JsValue {
        serde_wasm_bindgen::to_value(self.core.get_target_units()).unwrap()
    }

    pub fn get_user_units(&self) -> JsValue {
        serde_wasm_bindgen::to_value(self.core.get_user_units()).unwrap()
    }
}

// Standalone canonicalize function for utility use
#[wasm_bindgen]
pub fn canonicalize_text(input: &str) -> JsValue {
    let units = canonicalize(input);
    serde_wasm_bindgen::to_value(&units).unwrap()
}

// Build a display index map directly from source code.
// For each displayed char in `input`, return the canonical unit index it belongs to.
#[wasm_bindgen]
pub fn build_display_map_from_code(input: &str) -> Vec<usize> {
    let units = crate::leetype::canonicalize(input);
    let mut map = Vec::with_capacity(input.len());
    let mut unit_index = 0usize;

    for unit in &units {
        match unit {
            crate::leetype::CanonicalUnit::Char { .. } => {
                // single char unit - map 1 display char -> this unit
                map.push(unit_index);
                unit_index += 1;
            }
            crate::leetype::CanonicalUnit::Separator { value } => {
                // separator holds the exact whitespace string that was in the source
                for _ch in value.chars() {
                    map.push(unit_index);
                }
                unit_index += 1;
            }
        }
    }

    // Edge case: if input contained characters that canonicalize to fewer units
    // (shouldn't happen if canonicalize used same input), ensure length matches input.
    // If input.len() > map.len(), push final unit index for remaining chars (defensive).
    while map.len() < input.chars().count() {
        // append last unit index
        map.push(unit_index.saturating_sub(1));
    }

    map
}
