use crate::core::Viewport;
use std::collections::HashMap;

pub struct ViewportManager {
    viewports: HashMap<String, Viewport>,
    active_id: Option<String>,
}

impl ViewportManager {
    pub fn new() -> Self {
        Self {
            viewports: HashMap::new(),
            active_id: None,
        }
    }

    pub fn create(&mut self, id: String, viewport: Viewport) {
        let is_first = self.viewports.is_empty();
        self.viewports.insert(id.clone(), viewport);

        if is_first {
            self.active_id = Some(id);
        }
    }

    pub fn remove(&mut self, id: &str) -> Option<Viewport> {
        let removed = self.viewports.remove(id);

        if self.active_id.as_deref() == Some(id) {
            self.active_id = self.viewports.keys().next().cloned();
        }

        removed
    }

    pub fn get(&self, id: &str) -> Option<&Viewport> {
        self.viewports.get(id)
    }

    pub fn get_mut(&mut self, id: &str) -> Option<&mut Viewport> {
        self.viewports.get_mut(id)
    }

    pub fn set_active(&mut self, id: &str) -> bool {
        if self.viewports.contains_key(id) {
            self.active_id = Some(id.to_string());
            true
        } else {
            false
        }
    }

    pub fn active_id(&self) -> Option<&str> {
        self.active_id.as_deref()
    }

    pub fn list_ids(&self) -> Vec<&str> {
        self.viewports.keys().map(|s| s.as_str()).collect()
    }

    pub fn clear(&mut self) {
        self.viewports.clear();
        self.active_id = None;
    }
}

impl Default for ViewportManager {
    fn default() -> Self {
        Self::new()
    }
}
