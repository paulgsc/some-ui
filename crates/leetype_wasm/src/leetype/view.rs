//! Read-only projections of the engine, shaped for the JS renderer.
//!
//! These are the only types that cross the WASM boundary as structured
//! values, so they are the contract `packages/ui/leetype`'s zod schemas
//! mirror. All of them are computed from `&`-borrows; nothing here can
//! change the engine.

use serde::{Deserialize, Serialize};

use super::program::{Program, Section};
use super::reveal;
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
    /// The chunk's rendered text — what a renderer must draw, and what
    /// `roles`/`slotOfDisplay`/`slotStatus`/`visibility` are indexed
    /// against.
    ///
    /// Not always the authored source verbatim: a context span's
    /// delimiters are stripped before this is built (see
    /// `leetype::program::Role::Context`). A consumer that indexes those
    /// per-character maps against the raw source it authored, instead of
    /// against this field, falls out of alignment at the first context
    /// span — this is the one field that stays in agreement with them by
    /// construction.
    pub display_source: String,
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
    /// Cumulative WPM over the whole run — the figure the player is shown.
    pub wpm: usize,
    /// Instantaneous, windowed WPM — the figure the reveal window is driven
    /// by. Volatile on purpose: that volatility *is* the signal.
    pub instant_wpm: f64,
    /// Weighted WPM: rate discounted by assistance taken and accuracy. The
    /// gate reads this one and nothing else.
    pub weighted_wpm: f64,
    /// Weighted WPM the player must reach to leave this step, derived from
    /// their own sampled baseline.
    ///
    /// The comparison itself is deliberately not a field: `weightedWpm >=
    /// gateThreshold` is one expression, and a fourth boolean on a wire
    /// projection is a worse trade than asking the caller to write it.
    pub gate_threshold: f64,
    /// Which attempt at this step this is, zero-based.
    pub attempt: usize,
    /// How many runs ahead of the caret are unmasked. `0` is fully masked.
    pub reveal_k: usize,
    /// Reveal units the chunk holds in total — the ceiling `reveal_k`
    /// converges to for a player who never types.
    pub run_count: usize,
    /// Whether a manual-reveal toggle currently has the auto-hide loop
    /// frozen open. See `reveal::toggle_manual_override`; this is the read
    /// side the renderer's visual ergonomic effect is driven by.
    pub manual_reveal_active: bool,
    /// Fraction of the manual-reveal freeze window still remaining — `1.0`
    /// the instant a toggle opens it, decaying to `0.0` as it lifts. Always
    /// `0.0` when `manual_reveal_active` is `false`.
    pub manual_reveal_fraction: f64,
    /// Correctly-resolved slots the player could see at the moment they
    /// resolved them.
    pub assisted: usize,
    /// Seconds this *step* has been in flight. Restarts on every source
    /// swap, because the weighted figure gates one step and would be
    /// meaningless measured over all the steps before it.
    pub elapsed_time: f64,
    /// Seconds since the session began, across every step of it. Continuous
    /// across a source swap — the engine is not torn down between steps.
    pub session_elapsed_time: f64,
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
///
/// `session_started_at` is the *game* clock, which outlives any one step;
/// `state.started_at` is the step's own.
pub fn snapshot(state: &SessionState, program: &Program, config: SessionConfig, session_started_at: Option<f64>, now: f64) -> Snapshot {
    let correct = session::correct_count(state, program);
    let consecutive_errors = session::consecutive_errors(state, program);
    let elapsed_time = stats::elapsed_seconds(state.started_at, now);
    let assisted = state.assisted_count(program);
    let weighted_wpm = stats::weighted_wpm(correct, assisted, state.total_errors, elapsed_time);
    let gate_threshold = config.reveal.gate_threshold();
    let manual_reveal_fraction = reveal::manual_reveal_fraction(state.reveal.manual_override_until, now);

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
        instant_wpm: stats::instantaneous_wpm(&state.keystrokes, now),
        weighted_wpm,
        gate_threshold,
        attempt: state.reveal.attempt,
        reveal_k: state.reveal.k,
        run_count: program.runs().len(),
        manual_reveal_active: manual_reveal_fraction > 0.0,
        manual_reveal_fraction,
        assisted,
        elapsed_time,
        session_elapsed_time: stats::elapsed_seconds(session_started_at, now),
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
        display_source: program.rendered(),
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
        let view = snapshot(&state, &program, SessionConfig::default(), None, 0.0);

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
        assert_eq!(view.display_source, "fn a() {}\nfn b() {}\n");
    }

    #[test]
    fn layouts_display_source_has_context_delimiters_stripped_but_content_kept() {
        // The field a renderer must draw instead of the raw authored
        // source: it stays index-aligned with roles/slotOfDisplay even
        // once a context span has removed characters (the delimiters) the
        // author typed. Context *content* is still rendered — only the
        // delimiter markup vanishes.
        let program = Program::compile("‹a hint›fn a() {}\n");
        let view = layout(&program);
        assert_eq!(view.display_source, "a hintfn a() {}\n");
        assert_eq!(view.display_source.chars().count(), view.display_len);
    }

    #[test]
    fn section_progress_covers_every_section() {
        let program = Program::compile("fn a() {}\nfn b() {}\n");
        let state = SessionState::empty(program.slot_count());
        let progress = section_progress(&state, &program);

        assert_eq!(progress.len(), 2);
        assert!(progress.iter().all(|entry| entry.filled == 0 && entry.slot_count > 0));
    }

    #[test]
    fn a_fresh_snapshot_has_no_manual_override_in_force() {
        let program = Program::compile("let x = 1;");
        let state = SessionState::empty(program.slot_count());
        let view = snapshot(&state, &program, SessionConfig::default(), None, 0.0);

        assert!(!view.manual_reveal_active);
        assert!((view.manual_reveal_fraction - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn the_snapshot_projects_the_manual_override_the_toggle_produces() {
        let program = Program::compile("let x = 1;");
        let mut state = SessionState::empty(program.slot_count());
        state.reveal.manual_override_until = Some(4_000.0);

        let view = snapshot(&state, &program, SessionConfig::default(), None, 2_000.0);
        assert!(view.manual_reveal_active);
        assert!((view.manual_reveal_fraction - 0.25).abs() < f64::EPSILON);
    }
}
