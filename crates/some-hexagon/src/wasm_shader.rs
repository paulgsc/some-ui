use crate::shader;
use crate::{wasm_hex::WasmHexGrid, CubeCoord};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
impl WasmHexGrid {
    /// Render text in the grid using the shader
    #[wasm_bindgen]
    pub fn render_text(&mut self, text: &str, x: i32, y: i32, z: i32, scale: i32, color: u32) -> bool {
        match CubeCoord::new(x, y, z) {
            Ok(coord) => {
                shader::render_text(&mut self.grid, text, &coord, scale, color);
                true
            }
            Err(_) => false,
        }
    }
}
