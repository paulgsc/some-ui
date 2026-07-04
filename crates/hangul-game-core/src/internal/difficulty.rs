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

#[cfg(test)]
mod tests {
    use super::*;

    fn config_with_window(min: u32, max: u32) -> GameConfig {
        GameConfig {
            min_time_window_ms: min,
            max_time_window_ms: max,
            ..GameConfig::default()
        }
    }

    #[test]
    fn at_max_window_interval_is_slowest() {
        let config = config_with_window(1000, 3000);
        assert_eq!(calculate_spawn_interval(3000, &config), 2500);
    }

    #[test]
    fn at_min_window_interval_is_fastest() {
        let config = config_with_window(1000, 3000);
        assert_eq!(calculate_spawn_interval(1000, &config), 800);
    }

    #[test]
    fn interval_shrinks_monotonically_as_window_shrinks() {
        let config = config_with_window(1000, 3000);
        let windows = [3000, 2800, 2600, 2400, 2200, 2000, 1800, 1600, 1400, 1200, 1000];

        let mut prev = calculate_spawn_interval(windows[0], &config);
        for &window in &windows[1..] {
            let interval = calculate_spawn_interval(window, &config);
            assert!(interval <= prev, "interval increased from {prev} to {interval} as window shrank to {window}");
            prev = interval;
        }
    }

    #[test]
    fn clamps_progress_outside_window_bounds() {
        let config = config_with_window(1000, 3000);
        // A window wider than max clamps progress to 0 (slowest interval).
        assert_eq!(calculate_spawn_interval(5000, &config), 2500);
        // A window narrower than min clamps progress to 1 (fastest interval).
        assert_eq!(calculate_spawn_interval(0, &config), 800);
    }
}
