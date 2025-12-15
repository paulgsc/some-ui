    use std::collections::HashSet;

    // Helper to create test viewport
    fn create_test_viewport(n_items: usize, n_faces: usize, capacity: usize) -> Viewport {
        let items: Vec<Item> = (0..n_items)
            .map(|i| Item::new(format!("Item {}", i), Duration::from_secs(1)))
            .collect();
        
        let faces: Vec<FaceIndex> = (0..n_faces).collect();
        let cycle = RotationCycle::new(faces);
        let polyhedron = Polyhedron::new(vec![cycle], n_faces);
        
        Viewport::new(items, polyhedron, capacity).unwrap()
    }

    // Core quantities for invariant checking
    struct CycleMetrics {
        n: usize,           // timeline.len()
        f: usize,           // current_cycle.len()
        k: usize,           // face_capacity
        c: usize,           // F * k (capacity per full rotation)
        r: usize,           // N % C (residual)
        q: usize,           // N / C (full cycles)
        cycle_epoch: usize, // floor(cursor / C)
        cycle_offset: usize,// cursor % C
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

            Self { n, f, k, c, r, q, cycle_epoch, cycle_offset }
        }
    }

    /// Invariant 1: No early leakage of residuals
    /// Before the last face of a cycle, no face may display content beyond (cycle_epoch + 1) * C
    #[test]
    fn test_invariant_1_no_early_residual_leakage() {
        let mut vp = create_test_viewport(100, 4, 3);
        
        for _ in 0..150 {
            let layout = vp.compute_layout();
            let metrics = CycleMetrics::compute(&vp);
            let max_allowed = (metrics.cycle_epoch + 1) * metrics.c;
            
            // Check all faces except the last in the cycle
            let cycle = vp.current_cycle();
            for (pos, &face_idx) in cycle.faces.iter().enumerate() {
                if pos < cycle.len() - 1 {
                    if let Some(&max_content) = layout.faces[face_idx].iter().max() {
                        assert!(
                            max_content < max_allowed,
                            "Early residual leakage: face {} at position {} has content {} >= {}",
                            face_idx, pos, max_content, max_allowed
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
            
            // Residuals should only appear when at cycle start and not past all residuals
            if vp.cycle_position == 0 && metrics.cycle_epoch < metrics.q {
                let face_0 = vp.current_face();
                let expected_items = metrics.k.min(
                    metrics.r.saturating_sub(metrics.cycle_epoch * metrics.k)
                );
                
                if expected_items < metrics.k {
                    assert_eq!(
                        layout.faces[face_0].len(),
                        expected_items,
                        "Residual count mismatch at epoch {}: expected {}, got {}",
                        metrics.cycle_epoch, expected_items, layout.faces[face_0].len()
                    );
                }
            }
            
            // All non-first faces should show exactly k items (unless we're in residual exhaustion)
            for (pos, &face_idx) in vp.current_cycle().faces.iter().enumerate() {
                if pos != 0 || metrics.cycle_epoch >= metrics.q {
                    assert!(
                        layout.faces[face_idx].is_empty() || layout.faces[face_idx].len() == metrics.k,
                        "Non-residual face {} has {} items instead of {}",
                        face_idx, layout.faces[face_idx].len(), metrics.k
                    );
                }
            }
            
            vp.apply(Transition::RotateNext);
        }
    }

    /// Invariant 3: Cursor monotonicity ≠ face mutation
    /// Advancing cursor within a face should not mutate other faces
    #[test]
    fn test_invariant_3_cursor_locality() {
        let mut vp = create_test_viewport(50, 5, 4);
        
        for _ in 0..40 {
            let layout_before = vp.compute_layout();
            let active_before = layout_before.active_face;
            
            vp.apply(Transition::NextItem);
            
            let layout_after = vp.compute_layout();
            
            // All faces except possibly the active face should remain unchanged
            for face_idx in 0..vp.polyhedron.face_count {
                if face_idx != active_before {
                    assert_eq!(
                        layout_before.faces[face_idx],
                        layout_after.faces[face_idx],
                        "Face {} mutated during cursor advance",
                        face_idx
                    );
                }
            }
        }
    }

    /// Invariant 4: Rotation boundary rewrite only
    /// Face assignments should only change on rotation boundaries
    #[test]
    fn test_invariant_4_rotation_boundary_only() {
        let mut vp = create_test_viewport(60, 4, 5);
        
        // Test NextItem doesn't cause boundary rewrites
        for _ in 0..10 {
            let layout_before = vp.compute_layout();
            vp.apply(Transition::NextItem);
            let layout_after = vp.compute_layout();
            
            let mut changed_faces = HashSet::new();
            for face_idx in 0..vp.polyhedron.face_count {
                if layout_before.faces[face_idx] != layout_after.faces[face_idx] {
                    changed_faces.insert(face_idx);
                }
            }
            
            // Only active face (or none) should change
            assert!(
                changed_faces.len() <= 1,
                "Multiple faces changed during NextItem: {:?}",
                changed_faces
            );
        }
        
        // Test rotation transitions
        let layout_before = vp.compute_layout();
        let exiting_face = layout_before.active_face;
        
        vp.apply(Transition::RotateNext);
        
        let layout_after = vp.compute_layout();
        let entering_face = layout_after.active_face;
        
        let mut changed_faces = HashSet::new();
        for face_idx in 0..vp.polyhedron.face_count {
            if layout_before.faces[face_idx] != layout_after.faces[face_idx] {
                changed_faces.insert(face_idx);
            }
        }
        
        // Only exiting and entering faces should change
        for &face in &changed_faces {
            assert!(
                face == exiting_face || face == entering_face,
                "Face {} changed but is neither exiting ({}) nor entering ({})",
                face, exiting_face, entering_face
            );
        }
    }

    /// Invariant 5: Cycle conservation
    /// Across a full rotation, union of faces should be exactly C distinct indices
    #[test]
    fn test_invariant_5_cycle_conservation() {
        let mut vp = create_test_viewport(48, 4, 3); // 48 items, 4 faces, 3 each = 12 capacity
        
        let metrics = CycleMetrics::compute(&vp);
        let cycle_len = vp.current_cycle().len();
        
        // Collect all items across one full rotation
        let mut all_items = HashSet::new();
        
        for _ in 0..cycle_len {
            let layout = vp.compute_layout();
            
            for face in &layout.faces {
                for &item_idx in face {
                    all_items.insert(item_idx);
                }
            }
            
            vp.apply(Transition::RotateNext);
        }
        
        // Should have exactly C distinct items (or less if in residual phase)
        let expected = if metrics.r > 0 && metrics.cycle_epoch < metrics.q {
            metrics.c.min(metrics.n)
        } else {
            metrics.c
        };
        
        assert_eq!(
            all_items.len(),
            expected,
            "Cycle conservation violated: expected {} distinct items, got {}",
            expected, all_items.len()
        );
    }

    /// Invariant 6: Cursor / active face coherence
    /// Cursor must always be in the active face
    #[test]
    fn test_invariant_6_cursor_coherence() {
        let mut vp = create_test_viewport(60, 5, 4);
        
        for _ in 0..80 {
            let layout = vp.compute_layout();
            let cursor = vp.cursor();
            let active_face = layout.active_face;
            
            // Cursor must be in active face
            assert!(
                layout.faces[active_face].contains(&cursor),
                "Cursor {} not in active face {} contents: {:?}",
                cursor, active_face, layout.faces[active_face]
            );
            
            // active_item_in_face must be correct index
            let expected_pos = layout.faces[active_face]
                .iter()
                .position(|&idx| idx == cursor)
                .unwrap();
            
            assert_eq!(
                layout.active_item_in_face,
                expected_pos,
                "Active item position mismatch: expected {}, got {}",
                expected_pos, layout.active_item_in_face
            );
            
            // Rotate or advance randomly
            if cursor % 3 == 0 {
                vp.apply(Transition::RotateNext);
            } else {
                vp.apply(Transition::NextItem);
            }
        }
    }

    /// Invariant 7: Post-residual periodicity
    /// After residuals exhausted, layout should be perfectly periodic
    #[test]
    fn test_invariant_7_post_residual_periodicity() {
        let mut vp = create_test_viewport(50, 4, 3); // 50 items, capacity 12, residual 2
        let metrics = CycleMetrics::compute(&vp);
        
        // Advance past residuals
        let target_cursor = (metrics.q + 2) * metrics.c;
        vp.apply(Transition::JumpToContent(target_cursor % metrics.n));
        
        let layout_1 = vp.compute_layout();
        
        // Advance by one full cycle
        for _ in 0..vp.current_cycle().len() {
            vp.apply(Transition::RotateNext);
        }
        
        let layout_2 = vp.compute_layout();
        
        // Layouts should be identical (modulo wraparound)
        assert_eq!(
            layout_1.active_face,
            layout_2.active_face,
            "Active face differs after full cycle in periodic phase"
        );
        
        // Content should repeat with period C
        for face_idx in 0..vp.polyhedron.face_count {
            let items_1: Vec<usize> = layout_1.faces[face_idx]
                .iter()
                .map(|&i| i % metrics.n)
                .collect();
            let items_2: Vec<usize> = layout_2.faces[face_idx]
                .iter()
                .map(|&i| i % metrics.n)
                .collect();
            
            assert_eq!(
                items_1, items_2,
                "Face {} content differs after full cycle: {:?} vs {:?}",
                face_idx, items_1, items_2
            );
        }
    }

    /// Comprehensive test: Run all invariants over random transitions
    #[test]
    fn test_all_invariants_comprehensive() {
        let mut vp = create_test_viewport(77, 5, 3); // Non-trivial residuals
        
        for i in 0..200 {
            let layout = vp.compute_layout();
            let cursor = vp.cursor();
            
            // Invariant 6: Cursor coherence (always check)
            assert!(
                layout.faces[layout.active_face].contains(&cursor),
                "Iteration {}: Cursor coherence failed",
                i
            );
            
            // Apply random transition
            match i % 5 {
                0 => vp.apply(Transition::NextItem),
                1 => vp.apply(Transition::RotateNext),
                2 => vp.apply(Transition::RotatePrev),
                3 => vp.apply(Transition::JumpToContent((i * 7) % vp.timeline.len())),
                _ => vp.apply(Transition::NextItem),
            }
        }
    }
