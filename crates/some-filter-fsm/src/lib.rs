use wasm_bindgen::prelude::*;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TabState {
    Auto,
    Legacy,
    Off,
}

impl TabState {
    fn parse(value: &str) -> Result<Self, &'static str> {
        match value {
            "auto" => Ok(Self::Auto),
            "legacy" => Ok(Self::Legacy),
            "off" => Ok(Self::Off),
            _ => Err("invalid some-filter tab state"),
        }
    }

    const fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Legacy => "legacy",
            Self::Off => "off",
        }
    }

    const fn next(self) -> Self {
        match self {
            Self::Auto => Self::Off,
            Self::Off => Self::Legacy,
            Self::Legacy => Self::Auto,
        }
    }
}

/// The complete compile-time-known tab-mode state machine.
///
/// JavaScript owns browser effects only; it asks this value to validate direct
/// transitions and to perform the keyboard cycle.
#[wasm_bindgen]
pub struct FilterStateMachine {
    state: TabState,
}

#[wasm_bindgen]
impl FilterStateMachine {
    #[wasm_bindgen(constructor)]
    pub fn new(initial_state: &str) -> Result<FilterStateMachine, JsValue> {
        Ok(Self {
            state: TabState::parse(initial_state).map_err(JsValue::from_str)?,
        })
    }

    #[wasm_bindgen(getter)]
    pub fn state(&self) -> String {
        self.state.as_str().to_owned()
    }

    #[wasm_bindgen(js_name = transitionTo)]
    pub fn transition_to(&mut self, state: &str) -> Result<String, JsValue> {
        self.state = TabState::parse(state).map_err(JsValue::from_str)?;
        Ok(self.state())
    }

    pub fn cycle(&mut self) -> String {
        self.state = self.state.next();
        self.state()
    }
}

#[cfg(test)]
mod tests {
    use super::TabState;

    #[test]
    fn cycle_visits_each_state_and_returns_to_auto() {
        let mut state = TabState::Auto;
        state = state.next();
        assert_eq!(state, TabState::Off);
        state = state.next();
        assert_eq!(state, TabState::Legacy);
        state = state.next();
        assert_eq!(state, TabState::Auto);
    }

    #[test]
    fn rejects_unknown_states() {
        assert!(TabState::parse("unknown").is_err());
    }
}
