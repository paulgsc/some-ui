use super::GameConfig;

/// Calculate spawn interval based on current difficulty
pub fn calculate_spawn_interval(current_time_window_ms: u32, config: &GameConfig) -> u32 {
    const MIN_INTERVAL: f32 = 800.0; // Fastest spawn (hardest)
    const MAX_INTERVAL: f32 = 2500.0; // Slowest spawn (easiest)

    let max_time = config.max_time_window_ms as f32;
    let min_time = config.min_time_window_ms as f32;
    let current_time = current_time_window_ms as f32;

    let total_range = max_time - min_time;

    // Guard against invalid configuration
    if total_range <= 0.0 {
        return MAX_INTERVAL.round() as u32;
    }

    // Calculate normalized difficulty [0.0 = easiest, 1.0 = hardest]
    let difficulty_ratio = ((max_time - current_time) / total_range).clamp(0.0, 1.0);

    // Apply easing for smoother progression (square root easing)
    let eased_ratio = difficulty_ratio.sqrt();

    // Interpolate spawn interval
    let interval_range = MAX_INTERVAL - MIN_INTERVAL;
    let interval = MAX_INTERVAL - (interval_range * eased_ratio);

    interval.clamp(MIN_INTERVAL, MAX_INTERVAL).round() as u32
}
