
use serde::{Deserialize, Serialize};

/// Configuration for game behavior
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameConfig {
    pub min_time_window_ms: u32,
    pub max_time_window_ms: u32,
    pub correctness_threshold_ms: u32,
    pub speed_increase_every_n_correct: usize,
    pub time_window_step_ms: u32,
    pub hide_romanization_streak: usize,
    pub points_per_correct: i32,
    pub points_per_miss: i32,
    pub streak_bonus_divisor: usize,
}

impl Default for GameConfig {
    fn default() -> Self {
        Self {
            min_time_window_ms: 1500,
            max_time_window_ms: 4000,
            correctness_threshold_ms: 500,
            speed_increase_every_n_correct: 3,
            time_window_step_ms: 200,
            hide_romanization_streak: 5,
            points_per_correct: 10,
            points_per_miss: -5,
            streak_bonus_divisor: 5,
        }
    }
}

/// Game statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStats {
    pub score: i32,
    pub current_streak: usize,
    pub best_streak: usize,
    pub total_correct: usize,
    pub total_missed: usize,
}

impl GameStats {
    pub fn new() -> Self {
        Self {
            score: 0,
            current_streak: 0,
            best_streak: 0,
            total_correct: 0,
            total_missed: 0,
        }
    }

    pub fn accuracy(&self) -> f64 {
        let total = self.total_correct + self.total_missed;
        if total == 0 {
            0.0
        } else {
            (self.total_correct as f64 / total as f64) * 100.0
        }
    }
}

/// Result of spawning a new character
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnResult {
    pub cell_id: String,
    pub hangul: String,
    pub expected_key: String,
    pub revealed_at_ms: u64,
    pub play_spawn_sound: bool,
}

/// Result of checking for expired characters
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpiredResult {
    pub cell_ids: Vec<String>,
    pub count: usize,
    pub play_expire_sound: bool,
}

/// Timing parameters for the game
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimingParams {
    pub spawn_interval_ms: u32,
    pub character_lifetime_ms: u32,
    pub show_romanization: bool,
}

/// Audio events to trigger
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioEvents {
    pub match_correct: bool,
    pub match_perfect: bool,
    pub match_miss: bool,
    pub character_expired: bool,
    pub streak_milestone: bool,
    pub difficulty_changed: bool,
}

impl AudioEvents {
    pub fn new() -> Self {
        Self {
            match_correct: false,
            match_perfect: false,
            match_miss: false,
            character_expired: false,
            streak_milestone: false,
            difficulty_changed: false,
        }
    }
}

/// Result of processing a key press
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyPressResult {
    pub matched: bool,
    pub is_partial_match: bool,
    pub should_clear_buffer: bool,
    pub hangul: String,
    pub cell_id: String,
    pub points: i32,
    pub time_gap_ms: u32,
    pub is_high_quality: bool,
    pub current_buffer: String,
    pub audio_events: AudioEvents,
    pub counts_toward_completion: bool,
}

/// Progress information for completion mode
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameProgress {
    pub total_keys: usize,
    pub completed_keys: usize,
    pub remaining_keys: usize,
    pub completion_percentage: f32,
    pub keys_completed_list: Vec<String>,
}

/// Overall game status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStatus {
    pub is_complete: bool,
    pub is_timed_out: bool,
    pub time_remaining_ms: u64,
    pub progress: GameProgress,
}
