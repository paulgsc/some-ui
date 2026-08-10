pub use crate::hex_grid::HexGrid;
use crate::CubeCoord;

/// Direction enumeration for text and pattern placement
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    /// Horizontal (q-axis)
    Horizontal,
    /// Diagonal upward (r-axis)
    DiagonalUp,
    /// Diagonal downward (s-axis where s = -q-r)
    DiagonalDown,
}

impl Direction {
    /// Gets the direction vector as a `CubeCoord`
    pub fn get_vector(&self) -> CubeCoord {
        match self {
            Self::Horizontal => CubeCoord::new_unchecked(1, -1, 0),   // Moving along visual horizontal (east)
            Self::DiagonalUp => CubeCoord::new_unchecked(1, 0, -1),   // Moving northeast (along q-axis)
            Self::DiagonalDown => CubeCoord::new_unchecked(0, 1, -1), // Moving southeast (along r-axis)
        }
    }
}

impl From<u32> for Direction {
    fn from(value: u32) -> Self {
        match value {
            1 => Self::DiagonalUp,
            2 => Self::DiagonalDown,
            _ => Self::Horizontal,
        }
    }
}

// Defines relative rank/importance of cells in the grid
// #[derive(Debug, Clone, Copy, PartialEq, Eq)]
// pub enum RankOrder {
//     /// North to South (decreasing y, or increasing z)
//     NorthToSouth,
//     /// South to North (increasing y, or decreasing z)
//     SouthToNorth,
//     /// East to West (decreasing x)
//     EastToWest,
//     /// West to East (increasing x)
//     WestToEast,
//     /// Northeast to Southwest (decreasing x+y, or increasing z)
//     NortheastToSouthwest,
//     /// Southwest to Northeast (increasing x+y, or decreasing z)
//     SouthwestToNortheast,
// }

impl HexGrid {
    /// Places text along a path in the specified direction
    ///
    /// # Arguments
    /// * `grid` - The hexagonal grid to modify
    /// * `text` - The text to place
    /// * `start` - The starting coordinate
    /// * `direction` - The direction to place text
    /// * `color` - Optional color for the cells
    ///
    /// # Returns
    /// A vector of the coordinates that were modified
    pub fn place_text(&mut self, text: &str, start: CubeCoord, direction: Direction, color: Option<u32>) -> Vec<CubeCoord> {
        let chars: Vec<char> = text.chars().collect();
        let mut modified_coords = Vec::with_capacity(chars.len());

        // Get the direction vector
        let dir_vector = direction.get_vector();

        // Place each character
        for (i, &ch) in chars.iter().enumerate() {
            let coord = CubeCoord {
                x: start.x + i as i32 * dir_vector.x,
                y: start.y + i as i32 * dir_vector.y,
                z: start.z + i as i32 * dir_vector.z,
            };

            if let Some(cell) = self.get_cell_mut(&coord) {
                cell.set_content(ch.to_string());
                if let Some(c) = color {
                    cell.set_color(c);
                }
                modified_coords.push(coord);
            }
        }

        modified_coords
    }

    /// Places text in a row that matches the exact width of the grid at that position
    ///
    /// # Arguments
    /// * `grid` - The hexagonal grid to modify
    /// * `text` - The text to place
    /// * `row` - The row coordinate (in terms of the selected direction)
    /// * `direction` - The direction of the row
    /// * `color` - Optional color for the cells
    ///
    /// # Returns
    /// A vector of the coordinates that were modified
    pub fn place_text_in_row(&mut self, text: &str, row: i32, direction: Direction, color: Option<u32>) -> Vec<CubeCoord> {
        // Determine the width and starting point based on direction and row
        let (width, start) = self.get_row_info(row, direction);

        // If text length doesn't match width, adjust the text (center, etc.)
        let adjusted_text = Self::adjust_text_to_width(text, width);

        // Place the text
        self.place_text(&adjusted_text, start, direction, color)
    }

    /// Adjust text to fit exactly in a specified width
    fn adjust_text_to_width(text: &str, width: usize) -> String {
        let text_len = text.chars().count();

        if text_len == width {
            text.to_string()
        } else if text_len < width {
            // Center the text
            let padding_left = (width - text_len) / 2;
            let padding_right = width - text_len - padding_left;
            " ".repeat(padding_left) + text + &" ".repeat(padding_right)
        } else {
            // Truncate the text
            text.chars().take(width).collect()
        }
    }

    /// Get information about a row: its width and starting coordinate
    pub(super) fn get_row_info(&self, row: i32, direction: Direction) -> (usize, CubeCoord) {
        // Get grid bounds
        let ((min_q, min_r), (max_q, max_r)) = self.bounds();

        match direction {
            Direction::Horizontal => {
                // Row is specified by r-coordinate (z in cube coords)
                let r = row;

                // In a hexagonal grid, the q-range (x in cube coords) depends on r
                // This is because the grid is hexagonal, not rectangular
                let q_min = min_q.max(-self.size() - r);
                let q_max = max_q.min(self.size() - r);

                let width = (q_max - q_min + 1) as usize;
                let start = CubeCoord::from_axial(q_min, r);

                (width, start)
            }
            Direction::DiagonalUp => {
                // Row is specified as a diagonal line with constant x-coordinate
                let x = row;

                // Calculate the bounds for this diagonal
                let min_z = max(-self.size(), -self.size() - x).max(min_r);
                let max_z = min(self.size(), self.size() - x).min(max_r);

                let width = (max_z - min_z + 1) as usize;
                let start = CubeCoord { x, y: -x - min_z, z: min_z };

                (width, start)
            }
            Direction::DiagonalDown => {
                // Row is specified as a diagonal line with constant y-coordinate
                let y = row;

                // Calculate the bounds for this diagonal
                let min_x = max(-self.size(), -self.size() - y).max(min_q);
                let max_x = min(self.size(), self.size() - y).min(max_q);

                let width = (max_x - min_x + 1) as usize;
                let start = CubeCoord { x: min_x, y, z: -min_x - y };

                (width, start)
            }
        }
    }

    // /// Fill a row with a specific color
    // pub fn fill_row(&mut self, row: i32, direction: Direction, color: u32) -> Vec<CubeCoord> {
    //     let (width, start) = self.get_row_info(row, direction);
    //     let mut modified_coords = Vec::with_capacity(width);

    //     let dir_vector = match direction {
    //         Direction::Horizontal => (1, 0, -1),
    //         Direction::DiagonalUp => (0, -1, 1),
    //         Direction::DiagonalDown => (-1, 1, 0),
    //     };

    //     for i in 0..width {
    //         let coord = CubeCoord {
    //             x: start.x + i as i32 * dir_vector.0,
    //             y: start.y + i as i32 * dir_vector.1,
    //             z: start.z + i as i32 * dir_vector.2,
    //         };

    //         if self.set_cell_color(&coord, color) {
    //             modified_coords.push(coord);
    //         }
    //     }

    //     modified_coords
    // }

    // /// Get cells sorted by their rank according to the specified order
    // pub fn get_cells_by_rank(&self, order: RankOrder) -> Vec<&HexCell> {
    //     let mut cells: Vec<&HexCell> = self.all_cells().collect();

    //     // Sort cells based on the specified rank order
    //     match order {
    //         RankOrder::NorthToSouth => {
    //             // Sort by increasing z (north to south)
    //             cells.sort_by_key(|cell| cell.coord.z);
    //         }
    //         RankOrder::SouthToNorth => {
    //             // Sort by decreasing z (south to north)
    //             cells.sort_by_key(|cell| -cell.coord.z);
    //         }
    //         RankOrder::EastToWest => {
    //             // Sort by decreasing x (east to west)
    //             cells.sort_by_key(|cell| -cell.coord.x);
    //         }
    //         RankOrder::WestToEast => {
    //             // Sort by increasing x (west to east)
    //             cells.sort_by_key(|cell| cell.coord.x);
    //         }
    //         RankOrder::NortheastToSouthwest => {
    //             // Sort by increasing z and decreasing x (northeast to southwest)
    //             cells.sort_by_key(|cell| (cell.coord.z, -cell.coord.x));
    //         }
    //         RankOrder::SouthwestToNortheast => {
    //             // Sort by decreasing z and increasing x (southwest to northeast)
    //             cells.sort_by_key(|cell| (-cell.coord.z, cell.coord.x));
    //         }
    //     }

    //     cells
    // }

    // /// Fill cells with a pattern based on mathematical function
    // pub fn fill_pattern<F>(&mut self, pattern_fn: F, color: u32) -> Vec<CubeCoord>
    // where
    //     F: Fn(&CubeCoord) -> bool,
    // {
    //     let mut modified_coords = Vec::new();

    //     for (coord, cell) in self.cells.iter_mut() {
    //         if pattern_fn(coord) {
    //             cell.set_color(color);
    //             modified_coords.push(*coord);
    //         }
    //     }

    //     modified_coords
    // }

    // /// Create a stripe pattern that follows specified direction
    // pub fn stripe_pattern(&mut self, direction: Direction, stripe_width: i32, gap_width: i32, color: u32) -> Vec<CubeCoord> {
    //     let total_width = stripe_width + gap_width;
    //     if total_width <= 0 {
    //         return Vec::new();
    //     }

    //     // Pattern function for stripes
    //     let pattern_fn = move |coord: &CubeCoord| -> bool {
    //         let value = match direction {
    //             Direction::Horizontal => coord.z,
    //             Direction::DiagonalUp => coord.x,
    //             Direction::DiagonalDown => coord.y,
    //         };

    //         // Use modulo to create repeating pattern
    //         (value % total_width).abs() < stripe_width
    //     };

    //     Self::fill_pattern(self, pattern_fn, color)
    // }

    // /// Create a checkerboard pattern
    // pub fn checkerboard_pattern(&mut self, color1: u32, color2: Option<u32>) -> Vec<CubeCoord> {
    //     let mut modified_coords = Vec::new();

    //     for (coord, cell) in self.cells.iter_mut() {
    //         // In a hex grid, (x+y+z) is always 0, so we use (x+y) % 2
    //         // This creates a perfect checkerboard pattern
    //         if (coord.x + coord.y) % 2 == 0 {
    //             cell.set_color(color1);
    //             modified_coords.push(*coord);
    //         } else if let Some(c2) = color2 {
    //             cell.set_color(c2);
    //             modified_coords.push(*coord);
    //         }
    //     }

    //     modified_coords
    // }
}

// Helper functions
fn max(a: i32, b: i32) -> i32 {
    if a > b {
        a
    } else {
        b
    }
}

fn min(a: i32, b: i32) -> i32 {
    if a < b {
        a
    } else {
        b
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_place_text_horizontal() {
        let mut grid = HexGrid::new(5);
        let text = "BROCK";
        let start = CubeCoord { x: -2, y: 0, z: 2 };

        let modified = grid.place_text(
            text,
            start,
            Direction::Horizontal,
            Some(0xFFFF00), // Yellow
        );

        assert_eq!(modified.len(), 5);

        // Verify each character was placed correctly. Direction::Horizontal's
        // vector is (1, -1, 0) (see get_vector), so y decreases and z stays
        // fixed as we advance along the word.
        for (i, ch) in text.chars().enumerate() {
            let coord = CubeCoord {
                x: start.x + i as i32,
                y: start.y - i as i32,
                z: start.z,
            };

            let cell = grid.get_cell(&coord).unwrap();
            assert_eq!(cell.content, Some(ch.to_string()));
            assert_eq!(cell.color, Some(0xFFFF00));
        }
    }
}
