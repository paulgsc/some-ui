use crate::hex_cell::HexCell;
use crate::CubeCoord;
use std::collections::HashMap;

/// HexGrid represents a hexagonal grid of hexagon cells
#[derive(Debug, Clone)]
pub(super) struct HexGrid {
    pub(super) cells: HashMap<CubeCoord, HexCell>,
    size: i32, // The "radius" of the hexagonal grid
}

impl HexGrid {
    /// Create a new hexagonal grid with radius `size`
    pub fn new(size: i32) -> Self {
        let mut grid = Self { cells: HashMap::new(), size };
        grid.generate();
        grid
    }

    /// Generate the hexagonal grid of the specified size more efficiently
    fn generate(&mut self) {
        self.cells.clear();

        // More efficient approach that avoids checking every point in a cube
        for q in -self.size..=self.size {
            // For each q, calculate the min and max values of r
            let r_min = (-self.size).max(-q - self.size);
            let r_max = self.size.min(-q + self.size);

            for r in r_min..=r_max {
                let coord = CubeCoord::from_axial(q, r);
                let cell = HexCell::new(coord);
                self.cells.insert(coord, cell);
            }
        }
    }

    /// Get the number of cells in the grid
    pub fn cell_count(&self) -> usize {
        self.cells.len()
    }

    /// Get a reference to a cell at the given coordinates
    pub fn get_cell(&self, coord: &CubeCoord) -> Option<&HexCell> {
        self.cells.get(coord)
    }

    /// Get a mutable reference to a cell at the given coordinates
    pub fn get_cell_mut(&mut self, coord: &CubeCoord) -> Option<&mut HexCell> {
        self.cells.get_mut(coord)
    }

    /// Set the color of a cell at the given coordinates
    pub fn set_cell_color(&mut self, coord: &CubeCoord, color: u32) -> bool {
        if let Some(cell) = self.cells.get_mut(coord) {
            cell.set_color(color);
            true
        } else {
            false
        }
    }

    /// Set the content of a cell at the given coordinates
    pub fn set_cell_content(&mut self, coord: &CubeCoord, content: String) -> bool {
        if let Some(cell) = self.cells.get_mut(coord) {
            cell.set_content(content);
            true
        } else {
            false
        }
    }

    // /// Clear the color of a cell at the given coordinates
    // pub fn clear_cell_color(&mut self, coord: &CubeCoord) -> bool {
    //     if let Some(cell) = self.cells.get_mut(coord) {
    //         cell.clear_color();
    //         true
    //     } else {
    //         false
    //     }
    // }

    /// Fill a region with a color (all cells within distance `radius` of `center`)
    pub fn fill_region(&mut self, center: &CubeCoord, radius: i32, color: u32) {
        for (coord, cell) in &mut self.cells {
            if coord.distance(center) <= radius {
                cell.set_color(color);
            }
        }
    }

    /// Fill the ring at exactly distance `radius` from `center`
    pub fn fill_ring(&mut self, center: &CubeCoord, radius: i32, color: u32) {
        for (coord, cell) in &mut self.cells {
            if coord.distance(center) == radius {
                cell.set_color(color);
            }
        }
    }

    // /// Check if a coordinate is within the grid bounds
    // pub fn contains(&self, coord: &CubeCoord) -> bool {
    //     self.cells.contains_key(coord)
    // }

    /// Get all cells in the grid
    pub fn all_cells(&self) -> impl Iterator<Item = &HexCell> {
        self.cells.values()
    }

    // /// Get all colored cells in the grid
    // pub fn colored_cells(&self) -> impl Iterator<Item = &HexCell> {
    //     self.cells.values().filter(|cell| cell.color.is_some())
    // }

    // /// Find the center coordinates of the grid
    // pub fn center(&self) -> CubeCoord {
    //     CubeCoord { x: 0, y: 0, z: 0 }
    // }

    /// Get the current size (radius) of the grid
    pub const fn size(&self) -> i32 {
        self.size
    }

    // /// Calculate the theoretical number of cells in a filled hexagon of radius r
    // pub fn theoretical_cell_count(radius: i32) -> usize {
    //     // Formula: 3r² + 3r + 1
    //     (3 * radius * radius + 3 * radius + 1) as usize
    // }

    // /// Calculate the theoretical number of cells in a ring of radius r
    // pub const fn theoretical_ring_count(radius: i32) -> usize {
    //     if radius == 0 {
    //         1
    //     } else {
    //         (6 * radius) as usize
    //     }
    // }

    /// Clear all colored cells
    pub fn clear_all(&mut self) {
        for cell in self.cells.values_mut() {
            cell.clear_color();
            cell.clear_content();
        }
    }

    /// Get the bounds of the grid (min/max q,r in axial coordinates)
    pub fn bounds(&self) -> ((i32, i32), (i32, i32)) {
        let mut min_q = i32::MAX;
        let mut max_q = i32::MIN;
        let mut min_r = i32::MAX;
        let mut max_r = i32::MIN;

        for coord in self.cells.keys() {
            let (q, r) = coord.to_axial();
            min_q = min_q.min(q);
            max_q = max_q.max(q);
            min_r = min_r.min(r);
            max_r = max_r.max(r);
        }

        ((min_q, min_r), (max_q, max_r))
    }

    // /// Generate a simple text representation of the grid
    // pub fn to_text_representation(&self) -> String {
    //     let ((min_q, min_r), (max_q, max_r)) = self.bounds();
    //     let mut result = String::new();

    //     for r in min_r..=max_r {
    //         // Indent for hexagonal alignment
    //         let indent = " ".repeat(((r - min_r) * 2) as usize);
    //         result.push_str(&indent);

    //         for q in min_q..=max_q {
    //             let coord = CubeCoord::from_axial(q, r);
    //             if let Some(cell) = self.get_cell(&coord) {
    //                 if cell.color.is_some() {
    //                     result.push_str("# ");
    //                 } else {
    //                     result.push_str(". ");
    //                 }
    //             } else {
    //                 result.push_str("  ");
    //             }
    //         }
    //         result.push('\n');
    //     }

    //     result
    // }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fill_ring_at_radius_zero_colors_only_the_center() {
        let mut grid = HexGrid::new(2);
        let center = CubeCoord::from_axial(0, 0);

        grid.fill_ring(&center, 0, 0xFF_0000);

        assert_eq!(grid.get_cell(&center).unwrap().color, Some(0xFF_0000));
        let colored_count = grid.all_cells().filter(|c| c.color.is_some()).count();
        assert_eq!(colored_count, 1);
    }

    #[test]
    fn fill_ring_at_positive_radius_colors_exactly_the_ring_and_not_the_center() {
        let mut grid = HexGrid::new(3);
        let center = CubeCoord::from_axial(0, 0);

        grid.fill_ring(&center, 2, 0x00_FF00);

        assert_eq!(grid.get_cell(&center).unwrap().color, None);
        let colored_count = grid.all_cells().filter(|c| c.color.is_some()).count();
        // A ring at radius r has exactly 6r cells.
        assert_eq!(colored_count, 12);
    }

    #[test]
    fn bounds_on_a_single_cell_grid_collapses_to_the_center() {
        let grid = HexGrid::new(0);
        assert_eq!(grid.bounds(), ((0, 0), (0, 0)));
    }

    #[test]
    fn bounds_on_a_populated_grid_spans_the_full_radius() {
        let grid = HexGrid::new(3);
        assert_eq!(grid.bounds(), ((-3, -3), (3, 3)));
    }
}
