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
pub fn wpm(correct: usize, elapsed_seconds: f64) -> usize {
    if elapsed_seconds <= 0.0 {
        return 0;
    }
    let words = as_f64(correct) / 5.0;
    let minutes = elapsed_seconds / 60.0;
    let value = (words / minutes).floor();
    if value <= 0.0 {
        return 0;
    }
    usize_from(value)
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
    use super::{accuracy, elapsed_seconds, progress, wpm};

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
}
