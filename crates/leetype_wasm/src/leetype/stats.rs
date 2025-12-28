use super::CanonicalUnit;

pub fn calculate_progress(user_len: usize, target_len: usize) -> f64 {
    if target_len == 0 {
        return 0.0;
    }
    (user_len as f64 / target_len as f64) * 100.0
}

pub fn calculate_accuracy(chars_typed: usize, total_errors: usize) -> f64 {
    if chars_typed == 0 {
        return 100.0;
    }
    let correct = chars_typed.saturating_sub(total_errors);
    ((correct as f64 / chars_typed as f64) * 100.0).max(0.0)
}

pub fn calculate_wpm(chars_typed: usize, elapsed_seconds: f64) -> usize {
    if elapsed_seconds <= 0.0 {
        return 0;
    }
    let words = chars_typed as f64 / 5.0;
    let minutes = elapsed_seconds / 60.0;
    (words / minutes).floor() as usize
}

pub fn count_chars(units: &[CanonicalUnit]) -> usize {
    units.iter().filter(|u| u.is_char()).count()
}
