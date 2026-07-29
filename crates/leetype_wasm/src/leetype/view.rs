//! Read-only projections of the engine, shaped for the JS renderer.
//!
//! These are the only types that cross the WASM boundary as structured
//! values, so they are the contract `packages/ui/leetype`'s zod schemas
//! mirror. All of them are computed from `&`-borrows; nothing here can
//! change the engine.

use serde::{Deserialize, Serialize};

use super::program::{Program, Section};
use super::session::{self, Rejection, SessionConfig, SessionState};
use super::stats;

/// Everything about a chunk that never changes while it is being typed.
/// Fetched once per chunk; the per-character `roles`/`slotOfDisplay` maps
/// travel separately as typed arrays.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layout {
    /// Rendered characters in the chunk.
    pub display_len: usize,
    /// Keystrokes the chunk is worth.
    pub slot_count: usize,
    /// Navigable regions, in source order.
    pub sections: Vec<Section>,
}

/// The live state of a run.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// Slot the caret is on.
    pub cursor_slot: usize,
    /// Rendered-character index of the caret — what the overlay highlights.
    /// Always a typeable character (or one past the end), never indentation.
    pub cursor_display: usize,
    /// Section the caret is inside, if any.
    pub cursor_section: Option<usize>,
    pub slot_count: usize,
    /// Slots holding any character, right or wrong.
    pub filled: usize,
    /// Slots holding the right character.
    pub correct: usize,
    /// First slot never resolved — where "resume" goes.
    pub first_gap_slot: Option<usize>,
    pub progress: f64,
    pub accuracy: f64,
    pub wpm: usize,
    pub elapsed_time: f64,
    pub total_errors: usize,
    pub consecutive_errors: usize,
    pub show_error_alert: bool,
    pub is_complete: bool,
    pub started: bool,
}

/// How much of one section is done, for the skip/resume picker.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionProgress {
    pub index: usize,
    pub slot_count: usize,
    pub filled: usize,
    pub correct: usize,
}

/// What one dispatched command did.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    /// Whether the command changed anything.
    pub accepted: bool,
    /// Why it didn't, when it didn't.
    pub rejection: Option<Rejection>,
    /// Set only by a chunk completion, which is the one command that
    /// reports figures the next snapshot has already moved past.
    pub chunk: Option<ChunkCompletionStats>,
    pub snapshot: Snapshot,
}

/// Stats for a chunk that has just been finished, folded into the session
/// totals before the next chunk replaces it.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkCompletionStats {
    pub chars_typed: usize,
    pub errors: usize,
    pub elapsed_time: f64,
}

/// Totals carried across every chunk of a session.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CumulativeStats {
    pub chars_typed: usize,
    pub errors: usize,
}

/// Project a session into the snapshot the UI renders from.
pub fn snapshot(state: &SessionState, program: &Program, config: SessionConfig, now: f64) -> Snapshot {
    let correct = session::correct_count(state, program);
    let consecutive_errors = session::consecutive_errors(state, program);
    let elapsed_time = stats::elapsed_seconds(state.started_at, now);

    Snapshot {
        cursor_slot: state.cursor,
        cursor_display: program.slot_display_index(state.cursor),
        cursor_section: program.section_of_slot(state.cursor).map(|section| section.index),
        slot_count: program.slot_count(),
        filled: session::filled_count(state),
        correct,
        first_gap_slot: session::first_gap(&state.entries),
        progress: stats::progress(correct, program.slot_count()),
        accuracy: stats::accuracy(correct, state.total_errors),
        wpm: stats::wpm(correct, elapsed_time),
        elapsed_time,
        total_errors: state.total_errors,
        consecutive_errors,
        show_error_alert: consecutive_errors >= config.max_consecutive_errors && !state.alert_dismissed,
        is_complete: session::is_complete(state, program),
        started: state.started_at.is_some(),
    }
}

/// Project the chunk's fixed structure.
pub fn layout(program: &Program) -> Layout {
    Layout {
        display_len: program.display_len(),
        slot_count: program.slot_count(),
        sections: program.sections().to_vec(),
    }
}

/// Per-section completion, for the skip/resume picker.
pub fn section_progress(state: &SessionState, program: &Program) -> Vec<SectionProgress> {
    program
        .sections()
        .iter()
        .map(|section| {
            let range = section.start_slot..section.end_slot;
            let filled = range.clone().filter(|&slot| state.entries.get(slot).copied().flatten().is_some()).count();
            let correct = range
                .filter(|&slot| matches!((state.entries.get(slot).copied().flatten(), program.slot_char(slot)), (Some(t), Some(e)) if t == e))
                .count();

            SectionProgress {
                index: section.index,
                slot_count: section.slot_count(),
                filled,
                correct,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{layout, section_progress, snapshot, Program, SessionConfig, SessionState};

    #[test]
    fn a_fresh_snapshot_parks_the_caret_on_the_first_token() {
        let program = Program::compile("    fn a() {}\n");
        let state = SessionState::empty(program.slot_count());
        let view = snapshot(&state, &program, SessionConfig::default(), 0.0);

        assert_eq!(view.cursor_slot, 0);
        assert_eq!(view.cursor_display, 4);
        assert_eq!(view.filled, 0);
        assert!(!view.started);
        assert!(!view.is_complete);
        assert!((view.accuracy - 100.0).abs() < f64::EPSILON);
    }

    #[test]
    fn layout_reports_the_whole_chunk() {
        let program = Program::compile("fn a() {}\nfn b() {}\n");
        let view = layout(&program);
        assert_eq!(view.display_len, program.display_len());
        assert_eq!(view.slot_count, program.slot_count());
        assert_eq!(view.sections.len(), 2);
    }

    #[test]
    fn section_progress_covers_every_section() {
        let program = Program::compile("fn a() {}\nfn b() {}\n");
        let state = SessionState::empty(program.slot_count());
        let progress = section_progress(&state, &program);

        assert_eq!(progress.len(), 2);
        assert!(progress.iter().all(|entry| entry.filled == 0 && entry.slot_count > 0));
    }
}
