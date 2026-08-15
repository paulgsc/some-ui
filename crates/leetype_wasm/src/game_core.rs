//! The engine actor.
//!
//! # Where mutation lives (canon Axiom 12.1 / ADR 0004)
//!
//! Exactly one function in this crate takes `&mut self`:
//! [`TypingGameCore::dispatch`]. It calls the pure [`step`] — which takes
//! `&TypingGameCore` and *returns* the core that should replace it — and
//! then performs a single terminal assignment. Every other method reads
//! through `&self`, and every module under `crate::leetype` is free
//! functions over borrowed state. `scripts/check-mutation-boundary.sh`
//! holds that line in CI.
//!
//! The program sits behind an [`Rc`] precisely so "compute the whole next
//! state, then assign it" stays cheap: a keystroke clones the session's
//! entry vector (a few thousand `Option<char>`) and bumps a refcount,
//! instead of threading a `&mut` down through the reducer.

use std::rc::Rc;

use crate::leetype::program::Program;
use crate::leetype::reveal::{self, RevealConfig};
use crate::leetype::session::{self, Command as SessionCommand, SessionConfig, SessionState};
use crate::leetype::view::{self, ChunkCompletionStats, CumulativeStats, Layout, Outcome, SectionProgress, Snapshot};
use crate::leetype::{stats, Rejection};

/// Everything a caller can ask the engine to do.
#[derive(Debug, Clone, PartialEq)]
pub enum Command {
    /// Begin (or restart) the run, starting the clock.
    Start,
    /// A printable keystroke.
    Press { key: char },
    /// Undo the slot behind the caret.
    Backspace,
    /// Move the caret to a slot, leaving typed work untouched.
    JumpToSlot { slot: usize },
    /// Move the caret to a section's first slot.
    JumpToSection { section: usize },
    /// Move the caret to the first slot never resolved.
    ResumeAtFirstGap,
    /// Wave off the consecutive-error alert.
    DismissAlert,
    /// Flip the manual-reveal override — see
    /// `leetype::reveal::toggle_manual_override` and
    /// `leetype::session::Command::ToggleReveal`, which this delegates to
    /// unchanged.
    ToggleReveal,
    /// Clear the current chunk's progress, keeping session totals.
    ResetChunk,
    /// Clear everything, including session totals and the clock.
    ResetGame,
    /// Fold the current chunk's work into the session totals.
    CompleteChunk,
    /// Swap in the next chunk of source, keeping the clock running.
    StartNextChunk { source: String },
    /// Replay the *same* source as a fresh attempt: the gate held, so the
    /// step comes round again with a shorter initial delay and nothing else
    /// carried over. Repetition is the intervention (see `reveal`).
    RetryChunk,
    /// Nothing happened. Drives the reveal loop for a player who has stopped
    /// typing — see [`SessionCommand::Tick`].
    Tick,
    /// Replace the reveal loop's bands with ones derived from a fresh sample
    /// of the player's own typing speed.
    ///
    /// A command rather than a setter because this crate has exactly one
    /// mutation point and it is `dispatch` (canon Axiom 12.1 / ADR 0004).
    Calibrate { reveal: RevealConfig },
}

/// What [`step`] produced besides the next core. Kept separate from
/// [`Outcome`] so `step` never has to project a snapshot it would only
/// throw away — `dispatch` takes that from the core it is about to commit.
#[derive(Debug, Clone, Copy, PartialEq)]
struct StepResult {
    accepted: bool,
    rejection: Option<Rejection>,
    chunk: Option<ChunkCompletionStats>,
}

impl StepResult {
    const fn accepted() -> Self {
        Self {
            accepted: true,
            rejection: None,
            chunk: None,
        }
    }

    const fn refused(rejection: Rejection) -> Self {
        Self {
            accepted: false,
            rejection: Some(rejection),
            chunk: None,
        }
    }
}

/// The typing engine: one compiled chunk, one player's progress through
/// it, and the totals carried across chunks.
#[derive(Debug, Clone, PartialEq)]
pub struct TypingGameCore {
    program: Rc<Program>,
    config: SessionConfig,
    session: SessionState,
    cumulative: CumulativeStats,
    game_start_time: Option<f64>,
}

impl TypingGameCore {
    /// Compile `source` and start an untouched run over it.
    #[must_use]
    pub fn new(source: &str, max_consecutive_errors: Option<usize>, reveal: Option<RevealConfig>) -> Self {
        let program = Rc::new(Program::compile(source));
        let session = SessionState::empty(program.slot_count());
        let defaults = SessionConfig::default();

        Self {
            program,
            config: SessionConfig {
                max_consecutive_errors: max_consecutive_errors.unwrap_or(defaults.max_consecutive_errors),
                reveal: reveal.map_or(defaults.reveal, RevealConfig::sanitized),
            },
            session,
            cumulative: CumulativeStats::default(),
            game_start_time: None,
        }
    }

    /// The one state transition in this crate: compute the whole next core
    /// purely, then assign it.
    pub fn dispatch(&mut self, command: &Command, now: f64) -> Outcome {
        let (next, result) = step(self, command, now);
        let outcome = Outcome {
            accepted: result.accepted,
            rejection: result.rejection,
            chunk: result.chunk,
            snapshot: next.snapshot(now),
        };
        *self = next;
        outcome
    }

    /// The chunk's fixed structure — sections and sizes.
    #[must_use]
    pub fn layout(&self) -> Layout {
        view::layout(&self.program)
    }

    /// Per-rendered-character roles (`0` skipped, `1` typeable).
    #[must_use]
    pub fn role_codes(&self) -> Vec<u8> {
        self.program.role_codes()
    }

    /// Per-rendered-character slot ordinals, `-1` where skipped.
    #[must_use]
    pub fn slot_of_display_codes(&self) -> Vec<i32> {
        self.program.slot_of_display_codes()
    }

    /// Per-slot status (`0` untouched, `1` correct, `2` wrong).
    #[must_use]
    pub fn slot_status_codes(&self) -> Vec<u8> {
        session::slot_status_codes(&self.session, &self.program)
    }

    /// Per-slot visibility (`0` masked, `1` revealed) — the reveal window
    /// projected for the renderer, which owns no masking policy of its own.
    #[must_use]
    pub fn visibility_codes(&self) -> Vec<u8> {
        reveal::visibility_codes(&self.session.reveal, &self.program, self.session.cursor)
    }

    /// What the runner should do with this step, given how it was typed.
    #[must_use]
    pub fn progression(&self, now: f64) -> reveal::Progression {
        reveal::progression(self.snapshot(now).weighted_wpm, self.session.reveal.attempt, self.config.reveal)
    }

    /// The live state of the run.
    #[must_use]
    pub fn snapshot(&self, now: f64) -> Snapshot {
        view::snapshot(&self.session, &self.program, self.config, self.game_start_time, now)
    }

    /// How far the player has got in each section.
    #[must_use]
    pub fn section_progress(&self) -> Vec<SectionProgress> {
        view::section_progress(&self.session, &self.program)
    }

    /// Totals across every chunk completed so far.
    #[must_use]
    pub const fn cumulative(&self) -> CumulativeStats {
        self.cumulative
    }

    /// Keystrokes the current chunk is worth.
    #[must_use]
    pub fn slot_count(&self) -> usize {
        self.program.slot_count()
    }

    /// The core as it would be with a different session, sharing the same
    /// compiled program. Keeps [`step`]'s arms from re-listing every field.
    fn with_session(&self, session: SessionState) -> Self {
        Self {
            program: Rc::clone(&self.program),
            config: self.config,
            session,
            cumulative: self.cumulative,
            game_start_time: self.game_start_time,
        }
    }
}

/// Pure transition: read `core`, return the core that should replace it.
fn step(core: &TypingGameCore, command: &Command, now: f64) -> (TypingGameCore, StepResult) {
    match command {
        Command::Start => {
            let mut next = core.with_session(SessionState::empty(core.program.slot_count()).started(now));
            next.game_start_time = core.game_start_time.or(Some(now));
            (next, StepResult::accepted())
        }

        Command::ResetChunk => (core.with_session(SessionState::empty(core.program.slot_count())), StepResult::accepted()),

        Command::ResetGame => {
            let mut next = core.with_session(SessionState::empty(core.program.slot_count()));
            next.cumulative = CumulativeStats::default();
            next.game_start_time = None;
            (next, StepResult::accepted())
        }

        Command::CompleteChunk => complete_chunk(core, now),

        // The clock the *snapshot* reports restarts here, and the session
        // clock (`game_start_time`) does not. Both are wanted, for different
        // consumers: the weighted figure gates one step and would be
        // meaningless measured over every step before it, while the WASM
        // object is deliberately not torn down and rebuilt, so session-wide
        // timing stays continuous across the swap.
        Command::StartNextChunk { source } => {
            let program = Rc::new(Program::compile(source));
            let session = SessionState::empty(program.slot_count()).started(now);
            let next = TypingGameCore {
                program,
                config: core.config,
                session,
                cumulative: core.cumulative,
                game_start_time: core.game_start_time.or(Some(now)),
            };
            (next, StepResult::accepted())
        }

        Command::RetryChunk => {
            let session = SessionState::retrying(core.program.slot_count(), &core.session).started(now);
            (core.with_session(session), StepResult::accepted())
        }

        Command::Calibrate { reveal } => {
            let mut next = core.with_session(core.session.clone());
            next.config = SessionConfig {
                reveal: reveal.sanitized(),
                ..core.config
            };
            (next, StepResult::accepted())
        }

        Command::JumpToSection { section } => core.program.sections().get(*section).map_or_else(
            || (core.clone(), StepResult::refused(Rejection::NothingPending)),
            |target| apply_session(core, SessionCommand::JumpToSlot { slot: target.start_slot }, now),
        ),

        Command::ResumeAtFirstGap => {
            let slot = session::first_gap(&core.session.entries).unwrap_or_else(|| core.program.slot_count());
            apply_session(core, SessionCommand::JumpToSlot { slot }, now)
        }

        Command::Press { key } => apply_session(core, SessionCommand::Press { key: *key }, now),
        Command::Backspace => apply_session(core, SessionCommand::Backspace, now),
        Command::JumpToSlot { slot } => apply_session(core, SessionCommand::JumpToSlot { slot: *slot }, now),
        Command::DismissAlert => apply_session(core, SessionCommand::DismissAlert, now),
        Command::ToggleReveal => apply_session(core, SessionCommand::ToggleReveal, now),
        Command::Tick => apply_session(core, SessionCommand::Tick, now),
    }
}

fn apply_session(core: &TypingGameCore, command: SessionCommand, now: f64) -> (TypingGameCore, StepResult) {
    let transition = session::reduce(&core.session, &core.program, core.config, command, now);
    let result = transition.rejection.map_or_else(StepResult::accepted, StepResult::refused);

    (core.with_session(transition.state), result)
}

fn complete_chunk(core: &TypingGameCore, now: f64) -> (TypingGameCore, StepResult) {
    let chars_typed = session::correct_count(&core.session, &core.program);
    let chunk = ChunkCompletionStats {
        chars_typed,
        errors: core.session.total_errors,
        elapsed_time: stats::elapsed_seconds(core.game_start_time, now),
    };

    let mut next = core.with_session(core.session.clone());
    next.cumulative = CumulativeStats {
        chars_typed: core.cumulative.chars_typed + chars_typed,
        errors: core.cumulative.errors + core.session.total_errors,
    };

    (
        next,
        StepResult {
            accepted: true,
            rejection: None,
            chunk: Some(chunk),
        },
    )
}

#[cfg(test)]
mod tests {
    use super::{Command, RevealConfig, TypingGameCore};
    use crate::leetype::Rejection;

    const SOURCE: &str = "fn one() {\n    a();\n}\nfn two() {\n    b();\n}\n";

    fn type_text(core: &mut TypingGameCore, text: &str, now: f64) {
        for key in text.chars() {
            core.dispatch(&Command::Press { key }, now);
        }
    }

    #[test]
    fn a_fresh_core_is_parked_on_the_first_token() {
        let core = TypingGameCore::new(SOURCE, None, None);
        let snapshot = core.snapshot(0.0);
        assert_eq!(snapshot.cursor_slot, 0);
        assert_eq!(snapshot.cursor_display, 0);
        assert_eq!(snapshot.first_gap_slot, Some(0));
        assert!(!snapshot.started);
    }

    #[test]
    fn typing_the_token_stream_completes_the_chunk() {
        let mut core = TypingGameCore::new("fn a() {\n    b();\n}", None, None);
        core.dispatch(&Command::Start, 0.0);
        type_text(&mut core, "fn a() {b();}", 1.0);

        let snapshot = core.snapshot(60_000.0);
        assert!(snapshot.is_complete);
        assert_eq!(snapshot.total_errors, 0);
        assert!((snapshot.accuracy - 100.0).abs() < f64::EPSILON);
        assert!((snapshot.progress - 100.0).abs() < f64::EPSILON);
    }

    #[test]
    fn the_caret_never_lands_on_skipped_layout() {
        let mut core = TypingGameCore::new("fn a() {\n    b();\n}", None, None);
        core.dispatch(&Command::Start, 0.0);

        let roles = core.role_codes();
        let stream: Vec<char> = "fn a() {b();}".chars().collect();

        for expected in stream {
            let cursor = core.snapshot(0.0).cursor_display;
            assert_eq!(roles[cursor], 1, "caret parked on skipped char {cursor}");
            core.dispatch(&Command::Press { key: expected }, 0.0);
        }

        assert!(core.snapshot(0.0).is_complete);
    }

    #[test]
    fn an_extra_space_is_reported_as_a_rejection() {
        let mut core = TypingGameCore::new("fn a() {\n    b();\n}", None, None);
        core.dispatch(&Command::Start, 0.0);
        type_text(&mut core, "fn a() {", 0.0);

        let outcome = core.dispatch(&Command::Press { key: ' ' }, 0.0);
        assert!(!outcome.accepted);
        assert_eq!(outcome.rejection, Some(Rejection::ExtraSpace));
        assert_eq!(outcome.snapshot.total_errors, 0);
    }

    #[test]
    fn jumping_to_a_section_moves_the_caret_without_losing_work() {
        let mut core = TypingGameCore::new(SOURCE, None, None);
        core.dispatch(&Command::Start, 0.0);
        type_text(&mut core, "fn ", 0.0);

        let target = core.layout().sections[1].start_slot;
        let outcome = core.dispatch(&Command::JumpToSection { section: 1 }, 0.0);

        assert!(outcome.accepted);
        assert_eq!(outcome.snapshot.cursor_slot, target);
        assert_eq!(outcome.snapshot.cursor_section, Some(1));
        assert_eq!(outcome.snapshot.filled, 3);
        assert_eq!(outcome.snapshot.first_gap_slot, Some(3));
    }

    #[test]
    fn jumping_to_a_section_that_does_not_exist_is_refused() {
        let mut core = TypingGameCore::new(SOURCE, None, None);
        let outcome = core.dispatch(&Command::JumpToSection { section: 99 }, 0.0);
        assert!(!outcome.accepted);
        assert_eq!(outcome.snapshot.cursor_slot, 0);
    }

    #[test]
    fn resume_returns_to_the_first_hole() {
        let mut core = TypingGameCore::new(SOURCE, None, None);
        core.dispatch(&Command::Start, 0.0);
        type_text(&mut core, "fn ", 0.0);
        core.dispatch(&Command::JumpToSection { section: 1 }, 0.0);
        type_text(&mut core, "fn", 0.0);

        let outcome = core.dispatch(&Command::ResumeAtFirstGap, 0.0);
        assert_eq!(outcome.snapshot.cursor_slot, 3);
    }

    #[test]
    fn section_progress_tracks_what_has_been_typed() {
        let mut core = TypingGameCore::new(SOURCE, None, None);
        core.dispatch(&Command::Start, 0.0);
        type_text(&mut core, "fnone", 0.0);

        let progress = core.section_progress();
        assert_eq!(progress.len(), 2);
        assert_eq!(progress[0].filled, 5);
        assert_eq!(progress[1].filled, 0);
    }

    #[test]
    fn completing_a_chunk_folds_into_the_cumulative_totals() {
        let mut core = TypingGameCore::new("abc", None, None);
        core.dispatch(&Command::Start, 0.0);
        type_text(&mut core, "abc", 0.0);

        let outcome = core.dispatch(&Command::CompleteChunk, 60_000.0);
        let chunk = outcome.chunk.unwrap();
        assert_eq!(chunk.chars_typed, 3);
        assert_eq!(chunk.errors, 0);
        assert!((chunk.elapsed_time - 60.0).abs() < f64::EPSILON);
        assert_eq!(core.cumulative().chars_typed, 3);
    }

    #[test]
    fn the_next_chunk_replaces_the_program_and_restarts_the_step_clock_only() {
        // Two clocks, two consumers. The step clock restarts because the
        // weighted figure gates *this* step and would be meaningless
        // measured over every step before it; the session clock does not,
        // because the engine is deliberately not torn down between steps.
        let mut core = TypingGameCore::new("abc", None, None);
        core.dispatch(&Command::Start, 1_000.0);
        type_text(&mut core, "abc", 1_000.0);
        core.dispatch(&Command::StartNextChunk { source: "de\nfg".to_owned() }, 31_000.0);

        let snapshot = core.snapshot(61_000.0);
        assert_eq!(snapshot.slot_count, 4);
        assert_eq!(snapshot.filled, 0);
        assert!(snapshot.started);
        assert!((snapshot.elapsed_time - 30.0).abs() < f64::EPSILON);
        assert!((snapshot.session_elapsed_time - 60.0).abs() < f64::EPSILON);
    }

    #[test]
    fn a_retry_replays_the_same_source_as_a_further_attempt() {
        let mut core = TypingGameCore::new("abc", None, None);
        core.dispatch(&Command::Start, 0.0);
        type_text(&mut core, "axc", 0.0);
        assert_eq!(core.snapshot(0.0).attempt, 0);

        let outcome = core.dispatch(&Command::RetryChunk, 5_000.0);
        assert_eq!(outcome.snapshot.attempt, 1);
        assert_eq!(outcome.snapshot.slot_count, 3);
        assert_eq!(outcome.snapshot.filled, 0);
        assert_eq!(outcome.snapshot.total_errors, 0);
        assert!(outcome.snapshot.started);
    }

    #[test]
    fn calibrating_moves_the_gate_without_disturbing_the_run() {
        let mut core = TypingGameCore::new("abcdef", None, None);
        core.dispatch(&Command::Start, 0.0);
        type_text(&mut core, "abc", 0.0);

        let before = core.snapshot(1_000.0);
        let outcome = core.dispatch(
            &Command::Calibrate {
                reveal: RevealConfig {
                    baseline_wpm: 120.0,
                    dispersion_wpm: 8.0,
                },
            },
            1_000.0,
        );

        assert!(outcome.snapshot.gate_threshold > before.gate_threshold);
        assert_eq!(outcome.snapshot.filled, before.filled);
        assert_eq!(outcome.snapshot.cursor_slot, before.cursor_slot);
    }

    #[test]
    fn a_tick_opens_the_window_for_a_player_who_has_stopped_typing() {
        let mut core = TypingGameCore::new("let mut map = HashMap::new();", None, None);
        core.dispatch(&Command::Start, 0.0);
        assert_eq!(core.snapshot(0.0).reveal_k, 0, "a step starts fully masked");

        let mut now = 0.0;
        for _ in 0..4 {
            now += 3_000.0;
            core.dispatch(&Command::Tick, now);
        }

        let snapshot = core.snapshot(now);
        assert!(snapshot.reveal_k > 0, "an idle player must not be locked out");
        assert!(core.visibility_codes().contains(&1));
    }

    #[test]
    fn resetting_the_game_clears_totals_and_the_clock() {
        let mut core = TypingGameCore::new("abc", None, None);
        core.dispatch(&Command::Start, 0.0);
        type_text(&mut core, "abc", 0.0);
        core.dispatch(&Command::CompleteChunk, 1_000.0);
        core.dispatch(&Command::ResetGame, 1_000.0);

        assert_eq!(core.cumulative().chars_typed, 0);
        assert!(!core.snapshot(0.0).started);
    }

    #[test]
    fn resetting_the_chunk_keeps_session_totals() {
        let mut core = TypingGameCore::new("abc", None, None);
        core.dispatch(&Command::Start, 0.0);
        type_text(&mut core, "abc", 0.0);
        core.dispatch(&Command::CompleteChunk, 1_000.0);
        core.dispatch(&Command::ResetChunk, 1_000.0);

        assert_eq!(core.cumulative().chars_typed, 3);
        assert_eq!(core.snapshot(0.0).filled, 0);
    }

    #[test]
    fn the_error_ceiling_blocks_input_until_a_backspace() {
        let mut core = TypingGameCore::new("abcdefg", Some(2), None);
        core.dispatch(&Command::Start, 0.0);
        type_text(&mut core, "xy", 0.0);

        let blocked = core.dispatch(&Command::Press { key: 'z' }, 0.0);
        assert_eq!(blocked.rejection, Some(Rejection::ErrorCeiling));
        assert!(blocked.snapshot.show_error_alert);

        core.dispatch(&Command::Backspace, 0.0);
        let recovered = core.dispatch(&Command::Press { key: 'b' }, 0.0);
        assert!(recovered.accepted);
    }

    #[test]
    fn dismissing_the_alert_hides_it_without_unblocking_input() {
        let mut core = TypingGameCore::new("abcdefg", Some(2), None);
        core.dispatch(&Command::Start, 0.0);
        type_text(&mut core, "xy", 0.0);

        let dismissed = core.dispatch(&Command::DismissAlert, 0.0);
        assert!(!dismissed.snapshot.show_error_alert);
        assert_eq!(core.dispatch(&Command::Press { key: 'z' }, 0.0).rejection, Some(Rejection::ErrorCeiling));
    }

    #[test]
    fn the_status_and_role_maps_line_up_with_the_rendered_source() {
        let mut core = TypingGameCore::new("fn a() {\n    b();\n}", None, None);
        core.dispatch(&Command::Start, 0.0);
        type_text(&mut core, "fx", 0.0);

        let roles = core.role_codes();
        let slots = core.slot_of_display_codes();
        let status = core.slot_status_codes();

        assert_eq!(roles.len(), slots.len());
        assert_eq!(status.len(), core.slot_count());
        assert_eq!(status[0], 1);
        assert_eq!(status[1], 2);
        assert_eq!(status[2], 0);
    }

    #[test]
    fn an_empty_program_is_inert_rather_than_complete() {
        let mut core = TypingGameCore::new("", None, None);
        let outcome = core.dispatch(&Command::Press { key: 'a' }, 0.0);
        assert_eq!(outcome.rejection, Some(Rejection::NothingPending));
        assert!(!outcome.snapshot.is_complete);
        assert_eq!(outcome.snapshot.slot_count, 0);
    }

    #[test]
    fn toggling_reveal_forces_the_step_fully_visible_immediately() {
        let mut core = TypingGameCore::new("let mut map = HashMap::new();", None, None);
        core.dispatch(&Command::Start, 0.0);
        assert!(core.visibility_codes().contains(&0), "a step starts with something masked");

        let outcome = core.dispatch(&Command::ToggleReveal, 0.0);
        assert!(outcome.accepted);
        assert!(
            core.visibility_codes().iter().all(|&code| code == 1),
            "the toggle should reveal the whole step immediately, without waiting on the initial delay"
        );
        assert_eq!(outcome.snapshot.reveal_k, outcome.snapshot.run_count);
        assert!(outcome.snapshot.manual_reveal_active);
        assert!((outcome.snapshot.manual_reveal_fraction - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn toggling_reveal_a_second_time_hands_control_back_to_the_auto_loop() {
        let mut core = TypingGameCore::new("let mut map = HashMap::new();", None, None);
        core.dispatch(&Command::Start, 0.0);
        core.dispatch(&Command::ToggleReveal, 0.0);

        let outcome = core.dispatch(&Command::ToggleReveal, 0.0);
        assert!(outcome.accepted);
        assert!(!outcome.snapshot.manual_reveal_active);
        assert!((outcome.snapshot.manual_reveal_fraction - 0.0).abs() < f64::EPSILON);
    }
}
