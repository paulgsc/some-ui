use crate::CanonicalUnit;

#[derive(Debug, Clone)]
pub struct ValidationResult {
    pub should_block: bool,
    pub new_errors: usize,
}

/// Calculate how many consecutive errors exist in the current input.
///
/// Returns the count of all characters from the first error position to the end.
/// If there are no errors, returns 0.
pub fn calculate_consecutive_errors(user_units: &[CanonicalUnit], target_units: &[CanonicalUnit]) -> usize {
    let first_error_pos = find_first_error(user_units, target_units);

    match first_error_pos {
        None => 0,
        Some(pos) => user_units.len() - pos,
    }
}

/// Find the first position where user input diverges from target.
/// Returns None if all user input matches target so far.
pub fn find_first_error(user_units: &[CanonicalUnit], target_units: &[CanonicalUnit]) -> Option<usize> {
    (0..user_units.len()).find(|&i| {
        match target_units.get(i) {
            Some(target) => !user_units[i].matches(target),
            None => true, // Exceeded target length
        }
    })
}

/// Validate input against target.
///
/// Core principles:
/// 1. Backspacing is always allowed (checked before calling this)
/// 2. If already at max consecutive errors, block new input
/// 3. Count only NEWLY ADDED errors for total_errors tracking
/// 4. Once any position has an error, all subsequent positions are errors
pub fn validate_input(
    previous_units: &[CanonicalUnit],
    new_units: &[CanonicalUnit],
    target_units: &[CanonicalUnit],
    current_consecutive_errors: usize,
    max_consecutive_errors: usize,
) -> ValidationResult {
    // Block if we've reached the threshold
    // Note: We check >= because once you hit the threshold, you must backspace
    if current_consecutive_errors >= max_consecutive_errors {
        return ValidationResult {
            new_errors: 0,
            should_block: true,
        };
    }

    // Find first error in the new input
    let first_error_pos = find_first_error(new_units, target_units);
    let new_chars_start = previous_units.len();

    match first_error_pos {
        None => {
            // All characters match so far
            ValidationResult {
                new_errors: 0,
                should_block: false,
            }
        }
        Some(error_pos) => {
            // Count ONLY newly added errors
            //
            // If error_pos < new_chars_start:
            //   Error existed before, so all newly added chars are errors
            //
            // If error_pos >= new_chars_start:
            //   Error is in new portion, count from error_pos to end
            let new_error_count = if error_pos < new_chars_start {
                new_units.len() - new_chars_start
            } else {
                new_units.len() - error_pos
            };

            ValidationResult {
                new_errors: new_error_count,
                should_block: false,
            }
        }
    }
}

/// Check if the user has completed typing the target correctly.
pub fn check_completion(user_units: &[CanonicalUnit], target_units: &[CanonicalUnit]) -> bool {
    if user_units.len() != target_units.len() || user_units.is_empty() {
        return false;
    }
    user_units.iter().zip(target_units.iter()).all(|(user, target)| user.matches(target))
}
