use std::cell::RefCell;

use wasm_bindgen::prelude::*;

mod game_core;
mod leetype;

pub use game_core::{Command, TypingGameCore};
pub use leetype::reveal::{next_k, progression};
pub use leetype::{
    ChunkCompletionStats, CumulativeStats, Layout, Outcome, Program, Progression, Rejection, RevealConfig, Role, Run, Section, SectionProgress, SessionConfig, Snapshot,
    MAX_STEP_ATTEMPTS,
};

// Axiom 11.1 (docs/canon/hangul-progression-canon.typ,
// §11.2): this is the crate's only file allowed to reference wasm_bindgen -
// enforced by scripts/check-wasm-bindgen-boundary.sh in CI.
//
// Axiom 12.1 (ADR 0004): and it is also free of `&mut self`. The engine's
// single mutation point is `TypingGameCore::dispatch`; this wrapper reaches
// it through a `RefCell` borrow taken and released inside one method body,
// so the JS-facing surface is entirely `&self`. Interior mutability
// confined to the boundary object *is* the actor pattern the canon asks
// for - see scripts/check-mutation-boundary.sh.

/// JS-facing handle on one typing session.
///
/// The engine speaks in *slots* (the typeable stream) and *display
/// indices* (rendered characters). Layout whitespace has a display index
/// but no slot, which is what lets the caret fly over indentation while
/// still sitting exactly on the character the player owes a keystroke for.
#[wasm_bindgen]
pub struct TypingGame {
    core: RefCell<TypingGameCore>,
}

#[wasm_bindgen]
impl TypingGame {
    /// `baseline_wpm` / `dispersion_wpm` are the player's own sampled typing
    /// speed and its spread; every threshold in the reveal loop is a
    /// function of them. Omitting them takes the cold-start stand-in, which
    /// is what a player who has not calibrated yet gets — never a refusal to
    /// play.
    #[wasm_bindgen(constructor)]
    #[must_use]
    pub fn new(target_code: &str, max_consecutive_errors: Option<usize>, baseline_wpm: Option<f64>, dispersion_wpm: Option<f64>) -> Self {
        Self {
            core: RefCell::new(TypingGameCore::new(
                target_code,
                max_consecutive_errors,
                baseline_wpm.map(|baseline| reveal_config(baseline, dispersion_wpm)),
            )),
        }
    }

    /// The current chunk's fixed structure: sizes and navigable sections.
    #[must_use]
    pub fn layout(&self) -> JsValue {
        encode(&self.core.borrow().layout())
    }

    /// Per-rendered-character roles: `0` skipped layout, `1` typeable.
    #[must_use]
    pub fn roles(&self) -> Vec<u8> {
        self.core.borrow().role_codes()
    }

    /// Per-rendered-character slot ordinals, `-1` where the character is
    /// skipped layout.
    #[must_use]
    pub fn slot_of_display(&self) -> Vec<i32> {
        self.core.borrow().slot_of_display_codes()
    }

    /// Per-slot status: `0` untouched, `1` correct, `2` wrong.
    #[must_use]
    pub fn slot_status(&self) -> Vec<u8> {
        self.core.borrow().slot_status_codes()
    }

    /// Per-slot visibility: `0` masked, `1` revealed.
    ///
    /// The renderer draws what this says and owns no masking policy of its
    /// own — same posture as `roles` and `slot_status`, and for the same
    /// reason: the decision is engine state, so it should cross the boundary
    /// as data rather than be re-derived from a prop.
    #[must_use]
    pub fn visibility(&self) -> Vec<u8> {
        self.core.borrow().visibility_codes()
    }

    /// What the runner should do with this step: `"advance"`, `"repeat"`, or
    /// `"escape"`.
    #[must_use]
    pub fn progression(&self, now: f64) -> JsValue {
        encode(&self.core.borrow().progression(now))
    }

    /// The live state of the run.
    #[must_use]
    pub fn snapshot(&self, now: f64) -> JsValue {
        encode(&self.core.borrow().snapshot(now))
    }

    /// How much of each section is done — the skip/resume picker's data.
    #[must_use]
    pub fn section_progress(&self) -> JsValue {
        encode(&self.core.borrow().section_progress())
    }

    /// Totals across every chunk completed so far.
    #[must_use]
    pub fn cumulative_stats(&self) -> JsValue {
        encode(&self.core.borrow().cumulative())
    }

    /// Begin (or restart) the run, starting the clock.
    pub fn start(&self, now: f64) -> JsValue {
        self.apply(&Command::Start, now)
    }

    /// Feed one keystroke. `key` must be a single character; anything else
    /// is ignored the same way a non-typeable key is.
    pub fn press(&self, key: &str, now: f64) -> JsValue {
        let mut chars = key.chars();
        match (chars.next(), chars.next()) {
            (Some(key), None) => self.apply(&Command::Press { key }, now),
            _ => self.apply(&Command::Press { key: '\u{0}' }, now),
        }
    }

    /// Undo the slot behind the caret.
    pub fn backspace(&self, now: f64) -> JsValue {
        self.apply(&Command::Backspace, now)
    }

    /// Move the caret to a slot, leaving typed work untouched.
    pub fn jump_to_slot(&self, slot: usize, now: f64) -> JsValue {
        self.apply(&Command::JumpToSlot { slot }, now)
    }

    /// Move the caret to a section's first slot.
    pub fn jump_to_section(&self, section: usize, now: f64) -> JsValue {
        self.apply(&Command::JumpToSection { section }, now)
    }

    /// Move the caret to the first slot never resolved.
    pub fn resume(&self, now: f64) -> JsValue {
        self.apply(&Command::ResumeAtFirstGap, now)
    }

    /// Wave off the consecutive-error alert.
    pub fn dismiss_alert(&self, now: f64) -> JsValue {
        self.apply(&Command::DismissAlert, now)
    }

    /// Flip the manual-reveal override: freeze the auto-hide loop open for
    /// up to `reveal::MAX_MANUAL_REVEAL_MS`, or hand control back early if
    /// it is already frozen open. See `leetype::reveal::toggle_manual_override`.
    pub fn toggle_reveal(&self, now: f64) -> JsValue {
        self.apply(&Command::ToggleReveal, now)
    }

    /// Clear this chunk's progress, keeping session totals.
    pub fn reset(&self, now: f64) -> JsValue {
        self.apply(&Command::ResetChunk, now)
    }

    /// Clear everything, including session totals and the clock.
    pub fn reset_game(&self, now: f64) -> JsValue {
        self.apply(&Command::ResetGame, now)
    }

    /// Fold this chunk's work into the session totals. The returned
    /// outcome carries the completed chunk's stats.
    pub fn complete_chunk(&self, now: f64) -> JsValue {
        self.apply(&Command::CompleteChunk, now)
    }

    /// Swap in the next chunk of source, keeping the session clock running.
    pub fn start_next_chunk(&self, new_target_code: &str, now: f64) -> JsValue {
        self.apply(
            &Command::StartNextChunk {
                source: new_target_code.to_owned(),
            },
            now,
        )
    }

    /// Replay the same source as a fresh attempt — the gate held.
    pub fn retry_chunk(&self, now: f64) -> JsValue {
        self.apply(&Command::RetryChunk, now)
    }

    /// Advance the reveal loop without a keystroke. The host calls this
    /// while a step is in flight; without it, a player who has stopped
    /// typing is invisible to the controller that exists for them.
    pub fn tick(&self, now: f64) -> JsValue {
        self.apply(&Command::Tick, now)
    }

    /// Re-derive every threshold from a fresh sample of the player's speed.
    pub fn calibrate(&self, baseline_wpm: f64, dispersion_wpm: f64, now: f64) -> JsValue {
        self.apply(
            &Command::Calibrate {
                reveal: RevealConfig { baseline_wpm, dispersion_wpm },
            },
            now,
        )
    }

    /// The single place this wrapper takes a mutable borrow: one command
    /// in, one `Outcome` out, borrow released before returning.
    fn apply(&self, command: &Command, now: f64) -> JsValue {
        let outcome = self.core.borrow_mut().dispatch(command, now);
        encode(&outcome)
    }
}

/// Serialize a projection for the JS side.
///
/// A projection that fails to serialize is a bug in this crate's own types,
/// not a runtime condition the host can act on, so it degrades to `null`
/// rather than trapping the whole WASM instance - the zod schemas on the
/// other side turn that into a typed error at the seam instead.
fn encode<T: serde::Serialize>(value: &T) -> JsValue {
    serde_wasm_bindgen::to_value(value).unwrap_or(JsValue::NULL)
}

/// A calibration pair the host may or may not have. Absent means "this
/// player has not warmed up yet", which is a cold start, not an error.
fn reveal_config(baseline_wpm: f64, dispersion_wpm: Option<f64>) -> RevealConfig {
    RevealConfig {
        baseline_wpm,
        dispersion_wpm: dispersion_wpm.unwrap_or(0.0),
    }
    .sanitized()
}

/// Classify a source string's characters without constructing a game:
/// `0` for skipped layout, `1` for a typeable slot. Mirrors
/// [`TypingGame::roles`] for callers that only need to render.
#[wasm_bindgen]
#[must_use]
pub fn classify_source(input: &str) -> Vec<u8> {
    Program::compile(input).role_codes()
}

/// Map each rendered character of a source string to its slot ordinal,
/// `-1` where the character is skipped layout.
#[wasm_bindgen]
#[must_use]
pub fn slot_map_from_source(input: &str) -> Vec<i32> {
    Program::compile(input).slot_of_display_codes()
}
