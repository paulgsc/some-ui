use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

/// Represents a face in the cube
type Face = usize;

/// Represents a rotation axis
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum RotationAxis {
    #[serde(rename = "X-axis")]
    XAxis,
    #[serde(rename = "Y-axis")]
    YAxis,
}

/// Struct to manage viewport rotation with cube faces
pub struct ViewportRotation {
    // Total number of items
    total_items: usize,

    // Indices of items assigned to each face (0-5)
    face_indices: Vec<Vec<usize>>,

    // Maximum items per valid face
    max_per_face: usize,

    // Current face being displayed
    current_face: Face,

    // Current item index within the current face
    current_item_index: usize,

    // Current rotation axis
    current_axis: RotationAxis,

    // Valid rotation cycles for each axis
    rotation_cycles: HashMap<RotationAxis, Vec<Face>>,

    // Current position in the rotation cycle
    cycle_position: usize,

    // Next index to be assigned
    next_index: usize,
}

/// State that can be serialized and sent to the client
#[derive(Serialize, Deserialize)]
pub struct ViewportState {
    #[serde(rename = "faceIndices")]
    face_indices: Vec<Vec<usize>>, // Indices for each face
    #[serde(rename = "currFace")]
    current_face: Face,
    #[serde(rename = "currIdx")]
    current_item_index: usize,
    #[serde(rename = "currRotationAxis")]
    current_axis: RotationAxis,
    #[serde(rename = "pendingCount")]
    pending_count: usize, // Number of pending items
    #[serde(rename = "cyclePosition")]
    cycle_position: usize,
}

/// Manager for multiple viewport rotations
#[wasm_bindgen]
pub struct ViewportManager {
    // Map of viewport ID to ViewportRotation instance
    viewports: HashMap<String, ViewportRotation>,

    // Currently active viewport ID
    active_viewport_id: Option<String>,
}

impl ViewportRotation {
    /// Creates a new ViewportRotation instance
    pub fn new(total_items: usize, max_per_face: usize) -> Result<ViewportRotation, String> {
        if max_per_face < 1 || max_per_face > 6 {
            return Err("max_per_face must be between 1 and 6".to_string());
        }

        // Initialize rotation cycles
        let mut rotation_cycles = HashMap::new();
        rotation_cycles.insert(RotationAxis::XAxis, vec![0, 5, 2, 4]); // Front -> Top -> Back -> Bottom
        rotation_cycles.insert(RotationAxis::YAxis, vec![0, 3, 2, 1]); // Front -> Right -> Back -> Left

        let mut rotation = Self {
            total_items,
            face_indices: vec![Vec::new(); 6], // 6 total faces
            max_per_face,
            current_face: 0,
            current_item_index: 0,
            current_axis: RotationAxis::XAxis, // Default to Y-axis rotation
            rotation_cycles,
            cycle_position: 0,
            next_index: 0,
        };

        // Initialize faces with content
        rotation.initialize_faces();

        Ok(rotation)
    }

    /// Gets the internal state representation
    fn get_state(&self) -> ViewportState {
        ViewportState {
            face_indices: self.face_indices.clone(),
            current_face: self.current_face,
            current_item_index: self.current_item_index,
            current_axis: self.current_axis,
            pending_count: self.total_items - self.next_index,
            cycle_position: self.cycle_position,
        }
    }

    /// Moves to the next item in the current face
    fn next_item(&mut self) -> ViewportState {
        let face_items_count = self.face_indices[self.current_face].len();

        if face_items_count > 0 {
            self.current_item_index = (self.current_item_index + 1) % face_items_count;
        }

        self.get_state()
    }

    /// Rotates to the next face in the cycle
    fn rotate_next(&mut self) -> ViewportState {
        // Reset current item index when changing faces
        self.current_item_index = 0;

        // Get the cycle for the current axis
        let cycle = &self.rotation_cycles[&self.current_axis];

        // Move to the next position in the cycle
        self.cycle_position = (self.cycle_position + 1) % cycle.len();

        // Set the current face based on the cycle
        self.current_face = cycle[self.cycle_position];

        // Check if we're back at the beginning of the cycle and need to replenish items
        if self.cycle_position == 0 && self.next_index < self.total_items {
            self.cycle_all_faces();
        }

        self.get_state()
    }

    /// Get the current item index
    fn get_current_item_index(&self) -> Option<usize> {
        if self.face_indices[self.current_face].is_empty() {
            None
        } else {
            Some(self.face_indices[self.current_face][self.current_item_index])
        }
    }

    /// Initialize faces with content
    fn initialize_faces(&mut self) {
        // Get active faces for the current rotation axis
        let active_faces = self.get_active_cycle_faces();

        // Fill only the active faces
        for &face_idx in &active_faces {
            self.fill_face(face_idx);
        }
    }

    /// Fill a face with pending item indices
    fn fill_face(&mut self, face_idx: Face) {
        self.face_indices[face_idx].clear();

        // Add up to max_per_face indices from available items
        for _ in 0..self.max_per_face {
            if self.next_index < self.total_items {
                self.face_indices[face_idx].push(self.next_index);
                self.next_index += 1;
            } else {
                break;
            }
        }
    }

    /// Cycle items through all active faces
    fn cycle_all_faces(&mut self) {
        if self.next_index >= self.total_items {
            return;
        }

        // Get active faces for the current rotation axis
        let active_faces = self.get_active_cycle_faces();

        for &face_idx in &active_faces {
            if self.next_index >= self.total_items {
                break;
            }

            let items_to_replace = std::cmp::min(self.face_indices[face_idx].len(), self.total_items - self.next_index);

            // Replace existing indices first
            for i in 0..items_to_replace {
                self.face_indices[face_idx][i] = self.next_index;
                self.next_index += 1;
            }

            // Add new indices if there's still space
            let remaining_space = self.max_per_face - self.face_indices[face_idx].len();
            for _ in 0..remaining_space {
                if self.next_index < self.total_items {
                    self.face_indices[face_idx].push(self.next_index);
                    self.next_index += 1;
                } else {
                    break;
                }
            }
        }
    }

    /// Get the faces that are part of the active rotation cycle
    fn get_active_cycle_faces(&self) -> Vec<Face> {
        self.rotation_cycles[&self.current_axis].clone()
    }

    /// Set the rotation axis
    fn set_rotation_axis(&mut self, axis: RotationAxis) -> ViewportState {
        // Only update if the axis is different
        if self.current_axis != axis {
            self.current_axis = axis;
            self.cycle_position = 0;
            self.current_face = self.rotation_cycles[&self.current_axis][0];
            self.current_item_index = 0;
        }

        self.get_state()
    }
}

/// Response containing both a state and the active viewport ID
#[derive(Serialize, Deserialize)]
struct ViewportResponse {
    #[serde(rename = "viewportId")]
    viewport_id: String,
    state: ViewportState,
}

/// Response for listing all viewports
#[derive(Serialize, Deserialize)]
struct ViewportListResponse {
    #[serde(rename = "viewportIds")]
    viewport_ids: Vec<String>,
    #[serde(rename = "activeViewportId")]
    active_viewport_id: Option<String>,
}

#[wasm_bindgen]
impl ViewportManager {
    /// Creates a new ViewportManager instance
    #[wasm_bindgen(constructor)]
    pub fn new() -> ViewportManager {
        ViewportManager {
            viewports: HashMap::new(),
            active_viewport_id: None,
        }
    }

    /// Create a new viewport with the given ID
    #[wasm_bindgen]
    pub fn create_viewport(&mut self, viewport_id: &str, total_items: usize, max_per_face: usize) -> Result<JsValue, JsValue> {
        // Check if the viewport ID already exists
        if self.viewports.contains_key(viewport_id) {
            return Err(JsValue::from_str(&format!("Viewport with ID '{}' already exists", viewport_id)));
        }

        // Create a new viewport
        let viewport = match ViewportRotation::new(total_items, max_per_face) {
            Ok(v) => v,
            Err(e) => return Err(JsValue::from_str(&e)),
        };

        // Add the viewport to the map
        self.viewports.insert(viewport_id.to_string(), viewport);

        // Set as active if it's the first one
        if self.active_viewport_id.is_none() {
            self.active_viewport_id = Some(viewport_id.to_string());
        }

        // Return the new viewport's state
        self.get_viewport_state(viewport_id)
    }

    /// Set the active viewport
    #[wasm_bindgen]
    pub fn set_active_viewport(&mut self, viewport_id: &str) -> Result<JsValue, JsValue> {
        if !self.viewports.contains_key(viewport_id) {
            return Err(JsValue::from_str(&format!("Viewport with ID '{}' does not exist", viewport_id)));
        }

        self.active_viewport_id = Some(viewport_id.to_string());
        self.get_viewport_state(viewport_id)
    }

    /// Get the active viewport ID
    #[wasm_bindgen]
    pub fn get_active_viewport_id(&self) -> Option<String> {
        self.active_viewport_id.clone()
    }

    /// List all viewport IDs
    #[wasm_bindgen]
    pub fn list_viewports(&self) -> Result<JsValue, JsValue> {
        let response = ViewportListResponse {
            viewport_ids: self.viewports.keys().cloned().collect(),
            active_viewport_id: self.active_viewport_id.clone(),
        };

        serde_wasm_bindgen::to_value(&response).map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Get state for a specific viewport
    #[wasm_bindgen]
    pub fn get_viewport_state(&self, viewport_id: &str) -> Result<JsValue, JsValue> {
        let viewport = self.get_viewport(viewport_id)?;

        let response = ViewportResponse {
            viewport_id: viewport_id.to_string(),
            state: viewport.get_state(),
        };

        serde_wasm_bindgen::to_value(&response).map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Remove a viewport
    #[wasm_bindgen]
    pub fn remove_viewport(&mut self, viewport_id: &str) -> Result<JsValue, JsValue> {
        if !self.viewports.contains_key(viewport_id) {
            return Err(JsValue::from_str(&format!("Viewport with ID '{}' does not exist", viewport_id)));
        }

        // Remove the viewport
        self.viewports.remove(viewport_id);

        // If we removed the active viewport, select another one if available
        if self.active_viewport_id.as_deref() == Some(viewport_id) {
            self.active_viewport_id = self.viewports.keys().next().cloned();
        }

        self.list_viewports()
    }

    /// Rotate a specific viewport to the next face
    #[wasm_bindgen]
    pub fn rotate_viewport_next(&mut self, viewport_id: &str) -> Result<JsValue, JsValue> {
        let viewport = self.get_viewport_mut(viewport_id)?;

        let state = viewport.rotate_next();

        let response = ViewportResponse {
            viewport_id: viewport_id.to_string(),
            state,
        };

        serde_wasm_bindgen::to_value(&response).map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Move to the next item in a specific viewport
    #[wasm_bindgen]
    pub fn viewport_next_item(&mut self, viewport_id: &str) -> Result<JsValue, JsValue> {
        let viewport = self.get_viewport_mut(viewport_id)?;

        let state = viewport.next_item();

        let response = ViewportResponse {
            viewport_id: viewport_id.to_string(),
            state,
        };

        serde_wasm_bindgen::to_value(&response).map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Get the current item index in the active viewport
    #[wasm_bindgen]
    pub fn get_current_item_index(&self) -> Result<JsValue, JsValue> {
        let viewport_id = self.get_active_id()?;
        self.get_viewport_current_item_index(viewport_id)
    }

    /// Get the current item index in a specific viewport
    #[wasm_bindgen]
    pub fn get_viewport_current_item_index(&self, viewport_id: &str) -> Result<JsValue, JsValue> {
        let viewport = self.get_viewport(viewport_id)?;

        match viewport.get_current_item_index() {
            Some(idx) => Ok(JsValue::from_f64(idx as f64)),
            None => Ok(JsValue::null()),
        }
    }

    /// Set the rotation axis for a specific viewport
    #[wasm_bindgen]
    pub fn set_viewport_rotation_axis(&mut self, viewport_id: &str, axis_json: &str) -> Result<JsValue, JsValue> {
        let viewport = self.get_viewport_mut(viewport_id)?;

        let axis: RotationAxis = serde_json::from_str(axis_json).map_err(|e| JsValue::from_str(&format!("Failed to parse rotation axis: {}", e)))?;

        let state = viewport.set_rotation_axis(axis);

        let response = ViewportResponse {
            viewport_id: viewport_id.to_string(),
            state,
        };

        serde_wasm_bindgen::to_value(&response).map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Get all item indices for a specific face in the active viewport
    #[wasm_bindgen]
    pub fn get_face_indices(&self, face_index: usize) -> Result<JsValue, JsValue> {
        let viewport_id = self.get_active_id()?;
        self.get_viewport_face_indices(viewport_id, face_index)
    }

    /// Get all item indices for a specific face in a specific viewport
    #[wasm_bindgen]
    pub fn get_viewport_face_indices(&self, viewport_id: &str, face_index: usize) -> Result<JsValue, JsValue> {
        let viewport = self.get_viewport(viewport_id)?;

        if face_index >= 6 {
            // Hardcoded as 6 faces in a cube
            return Err(JsValue::from_str("Face index out of bounds"));
        }

        serde_wasm_bindgen::to_value(&viewport.face_indices[face_index]).map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }
}

// Helper methods for ViewportManager
impl ViewportManager {
    /// Get a reference to a viewport by ID
    fn get_viewport(&self, viewport_id: &str) -> Result<&ViewportRotation, JsValue> {
        self.viewports
            .get(viewport_id)
            .ok_or_else(|| JsValue::from_str(&format!("Viewport with ID '{}' does not exist", viewport_id)))
    }

    /// Get a mutable reference to a viewport by ID
    fn get_viewport_mut(&mut self, viewport_id: &str) -> Result<&mut ViewportRotation, JsValue> {
        self.viewports
            .get_mut(viewport_id)
            .ok_or_else(|| JsValue::from_str(&format!("Viewport with ID '{}' does not exist", viewport_id)))
    }

    /// Get the active viewport ID or return an error
    fn get_active_id(&self) -> Result<&str, JsValue> {
        self.active_viewport_id.as_deref().ok_or_else(|| JsValue::from_str("No active viewport selected"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::*;

    wasm_bindgen_test_configure!(run_in_browser);

    // Helper function to extract ViewportState from JsValue response
    //     fn extract_state_from_response(js_value: &wasm_bindgen::JsValue) -> serde_json::Value {
    //         let value: serde_json::Value = serde_wasm_bindgen::from_value(js_value.clone()).unwrap();
    //         value["state"].clone()
    //     }
    //
    #[test]
    fn test_viewport_rotation_initialization() {
        // Test with valid parameters
        let total_items = 24;
        let max_per_face = 3;

        let viewport = ViewportRotation::new(total_items, max_per_face).unwrap();

        // Verify initial state
        assert_eq!(viewport.total_items, total_items);
        assert_eq!(viewport.max_per_face, max_per_face);
        assert_eq!(viewport.current_face, 0);
        assert_eq!(viewport.current_item_index, 0);
        assert_eq!(viewport.current_axis, RotationAxis::XAxis);
        assert_eq!(viewport.cycle_position, 0);

        // Check that only active faces are filled (0, 5, 2, 4 for X-axis)
        let active_faces = vec![0, 5, 2, 4];
        for face in 0..6 {
            if active_faces.contains(&face) {
                assert!(!viewport.face_indices[face].is_empty(), "Face {face} should have items");
                assert!(viewport.face_indices[face].len() <= max_per_face);
            } else {
                assert!(viewport.face_indices[face].is_empty(), "Face {face} should be empty");
            }
        }

        // Test with invalid parameters
        let invalid_viewport = ViewportRotation::new(24, 0);
        assert!(invalid_viewport.is_err());

        let invalid_viewport = ViewportRotation::new(24, 7);
        assert!(invalid_viewport.is_err());
    }

    #[test]
    fn test_viewport_rotation_next_item() {
        let total_items = 10;
        let max_per_face = 3;

        let mut viewport = ViewportRotation::new(total_items, max_per_face).unwrap();

        // Initial state should have current_item_index = 0
        assert_eq!(viewport.current_item_index, 0);

        // Get initial item
        let initial_item = viewport.get_current_item_index().unwrap();

        // Move to next item
        let state = viewport.next_item();

        // Current item index should be 1
        assert_eq!(viewport.current_item_index, 1);
        assert_eq!(state.current_item_index, 1);

        // Get new current item
        let next_item = viewport.get_current_item_index().unwrap();

        // Should be different than initial item
        assert_ne!(initial_item, next_item);

        // Move to next item again (should wrap around to 0 since we have 3 items per face)
        viewport.next_item();
        viewport.next_item();

        // Should wrap back to 0
        assert_eq!(viewport.current_item_index, 0);
    }

    #[test]
    fn test_viewport_rotation_rotate_next() {
        let total_items = 24;
        let max_per_face = 3;

        let mut viewport = ViewportRotation::new(total_items, max_per_face).unwrap();

        // Initial state should have current_face = 0 (front)
        assert_eq!(viewport.current_face, 0);
        assert_eq!(viewport.cycle_position, 0);

        // Rotate to next face (should be top for X-axis rotation)
        let state = viewport.rotate_next();

        // Check updated state
        assert_eq!(viewport.current_face, 5); // Top face
        assert_eq!(viewport.cycle_position, 1);
        assert_eq!(viewport.current_item_index, 0); // Reset to first item

        assert_eq!(state.current_face, 5);
        assert_eq!(state.cycle_position, 1);
        assert_eq!(state.current_item_index, 0);

        // Rotate again to move to back face
        viewport.rotate_next();
        assert_eq!(viewport.current_face, 2); // Back face
        assert_eq!(viewport.cycle_position, 2);

        // Rotate again to move to bottom face
        viewport.rotate_next();
        assert_eq!(viewport.current_face, 4); // Bottom face
        assert_eq!(viewport.cycle_position, 3);

        // Rotate once more to complete the cycle
        viewport.rotate_next();
        assert_eq!(viewport.current_face, 0); // Back to front face
        assert_eq!(viewport.cycle_position, 0);
    }

    //     #[test]
    //     fn test_viewport_rotation_set_rotation_axis() {
    //         let total_items = 24;
    //         let max_per_face = 3;
    //
    //         let mut viewport = ViewportRotation::new(total_items, max_per_face).unwrap();
    //
    //         // Initial state should have X-axis rotation
    //         assert_eq!(viewport.current_axis, RotationAxis::XAxis);
    //
    //         // Change to Y-axis rotation
    //         let state = viewport.set_rotation_axis(RotationAxis::YAxis);
    //
    //         // Check updated state
    //         assert_eq!(viewport.current_axis, RotationAxis::YAxis);
    //         assert_eq!(viewport.current_face, 0); // Front face is still front face
    //         assert_eq!(viewport.cycle_position, 0); // Reset cycle position
    //         assert_eq!(viewport.current_item_index, 0); // Reset to first item
    //
    //         assert_eq!(state.current_axis, RotationAxis::YAxis);
    //
    //         // Rotate to next face (should be right for Y-axis rotation)
    //         viewport.rotate_next();
    //         assert_eq!(viewport.current_face, 3); // Right face
    //
    //         // Set back to X-axis rotation (should reset cycle position)
    //         viewport.set_rotation_axis(RotationAxis::XAxis);
    //         assert_eq!(viewport.current_face, 0); // Front face
    //         assert_eq!(viewport.cycle_position, 0);
    //
    //         // Setting to same axis should not change anything
    //         let current_face = viewport.current_face;
    //         let current_position = viewport.cycle_position;
    //         viewport.set_rotation_axis(RotationAxis::XAxis);
    //         assert_eq!(viewport.current_face, current_face);
    //         assert_eq!(viewport.cycle_position, current_position);
    //     }
    //
    //     #[test]
    //     fn test_viewport_rotation_get_current_item_index() {
    //         let total_items = 10;
    //         let max_per_face = 3;
    //
    //         let mut viewport = ViewportRotation::new(total_items, max_per_face).unwrap();
    //
    //         // Get initial item index
    //         let initial_item = viewport.get_current_item_index().unwrap();
    //         assert_eq!(initial_item, 0); // Should start with item 0
    //
    //         // Move to next item
    //         viewport.next_item();
    //         let next_item = viewport.get_current_item_index().unwrap();
    //         assert_eq!(next_item, 1); // Should be item 1
    //
    //         // Create a viewport with no items
    //         let empty_viewport = ViewportRotation {
    //             total_items: 0,
    //             face_indices: vec![Vec::new(); 6],
    //             max_per_face: 3,
    //             current_face: 0,
    //             current_item_index: 0,
    //             current_axis: RotationAxis::XAxis,
    //             rotation_cycles: {
    //                 let mut map = HashMap::new();
    //                 map.insert(RotationAxis::XAxis, vec![0, 5, 2, 4]);
    //                 map.insert(RotationAxis::YAxis, vec![0, 3, 2, 1]);
    //                 map
    //             },
    //             cycle_position: 0,
    //             next_index: 0,
    //         };
    //
    //         // Should return None for empty face
    //         assert_eq!(empty_viewport.get_current_item_index(), None);
    //     }
    //
    //     #[test]
    //     fn test_viewport_rotation_cycle_all_faces() {
    //         let total_items = 24;
    //         let max_per_face = 2; // Small number to ensure we need to cycle
    //
    //         let mut viewport = ViewportRotation::new(total_items, max_per_face).unwrap();
    //
    //         // Initial state - first 8 items should be distributed to active X-axis faces (0, 5, 2, 4)
    //         // with 2 items per face
    //         assert_eq!(viewport.next_index, 8);
    //
    //         // Check face 0 (front)
    //         assert_eq!(viewport.face_indices[0], vec![0, 1]);
    //
    //         // Check face 5 (top)
    //         assert_eq!(viewport.face_indices[5], vec![2, 3]);
    //
    //         // Check face 2 (back)
    //         assert_eq!(viewport.face_indices[2], vec![4, 5]);
    //
    //         // Check face 4 (bottom)
    //         assert_eq!(viewport.face_indices[4], vec![6, 7]);
    //
    //         // Rotate through a complete cycle
    //         viewport.rotate_next(); // To top (face 5)
    //         viewport.rotate_next(); // To back (face 2)
    //         viewport.rotate_next(); // To bottom (face 4)
    //         viewport.rotate_next(); // Back to front (face 0) - this should trigger cycling
    //
    //         // After cycling, the next 8 items (8-15) should replace the first 8
    //         assert_eq!(viewport.next_index, 16);
    //
    //         // Check face 0 (front) - should have items 8, 9
    //         assert_eq!(viewport.face_indices[0], vec![8, 9]);
    //
    //         // Check face 5 (top) - should have items 10, 11
    //         assert_eq!(viewport.face_indices[5], vec![10, 11]);
    //
    //         // Check face 2 (back) - should have items 12, 13
    //         assert_eq!(viewport.face_indices[2], vec![12, 13]);
    //
    //         // Check face 4 (bottom) - should have items 14, 15
    //         assert_eq!(viewport.face_indices[4], vec![14, 15]);
    //
    //         // Rotate through another complete cycle
    //         viewport.rotate_next(); // To top (face 5)
    //         viewport.rotate_next(); // To back (face 2)
    //         viewport.rotate_next(); // To bottom (face 4)
    //         viewport.rotate_next(); // Back to front (face 0) - this should trigger cycling again
    //
    //         // After cycling, the next 8 items (16-23) should replace the previous 8
    //         assert_eq!(viewport.next_index, 24); // All items used
    //
    //         // Check face 0 (front) - should have items 16, 17
    //         assert_eq!(viewport.face_indices[0], vec![16, 17]);
    //
    //         // Check face 5 (top) - should have items 18, 19
    //         assert_eq!(viewport.face_indices[5], vec![18, 19]);
    //
    //         // Check face 2 (back) - should have items 20, 21
    //         assert_eq!(viewport.face_indices[2], vec![20, 21]);
    //
    //         // Check face 4 (bottom) - should have items 22, 23
    //         assert_eq!(viewport.face_indices[4], vec![22, 23]);
    //
    //         // One more cycle - should not change anything since all items are used
    //         viewport.rotate_next(); // To top (face 5)
    //         viewport.rotate_next(); // To back (face 2)
    //         viewport.rotate_next(); // To bottom (face 4)
    //         viewport.rotate_next(); // Back to front (face 0)
    //
    //         // Should remain at 24 (no more items to add)
    //         assert_eq!(viewport.next_index, 24);
    //
    //         // Faces should remain unchanged
    //         assert_eq!(viewport.face_indices[0], vec![16, 17]);
    //     }
    //
    //     #[test]
    //     fn test_viewport_rotation_with_uneven_distribution() {
    //         let total_items = 7; // Prime number to ensure uneven distribution
    //         let max_per_face = 2;
    //
    //         let mut viewport = ViewportRotation::new(total_items, max_per_face).unwrap();
    //
    //         // Initial state - first 7 items should be distributed to active X-axis faces (0, 5, 2, 4)
    //         // Face 0 and 5 should have 2 items each, face 2 should have 2 items, and face 4 should have 1 item
    //         assert_eq!(viewport.face_indices[0], vec![0, 1]);
    //         assert_eq!(viewport.face_indices[5], vec![2, 3]);
    //         assert_eq!(viewport.face_indices[2], vec![4, 5]);
    //         assert_eq!(viewport.face_indices[4], vec![6]); // Only 1 item left
    //
    //         // Rotate and check that item index resets
    //         viewport.rotate_next(); // To top (face 5)
    //         assert_eq!(viewport.current_face, 5);
    //         assert_eq!(viewport.current_item_index, 0);
    //
    //         // Move to next item in current face
    //         viewport.next_item();
    //         assert_eq!(viewport.current_item_index, 1);
    //
    //         // Rotate to next face and check item index reset
    //         viewport.rotate_next(); // To back (face 2)
    //         assert_eq!(viewport.current_face, 2);
    //         assert_eq!(viewport.current_item_index, 0);
    //
    //         // Rotate to face with only one item
    //         viewport.rotate_next(); // To bottom (face 4)
    //         assert_eq!(viewport.current_face, 4);
    //         assert_eq!(viewport.current_item_index, 0);
    //
    //         // Try to move to next item (should stay at 0 since there's only 1 item)
    //         viewport.next_item();
    //         assert_eq!(viewport.current_item_index, 0); // Should not change
    //     }
    //
    //     #[test]
    //     fn test_viewport_rotation_get_active_cycle_faces() {
    //         let viewport = ViewportRotation::new(10, 2).unwrap();
    //
    //         // For X-axis, should return faces 0, 5, 2, 4
    //         let x_axis_faces = viewport.get_active_cycle_faces();
    //         assert_eq!(x_axis_faces, vec![0, 5, 2, 4]);
    //
    //         // Create a viewport with Y-axis rotation
    //         let mut viewport = ViewportRotation::new(10, 2).unwrap();
    //         viewport.set_rotation_axis(RotationAxis::YAxis);
    //
    //         // For Y-axis, should return faces 0, 3, 2, 1
    //         let y_axis_faces = viewport.get_active_cycle_faces();
    //         assert_eq!(y_axis_faces, vec![0, 3, 2, 1]);
    //     }
    //
    //     #[test]
    //     fn test_viewport_rotation_fill_face() {
    //         let mut viewport = ViewportRotation {
    //             total_items: 10,
    //             face_indices: vec![Vec::new(); 6],
    //             max_per_face: 3,
    //             current_face: 0,
    //             current_item_index: 0,
    //             current_axis: RotationAxis::XAxis,
    //             rotation_cycles: {
    //                 let mut map = HashMap::new();
    //                 map.insert(RotationAxis::XAxis, vec![0, 5, 2, 4]);
    //                 map.insert(RotationAxis::YAxis, vec![0, 3, 2, 1]);
    //                 map
    //             },
    //             cycle_position: 0,
    //             next_index: 0,
    //         };
    //
    //         // Fill face 0
    //         viewport.fill_face(0);
    //
    //         // Face 0 should have 3 items (max_per_face)
    //         assert_eq!(viewport.face_indices[0], vec![0, 1, 2]);
    //         assert_eq!(viewport.next_index, 3);
    //
    //         // Fill face 1
    //         viewport.fill_face(1);
    //
    //         // Face 1 should have 3 items
    //         assert_eq!(viewport.face_indices[1], vec![3, 4, 5]);
    //         assert_eq!(viewport.next_index, 6);
    //
    //         // Fill face 2 (only 4 items left)
    //         viewport.fill_face(2);
    //
    //         // Face 2 should have 3 items
    //         assert_eq!(viewport.face_indices[2], vec![6, 7, 8]);
    //         assert_eq!(viewport.next_index, 9);
    //
    //         // Fill face 3 (only 1 item left)
    //         viewport.fill_face(3);
    //
    //         // Face 3 should have 1 item
    //         assert_eq!(viewport.face_indices[3], vec![9]);
    //         assert_eq!(viewport.next_index, 10); // All items used
    //
    //         // Try to fill face 4 (no items left)
    //         viewport.fill_face(4);
    //
    //         // Face 4 should be empty
    //         assert_eq!(viewport.face_indices[4], Vec::<usize>::new());
    //         assert_eq!(viewport.next_index, 10); // No change
    //     }
    //
    //     // Tests for ViewportManager
    //
    //     #[wasm_bindgen_test]
    //     fn test_viewport_manager_creation() {
    //         let manager = ViewportManager::new();
    //
    //         // Should start with no viewports
    //         let viewports_result = manager.list_viewports().unwrap();
    //         let viewports: serde_json::Value = serde_wasm_bindgen::from_value(viewports_result).unwrap();
    //
    //         assert_eq!(viewports["viewportIds"].as_array().unwrap().len(), 0);
    //         assert!(viewports["activeViewportId"].is_null());
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_viewport_manager_create_viewport() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Create a viewport
    //         let result = manager.create_viewport("viewport1", 24, 3).unwrap();
    //         let state = extract_state_from_response(&result);
    //
    //         // Check that viewport was created with correct settings
    //         assert_eq!(state["currFace"], 0);
    //         assert_eq!(state["currIdx"], 0);
    //         assert_eq!(state["currRotationAxis"], "X-axis");
    //
    //         // Check that it's set as active
    //         assert_eq!(manager.get_active_viewport_id().unwrap(), "viewport1");
    //
    //         // Create another viewport
    //         manager.create_viewport("viewport2", 10, 2).unwrap();
    //
    //         // First viewport should still be active
    //         assert_eq!(manager.get_active_viewport_id().unwrap(), "viewport1");
    //
    //         // List viewports
    //         let viewports_result = manager.list_viewports().unwrap();
    //         let viewports: serde_json::Value = serde_wasm_bindgen::from_value(viewports_result).unwrap();
    //
    //         let viewport_ids = viewports["viewportIds"].as_array().unwrap();
    //         assert_eq!(viewport_ids.len(), 2);
    //         assert!(viewport_ids.iter().any(|id| id.as_str().unwrap() == "viewport1"));
    //         assert!(viewport_ids.iter().any(|id| id.as_str().unwrap() == "viewport2"));
    //
    //         // Try to create a viewport with existing ID
    //         let duplicate_result = manager.create_viewport("viewport1", 5, 1);
    //         assert!(duplicate_result.is_err());
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_viewport_manager_set_active_viewport() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Create two viewports
    //         manager.create_viewport("viewport1", 24, 3).unwrap();
    //         manager.create_viewport("viewport2", 10, 2).unwrap();
    //
    //         // First viewport should be active
    //         assert_eq!(manager.get_active_viewport_id().unwrap(), "viewport1");
    //
    //         // Set second viewport as active
    //         let result = manager.set_active_viewport("viewport2").unwrap();
    //         let state = extract_state_from_response(&result);
    //
    //         // Check that second viewport is now active
    //         assert_eq!(manager.get_active_viewport_id().unwrap(), "viewport2");
    //
    //         // Check that returned state is for viewport2
    //         assert_eq!(state["faceIndices"][0].as_array().unwrap().len(), 2); // max_per_face = 2
    //
    //         // Try to set a non-existent viewport as active
    //         let invalid_result = manager.set_active_viewport("nonexistent");
    //         assert!(invalid_result.is_err());
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_viewport_manager_remove_viewport() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Create two viewports
    //         manager.create_viewport("viewport1", 24, 3).unwrap();
    //         manager.create_viewport("viewport2", 10, 2).unwrap();
    //
    //         // Remove viewport1
    //         let result = manager.remove_viewport("viewport1").unwrap();
    //         let viewports: serde_json::Value = serde_wasm_bindgen::from_value(result).unwrap();
    //
    //         // Should have one viewport left
    //         let viewport_ids = viewports["viewportIds"].as_array().unwrap();
    //         assert_eq!(viewport_ids.len(), 1);
    //         assert_eq!(viewport_ids[0].as_str().unwrap(), "viewport2");
    //
    //         // viewport2 should now be active
    //         assert_eq!(viewports["activeViewportId"].as_str().unwrap(), "viewport2");
    //         assert_eq!(manager.get_active_viewport_id().unwrap(), "viewport2");
    //
    //         // Remove viewport2
    //         manager.remove_viewport("viewport2").unwrap();
    //
    //         // No viewports left, active viewport should be None
    //         assert!(manager.get_active_viewport_id().is_none());
    //
    //         // Try to remove a non-existent viewport
    //         let invalid_result = manager.remove_viewport("nonexistent");
    //         assert!(invalid_result.is_err());
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_viewport_manager_rotation_operations() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Create a viewport
    //         manager.create_viewport("viewport1", 24, 3).unwrap();
    //
    //         // Rotate to next face
    //         let result = manager.rotate_next().unwrap();
    //         let state = extract_state_from_response(&result);
    //
    //         // Should be on face 5 (top) for X-axis rotation
    //         assert_eq!(state["currFace"], 5);
    //
    //         // Rotate with specific viewport ID
    //         let result = manager.rotate_viewport_next("viewport1").unwrap();
    //         let state = extract_state_from_response(&result);
    //
    //         // Should be on face 2 (back)
    //         assert_eq!(state["currFace"], 2);
    //
    //         // Try with invalid viewport ID
    //         let invalid_result = manager.rotate_viewport_next("nonexistent");
    //         assert!(invalid_result.is_err());
    //
    //         // Create another viewport and set it as active
    //         manager.create_viewport("viewport2", 10, 2).unwrap();
    //         manager.set_active_viewport("viewport2").unwrap();
    //
    //         // Rotate active viewport (should be viewport2)
    //         let result = manager.rotate_next().unwrap();
    //         let state = extract_state_from_response(&result);
    //
    //         // Should still be on face 0 (default) for viewport2
    //         assert_eq!(state["currFace"], 5);
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_viewport_manager_next_item() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Create a viewport
    //         manager.create_viewport("viewport1", 24, 3).unwrap();
    //
    //         // Move to next item
    //         let result = manager.next_item().unwrap();
    //         let state = extract_state_from_response(&result);
    //
    //         // Should be on item 1
    //         assert_eq!(state["currIdx"], 1);
    //
    //         // Move to next item with specific viewport ID
    //         let result = manager.viewport_next_item("viewport1").unwrap();
    //         let state = extract_state_from_response(&result);
    //
    //         // Should be on item 2
    //         assert_eq!(state["currIdx"], 2);
    //
    //         // Try with invalid viewport ID
    //         let invalid_result = manager.viewport_next_item("nonexistent");
    //         assert!(invalid_result.is_err());
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_viewport_manager_get_current_item_index() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Create a viewport
    //         manager.create_viewport("viewport1", 24, 3).unwrap();
    //
    //         // Get current item index
    //         let result = manager.get_current_item_index().unwrap();
    //         let index: f64 = result.as_f64().unwrap();
    //
    //         // Should be 0
    //         assert_eq!(index, 0.0);
    //
    //         // Move to next item
    //         manager.next_item().unwrap();
    //
    //         // Get current item index with specific viewport ID
    //         let result = manager.get_viewport_current_item_index("viewport1").unwrap();
    //         let index: f64 = result.as_f64().unwrap();
    //
    //         // Should be 1
    //         assert_eq!(index, 1.0);
    //
    //         // Try with invalid viewport ID
    //         let invalid_result = manager.get_viewport_current_item_index("nonexistent");
    //         assert!(invalid_result.is_err());
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_viewport_manager_set_rotation_axis() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Create a viewport
    //         manager.create_viewport("viewport1", 24, 3).unwrap();
    //
    //         // Set rotation axis to Y
    //         let axis_json = r#""Y-axis""#; // JSON string representing Y-axis
    //         let result = manager.set_rotation_axis(axis_json).unwrap();
    //         let state = extract_state_from_response(&result);
    //
    //         // Should be Y-axis
    //         assert_eq!(state["currRotationAxis"], "Y-axis");
    //
    //         // Set rotation axis with specific viewport ID
    //         let axis_json = r#""X-axis""#; // JSON string representing X-axis
    //         let result = manager.set_viewport_rotation_axis("viewport1", axis_json).unwrap();
    //         let state = extract_state_from_response(&result);
    //
    //         // Should be X-axis
    //         assert_eq!(state["currRotationAxis"], "X-axis");
    //
    //         // Try with invalid JSON
    //         let invalid_json = r#"invalid"#;
    //         let invalid_result = manager.set_rotation_axis(invalid_json);
    //         assert!(invalid_result.is_err());
    //
    //         // Try with invalid viewport ID
    //         let axis_json = r#""X-axis""#;
    //         let invalid_result = manager.set_viewport_rotation_axis("nonexistent", axis_json);
    //         assert!(invalid_result.is_err());
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_viewport_manager_get_face_indices() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Create a viewport with total_items = 12, max_per_face = 2
    //         manager.create_viewport("viewport1", 12, 2).unwrap();
    //
    //         // Get face indices for face 0
    //         let result = manager.get_face_indices(0).unwrap();
    //         let indices: Vec<usize> = serde_wasm_bindgen::from_value(result).unwrap();
    //
    //         // Face 0 should have 2 items (0, 1)
    //         assert_eq!(indices, vec![0, 1]);
    //
    //         // Get face indices for face 5
    //         let result = manager.get_face_indices(5).unwrap();
    //         let indices: Vec<usize> = serde_wasm_bindgen::from_value(result).unwrap();
    //
    //         // Face 5 should have 2 items (2, 3)
    //         assert_eq!(indices, vec![2, 3]);
    //
    //         // Get face indices with specific viewport ID
    //         let result = manager.get_viewport_face_indices("viewport1", 2).unwrap();
    //         let indices: Vec<usize> = serde_wasm_bindgen::from_value(result).unwrap();
    //
    //         // Face 2 should have 2 items (4, 5)
    //         assert_eq!(indices, vec![4, 5]);
    //
    //         // Try with invalid face index
    //         let invalid_result = manager.get_face_indices(6);
    //         assert!(invalid_result.is_err());
    //
    //         // Try with invalid viewport ID
    //         let invalid_result = manager.get_viewport_face_indices("nonexistent", 0);
    //         assert!(invalid_result.is_err());
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_viewport_manager_with_no_active_viewport() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Try operations with no active viewport
    //         let rotate_result = manager.rotate_next();
    //         assert!(rotate_result.is_err());
    //
    //         let next_item_result = manager.next_item();
    //         assert!(next_item_result.is_err());
    //
    //         let get_index_result = manager.get_current_item_index();
    //         assert!(get_index_result.is_err());
    //
    //         let axis_json = r#""X-axis""#;
    //         let set_axis_result = manager.set_rotation_axis(axis_json);
    //         assert!(set_axis_result.is_err());
    //
    //         let get_face_result = manager.get_face_indices(0);
    //         assert!(get_face_result.is_err());
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_integration_rotate_and_cycle() {
    //         // Test rotating through multiple viewports with different configurations
    //         let mut manager = ViewportManager::new();
    //
    //         // Create a viewport with small count to test cycling
    //         manager.create_viewport("viewport1", 8, 1).unwrap();
    //
    //         // Faces 0, 5, 2, 4 (X-axis rotation) should each have 1 item
    //         assert_eq!(manager.get_viewport_face_indices("viewport1", 0).unwrap(), serde_wasm_bindgen::to_value(&vec![0]).unwrap());
    //         assert_eq!(manager.get_viewport_face_indices("viewport1", 5).unwrap(), serde_wasm_bindgen::to_value(&vec![1]).unwrap());
    //         assert_eq!(manager.get_viewport_face_indices("viewport1", 2).unwrap(), serde_wasm_bindgen::to_value(&vec![2]).unwrap());
    //         assert_eq!(manager.get_viewport_face_indices("viewport1", 4).unwrap(), serde_wasm_bindgen::to_value(&vec![3]).unwrap());
    //
    //         // Empty faces for Y-axis rotation faces not used in X-axis
    //         let empty_faces_result = manager.get_viewport_face_indices("viewport1", 1).unwrap();
    //         let empty_faces: Vec<usize> = serde_wasm_bindgen::from_value(empty_faces_result).unwrap();
    //         assert!(empty_faces.is_empty());
    //
    //         // Rotate through a full cycle
    //         manager.rotate_next().unwrap(); // To top (face 5)
    //         manager.rotate_next().unwrap(); // To back (face 2)
    //         manager.rotate_next().unwrap(); // To bottom (face 4)
    //         manager.rotate_next().unwrap(); // Back to front (face 0) - should cycle
    //
    //         // After cycling, should have new items
    //         assert_eq!(manager.get_viewport_face_indices("viewport1", 0).unwrap(), serde_wasm_bindgen::to_value(&vec![4]).unwrap());
    //         assert_eq!(manager.get_viewport_face_indices("viewport1", 5).unwrap(), serde_wasm_bindgen::to_value(&vec![5]).unwrap());
    //         assert_eq!(manager.get_viewport_face_indices("viewport1", 2).unwrap(), serde_wasm_bindgen::to_value(&vec![6]).unwrap());
    //         assert_eq!(manager.get_viewport_face_indices("viewport1", 4).unwrap(), serde_wasm_bindgen::to_value(&vec![7]).unwrap());
    //
    //         // One more cycle - no more items should be available
    //         manager.rotate_next().unwrap(); // To top (face 5)
    //         manager.rotate_next().unwrap(); // To back (face 2)
    //         manager.rotate_next().unwrap(); // To bottom (face 4)
    //         manager.rotate_next().unwrap(); // Back to front (face 0) - no more items to cycle
    //
    //         // Should still have the same items (no change)
    //         assert_eq!(manager.get_viewport_face_indices("viewport1", 0).unwrap(), serde_wasm_bindgen::to_value(&vec![4]).unwrap());
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_integration_change_rotation_axis() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Create a viewport
    //         manager.create_viewport("viewport1", 12, 2).unwrap();
    //
    //         // Initially should have X-axis rotation with items in faces 0, 5, 2, 4
    //         assert_eq!(
    //             manager.get_viewport_face_indices("viewport1", 0).unwrap(),
    //             serde_wasm_bindgen::to_value(&vec![0, 1]).unwrap()
    //         );
    //         assert_eq!(
    //             manager.get_viewport_face_indices("viewport1", 5).unwrap(),
    //             serde_wasm_bindgen::to_value(&vec![2, 3]).unwrap()
    //         );
    //         assert_eq!(
    //             manager.get_viewport_face_indices("viewport1", 2).unwrap(),
    //             serde_wasm_bindgen::to_value(&vec![4, 5]).unwrap()
    //         );
    //         assert_eq!(
    //             manager.get_viewport_face_indices("viewport1", 4).unwrap(),
    //             serde_wasm_bindgen::to_value(&vec![6, 7]).unwrap()
    //         );
    //
    //         // Empty for Y-axis only faces
    //         let empty_faces_result = manager.get_viewport_face_indices("viewport1", 1).unwrap();
    //         let empty_faces: Vec<usize> = serde_wasm_bindgen::from_value(empty_faces_result).unwrap();
    //         assert!(empty_faces.is_empty());
    //
    //         // Switch to Y-axis rotation
    //         let axis_json = r#""Y-axis""#;
    //         manager.set_rotation_axis(axis_json).unwrap();
    //
    //         // Should reset to front face
    //         let current_state_result = manager.get_viewport_state("viewport1").unwrap();
    //         let current_state = extract_state_from_response(&current_state_result);
    //         assert_eq!(current_state["currFace"], 0);
    //
    //         // Rotate through Y-axis cycle
    //         manager.rotate_next().unwrap(); // To right (face 3)
    //
    //         // Check that we're on the right face
    //         let current_state_result = manager.get_viewport_state("viewport1").unwrap();
    //         let current_state = extract_state_from_response(&current_state_result);
    //         assert_eq!(current_state["currFace"], 3);
    //
    //         // Check face 3 (should be empty since we haven't cycled)
    //         let face3_result = manager.get_viewport_face_indices("viewport1", 3).unwrap();
    //         let face3_indices: Vec<usize> = serde_wasm_bindgen::from_value(face3_result).unwrap();
    //         assert!(face3_indices.is_empty());
    //
    //         // Complete Y-axis rotation cycle
    //         manager.rotate_next().unwrap(); // To back (face 2)
    //         manager.rotate_next().unwrap(); // To left (face 1)
    //         manager.rotate_next().unwrap(); // Back to front (face 0) - should trigger cycle for Y-axis
    //
    //         // After cycling, Y-axis faces should have items
    //         assert_eq!(
    //             manager.get_viewport_face_indices("viewport1", 0).unwrap(),
    //             serde_wasm_bindgen::to_value(&vec![0, 1]).unwrap()
    //         ); // Front still has original items
    //         assert_eq!(
    //             manager.get_viewport_face_indices("viewport1", 3).unwrap(),
    //             serde_wasm_bindgen::to_value(&vec![8, 9]).unwrap()
    //         ); // Right has new items
    //         assert_eq!(
    //             manager.get_viewport_face_indices("viewport1", 1).unwrap(),
    //             serde_wasm_bindgen::to_value(&vec![10, 11]).unwrap()
    //         ); // Left has new items
    //
    //         // Switch back to X-axis
    //         let axis_json = r#""X-axis""#;
    //         manager.set_rotation_axis(axis_json).unwrap();
    //
    //         // Should reset to front face
    //         let current_state_result = manager.get_viewport_state("viewport1").unwrap();
    //         let current_state = extract_state_from_response(&current_state_result);
    //         assert_eq!(current_state["currFace"], 0);
    //         assert_eq!(current_state["currRotationAxis"], "X-axis");
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_viewport_with_zero_items() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Create a viewport with 0 items
    //         manager.create_viewport("viewport1", 0, 3).unwrap();
    //
    //         // All faces should be empty
    //         for face in 0..6 {
    //             let face_result = manager.get_viewport_face_indices("viewport1", face).unwrap();
    //             let face_indices: Vec<usize> = serde_wasm_bindgen::from_value(face_result).unwrap();
    //             assert!(face_indices.is_empty());
    //         }
    //
    //         // Current item index should be null
    //         let current_index = manager.get_current_item_index().unwrap();
    //         assert!(current_index.is_null());
    //
    //         // Operations should still work but not change anything
    //         manager.rotate_next().unwrap();
    //         manager.next_item().unwrap();
    //
    //         // Still no current item
    //         let current_index = manager.get_current_item_index().unwrap();
    //         assert!(current_index.is_null());
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_viewport_with_exactly_enough_items() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Create a viewport with exactly enough items for one cycle (8 items for 4 faces with 2 per face)
    //         manager.create_viewport("viewport1", 8, 2).unwrap();
    //
    //         // Check initial distribution
    //         assert_eq!(
    //             manager.get_viewport_face_indices("viewport1", 0).unwrap(),
    //             serde_wasm_bindgen::to_value(&vec![0, 1]).unwrap()
    //         );
    //         assert_eq!(
    //             manager.get_viewport_face_indices("viewport1", 5).unwrap(),
    //             serde_wasm_bindgen::to_value(&vec![2, 3]).unwrap()
    //         );
    //         assert_eq!(
    //             manager.get_viewport_face_indices("viewport1", 2).unwrap(),
    //             serde_wasm_bindgen::to_value(&vec![4, 5]).unwrap()
    //         );
    //         assert_eq!(
    //             manager.get_viewport_face_indices("viewport1", 4).unwrap(),
    //             serde_wasm_bindgen::to_value(&vec![6, 7]).unwrap()
    //         );
    //
    //         // Rotate through a full cycle
    //         manager.rotate_next().unwrap(); // To top (face 5)
    //         manager.rotate_next().unwrap(); // To back (face 2)
    //         manager.rotate_next().unwrap(); // To bottom (face 4)
    //         manager.rotate_next().unwrap(); // Back to front (face 0) - should have no more items to cycle
    //
    //         // No change should happen since we're out of items
    //         assert_eq!(
    //             manager.get_viewport_face_indices("viewport1", 0).unwrap(),
    //             serde_wasm_bindgen::to_value(&vec![0, 1]).unwrap()
    //         );
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_viewport_state_serialization() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Create a viewport
    //         let result = manager.create_viewport("viewport1", 12, 2).unwrap();
    //
    //         // Parse the result to verify serialization format
    //         let state: serde_json::Value = serde_wasm_bindgen::from_value(result).unwrap();
    //
    //         // Check all expected fields are present
    //         assert!(state.get("viewportId").is_some());
    //         assert!(state.get("state").is_some());
    //
    //         let state_obj = state.get("state").unwrap();
    //         assert!(state_obj.get("faceIndices").is_some());
    //         assert!(state_obj.get("currFace").is_some());
    //         assert!(state_obj.get("currIdx").is_some());
    //         assert!(state_obj.get("currRotationAxis").is_some());
    //         assert!(state_obj.get("pendingCount").is_some());
    //         assert!(state_obj.get("cyclePosition").is_some());
    //
    //         // Check viewport ID
    //         assert_eq!(state["viewportId"], "viewport1");
    //
    //         // Check initial state values
    //         assert_eq!(state_obj["currFace"], 0);
    //         assert_eq!(state_obj["currIdx"], 0);
    //         assert_eq!(state_obj["currRotationAxis"], "X-axis");
    //         assert_eq!(state_obj["cyclePosition"], 0);
    //         assert_eq!(state_obj["pendingCount"], 4); // 12 total - 8 assigned to faces
    //
    //         // faceIndices should be a 2D array
    //         let face_indices = state_obj["faceIndices"].as_array().unwrap();
    //         assert_eq!(face_indices.len(), 6); // 6 faces
    //
    //         // Check first face indices
    //         let face0_indices = face_indices[0].as_array().unwrap();
    //         assert_eq!(face0_indices.len(), 2); // 2 items per face
    //         assert_eq!(face0_indices[0], 0);
    //         assert_eq!(face0_indices[1], 1);
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_viewport_list_serialization() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Create multiple viewports
    //         manager.create_viewport("viewport1", 12, 2).unwrap();
    //         manager.create_viewport("viewport2", 6, 1).unwrap();
    //
    //         // Get list of viewports
    //         let result = manager.list_viewports().unwrap();
    //
    //         // Parse the result to verify serialization format
    //         let list: serde_json::Value = serde_wasm_bindgen::from_value(result).unwrap();
    //
    //         // Check all expected fields are present
    //         assert!(list.get("viewportIds").is_some());
    //         assert!(list.get("activeViewportId").is_some());
    //
    //         // Check viewport IDs
    //         let viewport_ids = list["viewportIds"].as_array().unwrap();
    //         assert_eq!(viewport_ids.len(), 2);
    //
    //         // IDs should be strings
    //         assert!(viewport_ids.iter().all(|id| id.is_string()));
    //
    //         // Active viewport ID should be set
    //         assert_eq!(list["activeViewportId"], "viewport1");
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_edge_case_max_per_face_one() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Create viewport with max_per_face = 1
    //         manager.create_viewport("viewport1", 10, 1).unwrap();
    //
    //         // Check that each active face has exactly 1 item
    //         assert_eq!(manager.get_viewport_face_indices("viewport1", 0).unwrap(), serde_wasm_bindgen::to_value(&vec![0]).unwrap());
    //         assert_eq!(manager.get_viewport_face_indices("viewport1", 5).unwrap(), serde_wasm_bindgen::to_value(&vec![1]).unwrap());
    //         assert_eq!(manager.get_viewport_face_indices("viewport1", 2).unwrap(), serde_wasm_bindgen::to_value(&vec![2]).unwrap());
    //         assert_eq!(manager.get_viewport_face_indices("viewport1", 4).unwrap(), serde_wasm_bindgen::to_value(&vec![3]).unwrap());
    //
    //         // next_item() should have no effect since there's only 1 item per face
    //         manager.next_item().unwrap();
    //
    //         // Current item index should still be 0
    //         let current_index_result = manager.get_current_item_index().unwrap();
    //         let current_index: f64 = current_index_result.as_f64().unwrap();
    //         assert_eq!(current_index, 0.0);
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_edge_case_max_per_face_six() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Create viewport with max_per_face = 6 (maximum allowed)
    //         manager.create_viewport("viewport1", 30, 6).unwrap();
    //
    //         // Check that active faces have up to 6 items
    //         let face0_result = manager.get_viewport_face_indices("viewport1", 0).unwrap();
    //         let face0_indices: Vec<usize> = serde_wasm_bindgen::from_value(face0_result).unwrap();
    //         assert_eq!(face0_indices.len(), 6);
    //         assert_eq!(face0_indices, vec![0, 1, 2, 3, 4, 5]);
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_error_handling_invalid_inputs() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Try to create viewport with invalid max_per_face
    //         let result = manager.create_viewport("invalid", 10, 0);
    //         assert!(result.is_err());
    //
    //         let result = manager.create_viewport("invalid", 10, 7);
    //         assert!(result.is_err());
    //
    //         // Create a valid viewport for further tests
    //         manager.create_viewport("viewport1", 10, 2).unwrap();
    //
    //         // Try invalid face index
    //         let result = manager.get_face_indices(10);
    //         assert!(result.is_err());
    //
    //         // Try invalid rotation axis JSON
    //         let result = manager.set_rotation_axis("{invalid}");
    //         assert!(result.is_err());
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_multiple_viewports_independence() {
    //         let mut manager = ViewportManager::new();
    //
    //         // Create two viewports with different configurations
    //         manager.create_viewport("viewport1", 10, 2).unwrap();
    //         manager.create_viewport("viewport2", 20, 3).unwrap();
    //
    //         // Rotate viewport1
    //         manager.set_active_viewport("viewport1").unwrap();
    //         manager.rotate_next().unwrap(); // To top (face 5)
    //
    //         // Check position of viewport1
    //         let state1_result = manager.get_viewport_state("viewport1").unwrap();
    //         let state1 = extract_state_from_response(&state1_result);
    //         assert_eq!(state1["currFace"], 5);
    //
    //         // Check position of viewport2 (should be unchanged)
    //         let state2_result = manager.get_viewport_state("viewport2").unwrap();
    //         let state2 = extract_state_from_response(&state2_result);
    //         assert_eq!(state2["currFace"], 0); // Still at front face
    //
    //         // Change rotation axis for viewport1
    //         let axis_json = r#""Y-axis""#;
    //         manager.set_rotation_axis(axis_json).unwrap();
    //
    //         // Check axis of viewport1
    //         let state1_result = manager.get_viewport_state("viewport1").unwrap();
    //         let state1 = extract_state_from_response(&state1_result);
    //         assert_eq!(state1["currRotationAxis"], "Y-axis");
    //
    //         // Check axis of viewport2 (should be unchanged)
    //         let state2_result = manager.get_viewport_state("viewport2").unwrap();
    //         let state2 = extract_state_from_response(&state2_result);
    //         assert_eq!(state2["currRotationAxis"], "X-axis"); // Still X-axis
    //     }
    //
    //     #[wasm_bindgen_test]
    //     fn test_full_lifecycle() {
    //         // Test a complete lifecycle of viewport operations
    //         let mut manager = ViewportManager::new();
    //
    //         // Create viewport
    //         manager.create_viewport("viewport1", 16, 3).unwrap();
    //
    //         // Verify initial state
    //         let state_result = manager.get_viewport_state("viewport1").unwrap();
    //         let state = extract_state_from_response(&state_result);
    //         assert_eq!(state["currFace"], 0);
    //         assert_eq!(state["currIdx"], 0);
    //         assert_eq!(state["currRotationAxis"], "X-axis");
    //
    //         // Get current item
    //         let current_item_result = manager.get_current_item_index().unwrap();
    //         let current_item: f64 = current_item_result.as_f64().unwrap();
    //         assert_eq!(current_item, 0.0);
    //
    //         // Move to next item
    //         manager.next_item().unwrap();
    //         let current_item_result = manager.get_current_item_index().unwrap();
    //         let current_item: f64 = current_item_result.as_f64().unwrap();
    //         assert_eq!(current_item, 1.0);
    //
    //         // Rotate to next face
    //         manager.rotate_next().unwrap();
    //         let state_result = manager.get_viewport_state("viewport1").unwrap();
    //         let state = extract_state_from_response(&state_result);
    //         assert_eq!(state["currFace"], 5); // Top face
    //         assert_eq!(state["currIdx"], 0); // Reset to first item
    //
    //         // Change rotation axis
    //         let axis_json = r#""Y-axis""#;
    //         manager.set_rotation_axis(axis_json).unwrap();
    //         let state_result = manager.get_viewport_state("viewport1").unwrap();
    //         let state = extract_state_from_response(&state_result);
    //         assert_eq!(state["currFace"], 0); // Reset to front face
    //         assert_eq!(state["currRotationAxis"], "Y-axis");
    //
    //         // Rotate in new axis
    //         manager.rotate_next().unwrap();
    //         let state_result = manager.get_viewport_state("viewport1").unwrap();
    //         let state = extract_state_from_response(&state_result);
    //         assert_eq!(state["currFace"], 3); // Right face
    //
    //         // Remove viewport
    //         manager.remove_viewport("viewport1").unwrap();
    //
    //         // Verify it's gone
    //         let viewports_result = manager.list_viewports().unwrap();
    //         let viewports: serde_json::Value = serde_wasm_bindgen::from_value(viewports_result).unwrap();
    //         let viewport_ids = viewports["viewportIds"].as_array().unwrap();
    //         assert_eq!(viewport_ids.len(), 0);
    //     }
}
