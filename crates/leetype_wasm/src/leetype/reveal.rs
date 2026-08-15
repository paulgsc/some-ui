//! Progressive reveal: the closed loop that decides how much of the step is
//! visible ahead of the caret, and the gate that decides when the player has
//! earned the next one.
//!
//! # Why this is engine state and not a render prop
//!
//! Reveal is a function of cursor position, keystroke timing and a
//! baseline-derived threshold. All three are facts the engine already owns,
//! and none of them is something React should be re-deriving during a
//! render. So the engine projects per-slot visibility the same way it
//! already projects roles and slot status, the renderer draws what it is
//! handed, and the whole loop is provable by `cargo test -p leetype_wasm`
//! with no DOM in the picture (docs/leetype/README.md, decision 3).
//!
//! # The loop
//!
//! A step starts fully masked. After an initial delay `t` the window opens;
//! from then on `k` — a count of runs ahead of the caret — grows while
//! the player is slow and shrinks while they are fast, clamped to the runs
//! that remain.
//!
//! That is negative feedback: masking slows the player, slowness opens `k`,
//! revealed text speeds them up, speed closes `k`. The loop self-seeks the
//! frontier of what the player can retrieve unaided, which is the entire
//! design.
//!
//! # Its one hazard, and the answer to it
//!
//! A controller with one threshold makes a player sitting exactly on that
//! threshold flicker between `•` and glyph, which is worse than either
//! state and is the single most likely way this feature ships feeling
//! broken. So there are **two** thresholds with a deadband between them
//! ([`RevealConfig::slow_band`] / [`RevealConfig::fast_band`]), and the
//! deadband widens with the player's own measured dispersion — a steady
//! typist and an erratic one with the same mean deserve different bands.
//!
//! `tests/invariants.rs` holds that line, and holds it the only way it can
//! be held: by also running the loop with the deadband collapsed and
//! asserting that it *does* flicker there.

use serde::{Deserialize, Serialize};

use super::program::Program;
use super::stats;

/// Below this fraction of the player's own copying speed, they are
/// retrieving rather than reading: open the window.
const SLOW_FRACTION: f64 = 0.35;

/// At or above this fraction of their copying speed, they have it: close the
/// window.
///
/// Both fractions are below 1.0 on purpose. WPM is a proxy for *retrieval
/// fluency* — the gap between typing text you must recall and text you are
/// merely copying — so a player typing masked code is expected to be slower
/// than their own baseline even when they know the answer cold. A band at
/// 1.0 would mean "as fast as copying", which nobody is.
const FAST_FRACTION: f64 = 0.65;

/// Weighted WPM, as a fraction of baseline, that opens the gate to the next
/// step. Lower than [`FAST_FRACTION`] because the weighted figure is already
/// discounted for assistance and accuracy — asking for the same fraction of
/// baseline from a discounted number would be asking for it twice.
const GATE_FRACTION: f64 = 0.5;

/// Characters' worth of the player's own baseline to wait before the first
/// run appears. Expressed in characters rather than milliseconds so that a
/// 90 WPM typist and a 35 WPM typist both get "about as long as it takes me
/// to type a short word", which is the same *experience* and two very
/// different durations.
const INITIAL_DELAY_CHARS: f64 = 12.0;

/// The narrowest the deadband is ever allowed to get, in WPM.
///
/// The dispersion term widens the band for an erratic typist, but a player
/// with a suspiciously tidy calibration sample would otherwise get a band of
/// nearly zero width — which is the one-threshold controller this module
/// exists to avoid.
const MIN_DEADBAND_WPM: f64 = 6.0;

/// How long a manual-reveal toggle holds the auto-hide loop open, in
/// milliseconds, before control reverts to the automatic controller on its
/// own.
///
/// This is the escape hatch for a player who has hit a mental block and does
/// not want to wait for their own typing to slow down enough to earn a
/// reveal the ordinary way — they ask for it directly instead (see
/// [`toggle_manual_override`]). Bounded rather than indefinite: an unbounded
/// override would let one keypress opt a step out of the probe entirely,
/// which is a different feature (and the wrong one — the loop's whole job is
/// reading retrieval fluency, and a permanently open window reads nothing).
/// Eight seconds is enough to read a short unfamiliar line without hurrying,
/// and short enough that the mechanic the rest of this module tests is still
/// mostly in force across a step.
pub const MAX_MANUAL_REVEAL_MS: f64 = 8_000.0;

/// How many attempts a player gets on one step before the gate lets them
/// past regardless.
///
/// The escape is not a nicety. Without it a player parked below threshold on
/// one step is trapped there forever, and "the player can always eventually
/// reach the end of an exercise" stops being true. Three is chosen so that
/// the repeat is felt as an intervention rather than as a wall: two chances
/// to improve, then the exercise moves on and the step's low score is the
/// record of what happened.
pub const MAX_STEP_ATTEMPTS: usize = 3;

/// Every threshold in the loop, derived from the player's own sampled
/// typing speed.
///
/// There is deliberately no absolute-WPM policy constant anywhere in this
/// module: `ADAPTIVE_WPM_THRESHOLD = 40` measured nothing about a 90 WPM
/// typist, and replacing it with a different number would have repeated the
/// mistake at a different value. The fractions above are fractions *of this
/// struct*, and this struct comes from a warm-up the player actually ran.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevealConfig {
    /// The player's copying speed, sampled in an agnostic warm-up.
    pub baseline_wpm: f64,
    /// How much that sample varied — the scale the deadband is built on.
    pub dispersion_wpm: f64,
}

impl Default for RevealConfig {
    /// The cold-start stand-in, for a player who has not calibrated yet and
    /// for tests that are not about calibration. The host is expected to
    /// replace it with a real sample as soon as it has one; see
    /// `Command::Calibrate`.
    fn default() -> Self {
        Self {
            baseline_wpm: 40.0,
            dispersion_wpm: 10.0,
        }
    }
}

impl RevealConfig {
    /// Guard against a corrupt or absurd stored sample without refusing to
    /// play: a non-finite or non-positive baseline degrades to the default
    /// rather than producing infinite bands.
    #[must_use]
    pub fn sanitized(self) -> Self {
        let fallback = Self::default();
        Self {
            baseline_wpm: if self.baseline_wpm.is_finite() && self.baseline_wpm > 0.0 {
                self.baseline_wpm
            } else {
                fallback.baseline_wpm
            },
            dispersion_wpm: if self.dispersion_wpm.is_finite() && self.dispersion_wpm >= 0.0 {
                self.dispersion_wpm
            } else {
                fallback.dispersion_wpm
            },
        }
    }

    fn half_deadband(self) -> f64 {
        (self.dispersion_wpm / 2.0).max(MIN_DEADBAND_WPM / 2.0)
    }

    /// Below this, `k` grows.
    #[must_use]
    pub fn slow_band(self) -> f64 {
        self.baseline_wpm.mul_add(SLOW_FRACTION, -self.half_deadband()).max(0.0)
    }

    /// Above this, `k` shrinks. Strictly greater than [`Self::slow_band`],
    /// which is what makes the deadband a deadband.
    #[must_use]
    pub fn fast_band(self) -> f64 {
        self.baseline_wpm.mul_add(FAST_FRACTION, self.half_deadband()).max(self.slow_band() + MIN_DEADBAND_WPM)
    }

    /// Weighted WPM the player must reach to leave a step.
    #[must_use]
    pub fn gate_threshold(self) -> f64 {
        self.baseline_wpm * GATE_FRACTION
    }

    /// How long a step stays fully masked before the window opens at all.
    ///
    /// `attempt` is zero-based and shortens the delay on a repeat: coming
    /// back to a step you already missed should not mean sitting through the
    /// same silence again, and the shorter delay is the whole of the "repeat
    /// with more help" intervention.
    #[must_use]
    pub fn initial_delay_ms(self, attempt: usize) -> f64 {
        let chars_per_minute = self.baseline_wpm * 5.0;
        if chars_per_minute <= 0.0 {
            return 0.0;
        }
        let full = INITIAL_DELAY_CHARS / chars_per_minute * 60_000.0;
        full / attempts_as_f64(attempt + 1)
    }
}

/// Attempt counts are bounded by [`MAX_STEP_ATTEMPTS`], far inside `f64`'s
/// exactly-representable integer range.
#[expect(clippy::cast_precision_loss, reason = "attempt counts are bounded by MAX_STEP_ATTEMPTS")]
const fn attempts_as_f64(value: usize) -> f64 {
    value as f64
}

/// The reveal loop's state within one step.
#[derive(Debug, Clone, PartialEq)]
pub struct RevealState {
    /// How many runs from the caret's own run forward are unmasked.
    /// `0` is fully masked, which is where every step starts.
    pub k: usize,
    /// Whether the initial delay has elapsed. Before it has, `k` is pinned
    /// at zero however slowly the player is going.
    pub opened: bool,
    /// Which attempt at this step this is, zero-based. Shortens the initial
    /// delay; the gate's escape hatch reads it too.
    pub attempt: usize,
    /// Sticky per-slot record of what the player has already been shown at
    /// or behind the caret.
    ///
    /// This is the ratchet: `k` shrinking re-masks text *ahead* of the
    /// caret, which is the controller doing its job, but text the player is
    /// currently on or has already passed must never go back under a mask.
    /// Watching the character under your own caret turn into a bullet is
    /// the kind of thing that ends a run.
    seen: Vec<bool>,
    /// Host timestamp the manual-reveal freeze lifts at, or `None` when the
    /// auto loop has full control.
    ///
    /// Only ever `Some` while it is genuinely still in force — [`advance`]
    /// clears an expired one itself (see its doc comment), so every other
    /// reader of this field can trust `Some` to mean "in force right now"
    /// without re-checking the deadline against `now` itself.
    pub manual_override_until: Option<f64>,
}

impl RevealState {
    /// A fresh, fully-masked pass over a program with `slot_count` slots.
    #[must_use]
    pub fn empty(slot_count: usize) -> Self {
        Self {
            k: 0,
            opened: false,
            attempt: 0,
            seen: vec![false; slot_count],
            manual_override_until: None,
        }
    }

    /// The same fresh state, but counted as a repeat of a step already
    /// attempted — a shorter initial delay, nothing else carried over.
    #[must_use]
    pub fn retry(slot_count: usize, previous_attempt: usize) -> Self {
        Self {
            attempt: previous_attempt.saturating_add(1),
            ..Self::empty(slot_count)
        }
    }

    /// The same state with the manual-reveal override flipped — see
    /// [`toggle_manual_override`].
    ///
    /// A method here rather than left to the caller to reconstruct with
    /// struct-update syntax: `seen` is private to this module, so a
    /// `session`-level caller has no other way to carry it through
    /// unchanged.
    #[must_use]
    pub fn toggled(&self, now: f64) -> Self {
        Self {
            manual_override_until: toggle_manual_override(self.manual_override_until, now),
            ..self.clone()
        }
    }

    /// Whether the player is being shown `slot` right now.
    ///
    /// The manual override is checked here, not baked into [`Self::k`]:
    /// `k` is always the auto controller's own arithmetic, evolving exactly
    /// as it would if the override did not exist, so that cancelling the
    /// override (or letting it expire) hands back precisely the state the
    /// controller would already be in — see [`advance`]'s doc comment.
    #[must_use]
    pub fn is_visible(&self, program: &Program, cursor: usize, slot: usize) -> bool {
        if program.slot_is_space(slot) {
            return true;
        }
        if self.seen.get(slot).copied().unwrap_or(false) {
            return true;
        }
        if self.manual_override_until.is_some() {
            return true;
        }
        window(program, cursor, self.k).is_some_and(|range| range.contains(&slot))
    }
}

/// The half-open slot range the window currently covers, or `None` when the
/// window is shut or the caret has run out of runs.
fn window(program: &Program, cursor: usize, k: usize) -> Option<std::ops::Range<usize>> {
    if k == 0 {
        return None;
    }

    let runs = program.runs();
    let first = program.run_index_at_or_after(cursor);
    let last = (first + k).min(runs.len());

    match (runs.get(first), last.checked_sub(1).and_then(|index| runs.get(index))) {
        (Some(start), Some(end)) if last > first => Some(start.start_slot..end.end_slot),
        _ => None,
    }
}

/// The control law, on its own: where `k` goes next given how fast the
/// player is going right now.
///
/// Taking the two bands as arguments rather than reading them off a
/// [`RevealConfig`] is what makes the hysteresis *testable*. A deadband that
/// cannot be collapsed cannot be shown to be doing anything, and a
/// hysteresis test that passes without hysteresis is not a test — so
/// `tests/invariants.rs` calls this with `slow == fast` and asserts that the
/// loop does flicker there, alongside asserting that it does not with the
/// real bands.
#[must_use]
pub fn next_k(k: usize, instant_wpm: f64, slow_band: f64, fast_band: f64, remaining: usize) -> usize {
    let moved = if instant_wpm < slow_band {
        k.saturating_add(1)
    } else if instant_wpm > fast_band {
        k.saturating_sub(1)
    } else {
        k
    };

    moved.min(remaining)
}

/// One step of the control loop: read the player, move `k`, ratchet what
/// they have been shown.
///
/// Pure — `state` is read, never written — and total: every branch has a
/// defined answer, including the ones a caller can only reach by handing it
/// a cursor past the end of the program.
///
/// # The manual override
///
/// While [`RevealState::manual_override_until`] names a deadline still ahead
/// of `now`, [`RevealState::is_visible`] shows everything regardless of `k`
/// or `opened` — but neither of those keeps running the ordinary
/// negative-feedback arithmetic and delay gate any differently than if the
/// override were not there at all. The override changes what is *shown*,
/// never what the controller has concluded or how far it has progressed.
///
/// That split is what makes cancelling the override (a second toggle, or the
/// deadline simply passing) hand back the controller's own state rather than
/// one the override itself perturbed. Two things were tried and are wrong:
///
/// - Baking the override into `k` directly: with no keystrokes to read, a
///   masked `next_k` sees zero WPM forever, which only ever grows — so a
///   step never un-reveals once toggled, even after the toggle is switched
///   back off.
/// - Letting the override contribute to `opened`: `opened` is a one-way
///   latch for the rest of the step, so even a toggle cancelled immediately,
///   before the initial delay has genuinely elapsed, would permanently
///   unlock `next_k` for a step that should still be sitting at a pinned
///   `k == 0` — the exact "hand back the pre-override state" promise this
///   override exists to keep.
///
/// Fast typing *during* the override still closes the real `k` down, same as
/// it always did (once `opened` is genuinely true), so a player who is now
/// confidently copying revealed text arrives at the override's expiry
/// already converging shut rather than starting from fully open.
///
/// An override past its deadline is cleared here, in the one place every
/// other reader of the field already has to pass through, rather than left
/// for the next toggle to notice.
#[must_use]
pub fn advance(state: &RevealState, program: &Program, cursor: usize, keystrokes: &[f64], started_at: Option<f64>, config: RevealConfig, now: f64) -> RevealState {
    let manual_override_until = state.manual_override_until.filter(|&until| now < until);

    let opened = state.opened || started_at.is_some_and(|start| now - start >= config.initial_delay_ms(state.attempt));

    let remaining = program.runs().len().saturating_sub(program.run_index_at_or_after(cursor));

    let k = if opened {
        next_k(state.k, stats::instantaneous_wpm(keystrokes, now), config.slow_band(), config.fast_band(), remaining)
    } else {
        0
    };

    // The slot under the caret must be ratcheted as seen using what is
    // *actually shown* right now, not the controller's own `k` — otherwise
    // a caret sitting outside the controller's real window while the
    // override is covering for it would go unprotected the instant the
    // override lifts (docs/leetype/README.md: "the character under your own
    // caret turns into a bullet is the kind of thing that ends a run").
    let shown_k = if manual_override_until.is_some() { remaining } else { k };

    RevealState {
        k,
        opened,
        attempt: state.attempt,
        seen: ratcheted(&state.seen, program, cursor, shown_k),
        manual_override_until,
    }
}

/// Flip the manual-reveal override: open it if the auto loop currently has
/// control, or hand control back immediately if it is already frozen open.
///
/// A two-state cycle rather than a latch plus a separate "cancel" command —
/// the same keypress that asks for relief is the one that gives control back
/// early, which is the ergonomic point of a *toggle* rather than a one-shot
/// reveal. Pure and total: every `(current, now)` pair has exactly one
/// answer, so a caller dispatching this command twice in a row — a stray
/// key-repeat event, say — always lands on a well-defined state rather than
/// one that depends on how many times it happened to fire.
#[must_use]
pub fn toggle_manual_override(current: Option<f64>, now: f64) -> Option<f64> {
    let active = current.is_some_and(|until| now < until);
    if active {
        None
    } else {
        Some(now + MAX_MANUAL_REVEAL_MS)
    }
}

/// Fraction of the manual-reveal freeze window still remaining: `1.0` the
/// instant a toggle opens it, decaying to `0.0` as `now` reaches the
/// deadline, and `0.0` whenever no override is in force.
///
/// The renderer's visual ergonomic effect reads this directly rather than
/// re-deriving a countdown from a raw deadline and a copy of
/// [`MAX_MANUAL_REVEAL_MS`] on the other side of the wasm boundary.
#[must_use]
pub fn manual_reveal_fraction(manual_override_until: Option<f64>, now: f64) -> f64 {
    manual_override_until.map_or(0.0, |until| ((until - now) / MAX_MANUAL_REVEAL_MS).clamp(0.0, 1.0))
}

/// Freeze everything the player has already been shown at or behind the
/// caret, so a shrinking `k` can never take it back.
///
/// Returns the next `seen` rather than mutating one in place: the whole
/// crate below `dispatch` computes values for its caller to assign (canon
/// Axiom 12.1 / ADR 0004), and this is no exception.
fn ratcheted(seen: &[bool], program: &Program, cursor: usize, k: usize) -> Vec<bool> {
    let under_caret = window(program, cursor, k).is_some_and(|range| range.contains(&cursor));

    seen.iter()
        .enumerate()
        .map(|(slot, &already)| already || slot < cursor || (slot == cursor && under_caret))
        .collect()
}

/// Per-slot visibility, wire-encoded: `0` masked, `1` revealed.
///
/// Mirrors `slot_status_codes` deliberately — same shape, same crossing,
/// same posture. The renderer's whole job is "draw what the map says".
#[must_use]
pub fn visibility_codes(state: &RevealState, program: &Program, cursor: usize) -> Vec<u8> {
    (0..program.slot_count()).map(|slot| u8::from(state.is_visible(program, cursor, slot))).collect()
}

/// What the runner should do with a step the player has just finished.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Progression {
    /// Weighted WPM cleared the threshold. Move on.
    Advance,
    /// It did not, and the player has attempts left. The same step comes
    /// round again with a shorter initial delay — repetition is the
    /// intervention, and there is deliberately no dialog explaining it.
    Repeat,
    /// It did not, and the attempts are spent. Move on anyway; being stuck
    /// forever on step three is a worse outcome than a step scored low.
    Escape,
}

/// The gate: weighted WPM against a baseline-derived threshold, plus the
/// escape that keeps the exercise finite.
///
/// Kept as a free function over plain numbers rather than a method on
/// anything exercise-shaped: the typing engine must never learn what a step
/// *is*, only that some caller counts attempts at one.
#[must_use]
pub fn progression(weighted_wpm: f64, attempt: usize, config: RevealConfig) -> Progression {
    if weighted_wpm >= config.gate_threshold() {
        Progression::Advance
    } else if attempt + 1 >= MAX_STEP_ATTEMPTS {
        Progression::Escape
    } else {
        Progression::Repeat
    }
}

#[cfg(test)]
mod tests {
    use super::{
        advance, manual_reveal_fraction, progression, toggle_manual_override, visibility_codes, Program, Progression, RevealConfig, RevealState, MAX_MANUAL_REVEAL_MS,
        MAX_STEP_ATTEMPTS,
    };

    const BASELINE: RevealConfig = RevealConfig {
        baseline_wpm: 60.0,
        dispersion_wpm: 10.0,
    };

    #[test]
    fn the_bands_never_collapse_onto_each_other() {
        for baseline in [1.0, 20.0, 40.0, 60.0, 120.0, 300.0] {
            for dispersion in [0.0, 1.0, 10.0, 90.0] {
                let config = RevealConfig {
                    baseline_wpm: baseline,
                    dispersion_wpm: dispersion,
                };
                assert!(config.fast_band() > config.slow_band(), "collapsed at {baseline}/{dispersion}");
            }
        }
    }

    #[test]
    fn an_erratic_typist_gets_a_wider_deadband_than_a_steady_one() {
        let steady = RevealConfig {
            baseline_wpm: 60.0,
            dispersion_wpm: 2.0,
        };
        let erratic = RevealConfig {
            baseline_wpm: 60.0,
            dispersion_wpm: 40.0,
        };
        assert!(erratic.fast_band() - erratic.slow_band() > steady.fast_band() - steady.slow_band());
    }

    #[test]
    fn a_faster_player_gets_proportionately_higher_bands() {
        let slow_typist = RevealConfig {
            baseline_wpm: 35.0,
            dispersion_wpm: 5.0,
        };
        let fast_typist = RevealConfig {
            baseline_wpm: 95.0,
            dispersion_wpm: 5.0,
        };
        assert!(fast_typist.slow_band() > slow_typist.slow_band());
        assert!(fast_typist.fast_band() > slow_typist.fast_band());
        assert!(fast_typist.gate_threshold() > slow_typist.gate_threshold());
    }

    #[test]
    fn a_corrupt_calibration_degrades_to_the_default_instead_of_infinite_bands() {
        let garbage = RevealConfig {
            baseline_wpm: f64::NAN,
            dispersion_wpm: -1.0,
        }
        .sanitized();
        assert_eq!(garbage, RevealConfig::default());
        assert!(garbage.slow_band().is_finite() && garbage.fast_band().is_finite());
    }

    #[test]
    fn a_repeat_shortens_the_initial_delay() {
        let first = BASELINE.initial_delay_ms(0);
        let second = BASELINE.initial_delay_ms(1);
        assert!(second < first && second > 0.0);
    }

    #[test]
    fn a_step_starts_fully_masked() {
        let program = Program::compile("let mut map = HashMap::new();");
        let state = RevealState::empty(program.slot_count());
        assert_eq!(state.k, 0);

        let codes = visibility_codes(&state, &program, 0);
        // Every non-space slot masked; the lone interior spaces stay visible
        // because a space is not something anybody has to retrieve.
        assert!(codes.contains(&0));
        for (slot, &code) in codes.iter().enumerate() {
            if program.slot_is_space(slot) {
                assert_eq!(code, 1, "slot {slot} is a space and should be visible");
            } else {
                assert_eq!(code, 0, "slot {slot} should be masked");
            }
        }
    }

    #[test]
    fn the_window_stays_shut_until_the_initial_delay_has_elapsed() {
        let program = Program::compile("let mut map = HashMap::new();");
        let state = RevealState::empty(program.slot_count());

        let too_soon = advance(&state, &program, 0, &[], Some(0.0), BASELINE, BASELINE.initial_delay_ms(0) - 1.0);
        assert!(!too_soon.opened);
        assert_eq!(too_soon.k, 0);

        let opened = advance(&state, &program, 0, &[], Some(0.0), BASELINE, BASELINE.initial_delay_ms(0) + 1.0);
        assert!(opened.opened);
        assert_eq!(opened.k, 1, "the window opens onto exactly one run");
    }

    #[test]
    fn an_idle_player_converges_to_a_fully_revealed_step() {
        let program = Program::compile("let mut map = HashMap::new();\nmap.entry(key).or_insert_with(Vec::new);");
        let mut state = RevealState::empty(program.slot_count());
        let mut now = 0.0;

        for _ in 0..(program.runs().len() + 4) {
            now += 500.0;
            state = advance(&state, &program, 0, &[], Some(0.0), BASELINE, now);
        }

        assert_eq!(state.k, program.runs().len(), "an idle player must never be locked out");
        assert!(visibility_codes(&state, &program, 0).iter().all(|&code| code == 1));
    }

    #[test]
    fn the_window_never_opens_past_the_runs_that_remain() {
        let program = Program::compile("let mut map = HashMap::new();");
        let mut state = RevealState::empty(program.slot_count());
        let Some(last_run) = program.runs().last().copied() else { panic!("source has runs") };
        let cursor = last_run.start_slot;

        for tick in 1..40 {
            state = advance(&state, &program, cursor, &[], Some(0.0), BASELINE, f64::from(tick) * 500.0);
            assert!(state.k <= program.runs().len() - program.run_index_at_or_after(cursor));
        }
    }

    #[test]
    fn a_fast_player_closes_the_window_and_keeps_it_closed() {
        let program = Program::compile("let mut map = HashMap::new();\nmap.entry(key).or_insert_with(Vec::new);");
        let mut state = RevealState {
            k: 3,
            opened: true,
            attempt: 0,
            ..RevealState::empty(program.slot_count())
        };

        // 200 WPM against a 60 WPM baseline: comfortably past the fast band.
        let mut now = 100_000.0;
        for _ in 0..10 {
            now += 60.0;
            let window: Vec<f64> = (0..12).map(|index| 60.0f64.mul_add(-f64::from(12 - index), now)).collect();
            state = advance(&state, &program, 0, &window, Some(0.0), BASELINE, now);
        }

        assert_eq!(state.k, 0);
    }

    #[test]
    fn the_token_under_the_caret_never_un_reveals() {
        let program = Program::compile("let mut map = HashMap::new();");
        let opened = RevealState {
            k: 1,
            opened: true,
            attempt: 0,
            ..RevealState::empty(program.slot_count())
        };
        let cursor = 0;
        let shown = advance(&opened, &program, cursor, &[], Some(0.0), BASELINE, 1_000_000.0);
        assert!(shown.is_visible(&program, cursor, cursor));

        // Now slam the window shut and confirm the caret's own token stays.
        let shut = RevealState { k: 0, ..shown };
        assert!(shut.is_visible(&program, cursor, cursor));
    }

    #[test]
    fn the_gate_advances_a_player_who_clears_the_threshold() {
        assert_eq!(progression(BASELINE.gate_threshold() + 1.0, 0, BASELINE), Progression::Advance);
    }

    #[test]
    fn the_gate_repeats_a_slow_player_and_eventually_lets_them_past() {
        let slow = BASELINE.gate_threshold() - 1.0;
        for attempt in 0..(MAX_STEP_ATTEMPTS - 1) {
            assert_eq!(progression(slow, attempt, BASELINE), Progression::Repeat);
        }
        assert_eq!(progression(slow, MAX_STEP_ATTEMPTS - 1, BASELINE), Progression::Escape);
        assert_eq!(progression(slow, MAX_STEP_ATTEMPTS + 20, BASELINE), Progression::Escape);
    }

    // ── The manual-reveal toggle ──────────────────────────────────────────

    #[test]
    fn the_manual_override_toggle_is_a_two_state_cycle() {
        assert_eq!(toggle_manual_override(None, 0.0), Some(MAX_MANUAL_REVEAL_MS), "idle -> frozen opens a fresh window");
        assert_eq!(toggle_manual_override(Some(1_000.0), 0.0), None, "toggling while active hands control back early");
        assert_eq!(
            toggle_manual_override(Some(500.0), 1_000.0),
            Some(1_000.0 + MAX_MANUAL_REVEAL_MS),
            "a deadline already behind `now` is exactly like no override at all"
        );
    }

    #[test]
    fn repeated_toggles_at_the_same_instant_still_land_on_a_well_defined_state() {
        // The idempotence a stray key-repeat event depends on: firing the
        // same command twice back to back cancels out rather than doing
        // something a caller would have to special-case.
        let opened = toggle_manual_override(None, 0.0);
        let closed = toggle_manual_override(opened, 0.0);
        assert_eq!(closed, None);
        assert_eq!(toggle_manual_override(closed, 0.0), opened);
    }

    #[test]
    fn a_manual_override_keeps_everything_visible_even_as_the_underlying_controller_closes() {
        let program = Program::compile("let mut map = HashMap::new();\nmap.entry(key).or_insert_with(Vec::new);");
        // `opened: true` here stands in for a step whose initial delay has
        // already genuinely elapsed — the override must not be what is
        // opening the controller (see `advance`'s doc comment), so the
        // fixture opens it the ordinary way, same as
        // `a_fast_player_closes_the_window_and_keeps_it_closed` above.
        let mut state = RevealState {
            k: 3,
            opened: true,
            manual_override_until: Some(5_000.0),
            ..RevealState::empty(program.slot_count())
        };

        let mut now = 0.0;
        for _ in 0..10 {
            now += 60.0;
            // The same 200 WPM-against-a-60-WPM-baseline reading that closes
            // the window in `a_fast_player_closes_the_window_and_keeps_it_closed`
            // above — comfortably past the fast band.
            let window: Vec<f64> = (0..12).map(|index| 60.0f64.mul_add(-f64::from(12 - index), now)).collect();
            state = advance(&state, &program, 0, &window, Some(0.0), BASELINE, now);
            assert!(
                visibility_codes(&state, &program, 0).iter().all(|&code| code == 1),
                "the override should keep every slot visible at t={now}, whatever the controller's own k is doing"
            );
        }

        // The controller underneath was never frozen — it closed exactly as
        // it would have without the override. That is what lets cancelling
        // or expiring the override hand back a sensible state instead of one
        // stuck wide open; see the regression below.
        assert_eq!(state.k, 0, "the real controller should have closed by now, independent of what the override is showing");
    }

    #[test]
    fn cancelling_the_override_restores_the_controllers_own_progression() {
        // The regression this override design exists to prevent: two
        // toggles back to back, nothing typed in between. Baking the
        // override straight into `k` (the first cut at this feature) left
        // `next_k` reading zero keystrokes forever after — which only ever
        // grows — so the window never un-revealed even once the toggle was
        // switched back off and the status pill said it had.
        let program = Program::compile("let mut map = HashMap::new();\nmap.entry(key).or_insert_with(Vec::new);");
        let empty = RevealState::empty(program.slot_count());

        let frozen = empty.toggled(0.0);
        let after_first_toggle = advance(&frozen, &program, 0, &[], Some(0.0), BASELINE, 0.0);
        assert!(after_first_toggle.manual_override_until.is_some());

        let cancelled = after_first_toggle.toggled(0.0);
        let after_second_toggle = advance(&cancelled, &program, 0, &[], Some(0.0), BASELINE, 0.0);

        assert_eq!(after_second_toggle.manual_override_until, None);
        // The controller only grows one run per idle step - it must not
        // have jumped straight to "everything", which is what carrying the
        // override's inflated value forward would leave behind.
        assert!(
            after_second_toggle.k < program.runs().len(),
            "cancelling immediately should not leave the window pinned open: k={} of {}",
            after_second_toggle.k,
            program.runs().len()
        );
        assert!(
            !visibility_codes(&after_second_toggle, &program, 0).iter().all(|&code| code == 1),
            "the window should have re-shut to the controller's real, still-ramping position"
        );
    }

    #[test]
    fn cancelling_the_override_before_the_delay_elapses_leaves_the_controller_still_shut() {
        // A sharper case than the regression above: `opened` is a one-way
        // latch for the rest of the step, so if the override ever
        // contributed to it (even indirectly, by riding along in the same
        // `||` chain), a toggle cancelled *immediately* — before the initial
        // delay has genuinely elapsed — would permanently unlock `next_k`
        // for a step that should still be sitting at a pinned `k == 0`. The
        // regression above alone would not have caught this: `k` growing
        // from 0 to 2 still satisfies "less than the run count" on a source
        // with more than two runs.
        let program = Program::compile("let mut map = HashMap::new();\nmap.entry(key).or_insert_with(Vec::new);");
        let empty = RevealState::empty(program.slot_count());
        let started_at = Some(0.0);
        let now = 0.0;
        assert!(now < BASELINE.initial_delay_ms(0), "the fixture must actually sit inside the delay window");

        let frozen = empty.toggled(now);
        let after_first_toggle = advance(&frozen, &program, 0, &[], started_at, BASELINE, now);
        assert!(after_first_toggle.manual_override_until.is_some());

        let cancelled = after_first_toggle.toggled(now);
        let after_second_toggle = advance(&cancelled, &program, 0, &[], started_at, BASELINE, now);

        assert_eq!(after_second_toggle.manual_override_until, None);
        assert!(!after_second_toggle.opened, "the delay gate must not have been unlocked by a cancelled override");
        assert_eq!(
            after_second_toggle.k, 0,
            "the controller must still be pinned shut, exactly as if the toggle had never happened"
        );
    }

    #[test]
    fn the_override_lifts_on_its_own_once_the_deadline_passes() {
        let program = Program::compile("let mut map = HashMap::new();");
        let state = RevealState {
            manual_override_until: Some(1_000.0),
            opened: true,
            k: program.runs().len(),
            ..RevealState::empty(program.slot_count())
        };

        let still_active = advance(&state, &program, 0, &[], Some(0.0), BASELINE, 999.0);
        assert_eq!(still_active.manual_override_until, Some(1_000.0));

        let lifted = advance(&state, &program, 0, &[], Some(0.0), BASELINE, 1_000.0);
        assert_eq!(lifted.manual_override_until, None, "the deadline having passed clears the override on its own");
    }

    #[test]
    fn manual_reveal_fraction_decays_from_one_to_zero_and_clamps() {
        assert_eq!(manual_reveal_fraction(None, 0.0), 0.0, "no override in force reads as zero, not a stale fraction");
        assert_eq!(manual_reveal_fraction(Some(MAX_MANUAL_REVEAL_MS), 0.0), 1.0);
        assert_eq!(manual_reveal_fraction(Some(MAX_MANUAL_REVEAL_MS), MAX_MANUAL_REVEAL_MS / 2.0), 0.5);
        assert_eq!(
            manual_reveal_fraction(Some(1_000.0), 5_000.0),
            0.0,
            "a deadline already in the past clamps rather than going negative"
        );
    }
}
