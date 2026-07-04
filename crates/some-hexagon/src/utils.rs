use crate::CubeCoord;

/// Convert hex coordinates to pixel positions for pointy-topped hexagons
pub fn hex_to_pixel(coord: &CubeCoord, size: f32) -> (f32, f32) {
    let (q, r) = coord.to_axial();
    // Formulas for pointy-topped hexagons
    let x = size * (3.0_f32.sqrt() * q as f32 + 3.0_f32.sqrt() / 2.0 * r as f32);
    let y = size * (3.0 / 2.0 * r as f32);
    (x, y)
}

/// Convert pixel position to hex coordinates for pointy-topped hexagons
pub fn pixel_to_hex(x: f32, y: f32, size: f32) -> CubeCoord {
    // Reverse formulas for pointy-topped hexagons
    let q = (3.0_f32.sqrt() / 3.0 * x - 1.0 / 3.0 * y) / size;
    let r = (2.0 / 3.0 * y) / size;

    // Convert to cube coordinates
    let  cx = q;
    let  cz = r;
    let  cy = -cx - cz;

    // Round to nearest hex
    let mut rx = cx.round();
    let mut ry = cy.round();
    let mut rz = cz.round();

    // Fix rounding errors
    let x_diff = (rx - cx).abs();
    let y_diff = (ry - cy).abs();
    let z_diff = (rz - cz).abs();

    if x_diff > y_diff && x_diff > z_diff {
        rx = -ry - rz;
    } else if y_diff > z_diff {
        ry = -rx - rz;
    } else {
        rz = -rx - ry;
    }

    CubeCoord {
        x: rx as i32,
        y: ry as i32,
        z: rz as i32,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn coord(x: i32, y: i32, z: i32) -> CubeCoord {
        CubeCoord::new_unchecked(x, y, z)
    }

    #[test]
    fn pixel_to_hex_round_trips_through_hex_to_pixel_across_a_grid() {
        let size = 10.0;

        for x in -5..=5 {
            for z in -5..=5 {
                let y = -x - z;
                let original = coord(x, y, z);

                let (px, py) = hex_to_pixel(&original, size);
                let recovered = pixel_to_hex(px, py, size);

                assert_eq!(recovered, original, "round-trip failed for {original:?} -> ({px}, {py}) -> {recovered:?}");
            }
        }
    }

    #[test]
    fn hex_to_pixel_places_the_origin_at_the_origin() {
        let (x, y) = hex_to_pixel(&coord(0, 0, 0), 10.0);
        assert!(x.abs() < f32::EPSILON);
        assert!(y.abs() < f32::EPSILON);
    }

    #[test]
    fn pixel_to_hex_resolves_the_origin_exactly() {
        let result = pixel_to_hex(0.0, 0.0, 10.0);
        assert_eq!(result, coord(0, 0, 0));
    }
}
