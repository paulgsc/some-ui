use crate::types::public::GameConfig;

/// Calculate spawn interval based on current difficulty
pub fn calculate_spawn_interval(current_time_window_ms: u32, config: &GameConfig) -> u32 {
    // Define spawn interval range (controls max character density)
    let min_interval: f32 = 800.0; // Fastest spawn (hardest)
    let max_interval: f32 = 2500.0; // Slowest spawn (easiest)

    // Define difficulty range
    let max_time = config.max_time_window_ms as f32;
    let min_time = config.min_time_window_ms as f32;
    let current_time = current_time_window_ms as f32;

    let total_time_range = max_time - min_time;

    // Prevent division by zero
    if total_time_range <= 0.0 {
        return max_interval.round() as u32;
    }

    // Calculate normalized difficulty (0.0 = easiest, 1.0 = hardest)
    let difficulty_ratio = (max_time - current_time) / total_time_range;
    let normalized_ratio = difficulty_ratio.clamp(0.0, 1.0);

    // Interpolate spawn interval
    let interval_range = max_interval - min_interval;
    let interval = max_interval - (interval_range * normalized_ratio);

    interval.clamp(min_interval, max_interval).round() as u32
}

/// Increase difficulty (faster spawns, shorter lifetime)
pub fn adjust_difficulty_faster(current_time_window_ms: &mut u32, current_streak: usize, config: &GameConfig) {
    if current_streak % config.speed_increase_every_n_correct == 0 {
        *current_time_window_ms = current_time_window_ms.saturating_sub(config.time_window_step_ms).max(config.min_time_window_ms);
    }
}

/// Decrease difficulty (slower spawns, longer lifetime)
pub fn adjust_difficulty_slower(current_time_window_ms: &mut u32, config: &GameConfig) {
    *current_time_window_ms = (*current_time_window_ms + config.time_window_step_ms).min(config.max_time_window_ms);
}
