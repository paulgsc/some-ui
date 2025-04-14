use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct ViewportRotation {
    item_ids: VecDeque<String>,
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
    remaining_items: Vec<String>,
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
            item_ids: VecDeque::from(item_ids),
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
        let state = ViewportState {
            faces: self.faces.clone(),
            current_face: self.current_face,
            current_item_index: self.current_item_index,
            remaining_items: self.item_ids.iter().cloned().collect(),
        };

        Ok(serde_wasm_bindgen::to_value(&state).map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))?)
    }

    #[wasm_bindgen]
    pub fn rotate_next(&mut self) -> Result<JsValue, JsValue> {
        self.current_item_index = 0;

        self.current_face = (self.current_face + 1) % 4;

        if self.current_face == 0 && !self.item_ids.is_empty() {
            self.refresh_face(0);
        }

        self.get_state()
    }

    #[wasm_bindgen]
    pub fn next_item(&mut self) -> Result<JsValue, JsValue> {
        let face_items_count = self.faces[self.current_face].len();

        if face_items_count > 0 {
            self.current_item_index = (self.current_item_index + 1) % face_items_count;
        }

        self.get_state()
    }

    #[wasm_bindgen]
    pub fn get_current_item_id(&self) -> Option<String> {
        if self.faces[self.current_face].is_empty() {
            None
        } else {
            Some(self.faces[self.current_face][self.current_item_index].clone())
        }
    }

    #[wasm_bindgen]
    pub fn get_face_item_ids(&self, face_index: usize) -> Result<String, JsValue> {
        if face_index >= self.faces.len() {
            return Err(JsValue::from_str("Face index out of bounds"));
        }

        let items = &self.faces[face_index];
        serde_json::to_string(items).map_err(|e| JsValue::from_str(&format!("Failed to serialize items: {}", e)))
    }
}

impl ViewportRotation {
    fn initialize_faces(&mut self) {
        for face_idx in 0..4 {
            self.refresh_face(face_idx);
        }
    }

    fn refresh_face(&mut self, face_idx: usize) {
        self.faces[face_idx].clear();

        for _ in 0..self.max_per_face {
            if let Some(item_id) = self.item_ids.pop_front() {
                self.faces[face_idx].push(item_id);
            } else {
                break;
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

        rotation.rotate_next();
        assert_eq!(rotation.current_face, 1);
        assert_eq!(rotation.get_current_item_id(), Some("id3".to_string()));

        rotation.rotate_next();
        rotation.rotate_next();
        rotation.rotate_next();

        assert_eq!(rotation.current_face, 0);
        assert_eq!(rotation.faces[0], vec!["id9", "id10"]);
    }

    #[test]
    fn test_next_item() {
        let item_ids = vec!["id1", "id2", "id3", "id4"].iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let item_ids_json = serde_json::to_string(&item_ids).unwrap();

        let mut rotation = ViewportRotation::new(&item_ids_json, 2).unwrap();

        assert_eq!(rotation.get_current_item_id(), Some("id1".to_string()));

        rotation.next_item();
        assert_eq!(rotation.get_current_item_id(), Some("id2".to_string()));

        rotation.next_item();
        assert_eq!(rotation.get_current_item_id(), Some("id1".to_string()));
    }
}
