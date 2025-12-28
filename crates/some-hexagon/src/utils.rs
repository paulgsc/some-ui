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
