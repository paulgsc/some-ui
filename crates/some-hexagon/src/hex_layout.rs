pub(crate) use crate::hex_grid::HexGrid;
use crate::{hex_pattern::Direction, CubeCoord};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Represents a data item to be placed in the hex grid
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HexData {
    /// The color to use for this cell
    pub color: u32,
    /// The weight/rank used for positioning (lower values = higher priority)
    pub weight: u32,
    /// The binary label that determines side (e.g., "offense" vs "defense")
    pub label: String,
    /// The value to display in the cell
    pub value: String,
}

/// Represents a layout manager for symmetric data placement in hex grids
pub struct SymmetricHexLayout {
    /// Direction for the symmetry line
    symmetry_direction: Direction,
    /// Title to place at the center (optional)
    title: Option<String>,
    /// Color for the center/title line
    center_color: Option<u32>,
}

impl SymmetricHexLayout {
    /// Creates a new symmetric layout manager
    pub fn new(symmetry_direction: Direction, title: Option<String>, center_color: Option<u32>) -> Self {
        Self {
            symmetry_direction,
            title,
            center_color,
        }
    }

    /// Lays out data in the hexagonal grid according to the specified constraints
    pub fn layout_data(&self, grid: &mut HexGrid, data: Vec<HexData>) -> Vec<CubeCoord> {
        let mut modified_coords = Vec::new();

        // Step 1: Group data by label
        let mut data_by_label: HashMap<String, Vec<HexData>> = HashMap::new();
        for item in data {
            data_by_label.entry(item.label.clone()).or_insert_with(Vec::new).push(item);
        }

        // We expect exactly two labels for our symmetric layout
        if data_by_label.len() != 2 {
            // For simplicity, if we don't have exactly two labels, we'll just return
            // In a production system, you might want to handle this differently
            return modified_coords;
        }

        // Step 2: Determine which label goes above and which goes below
        let mut labels: Vec<String> = data_by_label.keys().cloned().collect();
        labels.sort(); // Consistent ordering
        let label_above = &labels[0];
        let label_below = &labels[1];

        // Step 3: Further group data by weight within each label
        let above_by_weight = Self::group_by_weight(&data_by_label[label_above]);
        let below_by_weight = Self::group_by_weight(&data_by_label[label_below]);

        // Step 4: Place the center line (symmetry axis)
        let center_coords = self.place_center_line(grid);
        modified_coords.extend(center_coords);

        // Step 5: Place data above the center line
        let above_coords = self.place_data_by_weight(grid, &above_by_weight, true);
        modified_coords.extend(above_coords);

        // Step 6: Place data below the center line
        let below_coords = self.place_data_by_weight(grid, &below_by_weight, false);
        modified_coords.extend(below_coords);

        modified_coords
    }

    /// Groups data items by their weight
    fn group_by_weight(items: &[HexData]) -> HashMap<u32, Vec<HexData>> {
        let mut by_weight: HashMap<u32, Vec<HexData>> = HashMap::new();

        for item in items {
            by_weight.entry(item.weight).or_insert_with(Vec::new).push(item.clone());
        }

        by_weight
    }

    /// Places the center line (symmetry axis) in the grid
    fn place_center_line(&self, grid: &mut HexGrid) -> Vec<CubeCoord> {
        let mut modified_coords = Vec::new();

        // Determine which row is the center based on the symmetry direction
        let center_row = 0; // For simplicity, we use row 0 as center

        // Get information about the center row
        let (width, start) = grid.get_row_info(center_row, self.symmetry_direction);

        // If there's a title, place it in the center of the center row
        if let Some(title) = &self.title {
            // Place title text centered in the row
            let title_coords = grid.place_text_in_row(title, center_row, self.symmetry_direction, self.center_color);
            modified_coords.extend(title_coords);
        } else {
            // Otherwise, just color the center row
            let dir_vector = self.symmetry_direction.get_vector();

            for i in 0..width {
                let coord = CubeCoord {
                    x: start.x + i as i32 * dir_vector.x,
                    y: start.y + i as i32 * dir_vector.y,
                    z: start.z + i as i32 * dir_vector.z,
                };

                if let Some(cell) = grid.get_cell_mut(&coord) {
                    if let Some(color) = self.center_color {
                        cell.set_color(color);
                    }
                    modified_coords.push(coord);
                }
            }
        }

        modified_coords
    }

    /// Places data items by weight on either side of the center line
    fn place_data_by_weight(&self, grid: &mut HexGrid, data_by_weight: &HashMap<u32, Vec<HexData>>, is_above: bool) -> Vec<CubeCoord> {
        let mut modified_coords = Vec::new();

        // Get weights sorted in ascending order (lower weight = higher priority)
        let mut weights: Vec<u32> = data_by_weight.keys().cloned().collect();
        weights.sort();

        // Place data row by row, starting from the row closest to the center
        let mut row_offset = 1; // Start at row offset 1 (adjacent to center)

        for weight in weights {
            let items = &data_by_weight[&weight];

            // Determine the row for this weight
            // If above, use negative row offsets; if below, use positive row offsets
            let row = if is_above { -row_offset } else { row_offset };

            // Get row information
            let (width, start) = grid.get_row_info(row, self.symmetry_direction);

            // If too many items for this row, we'd need a more sophisticated algorithm
            // For simplicity, we'll just truncate the list if needed
            let display_items = if items.len() > width { &items[0..width] } else { &items[..] };

            // Place each item in the row
            let dir_vector = self.symmetry_direction.get_vector();

            for (i, item) in display_items.iter().enumerate() {
                let coord = CubeCoord {
                    x: start.x + i as i32 * dir_vector.x,
                    y: start.y + i as i32 * dir_vector.y,
                    z: start.z + i as i32 * dir_vector.z,
                };

                if let Some(cell) = grid.get_cell_mut(&coord) {
                    cell.set_content(item.value.clone());
                    cell.set_color(item.color);
                    modified_coords.push(coord);
                }
            }

            // Move to the next row
            row_offset += 1;
        }

        modified_coords
    }

    // /// Gets coordinates for all cells at a specific rank (distance from center)
    // /// in either the upper or lower half
    // pub fn get_rank_coords(&self, grid: &HexGrid, rank: u32, upper_half: bool) -> Vec<CubeCoord> {
    //     let mut coords = Vec::new();

    //     // Convert rank to row offset (rank 1 = adjacent row, etc.)
    //     let row_offset = rank as i32;

    //     // Determine the row based on upper/lower half
    //     let row = if upper_half { -row_offset } else { row_offset };

    //     // Get row information
    //     let (width, start) = grid.get_row_info(row, self.symmetry_direction);

    //     // Get all coordinates in this row
    //     let dir_vector = self.symmetry_direction.get_vector();
    //     for i in 0..width {
    //         let coord = CubeCoord {
    //             x: start.x + i as i32 * dir_vector.x,
    //             y: start.y + i as i32 * dir_vector.y,
    //             z: start.z + i as i32 * dir_vector.z,
    //         };

    //         if grid.get_cell(&coord).is_some() {
    //             coords.push(coord);
    //         }
    //     }

    //     coords
    // }

    // /// Sets values for all cells at a specific rank
    // pub fn set_rank_values(&self, grid: &mut HexGrid, rank: u32, upper_half: bool, values: &[String], color: u32) -> Vec<CubeCoord> {
    //     let coords = self.get_rank_coords(grid, rank, upper_half);
    //     let mut modified = Vec::new();

    //     // Fill in as many values as we have cells
    //     for (i, coord) in coords.iter().enumerate() {
    //         if i >= values.len() {
    //             break;
    //         }

    //         if let Some(cell) = grid.get_cell_mut(coord) {
    //             cell.set_content(values[i].clone());
    //             cell.set_color(color);
    //             modified.push(*coord);
    //         }
    //     }

    //     modified
    // }

    // /// Checks if we can fit all items with given weights into the grid
    // pub fn can_fit_data(&self, grid: &HexGrid, data: &[HexData]) -> bool {
    //     // Group data by label and weight
    //     let mut data_by_label: HashMap<String, HashMap<u32, Vec<HexData>>> = HashMap::new();

    //     for item in data {
    //         data_by_label
    //             .entry(item.label.clone())
    //             .or_insert_with(HashMap::new)
    //             .entry(item.weight)
    //             .or_insert_with(Vec::new)
    //             .push(item.clone());
    //     }

    //     // Check each label/weight combination
    //     for (_, weight_map) in data_by_label.iter() {
    //         let mut row_offset = 1; // Start at row offset 1 (adjacent to center)

    //         for (_, items) in weight_map.iter() {
    //             // Get row information for this offset (doesn't matter if upper/lower)
    //             let (width, _) = grid.get_row_info(row_offset, self.symmetry_direction);

    //             // If too many items for this row, we can't fit
    //             if items.len() > width {
    //                 return false;
    //             }

    //             row_offset += 1;
    //         }
    //     }

    //     true
    // }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::HexGrid;

    #[test]
    fn test_symmetric_layout() {
        let mut grid = HexGrid::new(5);
        let layout = SymmetricHexLayout::new(Direction::Horizontal, Some("TEAM".to_string()), Some(0xCCCCCC));

        // Create some test data
        let mut data = Vec::new();

        // Offense players (weight 1)
        data.push(HexData {
            color: 0xFF0000,
            weight: 1,
            label: "offense".to_string(),
            value: "QB".to_string(),
        });
        data.push(HexData {
            color: 0xFF0000,
            weight: 1,
            label: "offense".to_string(),
            value: "WR".to_string(),
        });

        // Defense players (weight 1)
        data.push(HexData {
            color: 0x0000FF,
            weight: 1,
            label: "defense".to_string(),
            value: "CB".to_string(),
        });
        data.push(HexData {
            color: 0x0000FF,
            weight: 1,
            label: "defense".to_string(),
            value: "SS".to_string(),
        });

        // Place data in grid
        let modified = layout.layout_data(&mut grid, data);

        // Check that some cells were modified
        assert!(modified.len() > 0);

        // Check that we can get coords for specific ranks
        let rank1_upper = layout.get_rank_coords(&grid, 1, true);
        let rank1_lower = layout.get_rank_coords(&grid, 1, false);

        assert!(!rank1_upper.is_empty());
        assert!(!rank1_lower.is_empty());
    }
}
