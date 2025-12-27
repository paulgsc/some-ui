use super::GameConfig;

/// Calculate spawn interval based on current difficulty
pub fn calculate_spawn_interval(current_time_window_ms: u32, config: &GameConfig) -> u32 {
    let max_window = config.max_time_window_ms as f32;
    let min_window = config.min_time_window_ms as f32;
    let current_window = current_time_window_ms as f32;

    // 1. Calculate how much the "lifetime" has shrunk (0.0 = full time, 1.0 = min time)
    let progress = ((max_window - current_window) / (max_window - min_window)).clamp(0.0, 1.0);

    // 2. Easing: Use a "Power of 3" (Cubic) easing.
    // This makes the spawn rate stay slow for a very short time and then
    // accelerate much faster into the "hard" zone.
    let eased_ratio = progress * progress * progress;

    // 3. Interpolate between Slow (2500ms) and Fast (800ms)
    // If you want it to feel even faster, consider lowering MIN_INTERVAL to 500.0
    let min_spawn = 800.0;
    let max_spawn = 2500.0;

    let interval = max_spawn - (eased_ratio * (max_spawn - min_spawn));

    interval.round() as u32
}
