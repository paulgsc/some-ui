use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use wasm_bindgen::prelude::*;

// The module to be exposed to WebAssembly
#[wasm_bindgen]
pub struct ViewportRotation {
    // Store item IDs instead of the items themselves
    item_ids: VecDeque<String>,
    faces: Vec<Vec<String>>,
    max_per_face: usize,
    current_face: usize,
    current_item_index: usize,
}

// Public struct for serializing the state to JS
#[derive(Serialize, Deserialize)]
pub struct ViewportState {
    faces: Vec<Vec<String>>,
    current_face: usize,
    current_item_index: usize,
    remaining_items: Vec<String>,
}

#[wasm_bindgen]
impl ViewportRotation {
    // Create a new instance with specified parameters
    #[wasm_bindgen(constructor)]
    pub fn new(item_ids_json: &str, max_per_face: usize) -> Result<ViewportRotation, JsValue> {
        let item_ids: Vec<String> = serde_json::from_str(item_ids_json).map_err(|e| JsValue::from_str(&format!("Failed to parse item IDs: {}", e)))?;

        if max_per_face < 1 || max_per_face > 6 {
            return Err(JsValue::from_str("max_per_face must be between 1 and 6"));
        }

        let mut rotation = ViewportRotation {
            item_ids: VecDeque::from(item_ids),
            faces: vec![Vec::new(); 4], // 4 faces
            max_per_face,
            current_face: 0,
            current_item_index: 0,
        };

        // Initial distribution of items to faces
        rotation.initialize_faces();

        Ok(rotation)
    }

    // Get the current state as JSON
    #[wasm_bindgen]
    pub fn get_state(&self) -> String {
        let state = ViewportState {
            faces: self.faces.clone(),
            current_face: self.current_face,
            current_item_index: self.current_item_index,
            remaining_items: self.item_ids.iter().cloned().collect(),
        };

        serde_json::to_string(&state).unwrap_or_else(|_| "{}".to_string())
    }

    // Rotate to the next face
    #[wasm_bindgen]
    pub fn rotate_next(&mut self) -> String {
        // Reset current item index
        self.current_item_index = 0;

        // Move to next face
        self.current_face = (self.current_face + 1) % 4;

        // Check if we've completed a full rotation
        if self.current_face == 0 && !self.item_ids.is_empty() {
            self.refresh_face(0);
        }

        self.get_state()
    }

    // Select next item on current face
    #[wasm_bindgen]
    pub fn next_item(&mut self) -> String {
        let face_items_count = self.faces[self.current_face].len();

        if face_items_count > 0 {
            self.current_item_index = (self.current_item_index + 1) % face_items_count;
        }

        self.get_state()
    }

    // Get currently highlighted item ID
    #[wasm_bindgen]
    pub fn get_current_item_id(&self) -> Option<String> {
        if self.faces[self.current_face].is_empty() {
            None
        } else {
            Some(self.faces[self.current_face][self.current_item_index].clone())
        }
    }

    // Get all face item IDs
    #[wasm_bindgen]
    pub fn get_face_item_ids(&self, face_index: usize) -> Result<String, JsValue> {
        if face_index >= self.faces.len() {
            return Err(JsValue::from_str("Face index out of bounds"));
        }

        let items = &self.faces[face_index];
        serde_json::to_string(items).map_err(|e| JsValue::from_str(&format!("Failed to serialize items: {}", e)))
    }
}

// Private implementation details
impl ViewportRotation {
    // Initialize the faces with items
    fn initialize_faces(&mut self) {
        for face_idx in 0..4 {
            self.refresh_face(face_idx);
        }
    }

    // Refresh a specific face with new items
    fn refresh_face(&mut self, face_idx: usize) {
        // Clear the face
        self.faces[face_idx].clear();

        // Fill the face with new items
        for _ in 0..self.max_per_face {
            if let Some(item_id) = self.item_ids.pop_front() {
                self.faces[face_idx].push(item_id);
            } else {
                break; // No more items to add
            }
        }
    }
}

// Test module
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initialization() {
        let item_ids = vec!["id1", "id2", "id3", "id4", "id5", "id6", "id7", "id8"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>();
        let item_ids_json = serde_json::to_string(&item_ids).unwrap();

        let rotation = ViewportRotation::new(&item_ids_json, 2).unwrap();

        // Check if faces are correctly initialized
        assert_eq!(rotation.faces[0], vec!["id1", "id2"]);
        assert_eq!(rotation.faces[1], vec!["id3", "id4"]);
        assert_eq!(rotation.faces[2], vec!["id5", "id6"]);
        assert_eq!(rotation.faces[3], vec!["id7", "id8"]);
        assert!(rotation.item_ids.is_empty());
    }

    #[test]
    fn test_rotation() {
        let item_ids = vec!["id1", "id2", "id3", "id4", "id5", "id6", "id7", "id8", "id9", "id10"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>();
        let item_ids_json = serde_json::to_string(&item_ids).unwrap();

        let mut rotation = ViewportRotation::new(&item_ids_json, 2).unwrap();

        // Initial state
        assert_eq!(rotation.current_face, 0);
        assert_eq!(rotation.get_current_item_id(), Some("id1".to_string()));

        // Rotate once
        rotation.rotate_next();
        assert_eq!(rotation.current_face, 1);
        assert_eq!(rotation.get_current_item_id(), Some("id3".to_string()));

        // Complete a full rotation
        rotation.rotate_next();
        rotation.rotate_next();
        rotation.rotate_next();

        // Should be back at face 0, but with new items
        assert_eq!(rotation.current_face, 0);
        assert_eq!(rotation.faces[0], vec!["id9", "id10"]);
    }

    #[test]
    fn test_next_item() {
        let item_ids = vec!["id1", "id2", "id3", "id4"].iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let item_ids_json = serde_json::to_string(&item_ids).unwrap();

        let mut rotation = ViewportRotation::new(&item_ids_json, 2).unwrap();

        // Initial state
        assert_eq!(rotation.get_current_item_id(), Some("id1".to_string()));

        // Next item on same face
        rotation.next_item();
        assert_eq!(rotation.get_current_item_id(), Some("id2".to_string()));

        // Loop back to first item
        rotation.next_item();
        assert_eq!(rotation.get_current_item_id(), Some("id1".to_string()));
    }
}
