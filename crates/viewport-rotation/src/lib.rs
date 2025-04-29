use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
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
#[wasm_bindgen]
pub struct ViewportRotation {
    // Queue of items waiting to be displayed
    pending_items: VecDeque<String>,

    // Items currently assigned to each face (0-5)
    faces: Vec<Vec<String>>,

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
}

/// State that can be serialized and sent to the client
#[derive(Serialize, Deserialize)]
pub struct ViewportState {
    faces: Vec<Vec<String>>,
    current_face: Face,
    current_item_index: usize,
    current_axis: RotationAxis,
    pending_items: Vec<String>,
    cycle_position: usize,
}

#[wasm_bindgen]
impl ViewportRotation {
    /// Creates a new ViewportRotation instance
    #[wasm_bindgen(constructor)]
    pub fn new(item_ids_json: &str, max_per_face: usize) -> Result<ViewportRotation, JsValue> {
        let item_ids: Vec<String> = serde_json::from_str(item_ids_json).map_err(|e| JsValue::from_str(&format!("Failed to parse item IDs: {}", e)))?;

        if max_per_face < 1 || max_per_face > 6 {
            return Err(JsValue::from_str("max_per_face must be between 1 and 6"));
        }

        // Initialize rotation cycles
        let mut rotation_cycles = HashMap::new();
        rotation_cycles.insert(RotationAxis::XAxis, vec![0, 5, 2, 4]); // Front -> Top -> Back -> Bottom
        rotation_cycles.insert(RotationAxis::YAxis, vec![0, 3, 2, 1]); // Front -> Right -> Back -> Left

        let mut rotation = Self {
            pending_items: VecDeque::from(item_ids),
            faces: vec![Vec::new(); 6], // 6 total faces
            max_per_face,
            current_face: 0,
            current_item_index: 0,
            current_axis: RotationAxis::YAxis, // Default to Y-axis rotation
            rotation_cycles,
            cycle_position: 0,
        };

        // Initialize faces with content
        rotation.initialize_faces();

        Ok(rotation)
    }

    /// Gets the current state of the viewport
    #[wasm_bindgen]
    #[must_use]
    pub fn get_state(&self) -> Result<JsValue, JsValue> {
        Ok(serde_wasm_bindgen::to_value(&self.internal_get_state()).map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))?)
    }

    /// Rotate to the next face in the cycle
    #[wasm_bindgen]
    pub fn rotate_next(&mut self) -> Result<JsValue, JsValue> {
        self.internal_rotate_next();
        self.get_state()
    }

    /// Move to the next item in the current face
    #[wasm_bindgen]
    pub fn next_item(&mut self) -> Result<JsValue, JsValue> {
        self.internal_next_item();
        self.get_state()
    }

    /// Get the current item ID
    #[wasm_bindgen]
    pub fn get_current_item_id(&self) -> Option<String> {
        self.internal_get_current_item_id()
    }

    /// Get all item IDs for a specific face
    #[wasm_bindgen]
    pub fn get_face_item_ids(&self, face_index: usize) -> Result<JsValue, JsValue> {
        if face_index >= self.faces.len() {
            return Err(JsValue::from_str("Face index out of bounds"));
        }

        let items = &self.faces[face_index];
        Ok(serde_wasm_bindgen::to_value(&items).map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))?)
    }

    /// Get the current items to display in the viewport
    #[wasm_bindgen]
    pub fn get_current_cycle_items(&self) -> Result<JsValue, JsValue> {
        let items = self.get_active_cycle_faces().iter().map(|&face| &self.faces[face]).collect::<Vec<_>>();

        Ok(serde_wasm_bindgen::to_value(&items).map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))?)
    }

    /// Set the rotation axis
    #[wasm_bindgen]
    pub fn set_rotation_axis(&mut self, axis_json: &str) -> Result<JsValue, JsValue> {
        let axis: RotationAxis = serde_json::from_str(axis_json).map_err(|e| JsValue::from_str(&format!("Failed to parse rotation axis: {}", e)))?;

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

impl ViewportRotation {
    /// Gets the internal state representation
    fn internal_get_state(&self) -> ViewportState {
        ViewportState {
            faces: self.faces.clone(),
            current_face: self.current_face,
            current_item_index: self.current_item_index,
            current_axis: self.current_axis,
            pending_items: self.pending_items.iter().cloned().collect(),
            cycle_position: self.cycle_position,
        }
    }

    /// Moves to the next item in the current face
    fn internal_next_item(&mut self) -> ViewportState {
        let face_items_count = self.faces[self.current_face].len();

        if face_items_count > 0 {
            self.current_item_index = (self.current_item_index + 1) % face_items_count;
        }

        self.internal_get_state()
    }

    /// Rotates to the next face in the cycle
    fn internal_rotate_next(&mut self) -> ViewportState {
        // Reset current item index when changing faces
        self.current_item_index = 0;

        // Get the cycle for the current axis
        let cycle = &self.rotation_cycles[&self.current_axis];

        // Move to the next position in the cycle
        self.cycle_position = (self.cycle_position + 1) % cycle.len();

        // Set the current face based on the cycle
        self.current_face = cycle[self.cycle_position];

        // Check if we're back at the beginning of the cycle and need to replenish items
        if self.cycle_position == 0 && !self.pending_items.is_empty() {
            self.cycle_all_faces();
        }

        self.internal_get_state()
    }

    /// Get the current item ID
    fn internal_get_current_item_id(&self) -> Option<String> {
        if self.faces[self.current_face].is_empty() {
            None
        } else {
            Some(self.faces[self.current_face][self.current_item_index].clone())
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

    /// Fill a face with pending items
    fn fill_face(&mut self, face_idx: Face) {
        self.faces[face_idx].clear();

        for _ in 0..self.max_per_face {
            if let Some(item_id) = self.pending_items.pop_front() {
                self.faces[face_idx].push(item_id);
            } else {
                break;
            }
        }
    }

    /// Cycle items through all active faces
    fn cycle_all_faces(&mut self) {
        if self.pending_items.is_empty() {
            return;
        }

        // Get active faces for the current rotation axis
        let active_faces = self.get_active_cycle_faces();

        for &face_idx in &active_faces {
            if self.pending_items.is_empty() {
                break;
            }

            let items_to_replace = std::cmp::min(self.faces[face_idx].len(), self.pending_items.len());

            // Replace existing items first
            for i in 0..items_to_replace {
                if let Some(new_item) = self.pending_items.pop_front() {
                    let _ = std::mem::replace(&mut self.faces[face_idx][i], new_item);
                }
            }

            // Add new items if there's still space
            let remaining_space = self.max_per_face - self.faces[face_idx].len();
            for _ in 0..remaining_space {
                if let Some(item_id) = self.pending_items.pop_front() {
                    self.faces[face_idx].push(item_id);
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
