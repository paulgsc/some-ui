use wasm_bindgen::prelude::*;

mod fsm;
mod lexer;
mod types;

#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
}
