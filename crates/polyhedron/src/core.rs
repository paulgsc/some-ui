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

    /// Compute current face layout (pure function, epoch-aware)
    pub fn compute_layout(&self) -> FaceLayout {
        let cycle = self.current_cycle();
        let total = self.timeline.len();
        let cursor = self.timeline.cursor();

        let f = cycle.len();
        let k = self.face_capacity;
        let c = f * k;

        // Core epoch quantities
        let epoch = cursor / c;
        let _epoch_offset = cursor % c;

        let q = total / c;
        let r = total % c;

        let mut faces = vec![Vec::new(); self.polyhedron.face_count];

        // Project faces for this epoch
        for (cycle_pos, &face_idx) in cycle.faces.iter().enumerate() {
            let face_base = epoch * c + cycle_pos * k;

            // Determine how many items this face is allowed to show
            let face_len = if epoch < q {
                // Full cycles: every face gets k items
                k
            } else if epoch == q {
                // Residual cycle: only some faces get items
                let consumed_before = cycle_pos * k;
                if consumed_before >= r {
                    0
                } else {
                    (r - consumed_before).min(k)
                }
            } else {
                // Post-residual: wrap cleanly back to periodic behavior
                k
            };

            for offset in 0..face_len {
                let idx = (face_base + offset) % total;
                faces[face_idx].push(idx);
            }
        }

        // Active face and active item resolution
        let active_face = self.current_face();

        let active_item_in_face = faces[active_face].iter().position(|&idx| idx == cursor).unwrap_or(0);

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
                // Simple cursor advance - layout recomputation handles epoch boundaries
                self.timeline.advance();
                self.sync_cycle_position_from_cursor();
            }

            Transition::RotateNext => {
                // Cache cycle length before mutating cycle_position
                let f = self.current_cycle().len();
                let k = self.face_capacity;
                let c = f * k;

                self.cycle_position = (self.cycle_position + 1) % f;

                // Advance cursor by k to maintain coherence with new cycle_position
                // This keeps cursor aligned with the active face in the epoch
                let cursor = self.timeline.cursor();
                let epoch = cursor / c;
                let epoch_offset = cursor % c;

                // Move forward by k within the current epoch, wrapping to next epoch if needed
                let new_offset = (epoch_offset + k) % c;
                let new_epoch = if new_offset < epoch_offset { epoch + 1 } else { epoch };
                let new_cursor = (new_epoch * c + new_offset) % self.timeline.len();

                self.timeline.jump_to(new_cursor);
            }

            Transition::RotatePrev => {
                // Cache cycle length before mutating cycle_position
                let f = self.current_cycle().len();
                let k = self.face_capacity;
                let c = f * k;

                self.cycle_position = if self.cycle_position == 0 { f - 1 } else { self.cycle_position - 1 };

                // Move cursor backward by k to maintain coherence
                let cursor = self.timeline.cursor();
                let epoch = cursor / c;
                let epoch_offset = cursor % c;

                // Move backward by k within epochs
                let new_offset = if epoch_offset >= k {
                    epoch_offset - k
                } else {
                    // Wrap to previous epoch
                    c - (k - epoch_offset)
                };
                let new_epoch = if new_offset > epoch_offset {
                    if epoch > 0 {
                        epoch - 1
                    } else {
                        self.timeline.len() / c
                    }
                } else {
                    epoch
                };
                let new_cursor = (new_epoch * c + new_offset) % self.timeline.len();

                self.timeline.jump_to(new_cursor);
            }

            Transition::JumpToFace(face_idx) => {
                if let Some(pos) = self.current_cycle().position_of(face_idx) {
                    self.cycle_position = pos;

                    // Align cursor to the start of the target face in current epoch
                    let cursor = self.timeline.cursor();
                    let f = self.current_cycle().len();
                    let k = self.face_capacity;
                    let c = f * k;
                    let epoch = cursor / c;

                    let new_cursor = (epoch * c + pos * k) % self.timeline.len();
                    self.timeline.jump_to(new_cursor);
                }
            }

            Transition::SwitchCycle(cycle_idx) => {
                if cycle_idx < self.polyhedron.cycles.len() {
                    self.cycle_index = cycle_idx;
                    self.cycle_position = 0;
                    // Keep timeline cursor unchanged - this is a pure view change
                }
            }

            Transition::JumpToContent(idx) => {
                if idx < self.timeline.len() {
                    self.timeline.jump_to(idx);
                    self.sync_cycle_position_from_cursor();

                    // Update cycle position to match the epoch-aligned face containing this content
                    let f = self.current_cycle().len();
                    let k = self.face_capacity;
                    let c = f * k;

                    let _epoch = idx / c;
                    let epoch_offset = idx % c;
                    let face_offset = epoch_offset / k;

                    self.cycle_position = face_offset.min(f - 1);
                }
            }
        }
    }

    /// Tick time forward (auto-advances timeline)
    pub fn tick(&mut self, dt: Duration) -> bool {
        let advanced = self.timeline.tick(dt);
        if advanced {
            self.sync_cycle_position_from_cursor();
        }
        advanced
    }

    /// Get current timeline progress
    pub fn progress(&self) -> f64 {
        self.timeline.progress()
    }

    fn sync_cycle_position_from_cursor(&mut self) {
        let f = self.current_cycle().len();
        let k = self.face_capacity;
        let c = f * k;

        let cursor = self.timeline.cursor();
        let face_block = (cursor % c) / k;

        self.cycle_position = face_block.min(f - 1);
    }
}

#[cfg(test)]
mod invariance_tests {
    use super::*;

    // Helper to create test viewport
    fn create_test_viewport(n_items: usize, _n_faces: usize, capacity: usize) -> Viewport {
        let items: Vec<Item> = (0..n_items).map(|_| Item { duration: Duration::from_secs(1) }).collect();

        let polyhedron = Polyhedron::default();

        Viewport::new(items, polyhedron, capacity).unwrap()
    }

    // Core quantities for invariant checking
    #[allow(dead_code)]
    struct CycleMetrics {
        n: usize,            // timeline.len()
        f: usize,            // current_cycle.len()
        k: usize,            // face_capacity
        c: usize,            // F * k (capacity per full rotation)
        r: usize,            // N % C (residual)
        q: usize,            // N / C (full cycles)
        cycle_epoch: usize,  // floor(cursor / C)
        cycle_offset: usize, // cursor % C
    }

    impl CycleMetrics {
        fn compute(viewport: &Viewport) -> Self {
            let n = viewport.timeline.len();
            let f = viewport.current_cycle().len();
            let k = viewport.face_capacity;
            let c = f * k;
            let r = n % c;
            let q = n / c;
            let cursor = viewport.cursor();
            let cycle_epoch = cursor / c;
            let cycle_offset = cursor % c;

            Self {
                n,
                f,
                k,
                c,
                r,
                q,
                cycle_epoch,
                cycle_offset,
            }
        }
    }

    /// Invariant 1: No early leakage of residuals
    #[test]
    fn test_invariant_1_no_early_residual_leakage() {
        let mut vp = create_test_viewport(100, 4, 3);

        for _ in 0..150 {
            let layout = vp.compute_layout();
            let metrics = CycleMetrics::compute(&vp);
            let max_allowed = (metrics.cycle_epoch + 1) * metrics.c;

            let cycle = vp.current_cycle();
            for (pos, &face_idx) in cycle.faces.iter().enumerate() {
                if pos < cycle.len() - 1 {
                    if let Some(&max_content) = layout.faces[face_idx].iter().max() {
                        assert!(
                            max_content < max_allowed,
                            "Early residual leakage: face {} at position {} has content {} >= {}",
                            face_idx,
                            pos,
                            max_content,
                            max_allowed
                        );
                    }
                }
            }

            vp.apply(Transition::NextItem);
        }
    }

    /// Invariant 2: Residuals appear only on cycle wrap
    #[test]
    fn test_invariant_2_residuals_only_on_wrap() {
        let mut vp = create_test_viewport(50, 4, 3); // 50 items, 4 faces, 3 per face = 12 cap, 2 residual

        for _ in 0..60 {
            let layout = vp.compute_layout();
            let metrics = CycleMetrics::compute(&vp);

            // During residual epoch (epoch == q), first face might show fewer items
            if metrics.cycle_epoch == metrics.q && vp.cycle_position == 0 && metrics.r > 0 {
                let face_0 = vp.current_face();
                let expected_items = metrics.k.min(metrics.r);

                if expected_items < metrics.k {
                    assert_eq!(
                        layout.faces[face_0].len(),
                        expected_items,
                        "Residual count mismatch at epoch {}: expected {}, got {}",
                        metrics.cycle_epoch,
                        expected_items,
                        layout.faces[face_0].len()
                    );
                }
            }

            // Check each face has appropriate content
            for (pos, &face_idx) in vp.current_cycle().faces.iter().enumerate() {
                let expected_len = if metrics.cycle_epoch < metrics.q {
                    // Before residual epoch: all faces show k items
                    metrics.k
                } else if metrics.cycle_epoch == metrics.q {
                    // Residual epoch: calculate based on position
                    let consumed = pos * metrics.k;
                    if consumed >= metrics.r {
                        0
                    } else {
                        metrics.k.min(metrics.r - consumed)
                    }
                } else {
                    // Post-residual: back to k items
                    metrics.k
                };

                if !layout.faces[face_idx].is_empty() {
                    assert_eq!(
                        layout.faces[face_idx].len(),
                        expected_len,
                        "Face {} at pos {} in epoch {} has {} items instead of expected {}",
                        face_idx,
                        pos,
                        metrics.cycle_epoch,
                        layout.faces[face_idx].len(),
                        expected_len
                    );
                }
            }

            vp.apply(Transition::RotateNext);
        }
    }

    /// Invariant 3: Cursor monotonicity ≠ face mutation
    #[test]
    fn test_invariant_3_cursor_locality() {
        let mut vp = create_test_viewport(50, 5, 4);

        for _ in 0..40 {
            let layout_before = vp.compute_layout();
            let metrics_before = CycleMetrics::compute(&vp);

            vp.apply(Transition::NextItem);

            let layout_after = vp.compute_layout();
            let metrics_after = CycleMetrics::compute(&vp);

            // If we didn't cross an epoch boundary, ALL faces should be identical
            if metrics_before.cycle_epoch == metrics_after.cycle_epoch {
                for face_idx in 0..vp.polyhedron.face_count {
                    assert_eq!(
                        layout_before.faces[face_idx], layout_after.faces[face_idx],
                        "Face {} mutated during cursor advance within same epoch",
                        face_idx
                    );
                }
            }
        }
    }

    /// Invariant 4: Rotation boundary rewrite only
    #[test]
    fn test_invariant_4_rotation_boundary_only() {
        let mut vp = create_test_viewport(60, 4, 5);

        // Test that NextItem within same epoch doesn't change face contents
        for _ in 0..10 {
            let layout_before = vp.compute_layout();
            let metrics_before = CycleMetrics::compute(&vp);

            vp.apply(Transition::NextItem);

            let metrics_after = CycleMetrics::compute(&vp);

            // Only check if we stayed in same epoch
            if metrics_before.cycle_epoch == metrics_after.cycle_epoch {
                let layout_after = vp.compute_layout();

                for face_idx in 0..vp.polyhedron.face_count {
                    assert_eq!(
                        layout_before.faces[face_idx], layout_after.faces[face_idx],
                        "Face content changed during same-epoch cursor movement"
                    );
                }
            }
        }

        // Test that rotation doesn't change face contents (just active face)
        let layout_before = vp.compute_layout();
        vp.apply(Transition::RotateNext);
        let layout_after = vp.compute_layout();

        // All face contents should be identical, only active_face differs
        for face_idx in 0..vp.polyhedron.face_count {
            assert_eq!(
                layout_before.faces[face_idx], layout_after.faces[face_idx],
                "Face {} content changed during rotation",
                face_idx
            );
        }
    }

    /// Invariant 5: Cycle conservation
    #[test]
    fn test_invariant_5_cycle_conservation() {
        let mut vp = create_test_viewport(48, 4, 3);

        let metrics = CycleMetrics::compute(&vp);
        let cycle_len = vp.current_cycle().len();

        let mut all_items = std::collections::HashSet::new();

        for _ in 0..cycle_len {
            let layout = vp.compute_layout();

            for face in &layout.faces {
                for &item_idx in face {
                    all_items.insert(item_idx);
                }
            }

            vp.apply(Transition::RotateNext);
        }

        let expected = if metrics.r > 0 && metrics.cycle_epoch == metrics.q {
            metrics.c.min(metrics.n)
        } else {
            metrics.c.min(metrics.n)
        };

        assert_eq!(
            all_items.len(),
            expected,
            "Cycle conservation violated: expected {} distinct items, got {}",
            expected,
            all_items.len()
        );
    }

    /// Invariant 6: Cursor / active face coherence
    #[test]
    fn test_invariant_6_cursor_coherence() {
        let mut vp = create_test_viewport(60, 5, 4);

        for i in 0..80 {
            let layout = vp.compute_layout();
            let cursor = vp.cursor();
            let active_face = layout.active_face;

            assert!(
                layout.faces[active_face].contains(&cursor),
                "Iteration {}: Cursor {} not in active face {} contents: {:?}",
                i,
                cursor,
                active_face,
                layout.faces[active_face]
            );

            let expected_pos = layout.faces[active_face].iter().position(|&idx| idx == cursor).unwrap();

            assert_eq!(
                layout.active_item_in_face, expected_pos,
                "Active item position mismatch: expected {}, got {}",
                expected_pos, layout.active_item_in_face
            );

            if i % 3 == 0 {
                vp.apply(Transition::RotateNext);
            } else {
                vp.apply(Transition::NextItem);
            }
        }
    }

    /// Invariant 7: Post-residual periodicity
    #[test]
    fn test_invariant_7_post_residual_periodicity() {
        let mut vp = create_test_viewport(50, 4, 3);
        let metrics = CycleMetrics::compute(&vp);

        // Advance well past residuals into periodic regime
        let target_cursor = ((metrics.q + 3) * metrics.c) % metrics.n;
        vp.apply(Transition::JumpToContent(target_cursor));

        let cursor_1 = vp.cursor();
        let layout_1 = vp.compute_layout();

        // Advance by C items (full cycle worth)
        for _ in 0..metrics.c {
            vp.apply(Transition::NextItem);
        }

        let cursor_2 = vp.cursor();
        let layout_2 = vp.compute_layout();

        // In periodic regime, the pattern should repeat
        // The actual content indices will be different, but the pattern should match
        for face_idx in 0..vp.polyhedron.face_count {
            assert_eq!(
                layout_1.faces[face_idx].len(),
                layout_2.faces[face_idx].len(),
                "Face {} has different content length in periodic phase: {} vs {}",
                face_idx,
                layout_1.faces[face_idx].len(),
                layout_2.faces[face_idx].len()
            );

            // Check that the relative offsets within faces are preserved
            if !layout_1.faces[face_idx].is_empty() && !layout_2.faces[face_idx].is_empty() {
                let offset_1 = layout_1.faces[face_idx][0] - cursor_1;
                let offset_2 = layout_2.faces[face_idx][0] - cursor_2;

                assert_eq!(offset_1, offset_2, "Face {} has different relative offset in periodic phase", face_idx);
            }
        }
    }

    /// Invariant 8: Cycle position auto-updates on face boundary crossing
    #[test]
    fn test_invariant_8_cycle_position_updates_on_face_boundary() {
        // Small numbers to make boundaries obvious
        // f = 4 faces, k = 2 items per face → c = 8
        let mut vp = create_test_viewport(32, 4, 2);

        let mut prev_cycle_position = vp.cycle_position;
        let mut prev_cursor = vp.cursor();

        // Step through several items
        for step in 0..20 {
            vp.apply(Transition::NextItem);

            let cursor = vp.cursor();
            let cycle_position = vp.cycle_position;

            let prev_face_block = prev_cursor / vp.face_capacity;
            let curr_face_block = cursor / vp.face_capacity;

            // When we cross a face boundary, cycle_position MUST update
            if curr_face_block != prev_face_block {
                assert_ne!(
                    cycle_position, prev_cycle_position,
                    "Step {}: Cursor crossed face boundary ({} → {}), \
                    but cycle_position did not update (still {})",
                    step, prev_face_block, curr_face_block, cycle_position
                );

                // And it must update to the correct face block (modulo cycle length)
                let expected = curr_face_block % vp.current_cycle().len();
                assert_eq!(
                    cycle_position, expected,
                    "Step {}: cycle_position incorrect after boundary crossing: \
                    expected {}, got {}",
                    step, expected, cycle_position
                );
            }

            prev_cursor = cursor;
            prev_cycle_position = cycle_position;
        }
    }

    /// Comprehensive test: Run all invariants over random transitions
    #[test]
    fn test_all_invariants_comprehensive() {
        let mut vp = create_test_viewport(77, 5, 3);

        for i in 0..200 {
            let layout = vp.compute_layout();
            let cursor = vp.cursor();

            assert!(layout.faces[layout.active_face].contains(&cursor), "Iteration {}: Cursor coherence failed", i);

            match i % 5 {
                0 => vp.apply(Transition::NextItem),
                1 => vp.apply(Transition::RotateNext),
                2 => vp.apply(Transition::RotatePrev),
                3 => vp.apply(Transition::JumpToContent((i * 7) % vp.timeline.len())),
                _ => vp.apply(Transition::NextItem),
            }
        }
    }
}
