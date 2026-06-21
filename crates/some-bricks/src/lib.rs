use js_sys::Object;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// Define the data structure that matches the JS interface
#[derive(Serialize, Deserialize)]
pub struct DataItem {
    name: String,
    value: f64,
}

// Define the brick position structure
#[derive(Serialize, Deserialize)]
pub struct BrickPosition {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

// Define the layer distribution result
#[derive(Serialize, Deserialize)]
pub struct LayerDistribution {
    layers: usize,
    elements_per_layer: Vec<usize>,
    total_elements_used: usize,
}

#[wasm_bindgen]
pub struct BrickLadderCalculator;

#[wasm_bindgen]
impl BrickLadderCalculator {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        BrickLadderCalculator {}
    }

    /// Calculate the number of layers and elements per layer
    #[wasm_bindgen]
    pub fn calculate_layer_distribution(&self, total_elements: usize) -> JsValue {
        // Using quadratic formula to solve: n(n+1)/2 = total_elements
        // This gives us the number of layers for a perfect triangle
        let n = ((((8.0 * total_elements as f64) + 1.0).sqrt() - 1.0) / 2.0).floor() as usize;

        // Calculate how many elements we can fit in a perfect triangle
        let perfect_triangle_elements = (n * (n + 1)) / 2;

        // Calculate remaining elements
        let remaining = total_elements - perfect_triangle_elements;

        // Create layer distribution array
        let mut distribution = Vec::new();

        // Fill the perfect triangle part (bottom to top)
        for i in (1..=n).rev() {
            distribution.push(i);
        }

        // Handle any remaining elements by adding extra to bottom layers
        if remaining > 0 {
            let mut extra_index = 0;
            for _ in 0..remaining {
                distribution[extra_index] += 1;
                extra_index = (extra_index + 1) % std::cmp::min(distribution.len(), n / 2 + n % 2);
            }
        }

        let result = LayerDistribution {
            layers: distribution.len(),
            elements_per_layer: distribution,
            total_elements_used: total_elements,
        };

        serde_wasm_bindgen::to_value(&result).unwrap()
    }

    /// Calculate brick positions for a given layer
    #[wasm_bindgen]
    pub fn calculate_brick_positions(
        &self,
        layer_index: usize,
        elements_in_layer: usize,
        brick_width: f64,
        brick_height: f64,
        canvas_width: f64,
        canvas_height: f64,
        padding: f64,
    ) -> JsValue {
        let mut positions = Vec::new();

        // Calculate total width needed for this layer
        let total_layer_width = elements_in_layer as f64 * brick_width;

        // Starting X position (centered)
        let mut start_x = (canvas_width - total_layer_width) / 2.0;

        // Apply the brick pattern offset for this layer
        // Each layer shifts by half brick width to create the staggered effect
        start_x += (layer_index as f64 * brick_width) / 2.0;

        // Calculate Y position (bottom up)
        let y = canvas_height - padding - (layer_index as f64 + 1.0) * brick_height * 1.5;

        // Generate positions for each brick in the layer
        for i in 0..elements_in_layer {
            positions.push(BrickPosition {
                x: start_x + i as f64 * brick_width,
                y,
                width: brick_width,
                height: brick_height,
            });
        }

        serde_wasm_bindgen::to_value(&positions).unwrap()
    }

    /// Calculate normalized color intensity based on data value
    #[wasm_bindgen]
    pub fn normalize_color_intensity(&self, value: f64, min: f64, max: f64) -> f64 {
        // Handle edge case
        if min == max {
            return 0.5;
        }

        // Calculate normalized value between 0 and 1
        (value - min) / (max - min)
    }

    /// Sort data items by value (descending)
    #[wasm_bindgen]
    pub fn sort_data(&self, data: JsValue) -> JsValue {
        let mut data_items: Vec<DataItem> = serde_wasm_bindgen::from_value(data).unwrap();

        // Sort by value in descending order
        data_items.sort_by(|a, b| b.value.partial_cmp(&a.value).unwrap());

        serde_wasm_bindgen::to_value(&data_items).unwrap()
    }

    /// Get min and max values from data
    #[wasm_bindgen]
    pub fn get_data_range(&self, data: JsValue) -> JsValue {
        let data_items: Vec<DataItem> = serde_wasm_bindgen::from_value(data).unwrap();

        let min_value = data_items.iter().map(|item| item.value).fold(f64::INFINITY, f64::min);

        let max_value = data_items.iter().map(|item| item.value).fold(f64::NEG_INFINITY, f64::max);

        let result = Object::new();
        js_sys::Reflect::set(&result, &JsValue::from_str("min"), &JsValue::from_f64(min_value)).unwrap();
        js_sys::Reflect::set(&result, &JsValue::from_str("max"), &JsValue::from_f64(max_value)).unwrap();

        result.into()
    }

    /// Calculate color shade based on value
    #[wasm_bindgen]
    pub fn calculate_color_shade(&self, value: f64, min: f64, max: f64) -> u32 {
        let intensity = self.normalize_color_intensity(value, min, max);
        let shade = (220.0 - intensity * 150.0).floor() as u32;
        shade
    }
}

// Initialize WASM
#[wasm_bindgen(start)]
pub fn start() {
    // Initialize panic hook for better error messages
    console_error_panic_hook::set_once();
}
