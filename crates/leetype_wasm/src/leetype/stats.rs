//! Scoring arithmetic. Every function here is total and pure.

/// Ratio of resolved-correct slots to total slots, as a percentage.
pub fn progress(correct: usize, slot_count: usize) -> f64 {
    if slot_count == 0 {
        return 0.0;
    }
    ratio(correct, slot_count) * 100.0
}

/// Correct keystrokes over all keystrokes, as a percentage.
///
/// The denominator is `correct + total_errors` rather than the number of
/// filled slots: a mistake that was backspaced away still happened, and
/// accuracy that forgets corrections isn't accuracy.
pub fn accuracy(correct: usize, total_errors: usize) -> f64 {
    let attempts = correct + total_errors;
    if attempts == 0 {
        return 100.0;
    }
    ratio(correct, attempts) * 100.0
}

/// Words per minute on the conventional five-characters-per-word basis,
/// counting only characters that landed correctly.
///
/// Cumulative over the whole run, and that is the right shape for a
/// *report*: it is the number the player sees at the end. It is the wrong
/// shape for a *controller* — see [`instantaneous_wpm`].
pub fn wpm(correct: usize, elapsed_seconds: f64) -> usize {
    let value = raw_wpm(correct, elapsed_seconds).floor();
    if value <= 0.0 {
        return 0;
    }
    usize_from(value)
}

/// [`wpm`] before flooring, for the arithmetic that carries on with it.
pub fn raw_wpm(correct: usize, elapsed_seconds: f64) -> f64 {
    if elapsed_seconds <= 0.0 {
        return 0.0;
    }
    let words = as_f64(correct) / 5.0;
    let minutes = elapsed_seconds / 60.0;
    words / minutes
}

/// How many recent keystrokes [`instantaneous_wpm`] averages over.
///
/// A fixed-width ring, not an exponentially-weighted rate. Both were on the
/// table and both can see an eight-second pause; the ring wins on being
/// *stateless with respect to its own history* — the figure is a pure
/// function of the timestamps still in the window and `now`, so a test can
/// write a synthetic timeline and read the answer off it without replaying
/// the run. An EWMA's value depends on every keystroke that ever fed it,
/// including the ones the window has forgotten, which makes the property
/// tests in `tests/invariants.rs` harder to state and no stronger.
///
/// Twelve is roughly two and a half seconds of typing at 60 WPM: long
/// enough that a single fast keystroke does not spike it, short enough that
/// a hesitation shows up inside the same word.
pub const INSTANT_WINDOW: usize = 12;

/// Instantaneous, windowed WPM — the controller the reveal window reads.
///
/// The span is measured from the oldest retained keystroke to **`now`**, not
/// to the newest keystroke. That is the load-bearing detail: it means the
/// figure keeps falling while the player sits still, so a hesitation is
/// visible *during* the hesitation rather than only once it ends. A measure
/// that only updates on keystrokes cannot see a player who has stopped
/// typing, which is precisely the player the reveal window exists for.
///
/// The states a windowed measure has and a cumulative one does not, each
/// with a defined answer rather than an accidental one:
///
/// - **Before the window fills.** Whatever timestamps exist are used. One
///   keystroke and a live `now` is already a rate.
/// - **At the very first keystroke**, where `now` equals that timestamp and
///   the span is zero: `0.0`. Finite, and it errs toward "slow", which opens
///   the reveal window rather than withholding it.
/// - **After a long idle gap.** The span grows without the count growing, so
///   the figure decays toward zero. No special case needed.
/// - **After a backspace burst.** Backspaces are keystrokes and are fed in
///   like any other, so mashing backspace reads as *fast*, which closes the
///   window. That is deliberate: a player mashing backspace is not stuck for
///   want of the next token, and the weighted figure (which the gate reads)
///   charges them for the errors either way.
pub fn instantaneous_wpm(recent: &[f64], now: f64) -> f64 {
    let Some(&oldest) = recent.first() else {
        return 0.0;
    };

    let span_seconds = ((now - oldest) / 1000.0).max(0.0);
    if span_seconds <= 0.0 {
        return 0.0;
    }

    raw_wpm(recent.len(), span_seconds)
}

/// How much a slot resolved under full assistance is discounted.
///
/// `0.5` — a step typed with everything revealed is worth half a step typed
/// from memory. The number is a judgement, not a measurement, and it is
/// named here so it is arguable: too low and copying scores nearly as well
/// as retrieving, which is the one thing this figure exists to tell apart;
/// too high and a player who took a single hint is punished as though they
/// had read the whole answer.
const ASSIST_DISCOUNT: f64 = 0.5;

/// Weighted WPM — the scalar the gate reads.
///
/// A rate, discounted twice:
///
/// ```text
/// weighted = raw_rate × (1 − ASSIST_DISCOUNT × assisted/correct) × accuracy
/// ```
///
/// **What it rewards.** Typing the step correctly, quickly, and with the
/// tokens still masked. All three at once — none of them substitutes for
/// another.
///
/// **What it is exploitable by.** Nothing that is cheaper than just knowing
/// the answer, which is the property that matters:
///
/// - *Stall until the window opens, then type a visible line fast.* Stalling
///   inflates `elapsed_seconds`, which lowers the rate, **and** raises
///   `assisted`, which lowers the assistance factor. Both move the same way,
///   so waiting is never the higher-scoring strategy at any speed.
/// - *Type wrong then correct.* `total_errors` is a lifetime tally including
///   backspaced-away mistakes (see [`accuracy`]), so the correction does not
///   erase the mistake.
/// - *Mash and backspace.* Same as above, plus the wasted time.
///
/// **What it is honestly bad at.** It cannot tell a player who genuinely
/// types slowly from one who is thinking — that is what the *baseline* is
/// for, and why the threshold this figure is compared against is a fraction
/// of the player's own copying speed rather than a number in this file.
pub fn weighted_wpm(correct: usize, assisted: usize, total_errors: usize, elapsed_seconds: f64) -> f64 {
    if correct == 0 {
        return 0.0;
    }

    let assist_ratio = (as_f64(assisted) / as_f64(correct)).clamp(0.0, 1.0);
    let assistance = ASSIST_DISCOUNT.mul_add(-assist_ratio, 1.0);
    let accuracy_factor = accuracy(correct, total_errors) / 100.0;

    raw_wpm(correct, elapsed_seconds) * assistance * accuracy_factor
}

/// Seconds between `started_at` and `now`, or zero if the clock never ran.
pub fn elapsed_seconds(started_at: Option<f64>, now: f64) -> f64 {
    started_at.map_or(0.0, |start| ((now - start) / 1000.0).max(0.0))
}

fn ratio(numerator: usize, denominator: usize) -> f64 {
    as_f64(numerator) / as_f64(denominator)
}

/// Slot counts here are bounded by the chunk size (a few thousand), far
/// inside `f64`'s exactly-representable integer range.
#[expect(clippy::cast_precision_loss, reason = "counts are bounded by the chunk size")]
const fn as_f64(value: usize) -> f64 {
    value as f64
}

/// `value` is a non-negative, already-floored WPM figure.
#[expect(clippy::cast_possible_truncation, clippy::cast_sign_loss, reason = "value is floored and guarded non-negative by the caller")]
const fn usize_from(value: f64) -> usize {
    value as usize
}

#[cfg(test)]
mod tests {
    use super::{accuracy, elapsed_seconds, instantaneous_wpm, progress, weighted_wpm, wpm, INSTANT_WINDOW};

    /// `count` keystrokes at a steady `wpm`, the last one landing at `end_ms`.
    fn steady_window(wpm: f64, count: usize, end_ms: f64) -> Vec<f64> {
        let interval_ms = 60_000.0 / (wpm * 5.0);
        (0..count).map(|index| interval_ms.mul_add(-f64::from(u32::try_from(count - 1 - index).unwrap_or(0)), end_ms)).collect()
    }

    #[test]
    fn progress_is_zero_for_an_empty_program() {
        assert!((progress(0, 0) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn progress_is_a_percentage() {
        assert!((progress(5, 10) - 50.0).abs() < f64::EPSILON);
        assert!((progress(10, 10) - 100.0).abs() < f64::EPSILON);
    }

    #[test]
    fn accuracy_starts_perfect_and_counts_corrected_mistakes() {
        assert!((accuracy(0, 0) - 100.0).abs() < f64::EPSILON);
        assert!((accuracy(9, 1) - 90.0).abs() < f64::EPSILON);
        assert!((accuracy(0, 4) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn wpm_is_zero_before_the_clock_runs() {
        assert_eq!(wpm(100, 0.0), 0);
        assert_eq!(wpm(100, -1.0), 0);
    }

    #[test]
    fn wpm_uses_five_characters_per_word() {
        // 300 correct chars = 60 words, in one minute
        assert_eq!(wpm(300, 60.0), 60);
    }

    #[test]
    fn elapsed_seconds_is_zero_until_started_and_never_negative() {
        assert!((elapsed_seconds(None, 5_000.0) - 0.0).abs() < f64::EPSILON);
        assert!((elapsed_seconds(Some(1_000.0), 4_000.0) - 3.0).abs() < f64::EPSILON);
        assert!((elapsed_seconds(Some(5_000.0), 1_000.0) - 0.0).abs() < f64::EPSILON);
    }

    // ── Instantaneous WPM ────────────────────────────────────────────────

    #[test]
    fn the_instantaneous_figure_is_defined_from_the_first_keystroke_onward() {
        // Zero span: finite, and it reads *slow*, which opens the reveal
        // window rather than withholding it.
        assert!((instantaneous_wpm(&[1_000.0], 1_000.0) - 0.0).abs() < f64::EPSILON);

        let after_a_second = instantaneous_wpm(&[1_000.0], 2_000.0);
        assert!(after_a_second.is_finite() && after_a_second > 0.0);
    }

    #[test]
    fn an_empty_window_reads_zero_rather_than_panicking() {
        assert!((instantaneous_wpm(&[], 10_000.0) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn steady_typing_reads_back_at_roughly_the_rate_it_was_generated_at() {
        let window = steady_window(60.0, INSTANT_WINDOW, 10_000.0);
        let interval_ms = 60_000.0 / 300.0;
        // `now` one interval past the last keystroke: the window then spans
        // exactly `INSTANT_WINDOW` intervals for `INSTANT_WINDOW` keystrokes.
        let reading = instantaneous_wpm(&window, 10_000.0 + interval_ms);
        assert!((reading - 60.0).abs() < 0.5, "expected ~60 wpm, got {reading}");
    }

    #[test]
    fn a_hesitation_moves_the_instantaneous_figure_and_barely_moves_the_cumulative_one() {
        // The entire justification for R1 in one assertion: four minutes into
        // a 60 WPM run, one eight-second pause.
        const FOUR_MINUTES_MS: f64 = 240_000.0;
        let window = steady_window(60.0, INSTANT_WINDOW, FOUR_MINUTES_MS);
        // 60 WPM for four minutes is 240 words = 1200 correct characters.
        let correct = 1_200;

        let before_instant = instantaneous_wpm(&window, FOUR_MINUTES_MS + 200.0);
        let before_cumulative = wpm(correct, 240.0);

        let after_instant = instantaneous_wpm(&window, FOUR_MINUTES_MS + 8_000.0);
        let after_cumulative = wpm(correct, 248.0);

        assert!(
            after_instant < before_instant * 0.35,
            "instantaneous should collapse: {before_instant} -> {after_instant}"
        );
        assert!(
            before_cumulative - after_cumulative <= 2,
            "cumulative should barely notice: {before_cumulative} -> {after_cumulative}"
        );
    }

    #[test]
    fn a_burst_reads_faster_than_the_run_that_precedes_it() {
        let steady = instantaneous_wpm(&steady_window(40.0, INSTANT_WINDOW, 10_000.0), 10_500.0);
        let burst = instantaneous_wpm(&steady_window(120.0, INSTANT_WINDOW, 10_000.0), 10_100.0);
        assert!(burst > steady * 2.0, "burst {burst} vs steady {steady}");
    }

    #[test]
    fn an_idle_gap_decays_the_figure_monotonically_toward_zero() {
        let window = steady_window(60.0, INSTANT_WINDOW, 10_000.0);
        let readings: Vec<f64> = [10_100.0, 12_000.0, 20_000.0, 60_000.0, 300_000.0].iter().map(|&now| instantaneous_wpm(&window, now)).collect();

        for pair in readings.windows(2) {
            assert!(pair[1] < pair[0], "expected decay, got {readings:?}");
        }
        assert!(readings.last().is_some_and(|&last| last < 1.0));
    }

    // ── Weighted WPM ─────────────────────────────────────────────────────

    #[test]
    fn a_step_typed_under_mask_outscores_the_same_step_typed_revealed() {
        let masked = weighted_wpm(100, 0, 0, 30.0);
        let revealed = weighted_wpm(100, 100, 0, 30.0);
        assert!(masked > revealed, "masked {masked} vs revealed {revealed}");
        // The discount is exactly the one named in ASSIST_DISCOUNT.
        assert!((revealed - masked * 0.5).abs() < 1e-9);
    }

    #[test]
    fn stalling_for_a_reveal_never_outscores_typing_it_now() {
        // Same step, same keystrokes. One player types it masked in 30s; the
        // other waits 20s for the window to open and then types it revealed
        // in the same 30s of actual typing.
        let straight_through = weighted_wpm(100, 0, 0, 30.0);
        let stalled = weighted_wpm(100, 100, 0, 50.0);
        assert!(stalled < straight_through, "stalled {stalled} vs {straight_through}");
    }

    #[test]
    fn partial_assistance_lands_between_the_two_extremes() {
        let none = weighted_wpm(100, 0, 0, 30.0);
        let half = weighted_wpm(100, 50, 0, 30.0);
        let all = weighted_wpm(100, 100, 0, 30.0);
        assert!(all < half && half < none);
    }

    #[test]
    fn typing_wrong_then_correcting_scores_below_typing_it_right() {
        let clean = weighted_wpm(100, 0, 0, 30.0);
        let corrected = weighted_wpm(100, 0, 20, 30.0);
        assert!(corrected < clean, "corrected {corrected} vs clean {clean}");
    }

    #[test]
    fn mashing_and_backspacing_is_charged_for_both_the_errors_and_the_time() {
        let clean = weighted_wpm(100, 0, 0, 30.0);
        let mashed = weighted_wpm(100, 0, 200, 45.0);
        assert!(mashed < clean * 0.4, "mashed {mashed} vs clean {clean}");
    }

    #[test]
    fn an_untouched_step_is_worth_nothing_rather_than_dividing_by_zero() {
        assert!((weighted_wpm(0, 0, 0, 30.0) - 0.0).abs() < f64::EPSILON);
        assert!((weighted_wpm(0, 0, 5, 0.0) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn more_assistance_than_correct_slots_cannot_push_the_factor_negative() {
        // Defensive: the caller counts both, but a weighting that could go
        // negative would make the gate nonsense rather than merely strict.
        assert!(weighted_wpm(10, 40, 0, 30.0) >= 0.0);
    }
}
