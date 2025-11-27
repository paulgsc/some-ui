use crate::types::internal::{ActiveReveal, KeyBufferEntry};
use crate::types::public::{AudioEvents, GameConfig, GameStats, KeyPressResult};

/// Actions that should be performed after matching
pub struct MatchActions {
    pub should_call_on_match: Option<(String, bool, bool)>, // (hangul, is_high_quality, show_romanization)
    pub adjust_difficulty_faster: bool,
    pub adjust_difficulty_slower: bool,
}

/// Process a key press with buffer management and greedy matching
pub fn process_key_with_buffer(
    key: String,
    pressed_at_ms: u64,
    key_buffer: &mut Vec<KeyBufferEntry>,
    active_reveals: &mut Vec<ActiveReveal>,
    stats: &mut GameStats,
    config: &GameConfig,
    buffer_timeout_ms: u64,
    show_romanization: bool,
) -> (KeyPressResult, MatchActions) {
    // Clean old keys from buffer
    key_buffer.retain(|entry| pressed_at_ms.saturating_sub(entry.timestamp_ms) < buffer_timeout_ms);

    // Add new key to buffer
    if let Some(key_char) = key.chars().next() {
        key_buffer.push(KeyBufferEntry {
            key: key_char,
            timestamp_ms: pressed_at_ms,
        });
    }

    // Get current buffer as string
    let current_buffer: String = key_buffer.iter().map(|e| e.key).collect();

    // Sort reveals by expected_key length (descending) for greedy matching
    let mut sorted_indices: Vec<usize> = (0..active_reveals.len()).collect();
    sorted_indices.sort_by(|&a, &b| active_reveals[b].expected_key.len().cmp(&active_reveals[a].expected_key.len()));

    let prev_streak = stats.current_streak;
    let mut audio_events = AudioEvents::new();
    let mut actions = MatchActions {
        should_call_on_match: None,
        adjust_difficulty_faster: false,
        adjust_difficulty_slower: false,
    };

    // Check for complete match
    for &idx in &sorted_indices {
        let reveal = &active_reveals[idx];
        if current_buffer == reveal.expected_key {
            // MATCH FOUND!
            let reveal = active_reveals.swap_remove(idx);
            let time_gap = pressed_at_ms.saturating_sub(reveal.revealed_at_ms);
            let is_high_quality = time_gap <= config.correctness_threshold_ms as u64;

            // Store match info for later processing
            actions.should_call_on_match = Some((reveal.hangul.clone(), is_high_quality, show_romanization));

            // Update stats
            stats.total_correct += 1;
            stats.current_streak += 1;
            stats.best_streak = stats.best_streak.max(stats.current_streak);

            // Calculate points
            let streak_bonus = (stats.current_streak / config.streak_bonus_divisor) as i32;
            let points = config.points_per_correct + streak_bonus;
            stats.score += points;

            // Audio events
            if is_high_quality {
                audio_events.match_perfect = true;
                actions.adjust_difficulty_faster = true;
                audio_events.difficulty_changed = true;
            } else {
                audio_events.match_correct = true;
            }

            // Check for streak milestone
            audio_events.streak_milestone = stats.current_streak > 0 && stats.current_streak % 5 == 0 && stats.current_streak != prev_streak;

            // Clear buffer after successful match
            key_buffer.clear();

            let result = KeyPressResult {
                matched: true,
                is_partial_match: false,
                should_clear_buffer: true,
                hangul: reveal.hangul,
                cell_id: reveal.cell_id,
                points,
                time_gap_ms: time_gap as u32,
                is_high_quality,
                current_buffer: String::new(),
                audio_events,
                counts_toward_completion: false, // Will be set by caller
            };

            return (result, actions);
        }
    }

    // No complete match - check for partial match
    let is_partial = active_reveals
        .iter()
        .any(|reveal| reveal.expected_key.starts_with(&current_buffer) && reveal.expected_key.len() > current_buffer.len());

    if is_partial {
        // Valid partial match - keep buffer
        let result = KeyPressResult {
            matched: false,
            is_partial_match: true,
            should_clear_buffer: false,
            hangul: String::new(),
            cell_id: String::new(),
            points: 0,
            time_gap_ms: 0,
            is_high_quality: false,
            current_buffer: current_buffer.clone(),
            audio_events,
            counts_toward_completion: false,
        };

        return (result, actions);
    }

    // Invalid sequence - miss
    stats.current_streak = 0;
    actions.adjust_difficulty_slower = true;
    audio_events.match_miss = true;
    audio_events.difficulty_changed = true;
    key_buffer.clear();

    let result = KeyPressResult {
        matched: false,
        is_partial_match: false,
        should_clear_buffer: true,
        hangul: String::new(),
        cell_id: String::new(),
        points: 0,
        time_gap_ms: 0,
        is_high_quality: false,
        current_buffer: String::new(),
        audio_events,
        counts_toward_completion: false,
    };

    (result, actions)
}
