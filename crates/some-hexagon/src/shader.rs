use crate::{CubeCoord, HexGrid};
use std::collections::HashMap;

// Color constants for easy use
// pub const BLACK: u32 = 0x000000;
// pub const WHITE: u32 = 0xFFFFFF;
// pub const RED: u32 = 0xFF0000;
// pub const GREEN: u32 = 0x00FF00;
// pub const BLUE: u32 = 0x0000FF;
// pub const YELLOW: u32 = 0xFFFF00;
// pub const CYAN: u32 = 0x00FFFF;
// pub const MAGENTA: u32 = 0xFF00FF;

// HexFont struct - optimized for hexagonal grid layout
struct HexFont {
    characters: HashMap<char, Vec<Vec<bool>>>,
}

impl HexFont {
    pub fn new() -> Self {
        let mut font = Self { characters: HashMap::new() };

        // Example of 'A' optimized for hexagonal grid
        // The odd rows are offset to account for hex grid layout
        font.characters.insert(
            'A',
            vec![
                vec![false, true, true, true, false],  // Row 0
                vec![false, true, false, true, false], // Row 1 (offset)
                vec![true, false, false, false, true], // Row 2
                vec![true, false, false, false, true], // Row 3 (offset)
                vec![true, true, true, true, true],    // Row 4
                vec![true, false, false, false, true], // Row 5 (offset)
                vec![true, false, false, false, true], // Row 6
            ],
        );

        // Add other characters similarly...

        font
    }

    pub fn get_char_pattern(&self, c: char) -> Option<&Vec<Vec<bool>>> {
        self.characters.get(&c)
    }
}

// Improved rendering function that properly maps to hexagonal grid
pub fn render_text(grid: &mut HexGrid, text: &str, start_coord: &CubeCoord, scale: i32, color: u32) {
    let font = HexFont::new();
    let mut current_q = start_coord.x;
    let base_r = start_coord.z;

    // Spacing between characters (adjusted for hex grid)
    let char_spacing = 6 * scale;

    for c in text.to_uppercase().chars() {
        if let Some(pattern) = font.get_char_pattern(c) {
            // Render the character
            for (y, row) in pattern.iter().enumerate() {
                // Calculate row offset based on whether the row is even or odd
                // This accounts for the offset nature of adjacent hex rows
                let row_offset = if y % 2 == 1 { scale / 2 } else { 0 };

                for (x, &filled) in row.iter().enumerate() {
                    if filled {
                        // Calculate hex grid coordinates
                        // Adjust q for the row offset in hex grids
                        let q = current_q + (x as i32) * scale + row_offset;
                        let r = base_r + (y as i32) * scale * 3 / 4; // 3/4 is to adjust for hex vertical spacing

                        // Calculate s to maintain the cube coordinate constraint q+r+s=0
                        let s = -q - r;

                        if let Ok(coord) = CubeCoord::new(q, s, r) {
                            // Set this cell and possibly surrounding cells for anti-aliasing
                            grid.set_cell_color(&coord, color);

                            // Add gradient effects for smoother appearance
                            add_gradient_effect(grid, &coord, color, scale);
                        }
                    }
                }
            }
        }

        // Move to next character position (adjusted for hex grid)
        current_q += char_spacing;
    }
}

// Add gradient effect around filled cells for smoother appearance
fn add_gradient_effect(grid: &mut HexGrid, center: &CubeCoord, color: u32, scale: i32) {
    // Only add gradient effect if scale is large enough
    if scale <= 1 {
        return;
    }

    // Define gradient colors (progressively more transparent)
    let alpha_75 = adjust_color_alpha(color, 0.75);
    let alpha_50 = adjust_color_alpha(color, 0.50);
    let alpha_25 = adjust_color_alpha(color, 0.25);

    // Get neighboring cells to apply gradient to
    let neighbors = get_hex_neighbors(center);

    // Apply gradient to neighbors
    for (i, neighbor) in neighbors.iter().enumerate() {
        if i < 2 {
            // Closest neighbors get darker color
            grid.set_cell_color(neighbor, alpha_75);
        } else if i < 4 {
            // Next level neighbors get medium color
            grid.set_cell_color(neighbor, alpha_50);
        } else {
            // Furthest neighbors get lightest color
            grid.set_cell_color(neighbor, alpha_25);
        }
    }
}

// Helper function to get hex neighbors
fn get_hex_neighbors(center: &CubeCoord) -> Vec<CubeCoord> {
    let directions = [(1, -1, 0), (1, 0, -1), (0, 1, -1), (-1, 1, 0), (-1, 0, 1), (0, -1, 1)];

    let mut neighbors = Vec::with_capacity(6);

    for &(dx, dy, dz) in &directions {
        if let Ok(coord) = CubeCoord::new(center.x + dx, center.y + dy, center.z + dz) {
            neighbors.push(coord);
        }
    }

    neighbors
}

// Helper function to adjust color transparency
fn adjust_color_alpha(color: u32, alpha: f32) -> u32 {
    let r = ((color >> 16) & 0xFF) as f32 * alpha;
    let g = ((color >> 8) & 0xFF) as f32 * alpha;
    let b = (color & 0xFF) as f32 * alpha;

    ((r as u32) << 16) | ((g as u32) << 8) | (b as u32)
}
