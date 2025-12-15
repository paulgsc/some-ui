use std::time::Duration;

/// A content item with associated display duration
#[derive(Clone, Debug)]
pub struct Item {
    pub duration: Duration,
}

/// Circular timeline cursor managing content progression
#[derive(Clone, Debug)]
pub struct Timeline {
    items: Vec<Item>,
    cursor: usize,
    elapsed: Duration,
}

impl Timeline {
    pub fn new(items: Vec<Item>) -> Result<Self, String> {
        if items.is_empty() {
            return Err("Timeline cannot be empty".to_string());
        }

        Ok(Self {
            items,
            cursor: 0,
            elapsed: Duration::ZERO,
        })
    }

    /// Current cursor position
    pub fn cursor(&self) -> usize {
        self.cursor
    }

    /// Total number of items
    pub fn len(&self) -> usize {
        self.items.len()
    }

    /// Get current item
    pub fn current(&self) -> &Item {
        &self.items[self.cursor]
    }

    /// Advance cursor by one item
    pub fn advance(&mut self) {
        self.cursor = (self.cursor + 1) % self.items.len();
        self.elapsed = Duration::ZERO;
    }

    /// Jump to specific index
    pub fn jump_to(&mut self, index: usize) {
        self.cursor = index % self.items.len();
        self.elapsed = Duration::ZERO;
    }

    /// Tick forward by duration, auto-advancing if needed
    pub fn tick(&mut self, dt: Duration) -> bool {
        self.elapsed += dt;

        if self.elapsed >= self.current().duration {
            self.advance();
            true // Advanced
        } else {
            false // Still on same item
        }
    }

    /// Progress through current item [0.0, 1.0]
    pub fn progress(&self) -> f64 {
        let current_dur = self.current().duration.as_secs_f64();
        if current_dur == 0.0 {
            1.0
        } else {
            (self.elapsed.as_secs_f64() / current_dur).min(1.0)
        }
    }
}
