use serde::{Deserialize, Serialize};
use serde_wasm_bindgen::to_value;
use wasm_bindgen::prelude::*;

use crate::{hex_grid::HexGrid, CubeCoord};

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

#[derive(Serialize, Deserialize)]
pub struct HexPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Serialize, Deserialize)]
pub struct HexRenderData {
    pub id: String,
    pub points: Vec<HexPoint>,
    pub color: Option<u32>,
    pub content: Option<String>,
}

#[wasm_bindgen]
pub struct WasmHexGrid {
    pub(crate) grid: HexGrid,
    pub(crate) hex_size: f64,
}

#[wasm_bindgen]
impl WasmHexGrid {
    /// Create a new hexagonal grid with given radius and size
    #[wasm_bindgen(constructor)]
    pub fn new(radius: i32, hex_size: f64) -> Self {
        Self {
            grid: HexGrid::new(radius),
            hex_size,
        }
    }

    /// Get the number of cells in the grid
    #[wasm_bindgen]
    pub fn cell_count(&self) -> usize {
        self.grid.cell_count()
    }

    /// Get the grid radius
    #[wasm_bindgen]
    pub fn radius(&self) -> i32 {
        self.grid.size()
    }

    /// Get the hex size
    #[wasm_bindgen]
    pub fn hex_size(&self) -> f64 {
        self.hex_size
    }

    /// Set the hex size
    #[wasm_bindgen]
    pub fn set_hex_size(&mut self, size: f64) {
        self.hex_size = size;
    }

    /// Clear all colors from the grid
    #[wasm_bindgen]
    pub fn clear_all(&mut self) {
        self.grid.clear_all();
    }

    /// Place text in a row
    #[wasm_bindgen]
    pub fn place_text(&mut self, text: &str, row: i32, direction: u32, color: Option<u32>) {
        self.grid.place_text_in_row(text, row, direction.into(), color);
    }

    /// Fill a region with a color
    #[wasm_bindgen]
    pub fn fill_region(&mut self, center_x: i32, center_y: i32, center_z: i32, radius: i32, color: u32) -> bool {
        match CubeCoord::new(center_x, center_y, center_z) {
            Ok(center) => {
                self.grid.fill_region(&center, radius, color);
                true
            }
            Err(_) => false,
        }
    }

    /// Fill a ring at a specific distance with a color
    #[wasm_bindgen]
    pub fn fill_ring(&mut self, center_x: i32, center_y: i32, center_z: i32, radius: i32, color: u32) -> bool {
        match CubeCoord::new(center_x, center_y, center_z) {
            Ok(center) => {
                self.grid.fill_ring(&center, radius, color);
                true
            }
            Err(_) => false,
        }
    }

    /// Set the color of a specific cell
    #[wasm_bindgen]
    pub fn set_cell_color(&mut self, x: i32, y: i32, z: i32, color: u32) -> bool {
        match CubeCoord::new(x, y, z) {
            Ok(coord) => self.grid.set_cell_color(&coord, color),
            Err(_) => false,
        }
    }

    /// Set the content of a specific cell
    #[wasm_bindgen]
    pub fn set_cell_content(&mut self, x: i32, y: i32, z: i32, content: String) -> bool {
        match CubeCoord::new(x, y, z) {
            Ok(coord) => self.grid.set_cell_content(&coord, content),
            Err(_) => false,
        }
    }

    /// Get all cells as a JSON string ready for rendering
    #[wasm_bindgen]
    pub fn get_render_data(&self) -> Result<JsValue, JsValue> {
        let mut render_data = Vec::new();

        for cell in self.grid.all_cells() {
            // Only include cells that have color or content
            if cell.color.is_some() || cell.content.is_some() {
                let points = self.calculate_hex_points(&cell.coord);

                render_data.push(HexRenderData {
                    id: format!("hex_{}_{}_{}", cell.coord.x, cell.coord.y, cell.coord.z),
                    points,
                    color: cell.color,
                    content: cell.content.clone(),
                });
            }
        }

        match to_value(&render_data) {
            Ok(json) => Ok(json),
            Err(_) => Err(JsValue::from_str("Failed to serialize render data")),
        }
    }

    /// Get all cells as a JSON string (including cells without color or content)
    #[wasm_bindgen]
    pub fn get_all_cells_render_data(&self) -> Result<JsValue, JsValue> {
        let mut render_data = Vec::new();

        for cell in self.grid.all_cells() {
            let points = self.calculate_hex_points(&cell.coord);

            render_data.push(HexRenderData {
                id: format!("hex_{}_{}_{}", cell.coord.x, cell.coord.y, cell.coord.z),
                points,
                color: cell.color,
                content: cell.content.clone(),
            });
        }

        match to_value(&render_data) {
            Ok(json) => Ok(json),
            Err(_) => Err(JsValue::from_str("Failed to serialize render data")),
        }
    }

    /// Get a specific cell's render data
    #[wasm_bindgen]
    pub fn get_cell_render_data(&self, x: i32, y: i32, z: i32) -> Result<JsValue, JsValue> {
        match CubeCoord::new(x, y, z) {
            Ok(coord) => {
                if let Some(cell) = self.grid.get_cell(&coord) {
                    let points = self.calculate_hex_points(&cell.coord);

                    let render_data = HexRenderData {
                        id: format!("hex_{}_{}_{}", cell.coord.x, cell.coord.y, cell.coord.z),
                        points,
                        color: cell.color,
                        content: cell.content.clone(),
                    };

                    match to_value(&render_data) {
                        Ok(json) => Ok(json),
                        Err(_) => Err(JsValue::from_str("Failed to serialize cell render data")),
                    }
                } else {
                    Err(JsValue::from_str("Cell not found"))
                }
            }
            Err(_) => Err(JsValue::from_str("Invalid cube coordinates")),
        }
    }

    /// Convert a pixel position to hex grid coordinates
    #[wasm_bindgen]
    pub fn pixel_to_hex(&self, x: f64, y: f64) -> Result<JsValue, JsValue> {
        let size = self.hex_size as f32;
        let coord = crate::utils::pixel_to_hex(x as f32, y as f32, size);

        let result = [coord.x, coord.y, coord.z];
        match to_value(&result) {
            Ok(json) => Ok(json),
            Err(_) => Err(JsValue::from_str("Failed to serialize coordinates")),
        }
    }

    /// Convert hex grid coordinates to a pixel position
    #[wasm_bindgen]
    pub fn hex_to_pixel(&self, x: i32, y: i32, z: i32) -> Result<JsValue, JsValue> {
        match CubeCoord::new(x, y, z) {
            Ok(coord) => {
                let size = self.hex_size as f32;
                let (px, py) = crate::utils::hex_to_pixel(&coord, size);

                let result = [px, py];
                match to_value(&result) {
                    Ok(json) => Ok(json),
                    Err(_) => Err(JsValue::from_str("Failed to serialize pixel position")),
                }
            }
            Err(_) => Err(JsValue::from_str("Invalid cube coordinates")),
        }
    }

    // Helper method to calculate the six corner points of a hexagon
    fn calculate_hex_points(&self, coord: &CubeCoord) -> Vec<HexPoint> {
        let size = self.hex_size as f32;
        let (center_x, center_y) = crate::utils::hex_to_pixel(coord, size);

        let mut points = Vec::with_capacity(6);
        for i in 0..6 {
            let angle = std::f32::consts::PI / 6.0 + std::f32::consts::PI / 3.0 * i as f32;
            let x = center_x + size * angle.cos();
            let y = center_y + size * angle.sin();
            points.push(HexPoint { x: x as f64, y: y as f64 });
        }

        points
    }
}
