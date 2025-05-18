use std::fmt;

mod hex_cell;
mod hex_grid;
mod hex_pattern;
mod utils;
mod wasm_hex;

/// Represents cube coordinates in a hexagonal grid.
/// x + y + z = 0 must be maintained for valid coordinates.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct CubeCoord {
    pub x: i32,
    pub y: i32,
    pub z: i32,
}

impl CubeCoord {
    /// Create a new cube coordinate, validating the constraint x + y + z = 0
    pub const fn new(x: i32, y: i32, z: i32) -> Result<Self, &'static str> {
        if x + y + z != 0 {
            return Err("Cube coordinates must sum to zero");
        }
        Ok(Self { x, y, z })
    }

    /// Create a new cube coordinate without validation, use with caution
    pub fn new_unchecked(x: i32, y: i32, z: i32) -> Self {
        Self { x, y, z }
    }

    /// Convert axial coordinates (q,r) to cube coordinates
    pub fn from_axial(q: i32, r: i32) -> Self {
        let y = -q - r;
        Self { x: q, y, z: r }
    }

    /// Convert to axial coordinates (q,r)
    pub fn to_axial(&self) -> (i32, i32) {
        (self.x, self.z)
    }

    /// Calculate distance between two cube coordinates
    pub fn distance(&self, other: &CubeCoord) -> i32 {
        ((self.x - other.x).abs() + (self.y - other.y).abs() + (self.z - other.z).abs()) / 2
    }

    /// Get the six neighboring coordinates
    pub fn neighbors(&self) -> [Self; 6] {
        const DIRECTIONS: [(i32, i32, i32); 6] = [(1, -1, 0), (1, 0, -1), (0, 1, -1), (-1, 1, 0), (-1, 0, 1), (0, -1, 1)];

        let mut result = [CubeCoord { x: 0, y: 0, z: 0 }; 6];
        for (i, &(dx, dy, dz)) in DIRECTIONS.iter().enumerate() {
            result[i] = CubeCoord {
                x: self.x + dx,
                y: self.y + dy,
                z: self.z + dz,
            };
        }
        result
    }

    /// Add another cube coordinate to this one
    pub fn add(&self, other: &Self) -> Self {
        CubeCoord {
            x: self.x + other.x,
            y: self.y + other.y,
            z: self.z + other.z,
        }
    }

    /// Scale this cube coordinate by a factor
    pub fn scale(&self, factor: i32) -> Self {
        CubeCoord {
            x: self.x * factor,
            y: self.y * factor,
            z: self.z * factor,
        }
    }
}

impl fmt::Display for CubeCoord {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "({}, {}, {})", self.x, self.y, self.z)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Helper function to create a CubeCoord for tests
    fn create_coord(x: i32, y: i32, z: i32) -> CubeCoord {
        CubeCoord::new(x, y, z).unwrap() // Use unwrap() in tests for brevity, assuming test inputs are valid
    }

    #[test]
    fn test_cube_coord_new() {
        // Test valid coordinates
        let coord1 = CubeCoord::new(1, 2, -3).unwrap();
        assert_eq!(coord1.x, 1);
        assert_eq!(coord1.y, 2);
        assert_eq!(coord1.z, -3);

        // Test invalid coordinates
        let result = CubeCoord::new(1, 2, 3);
        assert!(result.is_err());
        assert_eq!(result.err(), Some("Cube coordinates must sum to zero"));
    }

    #[test]
    fn test_cube_coord_new_unchecked() {
        let coord = CubeCoord::new_unchecked(1, 2, 3);
        assert_eq!(coord.x, 1);
        assert_eq!(coord.y, 2);
        assert_eq!(coord.z, 3);
        // Note: No assertion about the sum, as it's unchecked.
    }

    #[test]
    fn test_cube_coord_from_axial() {
        let coord = CubeCoord::from_axial(1, 2);
        assert_eq!(coord.x, 1);
        assert_eq!(coord.y, -3);
        assert_eq!(coord.z, 2);
    }

    #[test]
    fn test_cube_coord_to_axial() {
        let coord = create_coord(1, -3, 2);
        let (q, r) = coord.to_axial();
        assert_eq!(q, 1);
        assert_eq!(r, 2);
    }

    #[test]
    fn test_cube_coord_distance() {
        let coord1 = create_coord(1, -3, 2);
        let coord2 = create_coord(4, -2, -2);
        let distance = coord1.distance(&coord2);
        assert_eq!(distance, (3 + 1 + 4) / 2); // Manhattan distance in cube coords
        assert_eq!(distance, 4);
    }

    #[test]
    fn test_cube_coord_neighbors() {
        let coord = create_coord(0, 0, 0);
        let neighbors = coord.neighbors();
        assert_eq!(neighbors.len(), 6);
        // Check a few neighbors
        assert_eq!(neighbors[0], create_coord(1, -1, 0));
        assert_eq!(neighbors[3], create_coord(-1, 1, 0));
        assert_eq!(neighbors[5], create_coord(0, -1, 1));
    }

    #[test]
    fn test_cube_coord_add() {
        let coord1 = create_coord(1, -3, 2);
        let coord2 = create_coord(2, 1, -3);
        let result = coord1.add(&coord2);
        assert_eq!(result, create_coord(3, -2, -1));
    }

    #[test]
    fn test_cube_coord_scale() {
        let coord = create_coord(1, -3, 2);
        let result = coord.scale(3);
        assert_eq!(result, create_coord(3, -9, 6));
    }

    #[test]
    fn test_cube_coord_display() {
        let coord = create_coord(1, -3, 2);
        let display_string = format!("{}", coord);
        assert_eq!(display_string, "(1, -3, 2)");
    }

    #[test]
    fn test_hex_cell_new() {
        let coord = create_coord(1, -3, 2);
        let cell = HexCell::new(coord);
        assert_eq!(cell.coord, coord);
        assert_eq!(cell.color, None);
        assert_eq!(cell.content, None);
    }

    #[test]
    fn test_hex_cell_with_color() {
        let coord = create_coord(1, -3, 2);
        let cell = HexCell::with_color(coord, 0xFF0000);
        assert_eq!(cell.coord, coord);
        assert_eq!(cell.color, Some(0xFF0000));
        assert_eq!(cell.content, None);
    }

    #[test]
    fn test_hex_cell_with_content() {
        let coord = create_coord(1, -3, 2);
        let cell = HexCell::with_content(coord, "Test Content".to_string());
        assert_eq!(cell.coord, coord);
        assert_eq!(cell.color, None);
        assert_eq!(cell.content, Some("Test Content".to_string()));
    }

    #[test]
    fn test_hex_cell_set_color() {
        let coord = create_coord(1, -3, 2);
        let mut cell = HexCell::new(coord);
        cell.set_color(0x00FF00);
        assert_eq!(cell.color, Some(0x00FF00));
    }

    #[test]
    fn test_hex_cell_set_content() {
        let coord = create_coord(1, -3, 2);
        let mut cell = HexCell::new(coord);
        cell.set_content("New Content".to_string());
        assert_eq!(cell.content, Some("New Content".to_string()));
    }

    #[test]
    fn test_hex_cell_clear_color() {
        let coord = create_coord(1, -3, 2);
        let mut cell = HexCell::with_color(coord, 0xFF0000);
        cell.clear_color();
        assert_eq!(cell.color, None);
    }

    #[test]
    fn test_hex_cell_clear_content() {
        let coord = create_coord(1, -3, 2);
        let mut cell = HexCell::with_content(coord, "Test Content".to_string());
        cell.clear_content();
        assert_eq!(cell.content, None);
    }

    #[test]
    fn test_hex_grid_new() {
        let grid = HexGrid::new(3);
        assert_eq!(grid.size(), 3);
        assert_eq!(grid.cell_count(), HexGrid::theoretical_cell_count(3));
    }

    #[test]
    fn test_hex_grid_generate() {
        let mut grid = HexGrid::new(2);
        grid.generate(); // Redundant, but good to test explicitly if the method is public
        assert_eq!(grid.size(), 2);
        assert_eq!(grid.cell_count(), HexGrid::theoretical_cell_count(2));

        let mut grid2 = HexGrid::new(0);
        grid2.generate();
        assert_eq!(grid2.size(), 0);
        assert_eq!(grid2.cell_count(), HexGrid::theoretical_cell_count(0));
    }

    #[test]
    fn test_hex_grid_cell_count() {
        let grid = HexGrid::new(4);
        assert_eq!(grid.cell_count(), HexGrid::theoretical_cell_count(4));
    }

    #[test]
    fn test_hex_grid_get_cell() {
        let grid = HexGrid::new(2);
        let coord = create_coord(0, 0, 0);
        let cell = grid.get_cell(&coord);
        assert!(cell.is_some());
        assert_eq!(cell.unwrap().coord, coord);

        let invalid_coord = create_coord(10, 10, -20);
        let cell = grid.get_cell(&invalid_coord);
        assert!(cell.is_none());
    }

    #[test]
    fn test_hex_grid_get_cell_mut() {
        let mut grid = HexGrid::new(2);
        let coord = create_coord(0, 0, 0);
        let cell = grid.get_cell_mut(&coord);
        assert!(cell.is_some());
        cell.unwrap().set_color(0xFF0000);
        let cell = grid.get_cell(&coord);
        assert_eq!(cell.unwrap().color, Some(0xFF0000));
    }

    #[test]
    fn test_hex_grid_set_cell_color() {
        let mut grid = HexGrid::new(2);
        let coord = create_coord(0, 0, 0);
        let result = grid.set_cell_color(&coord, 0x00FF00);
        assert_eq!(result, true);
        let cell = grid.get_cell(&coord);
        assert_eq!(cell.unwrap().color, Some(0x00FF00));

        let invalid_coord = create_coord(10, 10, -20);
        let result = grid.set_cell_color(&invalid_coord, 0x00FF00);
        assert_eq!(result, false);
    }

    #[test]
    fn test_hex_grid_set_cell_content() {
        let mut grid = HexGrid::new(2);
        let coord = create_coord(0, 0, 0);
        let result = grid.set_cell_content(&coord, "Test Content".to_string());
        assert_eq!(result, true);
        let cell = grid.get_cell(&coord);
        assert_eq!(cell.unwrap().content, Some("Test Content".to_string()));

        let invalid_coord = create_coord(10, 10, -20);
        let result = grid.set_cell_content(&invalid_coord, "Test Content".to_string());
        assert_eq!(result, false);
    }

    #[test]
    fn test_hex_grid_clear_cell_color() {
        let mut grid = HexGrid::new(2);
        let coord = create_coord(0, 0, 0);
        grid.set_cell_color(&coord, 0xFF0000);
        let result = grid.clear_cell_color(&coord);
        assert_eq!(result, true);
        let cell = grid.get_cell(&coord);
        assert_eq!(cell.unwrap().color, None);

        let invalid_coord = create_coord(10, 10, -20);
        let result = grid.clear_cell_color(&invalid_coord);
        assert_eq!(result, false);
    }

    #[test]
    fn test_hex_grid_fill_region() {
        let mut grid = HexGrid::new(3);
        let center = create_coord(0, 0, 0);
        grid.fill_region(&center, 2, 0xFF0000);
        // Check that the center cell is colored
        assert_eq!(grid.get_cell(&center).unwrap().color, Some(0xFF0000));
        // Check that a cell at distance 2 is colored
        let coord_at_2 = create_coord(2, 0, -2);
        assert_eq!(grid.get_cell(&coord_at_2).unwrap().color, Some(0xFF0000));
        // Check that a cell at distance 3 is not colored
        let coord_at_3 = create_coord(3, 0, -3);
        if let Some(cell) = grid.get_cell(&coord_at_3) {
            // Need to check if the cell exists.
            assert_eq!(cell.color, None);
        }
        // Check the number of colored cells.  Radius 2 should be 19.
        let colored_count = grid.colored_cells().count();
        assert_eq!(colored_count, 19);
    }

    #[test]
    fn test_hex_grid_fill_ring() {
        let mut grid = HexGrid::new(3);
        let center = create_coord(0, 0, 0);
        grid.fill_ring(&center, 2, 0x00FF00);
        // Check that the center cell is not colored
        assert_eq!(grid.get_cell(&center).unwrap().color, None);
        // Check that a cell at distance 2 is colored
        let coord_at_2 = create_coord(2, 0, -2);
        assert_eq!(grid.get_cell(&coord_at_2).unwrap().color, Some(0x00FF00));
        // Check that a cell at distance 1 is not colored
        let coord_at_1 = create_coord(1, 0, -1);
        assert_eq!(grid.get_cell(&coord_at_1).unwrap().color, None);

        // Check the number of colored cells. Ring radius 2 should be 6*2 = 12
        let colored_count = grid.colored_cells().count();
        assert_eq!(colored_count, 12);
    }

    #[test]
    fn test_hex_grid_contains() {
        let grid = HexGrid::new(2);
        let coord_in = create_coord(0, 0, 0);
        let coord_out = create_coord(10, 0, -10);
        assert_eq!(grid.contains(&coord_in), true);
        assert_eq!(grid.contains(&coord_out), false);
    }

    #[test]
    fn test_hex_grid_all_cells() {
        let grid = HexGrid::new(2);
        let all_cells_count = grid.all_cells().count();
        assert_eq!(all_cells_count, HexGrid::theoretical_cell_count(2));
    }

    #[test]
    fn test_hex_grid_colored_cells() {
        let mut grid = HexGrid::new(2);
        let center = create_coord(0, 0, 0);
        grid.set_cell_color(&center, 0xFF0000);
        let colored_cells_count = grid.colored_cells().count();
        assert_eq!(colored_cells_count, 1);
    }

    #[test]
    fn test_hex_grid_center() {
        let grid = HexGrid::new(5);
        let center = grid.center();
        assert_eq!(center, create_coord(0, 0, 0));
    }

    #[test]
    fn test_hex_grid_size() {
        let grid = HexGrid::new(7);
        let size = grid.size();
        assert_eq!(size, 7);
    }

    #[test]
    fn test_hex_grid_create_hexagon_pattern() {
        let mut grid = HexGrid::new(5);
        grid.create_hexagon_pattern(1, 2, 0xFF0000);
        // The center should be colored.
        assert_eq!(grid.get_cell(&grid.center()).unwrap().color, Some(0xFF0000));
        // Check a cell in one of the neighboring hexagons.
        let neighbor_cell = create_coord(2, -2, 0);
        assert_eq!(grid.get_cell(&neighbor_cell).unwrap().color, Some(0xFF0000));
        // Check a cell that should not be colored.
        let far_cell = create_coord(4, -4, 0);
        if let Some(cell) = grid.get_cell(&far_cell) {
            assert_eq!(cell.color, None);
        }
    }

    #[test]
    fn test_hex_grid_create_corner_touching_pattern() {
        let mut grid = HexGrid::new(5);
        grid.create_corner_touching_pattern(1, 0xFF0000);
        // The center should be colored.
        assert_eq!(grid.get_cell(&grid.center()).unwrap().color, Some(0xFF0000));
        // Check one of the neighbors
        let neighbor_cell = create_coord(2, -1, -1);
        assert_eq!(grid.get_cell(&neighbor_cell).unwrap().color, Some(0xFF0000));
    }

    #[test]
    fn test_hex_grid_create_overlapping_pattern() {
        let mut grid = HexGrid::new(5);
        grid.create_overlapping_pattern(1, 2, 0xFF0000);
        // Center should be colored
        assert_eq!(grid.get_cell(&grid.center()).unwrap().color, Some(0xFF0000));
        // Check a neighbor
        let neighbor_cell = create_coord(2, -2, 0);
        assert_eq!(grid.get_cell(&neighbor_cell).unwrap().color, Some(0xFF0000));
    }

    #[test]
    fn test_hex_grid_theoretical_cell_count() {
        assert_eq!(HexGrid::theoretical_cell_count(0), 1);
        assert_eq!(HexGrid::theoretical_cell_count(1), 7);
        assert_eq!(HexGrid::theoretical_cell_count(2), 19);
        assert_eq!(HexGrid::theoretical_cell_count(3), 37);
    }

    #[test]
    fn test_hex_grid_theoretical_ring_count() {
        assert_eq!(HexGrid::theoretical_ring_count(0), 1);
        assert_eq!(HexGrid::theoretical_ring_count(1), 6);
        assert_eq!(HexGrid::theoretical_ring_count(2), 12);
        assert_eq!(HexGrid::theoretical_ring_count(3), 18);
    }

    #[test]
    fn test_hex_grid_clear_all() {
        let mut grid = HexGrid::new(2);
        let center = create_coord(0, 0, 0);
        grid.set_cell_color(&center, 0xFF0000);
        grid.set_cell_content(&center, "Test".to_string());
        grid.clear_all();
        let cell = grid.get_cell(&center).unwrap();
        assert_eq!(cell.color, None);
        assert_eq!(cell.content, None);
    }

    #[test]
    fn test_hex_grid_bounds() {
        let grid = HexGrid::new(2);
        let bounds = grid.bounds();
        assert_eq!(bounds.0, (-2, -2)); // min_q, min_r
        assert_eq!(bounds.1, (2, 2)); // max_q, max_r
    }

    #[test]
    fn test_hex_grid_to_text_representation() {
        let mut grid = HexGrid::new(2);
        let center = create_coord(0, 0, 0);
        grid.set_cell_color(&center, 0xFF0000);
        let text_repr = grid.to_text_representation();
        // The exact string representation depends on the algorithm.
        // Here's a basic check that verifies non-emptiness and the presence of '#'
        assert!(!text_repr.is_empty());
        assert!(text_repr.contains("#"));
        assert!(text_repr.contains("."));
    }

    #[test]
    fn test_hex_to_pixel() {
        let coord = create_coord(1, -2, 1);
        let size = 10.0;
        let (x, y) = utils::hex_to_pixel(&coord, size);
        // Expected values are calculated based on the conversion formula.
        let expected_x = size * (3.0_f32.sqrt() * 1.0 + 3.0_f32.sqrt() / 2.0 * -2.0);
        let expected_y = size * (3.0 / 2.0 * -2.0);
        assert_eq!(x, expected_x);
        assert_eq!(y, expected_y);
    }

    #[test]
    fn test_pixel_to_hex() {
        let size = 10.0;
        let x = size * (3.0_f32.sqrt() * 1.0 + 3.0_f32.sqrt() / 2.0 * -2.0);
        let y = size * (3.0 / 2.0 * -2.0);
        let coord = utils::pixel_to_hex(x, y, size);
        // Due to the rounding in pixel_to_hex, we expect to get back the original cube coord
        assert_eq!(coord, create_coord(1, -2, 1));
    }

    #[test]
    fn test_hex_to_pixel_pointy_top() {
        // Test the center hex
        let center = CubeCoord::new_unchecked(0, 0, 0);
        let size = 10.0;
        let (x, y) = utils::hex_to_pixel(&center, size);
        assert_eq!(x, 0.0);
        assert_eq!(y, 0.0);

        // Test q-axis neighbor (pointy-top orientation)
        let q_neighbor = CubeCoord::new_unchecked(1, -1, 0);
        let (x, y) = utils::hex_to_pixel(&q_neighbor, size);
        assert!((x - 3.0 * 10.0 * 0.5_f32.sqrt()).abs() < 0.001);
        assert_eq!(y, 0.0);

        // Test r-axis neighbor (pointy-top orientation)
        let r_neighbor = CubeCoord::new_unchecked(0, -1, 1);
        let (x, y) = utils::hex_to_pixel(&r_neighbor, size);
        assert!((x - 1.5 * 10.0 * 0.5_f32.sqrt()).abs() < 0.001);
        assert!((y + 1.5 * 10.0).abs() < 0.001);
    }

    #[test]
    fn test_pixel_to_hex_pointy_top() {
        let size = 10.0;

        // Test center
        let coord = utils::pixel_to_hex(0.0, 0.0, size);
        assert_eq!(coord.x, 0);
        assert_eq!(coord.y, 0);
        assert_eq!(coord.z, 0);

        // Test a point clearly in the first hex neighbor along q-axis
        let (x, y) = utils::hex_to_pixel(&CubeCoord::new_unchecked(1, -1, 0), size);
        let coord = utils::pixel_to_hex(x, y, size);
        assert_eq!(coord.x, 1);
        assert_eq!(coord.y, -1);
        assert_eq!(coord.z, 0);

        // Test a point clearly in a hex neighbor along r-axis
        let (x, y) = utils::hex_to_pixel(&CubeCoord::new_unchecked(0, -1, 1), size);
        let coord = utils::pixel_to_hex(x, y, size);
        assert_eq!(coord.x, 0);
        assert_eq!(coord.y, -1);
        assert_eq!(coord.z, 1);
    }

    #[test]
    fn test_neighbor_pattern_pointy_top() {
        // For pointy-topped hexagons, neighbors should form a proper pattern
        let coord = CubeCoord::new_unchecked(0, 0, 0);
        let neighbors = coord.neighbors();

        // Verify neighbor count
        assert_eq!(neighbors.len(), 6);

        // For a pointy-topped layout, neighbors should include these coords:
        let expected_neighbors = [
            CubeCoord::new_unchecked(1, -1, 0), // Right
            CubeCoord::new_unchecked(1, 0, -1), // Bottom right
            CubeCoord::new_unchecked(0, 1, -1), // Bottom left
            CubeCoord::new_unchecked(-1, 1, 0), // Left
            CubeCoord::new_unchecked(-1, 0, 1), // Top left
            CubeCoord::new_unchecked(0, -1, 1), // Top right
        ];

        for expected in expected_neighbors.iter() {
            assert!(neighbors.contains(expected));
        }
    }
}
