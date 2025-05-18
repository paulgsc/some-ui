use crate::CubeCoord;

/// A cell in the hexagonal grid
#[derive(Debug, Clone)]
pub struct HexCell {
    pub coord: CubeCoord,
    pub color: Option<u32>,      // Using u32 to represent colors (RGB or index)
    pub content: Option<String>, // Optional content for the cell
}

impl HexCell {
    pub const fn new(coord: CubeCoord) -> Self {
        Self {
            coord,
            color: None,
            content: None,
        }
    }

    pub fn set_color(&mut self, color: u32) {
        self.color = Some(color);
    }

    pub fn set_content(&mut self, content: String) {
        self.content = Some(content);
    }

    pub fn clear_color(&mut self) {
        self.color = None;
    }

    pub fn clear_content(&mut self) {
        self.content = None;
    }
}
