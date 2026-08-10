use serde::{Deserialize, Serialize};
use std::time::Duration;
use wasm_bindgen::prelude::*;

mod core;
mod manager;

use crate::core::{Transition as CoreTransition, Viewport};
use core::{Item, Polyhedron, RotationCycleKind};
use manager::ViewportManager;

/// Content item for WASM boundary
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WasmItem {
    #[serde(rename = "contentIndex")]
    pub content_index: usize,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
}

/// Serializable viewport state
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WasmViewportState {
    #[serde(rename = "faceLayout")]
    pub face_layout: Vec<Vec<usize>>,
    #[serde(rename = "activeFace")]
    pub active_face: usize,
    #[serde(rename = "activeItemInFace")]
    pub active_item_in_face: usize,
    #[serde(rename = "cursor")]
    pub cursor: usize,
    #[serde(rename = "cycleIndex")]
    pub cycle_index: usize,
    #[serde(rename = "cyclePosition")]
    pub cycle_position: usize,
    #[serde(rename = "cycleLength")]
    pub cycle_length: usize,
    #[serde(rename = "cycleName")]
    pub cycle_name: String,
    #[serde(rename = "progress")]
    pub progress: f64,
}

/// Polyhedron type selector
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum WasmPolyhedronType {
    #[serde(rename = "cube")]
    Cube,
    #[serde(rename = "hexPrism")]
    HexPrism,
    #[serde(rename = "carousel")]
    Carousel { faces: usize },
}

/// Transition actions - mirrored for WASM boundary
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum WasmTransition {
    #[serde(rename = "nextItem")]
    NextItem,
    #[serde(rename = "rotateNext")]
    RotateNext,
    #[serde(rename = "rotatePrev")]
    RotatePrev,
    #[serde(rename = "jumpToFace")]
    JumpToFace { face: usize },
    #[serde(rename = "switchCycle")]
    SwitchCycle { index: usize },
    #[serde(rename = "switchCycleByKind")]
    SwitchCycleByKind { cycle_name: String },
    #[serde(rename = "jumpToContent")]
    JumpToContent { index: usize },
}

impl From<WasmTransition> for CoreTransition {
    fn from(wt: WasmTransition) -> Self {
        match wt {
            WasmTransition::NextItem => CoreTransition::NextItem,
            WasmTransition::RotateNext => CoreTransition::RotateNext,
            WasmTransition::RotatePrev => CoreTransition::RotatePrev,
            WasmTransition::JumpToFace { face } => CoreTransition::JumpToFace(face),
            WasmTransition::SwitchCycle { index } => CoreTransition::SwitchCycle(index),
            WasmTransition::SwitchCycleByKind { cycle_name } => CoreTransition::SwitchCycleByKind(cycle_name),
            WasmTransition::JumpToContent { index } => CoreTransition::JumpToContent(index),
        }
    }
}

#[wasm_bindgen]
pub struct WasmViewportManager {
    inner: ViewportManager,
}

impl Default for WasmViewportManager {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl WasmViewportManager {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        // Enable panic hook for better error messages
        #[cfg(feature = "console_error_panic_hook")]
        console_error_panic_hook::set_once();

        Self { inner: ViewportManager::new() }
    }

    /// Create new viewport - uses serde_wasm_bindgen for items and polyhedron
    #[wasm_bindgen(js_name = createViewport)]
    pub fn create_viewport(&mut self, id: &str, items: JsValue, polyhedron: JsValue, face_capacity: usize, cycle_name: Option<String>) -> Result<JsValue, JsValue> {
        let wasm_items: Vec<WasmItem> = serde_wasm_bindgen::from_value(items).map_err(|e| JsValue::from_str(&format!("Invalid items: {}", e)))?;

        let poly_type: WasmPolyhedronType = serde_wasm_bindgen::from_value(polyhedron).map_err(|e| JsValue::from_str(&format!("Invalid polyhedron: {}", e)))?;

        // Convert to internal types
        let items: Vec<Item> = wasm_items
            .into_iter()
            .map(|wi| Item {
                duration: Duration::from_millis(wi.duration_ms),
            })
            .collect();

        let polyhedron = match poly_type {
            WasmPolyhedronType::Cube => Polyhedron::cube(),
            WasmPolyhedronType::HexPrism => Polyhedron::hex_prism(),
            WasmPolyhedronType::Carousel { faces } => Polyhedron::carousel(faces),
        };

        let cycle_index = if let Some(name) = cycle_name {
            let kind = RotationCycleKind::from_str(&name).ok_or_else(|| JsValue::from_str(&format!("Invalid cycle name: {}", name)))?;
            polyhedron
                .cycle_index_by_kind(kind)
                .ok_or_else(|| JsValue::from_str(&format!("Cycle '{}' not supported by this polyhedron", name)))?
        } else {
            0
        };

        let viewport = Viewport::new(items, polyhedron, face_capacity, cycle_index).map_err(|e| JsValue::from_str(&e))?;

        self.inner.create(id.to_string(), viewport);
        self.get_state(id)
    }

    /// Get viewport state - returns JsValue directly
    #[wasm_bindgen(js_name = getState)]
    pub fn get_state(&self, id: &str) -> Result<JsValue, JsValue> {
        let vp = self.inner.get(id).ok_or_else(|| JsValue::from_str("Viewport not found"))?;

        let layout = vp.compute_layout();
        let cycle = vp.current_cycle();

        let state = WasmViewportState {
            face_layout: layout.faces,
            active_face: layout.active_face,
            active_item_in_face: layout.active_item_in_face,
            cursor: vp.cursor(),
            cycle_index: vp.cycle_index,
            cycle_position: vp.cycle_position,
            cycle_length: cycle.faces.len(),
            cycle_name: cycle.kind.as_str().to_string(),
            progress: vp.progress(),
        };

        serde_wasm_bindgen::to_value(&state).map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Apply transition - uses serde_wasm_bindgen
    #[wasm_bindgen(js_name = applyTransition)]
    pub fn apply_transition(&mut self, id: &str, transition: JsValue) -> Result<JsValue, JsValue> {
        let vp = self.inner.get_mut(id).ok_or_else(|| JsValue::from_str("Viewport not found"))?;

        let wasm_transition: WasmTransition = serde_wasm_bindgen::from_value(transition).map_err(|e| JsValue::from_str(&format!("Invalid transition: {}", e)))?;

        let core_transition: CoreTransition = wasm_transition.into();
        vp.apply(core_transition);

        self.get_state(id)
    }

    /// Tick time forward
    #[wasm_bindgen(js_name = tick)]
    pub fn tick(&mut self, id: &str, dt_ms: u32) -> Result<bool, JsValue> {
        let vp = self.inner.get_mut(id).ok_or_else(|| JsValue::from_str("Viewport not found"))?;

        Ok(vp.tick(Duration::from_millis(dt_ms.into())))
    }

    /// Switch cycle - simple primitive, no need for serde
    #[wasm_bindgen(js_name = switchCycle)]
    pub fn switch_cycle(&mut self, id: &str, cycle_index: usize) -> Result<JsValue, JsValue> {
        let vp = self.inner.get_mut(id).ok_or_else(|| JsValue::from_str("Viewport not found"))?;

        vp.apply(CoreTransition::SwitchCycle(cycle_index));
        self.get_state(id)
    }

    /// Switch to a different rotation cycle by name
    #[wasm_bindgen(js_name = switchCycleByKind)]
    pub fn switch_cycle_by_kind(&mut self, id: &str, cycle_name: &str) -> Result<JsValue, JsValue> {
        let vp = self.inner.get_mut(id).ok_or_else(|| JsValue::from_str("Viewport not found"))?;
        vp.apply(CoreTransition::SwitchCycleByKind(cycle_name.to_owned()));

        self.get_state(id)
    }

    /// Jump to face
    #[wasm_bindgen(js_name = jumpToFace)]
    pub fn jump_to_face(&mut self, id: &str, face: usize) -> Result<JsValue, JsValue> {
        let vp = self.inner.get_mut(id).ok_or_else(|| JsValue::from_str("Viewport not found"))?;

        vp.apply(CoreTransition::JumpToFace(face));
        self.get_state(id)
    }

    /// Jump to content index
    #[wasm_bindgen(js_name = jumpToContent)]
    pub fn jump_to_content(&mut self, id: &str, index: usize) -> Result<JsValue, JsValue> {
        let vp = self.inner.get_mut(id).ok_or_else(|| JsValue::from_str("Viewport not found"))?;

        vp.apply(CoreTransition::JumpToContent(index));
        self.get_state(id)
    }

    /// Remove viewport
    #[wasm_bindgen(js_name = removeViewport)]
    pub fn remove_viewport(&mut self, id: &str) -> bool {
        self.inner.remove(id).is_some()
    }

    /// List all viewport IDs
    #[wasm_bindgen(js_name = listViewports)]
    pub fn list_viewports(&self) -> JsValue {
        let ids: Vec<String> = self.inner.list_ids().into_iter().map(|s| s.to_string()).collect();

        serde_wasm_bindgen::to_value(&ids).unwrap_or(JsValue::NULL)
    }

    /// Get active viewport ID
    #[wasm_bindgen(js_name = getActiveId)]
    pub fn get_active_id(&self) -> Option<String> {
        self.inner.active_id().map(|s| s.to_string())
    }

    /// Set active viewport
    #[wasm_bindgen(js_name = setActive)]
    pub fn set_active(&mut self, id: &str) -> bool {
        self.inner.set_active(id)
    }

    /// Clear all viewports
    #[wasm_bindgen(js_name = clear)]
    pub fn clear(&mut self) {
        self.inner.clear();
    }
}
