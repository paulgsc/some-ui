//! Shared driver for the integration tests: plays a `TypingGameCore` the
//! way the UI does — one keystroke at a time, never a whole string.
//!
//! Each test binary compiles its own copy of this module, so no single one
//! of them uses the whole driver.
#![allow(dead_code)]

use leetype_wasm::{Command, TypingGameCore};

pub struct Player {
    core: TypingGameCore,
    now: f64,
}

impl Player {
    pub fn start(source: &str, max_consecutive_errors: Option<usize>) -> Self {
        let mut core = TypingGameCore::new(source, max_consecutive_errors);
        core.dispatch(&Command::Start, 0.0);
        Self { core, now: 0.0 }
    }

    /// The exact keystroke sequence this source demands, in order — the
    /// engine's own answer to "what does the player still owe?".
    pub fn token_stream(source: &str) -> String {
        let core = TypingGameCore::new(source, None);
        let roles = core.role_codes();
        source.chars().zip(roles).filter_map(|(ch, role)| (role == 1).then_some(ch)).collect()
    }

    pub fn advance_clock(&mut self, millis: f64) -> &mut Self {
        self.now += millis;
        self
    }

    pub fn send(&mut self, command: &Command) -> leetype_wasm::Outcome {
        self.core.dispatch(command, self.now)
    }

    pub fn press(&mut self, key: char) -> leetype_wasm::Outcome {
        self.send(&Command::Press { key })
    }

    pub fn type_text(&mut self, text: &str) -> &mut Self {
        for key in text.chars() {
            self.press(key);
        }
        self
    }

    pub fn snapshot(&self) -> leetype_wasm::Snapshot {
        self.core.snapshot(self.now)
    }

    pub fn core(&self) -> &TypingGameCore {
        &self.core
    }
}
