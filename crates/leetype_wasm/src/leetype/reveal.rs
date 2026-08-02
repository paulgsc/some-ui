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
#[derive(Debug, Clone, PartialEq, Eq)]
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

    /// Whether the player is being shown `slot` right now.
    #[must_use]
    pub fn is_visible(&self, program: &Program, cursor: usize, slot: usize) -> bool {
        if program.slot_is_space(slot) {
            return true;
        }
        if self.seen.get(slot).copied().unwrap_or(false) {
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
#[must_use]
pub fn advance(state: &RevealState, program: &Program, cursor: usize, keystrokes: &[f64], started_at: Option<f64>, config: RevealConfig, now: f64) -> RevealState {
    let opened = state.opened || started_at.is_some_and(|start| now - start >= config.initial_delay_ms(state.attempt));

    let remaining = program.runs().len().saturating_sub(program.run_index_at_or_after(cursor));

    let k = if opened {
        next_k(state.k, stats::instantaneous_wpm(keystrokes, now), config.slow_band(), config.fast_band(), remaining)
    } else {
        0
    };

    RevealState {
        k,
        opened,
        attempt: state.attempt,
        seen: ratcheted(&state.seen, program, cursor, k),
    }
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
    use super::{advance, progression, visibility_codes, Progression, Program, RevealConfig, RevealState, MAX_STEP_ATTEMPTS};

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
        let Some(last_run) = program.runs().last().copied() else {
            panic!("source has runs")
        };
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
}
