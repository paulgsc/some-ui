use serde::{Deserialize, Serialize};

/// An active character reveal in the game
#[derive(Debug, Clone)]
pub struct ActiveReveal {
    pub hangul: String,
    pub expected_key: String,
    pub revealed_at_ms: u64,
    pub cell_id: String,
}

/// A key press in the input buffer
#[derive(Debug, Clone)]
pub struct KeyBufferEntry {
    pub key: char,
    pub timestamp_ms: u64,
}
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
    pub game_duration_ms: u64,
    pub buffer_timeout_ms: u64,
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
            buffer_timeout_ms: 300,
            game_duration_ms: 180_000,
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

/// Timing parameters for the game
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimingParams {
    pub spawn_interval_ms: u32,
    pub character_lifetime_ms: u32,
    pub show_romanization: bool,
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
