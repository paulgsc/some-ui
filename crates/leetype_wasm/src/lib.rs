use wasm_bindgen::prelude::*;

mod game_core;
mod leetype;

pub use game_core::TypingGameCore;
pub use leetype::{canonicalize, CanonicalUnit};

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
