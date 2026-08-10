use serde::{Deserialize, Serialize};

use super::stimulus::Stimulus;

/// An active challenge on the board (canon Def. 4.2): a stimulus paired with an ordered answer
/// sequence, a cursor into it, and the (possibly multi-cell, ADR 0003 §2(a)) board placement it
/// occupies. Generalizes the old single-jamo `ActiveReveal`; at `answer_keys.len() == 1` this is
/// observationally identical to it (canon Thm. 4.1).
#[derive(Debug, Clone)]
pub struct ActiveChallenge {
    pub stimulus: Stimulus,
    /// w - the ordered QWERTY key tokens the player must type.
    pub answer_keys: Vec<String>,
    /// Parallel jamo/display tokens (index-aligned with `answer_keys`), used for progressive
    /// reveal and completion display. No syllable-composition layer: this is the raw jamo stream
    /// (ADR 0001 §2(b)'s deferred choice, resolved as Option A).
    pub answer_glyphs: Vec<String>,
    /// c - tokens of the answer already matched.
    pub cursor: usize,
    pub revealed_at_ms: u64,
    /// Ordered board cells; `cell_ids[i]` is bound to answer token `i` (ADR 0003 §2(a)).
    pub cell_ids: Vec<String>,
    /// Stable key for `GameMode::on_match`/`on_miss` bookkeeping (a jamo, or a word's id).
    pub identity: String,
}

impl ActiveChallenge {
    /// t(C) = `w_c` - the current expected token (canon Def. 4.3).
    pub fn current_key(&self) -> &str {
        &self.answer_keys[self.cursor]
    }
}

/// What a `GameMode` hands the engine when asked for the next thing to spawn (canon Def. 6.1's
/// `Challenge`, plus the `identity` a mode needs for its own completion bookkeeping). Also the
/// wire shape a word pool arrives in from JS (`Deserialize`) for `VocabularyMode`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChallengeSeed {
    pub stimulus: Stimulus,
    pub answer_keys: Vec<String>,
    pub answer_glyphs: Vec<String>,
    pub identity: String,
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
    // Every field here must match `DEFAULT_GAME_CONFIG` in
    // packages/ui/honeycomb/src/lib/hangul/wasm-game-bridge/index.ts field
    // for field. There is no automated single-sourcing across the Rust/TS
    // boundary (see the module comment on `correctness_threshold_ms` below
    // for why), so `default_matches_typescript_bridge_defaults` in this
    // file's test module, and the mirroring test in that TS file, are the
    // only things that catch the two copies drifting apart (Prop. 2.3).
    fn default() -> Self {
        Self {
            min_time_window_ms: 1000,
            max_time_window_ms: 3000,
            // Reconciled to 1500 (was 600, silently unreachable in
            // production - see Prop. 2.3): `loadHangulWasm` always merges a
            // fully-populated DEFAULT_GAME_CONFIG before constructing
            // HangulGameCore, so 1500 is the value every real game session
            // has actually run at. Deliberately matching that lived
            // behavior, rather than the unreached 600, so fixing the
            // duplication doesn't also silently tighten the "high quality
            // match" window underneath existing players.
            correctness_threshold_ms: 1500,
            speed_increase_every_n_correct: 2,
            time_window_step_ms: 150,
            hide_romanization_streak: 5,
            points_per_correct: 10,
            points_per_miss: -5,
            streak_bonus_divisor: 5,
            buffer_timeout_ms: 400,
            game_duration_ms: 180_000,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Cross-language tripwire for Prop. 2.3: the Rust and TypeScript
    /// defaults have no shared source, so this test pins every field to the
    /// literal values `DEFAULT_GAME_CONFIG`
    /// (packages/ui/honeycomb/src/lib/hangul/wasm-game-bridge/index.ts) also
    /// asserts against itself. Changing either default without updating both
    /// tests leaves this one failing.
    #[test]
    fn default_matches_typescript_bridge_defaults() {
        let config = GameConfig::default();

        assert_eq!(config.min_time_window_ms, 1000);
        assert_eq!(config.max_time_window_ms, 3000);
        assert_eq!(config.correctness_threshold_ms, 1500);
        assert_eq!(config.speed_increase_every_n_correct, 2);
        assert_eq!(config.time_window_step_ms, 150);
        assert_eq!(config.hide_romanization_streak, 5);
        assert_eq!(config.points_per_correct, 10);
        assert_eq!(config.points_per_miss, -5);
        assert_eq!(config.streak_bonus_divisor, 5);
        assert_eq!(config.game_duration_ms, 180_000);
        assert_eq!(config.buffer_timeout_ms, 400);
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
    pub const fn new() -> Self {
        Self {
            score: 0,
            current_streak: 0,
            best_streak: 0,
            total_correct: 0,
            total_missed: 0,
        }
    }
}

/// Result of spawning a new character. `cell_id`/`hangul`/`expected_key` are the pre-#421 fields,
/// kept exactly as-is (first cell / full display text / first token's key) for back-compat with
/// single-jamo consumers; `cell_ids`/`stimulus`/`answer_keys`/`answer_glyphs` are the ADR 0001/0003
/// widening (canon Rem. 8.1: additive only, nothing removed).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnResult {
    pub cell_id: String,
    pub cell_ids: Vec<String>,
    pub hangul: String,
    pub expected_key: String,
    pub stimulus: Stimulus,
    pub answer_keys: Vec<String>,
    pub answer_glyphs: Vec<String>,
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
