
/// An active character reveal in the game
#[derive(Debug, Clone)]
pub struct ActiveReveal {
    pub hangul: String,
    pub expected_key: String,
    pub revealed_at_ms: u64,
    pub cell_id: String,
}

/// A key press in the input buffer
#[derive(Debug, Clone)]
pub struct KeyBufferEntry {
    pub key: char,
    pub timestamp_ms: u64,
}
