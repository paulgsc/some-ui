mod geometry;
mod timeline;

pub use geometry::Polyhedron;
use geometry::{FaceIndex, RotationCycle};
use std::time::Duration;
pub use timeline::Item;
use timeline::Timeline;

/// Core viewport state managing content projection onto polyhedron
pub struct Viewport {
    timeline: Timeline,
    polyhedron: Polyhedron,
    pub cycle_index: usize,
    pub cycle_position: usize,
    face_capacity: usize,
}

/// Transition actions for viewport navigation
#[derive(Clone, Debug)]
pub enum Transition {
    /// Advance to next item on same face
    NextItem,
    /// Rotate to next face in current cycle
    RotateNext,
    /// Rotate to previous face in current cycle
    RotatePrev,
    /// Jump to specific face
    JumpToFace(FaceIndex),
    /// Switch to different rotation cycle
    SwitchCycle(usize),
    /// Jump to specific content index
    JumpToContent(usize),
}

/// Computed face layout (stateless projection)
#[derive(Clone, Debug)]
pub struct FaceLayout {
    /// Content indices assigned to each face
    pub faces: Vec<Vec<usize>>,
    /// Currently active face
    pub active_face: FaceIndex,
    /// Active item index within its face
    pub active_item_in_face: usize,
}

impl Viewport {
    pub fn new(items: Vec<Item>, polyhedron: Polyhedron, face_capacity: usize) -> Result<Self, String> {
        if face_capacity == 0 {
            return Err("Face capacity must be at least 1".to_string());
        }

        let timeline = Timeline::new(items)?;

        Ok(Self {
            timeline,
            polyhedron,
            cycle_index: 0,
            cycle_position: 0,
            face_capacity,
        })
    }

    /// Get current rotation cycle
    pub fn current_cycle(&self) -> &RotationCycle {
        self.polyhedron.cycle(self.cycle_index)
    }

    /// Get currently visible face index
    pub fn current_face(&self) -> FaceIndex {
        self.current_cycle().face_at(self.cycle_position)
    }

    /// Get timeline cursor
    pub fn cursor(&self) -> usize {
        self.timeline.cursor()
    }

    /// Compute current face layout (pure function)
    pub fn compute_layout(&self) -> FaceLayout {
        let cycle = self.current_cycle();
        let mut faces = vec![Vec::new(); self.polyhedron.face_count];

        let cursor = self.timeline.cursor();
        let total = self.timeline.len();

        // Distribute content across cycle faces
        for (cycle_pos, &face_idx) in cycle.faces.iter().enumerate() {
            let base = (cursor + cycle_pos * self.face_capacity) % total;

            for offset in 0..self.face_capacity {
                let content_idx = (base + offset) % total;
                faces[face_idx].push(content_idx);
            }
        }

        // Determine active face and item position
        let active_face = self.current_face();
        let active_item_in_face = if !faces[active_face].is_empty() {
            faces[active_face].iter().position(|&idx| idx == cursor).unwrap_or(0)
        } else {
            0
        };

        FaceLayout {
            faces,
            active_face,
            active_item_in_face,
        }
    }

    /// Apply transition (state mutation)
    pub fn apply(&mut self, transition: Transition) {
        match transition {
            Transition::NextItem => {
                self.timeline.advance();
            }

            Transition::RotateNext => {
                let cycle = self.current_cycle();
                self.cycle_position = (self.cycle_position + 1) % cycle.len();

                // Advance timeline to align with new face
                let new_cursor = (self.timeline.cursor() + self.face_capacity) % self.timeline.len();
                self.timeline.jump_to(new_cursor);
            }

            Transition::RotatePrev => {
                let cycle = self.current_cycle();
                self.cycle_position = if self.cycle_position == 0 { cycle.len() - 1 } else { self.cycle_position - 1 };

                // Move timeline backward
                let offset = if self.timeline.cursor() >= self.face_capacity {
                    self.timeline.cursor() - self.face_capacity
                } else {
                    self.timeline.len() - (self.face_capacity - self.timeline.cursor())
                };
                self.timeline.jump_to(offset);
            }

            Transition::JumpToFace(face_idx) => {
                if let Some(pos) = self.current_cycle().position_of(face_idx) {
                    self.cycle_position = pos;
                    let new_cursor = (pos * self.face_capacity) % self.timeline.len();
                    self.timeline.jump_to(new_cursor);
                }
            }

            Transition::SwitchCycle(cycle_idx) => {
                if cycle_idx < self.polyhedron.cycles.len() {
                    self.cycle_index = cycle_idx;
                    self.cycle_position = 0;
                    // Keep timeline cursor unchanged
                }
            }

            Transition::JumpToContent(idx) => {
                self.timeline.jump_to(idx);
                // Update cycle position to match
                let offset = idx % (self.current_cycle().len() * self.face_capacity);
                self.cycle_position = offset / self.face_capacity;
            }
        }
    }

    /// Tick time forward (auto-advances timeline)
    pub fn tick(&mut self, dt: Duration) -> bool {
        self.timeline.tick(dt)
    }

    /// Get current timeline progress
    pub fn progress(&self) -> f64 {
        self.timeline.progress()
    }
}
