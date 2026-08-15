//! One player's progress through a compiled [`Program`], and the pure
//! reducer that advances it.
//!
//! Nothing here mutates anything the caller owns: [`reduce`] takes
//! `&SessionState` and returns a fresh one. The single place a `&mut`
//! actually lands is `TypingGameCore::dispatch`, which assigns the value
//! this module computed (canon Axiom 12.1 / ADR 0004).

use serde::{Deserialize, Serialize};

use super::program::Program;
use super::reveal::{self, RevealConfig, RevealState};
use super::stats;

/// Tuning knobs fixed at construction time.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SessionConfig {
    /// How many wrong keystrokes in a row before input is blocked and the
    /// player has to back up.
    pub max_consecutive_errors: usize,
    /// The bands and delays the reveal loop runs on, all derived from the
    /// player's own sampled typing speed.
    pub reveal: RevealConfig,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            max_consecutive_errors: 3,
            reveal: RevealConfig::default(),
        }
    }
}

/// Why a keystroke did not land.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Rejection {
    /// The space bar was pressed where the pending slot is not a space.
    ///
    /// Indentation is auto-skipped, so a second space is never owed — it is
    /// the old "match the whitespace exactly" reflex, and swallowing it is
    /// kinder (and more honest) than charging the player an error for a
    /// keystroke the game itself made unnecessary.
    ExtraSpace,
    /// The consecutive-error ceiling is reached; only backspace helps now.
    ErrorCeiling,
    /// Nothing is pending — the chunk is finished.
    NothingPending,
    /// A key with no slot in the typeable stream (Enter, Tab, …). Layout is
    /// the machine's job, so these are quietly ignored rather than scored.
    NotTypeable,
}

/// The player's progress through a chunk.
///
/// `entries` is indexed by slot and sized to the program, so a jump can
/// leave holes behind without disturbing anything already typed — which is
/// exactly what "skip this section, come back later" needs.
#[derive(Debug, Clone, PartialEq)]
pub struct SessionState {
    /// What the player actually produced for each slot; `None` = untouched.
    pub entries: Vec<Option<char>>,
    /// The slot the caret sits on.
    pub cursor: usize,
    /// Every wrong keystroke made in this chunk, including ones since
    /// corrected — this is the denominator half of accuracy, not a count of
    /// currently-wrong slots.
    pub total_errors: usize,
    /// When the run began, in host milliseconds.
    pub started_at: Option<f64>,
    /// The player waved off the error alert; cleared as soon as the streak
    /// that raised it is broken.
    pub alert_dismissed: bool,
    /// Timestamps of the most recent keystrokes, oldest first, capped at
    /// [`stats::INSTANT_WINDOW`].
    ///
    /// Bounded on purpose: a `Vec<f64>` growing with the step would be
    /// affordable at step scale, but "affordable" is not the same as
    /// "decided", and the instantaneous figure only ever reads the tail. The
    /// cumulative figures do not need the history at all — they are
    /// arithmetic over counts and one start time.
    pub keystrokes: Vec<f64>,
    /// Per slot: was the player being shown it at the moment they resolved
    /// it? This is the per-slot assistance fact the weighted figure
    /// discounts by, recorded where it is knowable rather than guessed at
    /// per step afterwards.
    pub assisted: Vec<bool>,
    /// How much of the step is currently unmasked.
    pub reveal: RevealState,
}

impl SessionState {
    /// A fresh, untouched pass over a program with `slot_count` slots.
    pub fn empty(slot_count: usize) -> Self {
        Self {
            entries: vec![None; slot_count],
            cursor: 0,
            total_errors: 0,
            started_at: None,
            alert_dismissed: false,
            keystrokes: Vec::with_capacity(stats::INSTANT_WINDOW),
            assisted: vec![false; slot_count],
            reveal: RevealState::empty(slot_count),
        }
    }

    /// A fresh pass counted as a repeat of a step already attempted — the
    /// reveal window opens sooner, and nothing else is carried over.
    pub fn retrying(slot_count: usize, previous: &Self) -> Self {
        Self {
            reveal: RevealState::retry(slot_count, previous.reveal.attempt),
            ..Self::empty(slot_count)
        }
    }

    /// The same state with the clock started.
    pub fn started(self, timestamp: f64) -> Self {
        Self {
            started_at: Some(timestamp),
            ..self
        }
    }

    /// Slots resolved while the player could see them — the numerator of the
    /// weighted figure's assistance discount.
    pub fn assisted_count(&self, program: &Program) -> usize {
        self.assisted
            .iter()
            .enumerate()
            .filter(|&(slot, &assisted)| assisted && matches!((self.entries.get(slot).copied().flatten(), program.slot_char(slot)), (Some(t), Some(e)) if t == e))
            .count()
    }
}

/// The result of applying one [`Command`] — the next state plus why the
/// keystroke was refused, if it was.
#[derive(Debug, Clone, PartialEq)]
pub struct Transition {
    pub state: SessionState,
    pub rejection: Option<Rejection>,
}

impl Transition {
    const fn landed(state: SessionState) -> Self {
        Self { state, rejection: None }
    }

    const fn refused(state: SessionState, rejection: Rejection) -> Self {
        Self {
            state,
            rejection: Some(rejection),
        }
    }
}

/// Session-scoped player actions. Chunk and game lifecycle live one level
/// up, in `TypingGameCore`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Command {
    /// A printable keystroke.
    Press { key: char },
    /// Undo the slot behind the caret.
    Backspace,
    /// Move the caret to a slot, leaving typed work untouched.
    JumpToSlot { slot: usize },
    /// Wave off the consecutive-error alert.
    DismissAlert,
    /// Flip the manual-reveal override: freeze the auto-hide loop open for
    /// up to `reveal::MAX_MANUAL_REVEAL_MS`, or hand control back early if
    /// it is already frozen. See `reveal::toggle_manual_override` for the
    /// two-state cycle this drives.
    ///
    /// The keybinding that dispatches this lives entirely on the JS side
    /// (`use-keystroke-capture`); the session only owns what the toggle
    /// means for the reveal loop.
    ToggleReveal,
    /// Nothing happened, and that is the information.
    ///
    /// The reveal loop is a controller whose most important input is a
    /// player who has *stopped* typing, and a state machine driven only by
    /// keystrokes cannot see one — the idle player issues no commands, so
    /// `k` would freeze exactly when it most needs to open. The host ticks
    /// while a step is in flight; the engine is otherwise untouched by it.
    Tick,
}

/// Apply one command to a session. Pure: `state` is read, never written.
///
/// `now` is threaded in because reveal is a function of *time*, not only of
/// keystrokes: the initial delay, the instantaneous rate, and the decay
/// during a hesitation are all read off the clock. Every command therefore
/// carries a timestamp, and every command re-runs the control loop before
/// returning — including the ones that were refused, since a refused
/// keystroke is still a keystroke's worth of elapsed time.
pub fn reduce(state: &SessionState, program: &Program, config: SessionConfig, command: Command, now: f64) -> Transition {
    let transition = match command {
        Command::Press { key } => press(state, program, config, key, now),
        Command::Backspace => Transition::landed(backspace(state, now)),
        Command::JumpToSlot { slot } => Transition::landed(jump_to_slot(state, program, slot)),
        Command::DismissAlert => Transition::landed(SessionState {
            alert_dismissed: true,
            ..state.clone()
        }),
        Command::ToggleReveal => Transition::landed(SessionState {
            reveal: state.reveal.toggled(now),
            ..state.clone()
        }),
        Command::Tick => Transition::landed(state.clone()),
    };

    let settled = settle_alert(transition, program);
    Transition {
        state: with_reveal_advanced(settled.state, program, config, now),
        rejection: settled.rejection,
    }
}

/// Re-run the control loop over whatever the command left behind.
fn with_reveal_advanced(state: SessionState, program: &Program, config: SessionConfig, now: f64) -> SessionState {
    let reveal = reveal::advance(&state.reveal, program, state.cursor, &state.keystrokes, state.started_at, config.reveal, now);
    SessionState { reveal, ..state }
}

/// The keystroke history with `now` appended, oldest entries dropped so the
/// window stays [`stats::INSTANT_WINDOW`] wide.
fn recorded(keystrokes: &[f64], now: f64) -> Vec<f64> {
    let start = (keystrokes.len() + 1).saturating_sub(stats::INSTANT_WINDOW);
    keystrokes.iter().skip(start).copied().chain(std::iter::once(now)).collect()
}

/// Once the streak that raised the alert is broken, the dismissal has
/// nothing left to suppress — clearing it here keeps that invariant in one
/// place instead of at every call site that might break a streak.
fn settle_alert(transition: Transition, program: &Program) -> Transition {
    if !transition.state.alert_dismissed || consecutive_errors(&transition.state, program) > 0 {
        return transition;
    }

    Transition {
        state: SessionState {
            alert_dismissed: false,
            ..transition.state
        },
        rejection: transition.rejection,
    }
}

fn press(state: &SessionState, program: &Program, config: SessionConfig, key: char, now: f64) -> Transition {
    let Some(expected) = program.slot_char(state.cursor) else {
        return Transition::refused(state.clone(), Rejection::NothingPending);
    };

    if key == '\n' || key == '\r' || key == '\t' {
        return Transition::refused(state.clone(), Rejection::NotTypeable);
    }

    if key == ' ' && expected != ' ' {
        return Transition::refused(state.clone(), Rejection::ExtraSpace);
    }

    if consecutive_errors(state, program) >= config.max_consecutive_errors {
        return Transition::refused(state.clone(), Rejection::ErrorCeiling);
    }

    let mut entries = state.entries.clone();
    entries[state.cursor] = Some(key);

    // Read before the caret moves: assistance is "could the player see this
    // slot at the moment they resolved it", which is a fact about the
    // reveal state that was in force when the key landed, not the one the
    // control loop is about to compute.
    let mut assisted = state.assisted.clone();
    if let Some(flag) = assisted.get_mut(state.cursor) {
        *flag = state.reveal.is_visible(program, state.cursor, state.cursor);
    }

    let total_errors = state.total_errors + usize::from(key != expected);
    let cursor = advance(state.cursor, &entries, program.slot_count());

    Transition::landed(SessionState {
        entries,
        cursor,
        total_errors,
        assisted,
        keystrokes: recorded(&state.keystrokes, now),
        ..state.clone()
    })
}

/// Step the caret forward one slot. Running off the end while holes remain
/// (the player skipped a section earlier) resumes at the first hole rather
/// than parking on a chunk that isn't actually finished.
fn advance(cursor: usize, entries: &[Option<char>], slot_count: usize) -> usize {
    let next = cursor + 1;
    if next < slot_count {
        return next;
    }
    first_gap(entries).unwrap_or(slot_count)
}

fn backspace(state: &SessionState, now: f64) -> SessionState {
    if state.cursor == 0 {
        return state.clone();
    }

    let cursor = state.cursor - 1;
    let mut entries = state.entries.clone();
    entries[cursor] = None;

    // A backspace is a keystroke. Feeding it to the instantaneous window
    // means a backspace burst reads as *fast*, which closes the reveal
    // window — deliberate, see `stats::instantaneous_wpm`.
    SessionState {
        entries,
        cursor,
        keystrokes: recorded(&state.keystrokes, now),
        ..state.clone()
    }
}

fn jump_to_slot(state: &SessionState, program: &Program, slot: usize) -> SessionState {
    SessionState {
        cursor: slot.min(program.slot_count()),
        ..state.clone()
    }
}

/// The first slot the player has not resolved yet, if any.
pub fn first_gap(entries: &[Option<char>]) -> Option<usize> {
    entries.iter().position(Option::is_none)
}

/// How far the caret has run past its earliest *unrepaired* mistake.
///
/// This is the distance back to the first divergence in the contiguous run of
/// typed slots behind the caret — not a count of wrong slots, and deliberately
/// not "wrong slots immediately behind the caret".
///
/// The difference is the whole point of the error ceiling. Under the older
/// "contiguous wrong suffix" reading, one lucky-correct keystroke reset the
/// streak to zero, so a player could carry unrepaired mistakes to the end of a
/// chunk and never once be stopped. Typing `baf roo` for `bar foo` did exactly
/// that: two wrong slots, the last two keystrokes correct, streak zero, chunk
/// finished. The ceiling exists to make the player go back and fix the
/// divergence, and it can only do that if being past a divergence is what it
/// measures.
///
/// An untouched slot still ends the scan: a hole left by a jump is not a
/// mistake, and work on the far side of one belongs to a different run.
///
/// Note this is scored per *position*, not per keystroke — `total_errors`
/// remains the lifetime tally of wrong keystrokes and is untouched by this.
/// A correct character typed while diverged extends the streak (the player is
/// still misaligned with what they owe) but is not itself counted as an error
/// against accuracy.
pub fn consecutive_errors(state: &SessionState, program: &Program) -> usize {
    let mut divergence = None;

    for slot in (0..state.cursor).rev() {
        let (Some(typed), Some(expected)) = (state.entries.get(slot).copied().flatten(), program.slot_char(slot)) else {
            break;
        };
        if typed != expected {
            divergence = Some(slot);
        }
    }

    divergence.map_or(0, |slot| state.cursor - slot)
}

/// Per-slot render status: `0` untouched, `1` correct, `2` wrong.
pub fn slot_status_codes(state: &SessionState, program: &Program) -> Vec<u8> {
    state
        .entries
        .iter()
        .enumerate()
        .map(|(slot, typed)| match (typed, program.slot_char(slot)) {
            (Some(t), Some(e)) if *t == e => 1,
            (Some(_), _) => 2,
            (None, _) => 0,
        })
        .collect()
}

/// Slots resolved correctly.
pub fn correct_count(state: &SessionState, program: &Program) -> usize {
    state
        .entries
        .iter()
        .enumerate()
        .filter(|(slot, typed)| matches!((typed, program.slot_char(*slot)), (Some(t), Some(e)) if *t == e))
        .count()
}

/// Slots the player has put a character into, right or wrong.
pub fn filled_count(state: &SessionState) -> usize {
    state.entries.iter().filter(|entry| entry.is_some()).count()
}

/// Every slot resolved, and resolved correctly.
pub fn is_complete(state: &SessionState, program: &Program) -> bool {
    program.slot_count() > 0 && correct_count(state, program) == program.slot_count()
}

#[cfg(test)]
mod tests {
    use super::{consecutive_errors, first_gap, is_complete, reduce, Command, Program, Rejection, SessionConfig, SessionState};

    struct Harness {
        program: Program,
        config: SessionConfig,
        state: SessionState,
        /// A monotone fake clock. These tests are about the keystroke model,
        /// not the reveal loop, so the clock only has to move forward.
        now: f64,
    }

    impl Harness {
        fn new(source: &str) -> Self {
            Self::with_ceiling(source, SessionConfig::default().max_consecutive_errors)
        }

        /// The default ceiling is 3, which is lower than some invariants need
        /// to observe: with the streak measured from the divergence, input is
        /// blocked three keystrokes past it, so a longer misalignment can only
        /// be *reached* with the ceiling raised out of the way.
        fn with_ceiling(source: &str, max_consecutive_errors: usize) -> Self {
            let program = Program::compile(source);
            let state = SessionState::empty(program.slot_count());
            Self {
                program,
                config: SessionConfig {
                    max_consecutive_errors,
                    ..SessionConfig::default()
                },
                state,
                now: 0.0,
            }
        }

        fn streak(&self) -> usize {
            consecutive_errors(&self.state, &self.program)
        }

        fn send(&mut self, command: Command) -> Option<Rejection> {
            self.now += 100.0;
            let transition = reduce(&self.state, &self.program, self.config, command, self.now);
            self.state = transition.state;
            transition.rejection
        }

        fn type_text(&mut self, text: &str) {
            for key in text.chars() {
                self.send(Command::Press { key });
            }
        }

        fn cursor_display(&self) -> usize {
            self.program.slot_display_index(self.state.cursor)
        }
    }

    #[test]
    fn typing_the_token_stream_completes_the_chunk() {
        let mut harness = Harness::new("fn a() {\n    b();\n}");
        harness.type_text("fn a() {b();}");
        assert!(is_complete(&harness.state, &harness.program));
        assert_eq!(harness.state.total_errors, 0);
    }

    #[test]
    fn the_caret_jumps_indentation_instead_of_asking_for_it() {
        let mut harness = Harness::new("fn a() {\n    b();\n}");
        harness.type_text("fn a() {");
        // rendered index 8 is the '\n'; the caret must already be on 'b'
        assert_eq!(harness.cursor_display(), 13);
    }

    #[test]
    fn an_extra_space_is_refused_without_moving_the_caret() {
        let mut harness = Harness::new("fn a() {\n    b();\n}");
        harness.type_text("fn a() {");
        let before = harness.state.clone();

        assert_eq!(harness.send(Command::Press { key: ' ' }), Some(Rejection::ExtraSpace));
        assert_eq!(harness.state, before);
        assert_eq!(harness.state.total_errors, 0);
    }

    #[test]
    fn a_genuine_single_space_is_still_typed() {
        let mut harness = Harness::new("let x = 1");
        harness.type_text("let");
        assert_eq!(harness.send(Command::Press { key: ' ' }), None);
        assert_eq!(harness.state.cursor, 4);
    }

    #[test]
    fn enter_and_tab_are_ignored_rather_than_scored() {
        let mut harness = Harness::new("fn a() {\n    b();\n}");
        assert_eq!(harness.send(Command::Press { key: '\n' }), Some(Rejection::NotTypeable));
        assert_eq!(harness.send(Command::Press { key: '\t' }), Some(Rejection::NotTypeable));
        assert_eq!(harness.state.cursor, 0);
        assert_eq!(harness.state.total_errors, 0);
    }

    #[test]
    fn wrong_keys_accumulate_until_the_ceiling_blocks_input() {
        let mut harness = Harness::new("abcdefg");
        harness.type_text("xyz");
        assert_eq!(consecutive_errors(&harness.state, &harness.program), 3);
        assert_eq!(harness.send(Command::Press { key: 'q' }), Some(Rejection::ErrorCeiling));
        assert_eq!(harness.state.total_errors, 3);
    }

    #[test]
    fn backspace_clears_the_slot_behind_the_caret() {
        let mut harness = Harness::new("abc");
        harness.type_text("ax");
        harness.send(Command::Backspace);
        assert_eq!(harness.state.cursor, 1);
        assert_eq!(harness.state.entries[1], None);
        // total_errors is a lifetime tally, not a live count
        assert_eq!(harness.state.total_errors, 1);
    }

    #[test]
    fn backspace_at_the_start_is_a_no_op() {
        let mut harness = Harness::new("abc");
        let before = harness.state.clone();
        harness.send(Command::Backspace);
        assert_eq!(harness.state, before);
    }

    #[test]
    fn toggling_reveal_freezes_the_window_open_and_toggling_again_hands_it_back() {
        let mut harness = Harness::new("let mut map = HashMap::new();");
        assert_eq!(harness.state.reveal.manual_override_until, None);

        harness.send(Command::ToggleReveal);
        assert!(harness.state.reveal.manual_override_until.is_some());
        assert_eq!(harness.state.reveal.k, harness.program.runs().len(), "the override pins the window fully open");

        harness.send(Command::ToggleReveal);
        assert_eq!(harness.state.reveal.manual_override_until, None);
    }

    #[test]
    fn dismissing_the_alert_sticks_until_the_streak_breaks() {
        let mut harness = Harness::new("abcdefg");
        harness.type_text("xyz");
        harness.send(Command::DismissAlert);
        assert!(harness.state.alert_dismissed);

        harness.send(Command::Backspace);
        harness.send(Command::Backspace);
        harness.send(Command::Backspace);
        assert!(!harness.state.alert_dismissed);
    }

    #[test]
    fn jumping_leaves_earlier_work_intact() {
        let mut harness = Harness::new("fn one() {\n    a();\n}\nfn two() {\n    b();\n}\n");
        harness.type_text("fn ");
        let target = harness.program.sections()[1].start_slot;

        harness.send(Command::JumpToSlot { slot: target });
        assert_eq!(harness.state.cursor, target);
        assert_eq!(harness.state.entries[0], Some('f'));
        assert_eq!(first_gap(&harness.state.entries), Some(3));
    }

    #[test]
    fn running_off_the_end_resumes_at_the_first_hole() {
        let mut harness = Harness::new("abcdef");
        harness.send(Command::JumpToSlot { slot: 3 });
        harness.type_text("def");
        // slots 0..3 were skipped, so the caret comes back for them
        assert_eq!(harness.state.cursor, 0);
        assert!(!is_complete(&harness.state, &harness.program));

        harness.type_text("abc");
        assert!(is_complete(&harness.state, &harness.program));
    }

    #[test]
    fn a_jump_past_the_end_clamps_to_the_end() {
        let mut harness = Harness::new("abc");
        harness.send(Command::JumpToSlot { slot: 999 });
        assert_eq!(harness.state.cursor, 3);
    }

    #[test]
    fn pressing_past_the_end_is_refused() {
        let mut harness = Harness::new("ab");
        harness.type_text("ab");
        assert_eq!(harness.send(Command::Press { key: 'c' }), Some(Rejection::NothingPending));
    }

    #[test]
    fn a_hole_left_by_a_jump_does_not_count_as_an_error_streak() {
        let mut harness = Harness::new("abcdef");
        harness.send(Command::JumpToSlot { slot: 3 });
        harness.type_text("d");
        assert_eq!(consecutive_errors(&harness.state, &harness.program), 0);
    }

    // ── Backspace / streak invariants ────────────────────────────────────
    //
    // The suite above mostly replays happy paths, which lets an
    // implementation look correct while violating the model. These assert
    // the model directly.

    #[test]
    fn backspace_reduces_the_streak_by_exactly_one() {
        // Implied by three separate claims the implementation makes: errors
        // are mismatching entries, the streak is measured back from the
        // caret, and backspace removes the slot immediately behind it.
        let mut harness = Harness::new("abcdef");
        harness.type_text("xyz");
        assert_eq!(harness.streak(), 3);

        harness.send(Command::Backspace);
        assert_eq!(harness.streak(), 2);
        harness.send(Command::Backspace);
        assert_eq!(harness.streak(), 1);
        harness.send(Command::Backspace);
        assert_eq!(harness.streak(), 0);
    }

    #[test]
    fn backspacing_below_the_ceiling_unblocks_input_immediately() {
        // The policy, not the mechanism: one backspace is enough to earn back
        // exactly one keystroke.
        let mut harness = Harness::new("abcdef");
        harness.type_text("xyz");
        assert_eq!(harness.send(Command::Press { key: 'q' }), Some(Rejection::ErrorCeiling));

        harness.send(Command::Backspace);
        assert_eq!(harness.send(Command::Press { key: 'q' }), None);
    }

    #[test]
    fn backspace_touches_exactly_one_slot() {
        let mut harness = Harness::new("abcdef");
        harness.type_text("xyz");
        harness.send(Command::Backspace);

        assert_eq!(harness.state.entries[0], Some('x'));
        assert_eq!(harness.state.entries[1], Some('y'));
        assert_eq!(harness.state.entries[2], None);
    }

    #[test]
    fn a_wrong_slot_stays_wrong_until_it_is_erased() {
        let mut harness = Harness::new("abc");
        harness.type_text("x");
        assert_eq!(harness.streak(), 1);

        harness.send(Command::Backspace);
        assert_eq!(harness.streak(), 0);

        harness.send(Command::Press { key: 'a' });
        assert_eq!(harness.streak(), 0);
    }

    #[test]
    fn jumping_away_ends_the_streak_without_forgiving_the_errors() {
        // "Active misalignment" and "historical error count" are different
        // quantities and must not be conflated: the jump lands the caret in a
        // region with no typed run behind it, but the mistakes still happened.
        let mut harness = Harness::new("abcdef");
        harness.type_text("xyz");

        harness.send(Command::JumpToSlot { slot: 5 });
        assert_eq!(harness.streak(), 0);
        assert_eq!(harness.state.total_errors, 3);
    }

    // ── Alignment: the streak measures divergence, not mismatch ──────────

    #[test]
    fn a_correct_key_typed_while_diverged_does_not_heal_the_streak() {
        let mut harness = Harness::new("abcdef");
        harness.type_text("x");
        assert_eq!(harness.streak(), 1);

        // 'b' is the right character for slot 1, but slot 0 is still wrong -
        // the player is past an unrepaired divergence and typing on regardless.
        harness.send(Command::Press { key: 'b' });
        assert_eq!(harness.streak(), 2);
    }

    #[test]
    fn the_streak_is_the_distance_back_to_the_earliest_unrepaired_divergence() {
        // "bar foo" typed as "baf roo": two wrong slots, but the space and the
        // trailing "oo" are only accidentally in the right place. Needs the
        // ceiling raised - see `with_ceiling`.
        let mut harness = Harness::with_ceiling("bar foo", 99);
        harness.type_text("baf roo");

        assert_eq!(harness.streak(), 5);
        // Scoring is still per-keystroke: only two keys were actually wrong.
        assert_eq!(harness.state.total_errors, 2);
    }

    #[test]
    fn an_earlier_divergence_outranks_a_later_one() {
        let mut harness = Harness::with_ceiling("abcdef", 99);
        harness.type_text("xbzdef");

        // Divergences at slots 0 and 2; the streak is measured from slot 0.
        assert_eq!(harness.streak(), 6);
    }

    #[test]
    fn the_ceiling_engages_three_keys_past_a_divergence_however_correct_they_are() {
        // The behaviour the old "contiguous wrong suffix" reading gave away:
        // there, `baf roo` finished the chunk with the streak back at zero and
        // the ceiling never once consulted.
        let mut harness = Harness::new("bar foo");
        harness.type_text("baf");

        assert_eq!(harness.streak(), 1);
        assert_eq!(harness.send(Command::Press { key: ' ' }), None);
        assert_eq!(harness.send(Command::Press { key: 'r' }), None);
        assert_eq!(harness.streak(), 3);
        assert_eq!(harness.send(Command::Press { key: 'o' }), Some(Rejection::ErrorCeiling));
    }

    #[test]
    fn only_backspacing_onto_the_divergence_clears_it() {
        let mut harness = Harness::with_ceiling("bar foo", 99);
        harness.type_text("baf roo");
        assert_eq!(harness.streak(), 5);

        // Back over the accidentally-right tail: still diverged the whole way.
        harness.send(Command::Backspace);
        assert_eq!(harness.streak(), 4);
        harness.send(Command::Backspace);
        assert_eq!(harness.streak(), 3);
        harness.send(Command::Backspace);
        assert_eq!(harness.streak(), 2);
        harness.send(Command::Backspace);
        assert_eq!(harness.streak(), 1);

        // This one erases slot 2 itself - the divergence - and only now is the
        // player aligned again.
        harness.send(Command::Backspace);
        assert_eq!(harness.streak(), 0);
    }

    #[test]
    fn a_streak_can_never_exceed_the_ceiling_that_governs_it() {
        // Follows from the two together: `press` refuses at the ceiling, and
        // nothing but a press can grow the streak.
        let mut harness = Harness::new("abcdefghij");
        harness.type_text("xxxxxxxxxx");

        assert_eq!(harness.streak(), SessionConfig::default().max_consecutive_errors);
    }
}
