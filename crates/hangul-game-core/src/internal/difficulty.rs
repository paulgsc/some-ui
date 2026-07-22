use super::{DifficultyChangeReason, GameConfig, SecondaryEvent};

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

/// Pure step calculator for a speed-up (canon Thm. 7.2(b), Axiom 12.1, ADR 0004 #752): given the
/// streak-token counter before this match and how many tokens it just matched, returns the new
/// streak-token counter, the resulting lifetime after applying every threshold crossed, and one
/// `DifficultyChanged` event per step where the lifetime actually changed. At `tokens_matched == 1`
/// this reduces to at most one step, unchanged from the original per-match trigger.
pub fn compute_speedup(streak_tokens_before: usize, tokens_matched: usize, current_lifetime_ms: u32, config: &GameConfig) -> (usize, u32, Vec<SecondaryEvent>) {
    let step_every = config.speed_increase_every_n_correct;
    let old_level = streak_tokens_before / step_every;
    let new_streak_tokens = streak_tokens_before + tokens_matched;
    let new_level = new_streak_tokens / step_every;

    let mut lifetime = current_lifetime_ms;
    let mut events = Vec::new();
    for _ in old_level..new_level {
        let old_lifetime = lifetime;
        lifetime = lifetime.saturating_sub(config.time_window_step_ms).max(config.min_time_window_ms);

        if old_lifetime != lifetime {
            events.push(SecondaryEvent::DifficultyChanged {
                new_lifetime_ms: lifetime,
                new_interval_ms: calculate_spawn_interval(lifetime, config),
                reason: DifficultyChangeReason::PerfectMatch,
            });
        }
    }

    (new_streak_tokens, lifetime, events)
}

/// Pure step calculator for a slow-down (canon Axiom 12.1, ADR 0004 #752): given the current
/// lifetime, returns the new (clamped-at-ceiling) lifetime and, if it actually changed, the
/// `DifficultyChanged` event describing it.
pub fn compute_slowdown(current_lifetime_ms: u32, config: &GameConfig, reason: DifficultyChangeReason) -> (u32, Option<SecondaryEvent>) {
    let new_lifetime = (current_lifetime_ms + config.time_window_step_ms).min(config.max_time_window_ms);

    let event = if current_lifetime_ms == new_lifetime {
        None
    } else {
        Some(SecondaryEvent::DifficultyChanged {
            new_lifetime_ms: new_lifetime,
            new_interval_ms: calculate_spawn_interval(new_lifetime, config),
            reason,
        })
    };

    (new_lifetime, event)
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

    fn config_with_step(min: u32, max: u32, step: u32, speed_increase_every_n_correct: usize) -> GameConfig {
        GameConfig {
            min_time_window_ms: min,
            max_time_window_ms: max,
            time_window_step_ms: step,
            speed_increase_every_n_correct,
            ..GameConfig::default()
        }
    }

    #[test]
    fn compute_speedup_steps_once_per_multiple_of_tokens_matched() {
        let config = config_with_step(1000, 3000, 150, 4);

        let (streak_tokens, lifetime, events) = compute_speedup(0, 4, 3000, &config);

        assert_eq!(streak_tokens, 4);
        assert_eq!(lifetime, 2850);
        assert_eq!(events.len(), 1);
        assert!(matches!(events[0], SecondaryEvent::DifficultyChanged { new_lifetime_ms: 2850, .. }));
    }

    #[test]
    fn compute_speedup_does_not_step_below_the_token_threshold() {
        let config = config_with_step(1000, 3000, 150, 4);

        let (streak_tokens, lifetime, events) = compute_speedup(0, 3, 3000, &config);

        assert_eq!(streak_tokens, 3);
        assert_eq!(lifetime, 3000);
        assert!(events.is_empty());
    }

    #[test]
    fn compute_speedup_can_cross_multiple_thresholds_in_one_call() {
        let config = config_with_step(1000, 3000, 150, 1);

        let (streak_tokens, lifetime, events) = compute_speedup(0, 4, 3000, &config);

        assert_eq!(streak_tokens, 4);
        assert_eq!(lifetime, 2400);
        assert_eq!(events.len(), 4);
    }

    #[test]
    fn compute_speedup_clamps_at_the_minimum_and_stops_emitting_events() {
        let config = config_with_step(1000, 1100, 150, 1);

        let (_, lifetime_1, events_1) = compute_speedup(0, 1, 1100, &config);
        assert_eq!(lifetime_1, 1000);
        assert_eq!(events_1.len(), 1);

        let (_, lifetime_2, events_2) = compute_speedup(1, 1, lifetime_1, &config);
        assert_eq!(lifetime_2, 1000);
        assert!(events_2.is_empty(), "already at the floor: no further decrease, no spurious event");
    }

    #[test]
    fn compute_slowdown_increases_lifetime_and_emits_an_event() {
        let config = config_with_step(1000, 3000, 150, 1);

        let (lifetime, event) = compute_slowdown(2000, &config, DifficultyChangeReason::InputMiss);

        assert_eq!(lifetime, 2150);
        assert!(matches!(event, Some(SecondaryEvent::DifficultyChanged { new_lifetime_ms: 2150, .. })));
    }

    #[test]
    fn compute_slowdown_clamps_at_the_ceiling_with_no_spurious_event() {
        let config = config_with_step(1000, 1100, 150, 1);

        let (lifetime, event) = compute_slowdown(1100, &config, DifficultyChangeReason::CharacterExpired);

        assert_eq!(lifetime, 1100);
        assert!(event.is_none());
    }
}
