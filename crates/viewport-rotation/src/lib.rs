use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct ViewportRotation {
    pending_items: VecDeque<String>,
    faces: Vec<Vec<String>>,
    max_per_face: usize,
    current_face: usize,
    current_item_index: usize,
}

#[derive(Serialize, Deserialize)]
pub struct ViewportState {
    faces: Vec<Vec<String>>,
    current_face: usize,
    current_item_index: usize,
    pending_items: Vec<String>,
}

#[wasm_bindgen]
impl ViewportRotation {
    #[wasm_bindgen(constructor)]
    pub fn new(item_ids_json: &str, max_per_face: usize) -> Result<ViewportRotation, JsValue> {
        let item_ids: Vec<String> = serde_json::from_str(item_ids_json).map_err(|e| JsValue::from_str(&format!("Failed to parse item IDs: {}", e)))?;

        if max_per_face < 1 || max_per_face > 6 {
            return Err(JsValue::from_str("max_per_face must be between 1 and 6"));
        }

        let mut rotation = Self {
            pending_items: VecDeque::from(item_ids.clone()),
            faces: vec![Vec::new(); 4], // 4 faces
            max_per_face,
            current_face: 0,
            current_item_index: 0,
        };

        rotation.initialize_faces();

        Ok(rotation)
    }

    #[wasm_bindgen]
    #[must_use]
    pub fn get_state(&self) -> Result<JsValue, JsValue> {
        Ok(serde_wasm_bindgen::to_value(&self.internal_get_state()).map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))?)
    }

    #[wasm_bindgen]
    pub fn rotate_next(&mut self) -> Result<JsValue, JsValue> {
        self.internal_rotate_next();

        self.get_state()
    }

    #[wasm_bindgen]
    pub fn next_item(&mut self) -> Result<JsValue, JsValue> {
        self.internal_next_item();

        self.get_state()
    }

    #[wasm_bindgen]
    pub fn get_current_item_id(&self) -> Option<String> {
        self.internal_get_current_item_id()
    }

    #[wasm_bindgen]
    pub fn get_face_item_ids(&self, face_index: usize) -> Result<JsValue, JsValue> {
        if face_index >= self.faces.len() {
            return Err(JsValue::from_str("Face index out of bounds"));
        }

        let items = &self.faces[face_index];
        Ok(serde_wasm_bindgen::to_value(&items).map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))?)
    }
}

impl ViewportRotation {
    fn internal_get_state(&self) -> ViewportState {
        ViewportState {
            faces: self.faces.clone(),
            current_face: self.current_face,
            current_item_index: self.current_item_index,
            pending_items: self.pending_items.iter().cloned().collect(),
        }
    }

    fn internal_next_item(&mut self) -> ViewportState {
        let face_items_count = self.faces[self.current_face].len();

        if face_items_count > 0 {
            self.current_item_index = (self.current_item_index + 1) % face_items_count;
        }

        self.internal_get_state()
    }

    fn internal_rotate_next(&mut self) -> ViewportState {
        self.current_item_index = 0;

        self.current_face = (self.current_face + 1) % 4;

        if self.current_face == 0 && !self.pending_items.is_empty() {
            self.cycle_all_faces();
        }

        self.internal_get_state()
    }

    fn internal_get_current_item_id(&self) -> Option<String> {
        if self.faces[self.current_face].is_empty() {
            None
        } else {
            Some(self.faces[self.current_face][self.current_item_index].clone())
        }
    }

    fn initialize_faces(&mut self) {
        for face_idx in 0..4 {
            self.fill_face(face_idx);
        }
    }

    fn fill_face(&mut self, face_idx: usize) {
        self.faces[face_idx].clear();

        for _ in 0..self.max_per_face {
            if let Some(item_id) = self.pending_items.pop_front() {
                self.faces[face_idx].push(item_id);
            } else {
                break;
            }
        }
    }

    fn cycle_all_faces(&mut self) {
        if self.pending_items.is_empty() {
            return;
        }

        for face_idx in 0..4 {
            if self.pending_items.is_empty() {
                break;
            }

            let items_to_replace = std::cmp::min(self.faces[face_idx].len(), self.pending_items.len());

            for i in 0..items_to_replace {
                if let Some(new_item) = self.pending_items.pop_front() {
                    let _ = std::mem::replace(&mut self.faces[face_idx][i], new_item);
                }
            }

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
}

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

        assert_eq!(rotation.faces[0], vec!["id1", "id2"]);
        assert_eq!(rotation.faces[1], vec!["id3", "id4"]);
        assert_eq!(rotation.faces[2], vec!["id5", "id6"]);
        assert_eq!(rotation.faces[3], vec!["id7", "id8"]);
        assert!(rotation.pending_items.is_empty());
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
        assert_eq!(rotation.internal_get_current_item_id(), Some("id1".to_string()));

        let _ = rotation.internal_rotate_next();
        assert_eq!(rotation.current_face, 1);
        assert_eq!(rotation.internal_get_current_item_id(), Some("id3".to_string()));

        let _ = rotation.internal_rotate_next();
        let _ = rotation.internal_rotate_next();
        let _ = rotation.internal_rotate_next();

        assert_eq!(rotation.current_face, 0);
        assert_eq!(rotation.faces[0], vec!["id9", "id10"]);
    }

    #[test]
    fn test_next_item() {
        let item_ids = vec!["id1", "id2", "id3", "id4"].iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let item_ids_json = serde_json::to_string(&item_ids).unwrap();

        let mut rotation = ViewportRotation::new(&item_ids_json, 2).unwrap();

        assert_eq!(rotation.internal_get_current_item_id(), Some("id1".to_string()));

        let _ = rotation.internal_next_item();
        assert_eq!(rotation.internal_get_current_item_id(), Some("id2".to_string()));

        let _ = rotation.internal_next_item();
        assert_eq!(rotation.internal_get_current_item_id(), Some("id1".to_string()));
    }

    #[test]
    fn test_cycling_with_more_items() {
        let item_ids = vec!["id1", "id2", "id3", "id4", "id5", "id6", "id7", "id8", "id9", "id10", "id11", "id12"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>();
        let item_ids_json = serde_json::to_string(&item_ids).unwrap();

        let mut rotation = ViewportRotation::new(&item_ids_json, 2).unwrap();

        // Complete one full rotation
        let _ = rotation.internal_rotate_next(); // face 1
        let _ = rotation.internal_rotate_next(); // face 2
        let _ = rotation.internal_rotate_next(); // face 3
        let _ = rotation.internal_rotate_next(); // back to face 0

        // Face 0 should have id9, id10
        assert_eq!(rotation.faces[0], vec!["id9", "id10"]);

        // Do another full rotation
        let _ = rotation.internal_rotate_next(); // face 1
        let _ = rotation.internal_rotate_next(); // face 2
        let _ = rotation.internal_rotate_next(); // face 3
        let _ = rotation.internal_rotate_next(); // back to face 0

        // Face 0 should still have id9, id10 (no change since we added no new items)
        assert_eq!(rotation.faces[0], vec!["id9", "id10"]);

        // Face 1 should have id11, id12 (the remaining new items)
        assert_eq!(rotation.faces[1], vec!["id11", "id12"]);
    }
}
