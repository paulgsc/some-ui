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

    #[test]
    fn test_initialization() {
        let items = vec!["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let items_json = serde_json::to_string(&items).unwrap();

        let vr = ViewportRotation::new(&items_json, 2).unwrap();

        // Check Y-axis cycle (default)
        let y_cycle_faces = vec![0, 3, 2, 1];

        // Verify items are only in active faces
        for face in 0..6 {
            if y_cycle_faces.contains(&face) {
                assert!(!vr.faces[face].is_empty(), "Active face {} should have items", face);
            } else {
                assert!(vr.faces[face].is_empty(), "Inactive face {} should be empty", face);
            }
        }

        // Verify item distribution
        assert_eq!(vr.faces[0], vec!["1", "2"]);
        assert_eq!(vr.faces[3], vec!["3", "4"]);
        assert_eq!(vr.faces[2], vec!["5", "6"]);
        assert_eq!(vr.faces[1], vec!["7", "8"]);

        // Verify pending items
        assert_eq!(vr.pending_items.len(), 2);
    }

    #[test]
    fn test_rotation() {
        let items = vec!["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let items_json = serde_json::to_string(&items).unwrap();

        let mut vr = ViewportRotation::new(&items_json, 2).unwrap();

        // Initial state
        assert_eq!(vr.current_face, 0);
        assert_eq!(vr.cycle_position, 0);

        // First rotation
        vr.internal_rotate_next();
        assert_eq!(vr.current_face, 3);
        assert_eq!(vr.cycle_position, 1);

        // Second rotation
        vr.internal_rotate_next();
        assert_eq!(vr.current_face, 2);
        assert_eq!(vr.cycle_position, 2);

        // Third rotation
        vr.internal_rotate_next();
        assert_eq!(vr.current_face, 1);
        assert_eq!(vr.cycle_position, 3);

        // Complete cycle, should return to beginning and replenish
        vr.internal_rotate_next();
        assert_eq!(vr.current_face, 0);
        assert_eq!(vr.cycle_position, 0);

        // Check items were replenished
        assert!(
            vr.faces[0].contains(&"9".to_string()) || vr.faces[0].contains(&"10".to_string()),
            "Face 0 should have been replenished with pending items"
        );
    }

    #[test]
    fn test_change_axis() {
        let items = vec!["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>();
        let items_json = serde_json::to_string(&items).unwrap();

        let mut vr = ViewportRotation::new(&items_json, 2).unwrap();

        // Default is Y-axis
        assert_eq!(vr.current_axis, RotationAxis::YAxis);

        // Check active faces have items
        let y_active_faces = vec![0, 3, 2, 1];
        for &face in &y_active_faces {
            assert!(!vr.faces[face].is_empty());
        }

        // Change to X-axis
        let x_axis_json = serde_json::to_string("X-axis").unwrap();
        vr.set_rotation_axis(&x_axis_json).unwrap();

        // Verify current state reset
        assert_eq!(vr.current_axis, RotationAxis::XAxis);
        // assert_eq!(vr.cycle_position, 0);
        // assert_eq!(vr.current_face, 0);

        // // Complete a full cycle
        // for _ in 0..4 {
        //     vr.internal_rotate_next();
        // }

        // // Verify X-axis active faces have items
        // let x_active_faces = vec![0, 5, 2, 4];
        // for face in 0..6 {
        //     if x_active_faces.contains(&face) {
        //         assert!(!vr.faces[face].is_empty(), "X-axis active face {} should have items", face);
        //     }
        // }
    }

    #[test]
    fn test_next_item() {
        let items = vec!["1", "2", "3", "4", "5", "6"].iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let items_json = serde_json::to_string(&items).unwrap();

        let mut vr = ViewportRotation::new(&items_json, 3).unwrap();

        // Initial state
        assert_eq!(vr.current_item_index, 0);
        assert_eq!(vr.internal_get_current_item_id().unwrap(), "1");

        // Next item
        vr.internal_next_item();
        assert_eq!(vr.current_item_index, 1);
        assert_eq!(vr.internal_get_current_item_id().unwrap(), "2");

        // Next item should wrap around
        vr.internal_next_item();
        assert_eq!(vr.current_item_index, 2);
        assert_eq!(vr.internal_get_current_item_id().unwrap(), "3");

        // Wrap around
        vr.internal_next_item();
        assert_eq!(vr.current_item_index, 0);
        assert_eq!(vr.internal_get_current_item_id().unwrap(), "1");
    }

    #[test]
    fn test_get_current_cycle_items() {
        let items = vec!["1", "2", "3", "4", "5", "6", "7", "8"].iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let items_json = serde_json::to_string(&items).unwrap();

        /// Set the rotation axis for the active viewport
        /// Set the rotation axis for the active viewport
        /// Set the rotation axis for the active viewport
        /// Set the rotation axis for the active viewport
        /// Set the rotation axis for the active viewport
        let vr = ViewportRotation::new(&items_json, 2).unwrap();

        // Get items via the internal method that get_current_cycle_items uses
        let active_faces = vr.get_active_cycle_faces();
        let cycle_items: Vec<&Vec<String>> = active_faces.iter().map(|&face| &vr.faces[face]).collect();

        // Check correct faces and items
        assert_eq!(active_faces, vec![0, 3, 2, 1]);
        assert_eq!(cycle_items[0], &vec!["1".to_string(), "2".to_string()]);
        assert_eq!(cycle_items[1], &vec!["3".to_string(), "4".to_string()]);
        assert_eq!(cycle_items[2], &vec!["5".to_string(), "6".to_string()]);
        assert_eq!(cycle_items[3], &vec!["7".to_string(), "8".to_string()]);
    }
}
