use super::CanonicalUnit;

pub struct ValidationResult {
    pub is_valid: bool,
    pub new_errors: usize,
    pub should_block: bool,
}

pub fn validate_input(
    previous_units: &[CanonicalUnit],
    new_units: &[CanonicalUnit],
    target_units: &[CanonicalUnit],
    current_consecutive_errors: usize,
    max_consecutive_errors: usize,
) -> ValidationResult {
    // Backspace detected - always allow
    if new_units.len() < previous_units.len() {
        return ValidationResult {
            is_valid: true,
            new_errors: 0,
            should_block: false,
        };
    }

    // Already at max consecutive errors - block new input
    if current_consecutive_errors >= max_consecutive_errors {
        return ValidationResult {
            is_valid: false,
            new_errors: 0,
            should_block: true,
        };
    }

    let mut error_count = 0;

    // Validate only newly added units
    for i in previous_units.len()..new_units.len() {
        if let Some(target) = target_units.get(i) {
            if !new_units[i].matches(target) {
                error_count += 1;
            }
        } else {
            // Exceeded target length
            error_count += 1;
        }
    }

    ValidationResult {
        is_valid: error_count == 0,
        new_errors: error_count,
        should_block: false,
    }
}

pub fn check_completion(user_units: &[CanonicalUnit], target_units: &[CanonicalUnit]) -> bool {
    if user_units.len() != target_units.len() || user_units.is_empty() {
        return false;
    }

    user_units.iter().zip(target_units.iter()).all(|(user, target)| user.matches(target))
}
