use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DataItem<'a> {
    pub name: Cow<'a, str>,
    pub value: f64,
}

#[derive(Serialize, Deserialize)]
pub struct BrickPosition {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Serialize, Deserialize)]
pub struct LayerDistribution {
    pub layers: usize,
    pub elements_per_layer: Box<[usize]>,
    pub total_elements_used: usize,
}

#[derive(Serialize, Deserialize)]
pub struct BrickData<'a> {
    pub position: BrickPosition,
    pub item: DataItem<'a>,
    pub color_intensity: f64,
}

#[derive(Serialize, Deserialize)]
pub struct ChartData<'a> {
    pub bricks: Box<[BrickData<'a>]>,
    pub crown_position: Option<CrownPosition>,
    pub min_value: f64,
    pub max_value: f64,
}

#[derive(Serialize, Deserialize)]
pub struct CrownPosition {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[wasm_bindgen]
pub fn calculate_layer_distribution(total_elements: usize) -> JsValue {
    // Using quadratic formula to solve: n(n+1)/2 = total_elements
    let discriminant = 1.0 + 8.0 * (total_elements as f64);
    let n = ((discriminant.sqrt() - 1.0) / 2.0).floor() as usize;

    // Calculate elements in perfect triangle
    let perfect_triangle_elements = (n * (n + 1)) / 2;

    // Calculate remaining elements
    let remaining = total_elements - perfect_triangle_elements;

    // Create layer distribution
    let mut distribution = vec![0; n].into_boxed_slice();

    // Fill perfect triangle part (bottom to top)
    for i in (1..=n).rev() {
        distribution[i - 1] = i;
    }

    // Handle remaining elements
    if remaining > 0 {
        let mut extra_index = 0;
        for _ in 0..remaining {
            distribution[extra_index] += 1;
            extra_index = (extra_index + 1) % std::cmp::min(distribution.len(), (n + 1) / 2);
        }
    }

    let result = LayerDistribution {
        layers: distribution.len(),
        elements_per_layer: distribution,
        total_elements_used: total_elements,
    };

    serde_wasm_bindgen::to_value(&result).unwrap()
}

#[wasm_bindgen]
#[must_use]
pub fn calculate_brick_positions(
    layer_index: usize,
    elements_in_layer: usize,
    brick_width: f64,
    brick_height: f64,
    canvas_width: f64,
    canvas_height: f64,
    padding: f64,
) -> JsValue {
    let mut positions = Vec::new();

    // Calculate total width for this layer
    let total_layer_width = elements_in_layer as f64 * brick_width;

    // Starting X position (centered)
    let mut start_x = (canvas_width - total_layer_width) / 2.0;

    // Apply brick pattern offset
    start_x += (layer_index as f64 * brick_width) / 2.0;

    // Calculate Y position (bottom up)
    let y = canvas_height - padding - (layer_index as f64 + 1.0) * brick_height * 1.5;

    // Generate positions for each brick
    for i in 0..elements_in_layer {
        positions.push(BrickPosition {
            x: start_x + (i as f64) * brick_width,
            y,
            width: brick_width,
            height: brick_height,
        });
    }

    serde_wasm_bindgen::to_value(&positions).unwrap()
}

#[wasm_bindgen]
pub fn normalize_color_intensity(value: f64, min: f64, max: f64) -> f64 {
    if min == max {
        return 0.5;
    }
    (value - min) / (max - min)
}

#[wasm_bindgen]
pub fn process_chart_data(data_js: JsValue, canvas_width: f64, canvas_height: f64, padding: f64) -> JsValue {
    // Convert JS data to Rust
    let mut data: Vec<DataItem> = serde_wasm_bindgen::from_value(data_js).unwrap();

    // Sort data by value (descending)
    data.sort_by(|a, b| b.value.partial_cmp(&a.value).unwrap());

    // Get min and max values
    let min_value = data.iter().map(|item| item.value).fold(f64::INFINITY, f64::min);
    let max_value = data.iter().map(|item| item.value).fold(f64::NEG_INFINITY, f64::max);

    // Calculate layer distribution
    let distribution_js = calculate_layer_distribution(data.len());
    let distribution: LayerDistribution = serde_wasm_bindgen::from_value(distribution_js).unwrap();
    let layer_distribution = distribution.elements_per_layer;

    // Set brick width
    let max_elements_in_layer = *layer_distribution.iter().max().unwrap_or(&1);
    let brick_width = f64::min(100.0, (canvas_width - padding * 2.0) / (max_elements_in_layer as f64 + 0.5));

    // Adjust brick height
    let brick_height = brick_width * 0.4;

    // Generate bricks
    let mut bricks = Vec::new();
    let mut data_index = 0;

    for layer_index in 0..layer_distribution.len() {
        let elements_in_layer = layer_distribution[layer_index];

        // Calculate positions for this layer
        let positions_js = calculate_brick_positions(layer_index, elements_in_layer, brick_width, brick_height, canvas_width, canvas_height, padding);

        let positions: Vec<BrickPosition> = serde_wasm_bindgen::from_value(positions_js).unwrap();

        // Generate bricks for this layer
        for pos_index in 0..positions.len() {
            if data_index >= data.len() {
                break;
            }

            let item = data[data_index].clone();
            let pos = &positions[pos_index];
            let color_intensity = normalize_color_intensity(item.value, min_value, max_value);

            bricks.push(BrickData {
                position: BrickPosition {
                    x: pos.x,
                    y: pos.y,
                    width: brick_width,
                    height: brick_height,
                },
                item: item,
                color_intensity,
            });

            data_index += 1;
        }
    }

    // Calculate crown position
    let crown_position = if !data.is_empty() && !layer_distribution.is_empty() {
        let top_layer = layer_distribution.len() - 1;
        let top_pos_js = calculate_brick_positions(top_layer, layer_distribution[top_layer], brick_width, brick_height, canvas_width, canvas_height, padding);

        let top_positions: Box<[BrickPosition]> = serde_wasm_bindgen::from_value::<Vec<BrickPosition>>(top_pos_js).unwrap().into_boxed_slice();

        if !top_positions.is_empty() {
            let top_pos = &top_positions[0];
            let crown_x = top_pos.x + brick_width / 2.0;
            let crown_y = top_pos.y;
            let crown_width = brick_width * 0.6;
            let crown_height = brick_height * 0.5;

            Some(CrownPosition {
                x: crown_x,
                y: crown_y,
                width: crown_width,
                height: crown_height,
            })
        } else {
            None
        }
    } else {
        None
    };

    // Create final chart data
    let chart_data = ChartData {
        bricks: bricks.into_boxed_slice(),
        crown_position,
        min_value,
        max_value,
    };

    serde_wasm_bindgen::to_value(&chart_data).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_calculate_layer_distribution() {
        // Test case 1: Perfect triangle (6 elements)
        let result = calculate_layer_distribution(6);
        let layer_dist: LayerDistribution = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(layer_dist.layers, 3);
        assert_eq!(layer_dist.elements_per_layer, vec![3, 2, 1]);

        // Test case 2: Non-perfect triangle (7 elements)
        let result = calculate_layer_distribution(7);
        let layer_dist: LayerDistribution = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(layer_dist.layers, 3);
        assert_eq!(layer_dist.elements_per_layer, vec![4, 2, 1]);

        // Test case 3: Zero elements
        let result = calculate_layer_distribution(0);
        let layer_dist: LayerDistribution = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(layer_dist.layers, 0);
        assert_eq!(layer_dist.elements_per_layer, vec![]);
    }

    #[test]
    fn test_calculate_brick_positions() {
        // Test case 1: Single brick in the layer
        let result = calculate_brick_positions(
            0,     // layer_index
            1,     // elements_in_layer
            50.0,  // brick_width
            20.0,  // brick_height
            800.0, // canvas_width
            600.0, // canvas_height
            10.0,  // padding
        );
        let positions: Vec<BrickPosition> = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(positions.len(), 1);
        assert!((positions[0].x - 375.0).abs() < 1e-5); // Centered X
        assert!((positions[0].y - 560.0).abs() < 1e-5); // Bottom-aligned Y

        // Test case 2: Multiple bricks in the layer
        let result = calculate_brick_positions(
            1,     // layer_index
            3,     // elements_in_layer
            50.0,  // brick_width
            20.0,  // brick_height
            800.0, // canvas_width
            600.0, // canvas_height
            10.0,  // padding
        );
        let positions: Vec<BrickPosition> = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(positions.len(), 3);
        assert!((positions[0].x - 300.0).abs() < 1e-5); // First brick X
        assert!((positions[0].y - 530.0).abs() < 1e-5); // Second row Y
    }

    #[test]
    fn test_calculate_brick_positions_empty_layer() {
        // Test case: Empty layer
        let result = calculate_brick_positions(
            0,     // layer_index
            0,     // elements_in_layer
            50.0,  // brick_width
            20.0,  // brick_height
            800.0, // canvas_width
            600.0, // canvas_height
            10.0,  // padding
        );
        let positions: Vec<BrickPosition> = serde_wasm_bindgen::from_value(result).unwrap();
        assert_eq!(positions.len(), 0);
    }

    #[test]
    fn test_normalize_color_intensity() {
        // Test case 1: Normal range
        let intensity = normalize_color_intensity(5.0, 0.0, 10.0);
        assert!((intensity - 0.5).abs() < 1e-5);

        // Test case 2: Value at min
        let intensity = normalize_color_intensity(0.0, 0.0, 10.0);
        assert!((intensity - 0.0).abs() < 1e-5);

        // Test case 3: Value at max
        let intensity = normalize_color_intensity(10.0, 0.0, 10.0);
        assert!((intensity - 1.0).abs() < 1e-5);

        // Test case 4: Min equals max
        let intensity = normalize_color_intensity(5.0, 5.0, 5.0);
        assert!((intensity - 0.5).abs() < 1e-5);
    }

    #[test]
    fn test_process_chart_data() {
        // Test case 1: Sample data
        let data_js = serde_wasm_bindgen::to_value(&vec![
            DataItem {
                name: "A".to_string(),
                value: 10.0,
            },
            DataItem {
                name: "B".to_string(),
                value: 20.0,
            },
            DataItem {
                name: "C".to_string(),
                value: 30.0,
            },
        ])
        .unwrap();

        let result = process_chart_data(data_js, 800.0, 600.0, 10.0);
        let chart_data: ChartData = serde_wasm_bindgen::from_value(result).unwrap();

        assert_eq!(chart_data.bricks.len(), 3);
        assert!((chart_data.min_value - 10.0).abs() < 1e-5);
        assert!((chart_data.max_value - 30.0).abs() < 1e-5);

        // Test crown position
        if let Some(crown) = &chart_data.crown_position {
            assert!((crown.x - 400.0).abs() < 1e-5); // Centered X
            assert!((crown.y - 560.0).abs() < 1e-5); // Top Y
        }
    }

    #[test]
    fn test_process_chart_data_empty_input() {
        // Test case: Empty input data
        let data_js = serde_wasm_bindgen::to_value(&Vec::<DataItem>::new()).unwrap();
        let result = process_chart_data(data_js, 800.0, 600.0, 10.0);
        let chart_data: ChartData = serde_wasm_bindgen::from_value(result).unwrap();

        assert_eq!(chart_data.bricks.len(), 0);
        assert!(chart_data.crown_position.is_none());
    }
}
