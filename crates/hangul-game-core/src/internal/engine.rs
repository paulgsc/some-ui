use super::difficulty;
use super::spawning;
use super::{create_game_mode, GameMode};
use super::{ActiveReveal, GameConfig, GameStats, KeyBufferEntry, SpawnResult};
use super::{DifficultyChangeReason, PrimaryEvent, SecondaryEvent, UiHintEvent};
use super::{EventBatch, GameStatus, TimingParams};

/// The pure Rust game engine - no WASM dependencies
pub struct GameEngine {
    config: GameConfig,
    active_reveals: Vec<ActiveReveal>,
    /// Cells holding a completed character. These persist on the board and are
    /// never reused for new spawns until the game is reset.
    completed_cells: Vec<String>,
    stats: GameStats,
    key_buffer: Vec<KeyBufferEntry>,
    buffer_timeout_ms: u64,
    current_lifetime_ms: u32,
    // TODO: No dynamic dispatch in my code.
    game_mode: Box<dyn GameMode>,
    game_timer_start_ms: u64,
    game_duration_ms: u64,
}

impl GameEngine {
    pub fn new(config: GameConfig, mode: String) -> Self {
        let game_mode = create_game_mode(&mode);
        let buffer_timeout_ms = config.buffer_timeout_ms;
        let game_duration_ms = config.game_duration_ms;

        Self {
            current_lifetime_ms: config.max_time_window_ms,
            config,
            active_reveals: Vec::new(),
            completed_cells: Vec::new(),
            stats: GameStats::new(),
            key_buffer: Vec::new(),
            buffer_timeout_ms,
            game_mode,
            game_timer_start_ms: 0,
            game_duration_ms,
        }
    }

    pub fn start_timer(&mut self, current_time_ms: u64) {
        self.game_timer_start_ms = current_time_ms;
        self.game_mode.initialize(&self.config);
    }

    /// Process input with ambiguity resolution
    pub fn process_input(&mut self, key: String, now: u64) -> EventBatch {
        let mut batch = EventBatch::new();

        // Clean stale buffer entries
        self.key_buffer.retain(|entry| now.saturating_sub(entry.timestamp_ms) < self.buffer_timeout_ms);

        // Add new key
        if let Some(key_char) = key.chars().next() {
            self.key_buffer.push(KeyBufferEntry { key: key_char, timestamp_ms: now });
        }

        let buffer_str: String = self.key_buffer.iter().map(|e| e.key).collect();

        // Find candidates
        let exact_matches: Vec<usize> = self
            .active_reveals
            .iter()
            .enumerate()
            .filter(|(_, r)| r.expected_key == buffer_str)
            .map(|(i, _)| i)
            .collect();

        let potential_extensions = self
            .active_reveals
            .iter()
            .any(|r| r.expected_key.starts_with(&buffer_str) && r.expected_key.len() > buffer_str.len());

        // Resolve intent
        if !exact_matches.is_empty() {
            if potential_extensions {
                // AMBIGUOUS: exact match exists but also potential extensions
                let potentials: Vec<String> = self
                    .active_reveals
                    .iter()
                    .filter(|r| r.expected_key.starts_with(&buffer_str))
                    .map(|r| r.hangul.clone())
                    .collect();

                batch.add_ui_hint(UiHintEvent::AmbiguousInput {
                    current_buffer: buffer_str,
                    potential_matches: potentials,
                });
            } else {
                // CLEAR MATCH: Only one possibility
                let idx = self.find_best_match_index(&exact_matches);
                let reveal = self.active_reveals.swap_remove(idx);
                self.handle_match(reveal, now, &mut batch);
                self.key_buffer.clear();
            }
        } else if potential_extensions {
            // PARTIAL MATCH: Valid prefix
            batch.add_ui_hint(UiHintEvent::BufferUpdated { current_buffer: buffer_str });
        } else {
            // INVALID: No match, no prefix
            self.handle_miss(&mut batch);
            self.key_buffer.clear();
        }

        batch
    }

    /// Check for expired characters
    pub fn tick(&mut self, now: u64) -> EventBatch {
        let mut batch = EventBatch::new();
        let mut expired_cells = Vec::new();
        let mut expired_hanguls = Vec::new();

        self.active_reveals.retain(|reveal| {
            let age = now.saturating_sub(reveal.revealed_at_ms);
            let is_expired = age > self.current_lifetime_ms as u64;

            if is_expired {
                expired_cells.push(reveal.cell_id.clone());
                expired_hanguls.push(reveal.hangul.clone());
                self.game_mode.on_miss(&reveal.hangul);
            }

            !is_expired
        });

        let count = expired_cells.len();
        if count > 0 {
            self.stats.total_missed += count;
            self.stats.current_streak = 0;

            // Apply penalty
            let penalty = self.config.points_per_miss * count as i32;
            self.stats.score = (self.stats.score + penalty).max(0);

            // Primary event
            batch.primary = Some(PrimaryEvent::CharactersExpired {
                cell_ids: expired_cells,
                hanguls: expired_hanguls,
                count,
            });

            // Secondary: Stats update
            batch.add_secondary(SecondaryEvent::StatsUpdated { stats: self.stats.clone() });

            // Slow down for each expiration
            for _ in 0..count {
                self.adjust_difficulty_slower(DifficultyChangeReason::CharacterExpired, &mut batch);
            }
        }

        batch
    }

    /// Spawn a new character
    pub fn spawn_character(&mut self, now: u64, available_cell_ids: Vec<String>) -> EventBatch {
        let mut batch = EventBatch::new();

        // Get next character from game mode
        let hangul = match self.game_mode.get_next_character() {
            Some(ch) => ch,
            None => return batch, // No more characters
        };

        let expected_key = spawning::hangul_to_qwerty(&hangul);

        // Find available cell (exclude both active reveals and persisted completed cells)
        let available: Vec<String> = available_cell_ids
            .into_iter()
            .filter(|id| !self.active_reveals.iter().any(|r| &r.cell_id == id) && !self.completed_cells.contains(id))
            .collect();

        if available.is_empty() {
            batch.primary = Some(PrimaryEvent::BoardFull);
            return batch;
        }

        // Pick random cell
        use rand::seq::SliceRandom;
        if let Some(cell_id) = available.choose(&mut rand::thread_rng()).cloned() {
            let spawn_result = SpawnResult {
                cell_id: cell_id.clone(),
                hangul: hangul.clone(),
                expected_key: expected_key.clone(),
                revealed_at_ms: now,
                play_spawn_sound: true,
            };

            self.active_reveals.push(ActiveReveal {
                hangul,
                expected_key,
                revealed_at_ms: now,
                cell_id,
            });

            batch.primary = Some(PrimaryEvent::CharacterSpawned { spawn_result });
        }

        batch
    }

    /// Get game status
    pub fn get_status(&self, now: u64) -> GameStatus {
        let is_complete = self.game_mode.is_complete();

        let elapsed_ms = if self.game_timer_start_ms > 0 {
            now.saturating_sub(self.game_timer_start_ms)
        } else {
            0
        };

        let is_timed_out = if self.game_duration_ms > 0 { elapsed_ms >= self.game_duration_ms } else { false };

        let time_remaining_ms = if self.game_duration_ms > 0 {
            self.game_duration_ms.saturating_sub(elapsed_ms)
        } else {
            0
        };

        GameStatus {
            is_complete,
            is_timed_out,
            time_remaining_ms,
            progress: self.game_mode.get_progress(),
        }
    }

    /// Get timing parameters
    pub fn get_timing_params(&self) -> TimingParams {
        TimingParams {
            spawn_interval_ms: self.calculate_spawn_interval(),
            character_lifetime_ms: self.current_lifetime_ms,
            show_romanization: self.stats.current_streak < self.config.hide_romanization_streak,
        }
    }

    /// Get current stats
    pub fn get_stats(&self) -> GameStats {
        self.stats.clone()
    }

    /// Get active count
    pub fn get_active_count(&self) -> usize {
        self.active_reveals.len()
    }

    /// Reset game
    pub fn reset(&mut self) {
        self.active_reveals.clear();
        self.completed_cells.clear();
        self.current_lifetime_ms = self.config.max_time_window_ms;
        self.stats = GameStats::new();
        self.key_buffer.clear();
        self.game_mode.reset();
        self.game_timer_start_ms = 0;
    }

    // --- Private Helper Methods ---
    fn handle_match(&mut self, reveal: ActiveReveal, now: u64, batch: &mut EventBatch) {
        let time_gap = now.saturating_sub(reveal.revealed_at_ms);
        let is_high_quality = time_gap <= self.config.correctness_threshold_ms as u64;

        let show_romanization = self.stats.current_streak < self.config.hide_romanization_streak;

        // Update stats
        let prev_streak = self.stats.current_streak;
        self.stats.total_correct += 1;
        self.stats.current_streak += 1;
        self.stats.best_streak = self.stats.best_streak.max(self.stats.current_streak);

        // Calculate points
        let streak_bonus = (self.stats.current_streak / self.config.streak_bonus_divisor) as i32;
        let points = self.config.points_per_correct + streak_bonus;
        self.stats.score += points;

        // Check game mode completion
        let counts_toward_completion = self.game_mode.on_match(&reveal.hangul, is_high_quality, show_romanization);

        // When a character is completed it locks into its cell: reserve the cell
        // so no future character spawns on top of the persisted glyph.
        if counts_toward_completion {
            self.completed_cells.push(reveal.cell_id.clone());
        }

        // Primary event
        batch.primary = Some(PrimaryEvent::MatchFound {
            cell_id: reveal.cell_id,
            hangul: reveal.hangul,
            points,
            is_high_quality,
            time_gap_ms: time_gap as u32,
            counts_toward_completion,
        });

        // Secondary: Stats update
        batch.add_secondary(SecondaryEvent::StatsUpdated { stats: self.stats.clone() });

        // Secondary: Streak milestone
        if self.stats.current_streak > 0 && self.stats.current_streak % 5 == 0 && self.stats.current_streak != prev_streak {
            batch.add_secondary(SecondaryEvent::StreakMilestone {
                streak: self.stats.current_streak,
            });
        }

        // Secondary: Difficulty adjustment on perfect match
        if is_high_quality {
            self.adjust_difficulty_faster(batch);
        }
    }

    fn handle_miss(&mut self, batch: &mut EventBatch) {
        self.stats.current_streak = 0;

        // Primary event
        batch.primary = Some(PrimaryEvent::InputMissed);

        // Secondary: Stats update
        batch.add_secondary(SecondaryEvent::StatsUpdated { stats: self.stats.clone() });

        // Secondary: Difficulty adjustment
        self.adjust_difficulty_slower(DifficultyChangeReason::InputMiss, batch);
    }

    fn adjust_difficulty_faster(&mut self, batch: &mut EventBatch) {
        if self.stats.current_streak % self.config.speed_increase_every_n_correct == 0 {
            let old_lifetime = self.current_lifetime_ms;
            self.current_lifetime_ms = self.current_lifetime_ms.saturating_sub(self.config.time_window_step_ms).max(self.config.min_time_window_ms);

            if old_lifetime != self.current_lifetime_ms {
                batch.add_secondary(SecondaryEvent::DifficultyChanged {
                    new_lifetime_ms: self.current_lifetime_ms,
                    new_interval_ms: self.calculate_spawn_interval(),
                    reason: DifficultyChangeReason::PerfectMatch,
                });
            }
        }
    }

    fn adjust_difficulty_slower(&mut self, reason: DifficultyChangeReason, batch: &mut EventBatch) {
        let old_lifetime = self.current_lifetime_ms;
        self.current_lifetime_ms = (self.current_lifetime_ms + self.config.time_window_step_ms).min(self.config.max_time_window_ms);

        if old_lifetime != self.current_lifetime_ms {
            batch.add_secondary(SecondaryEvent::DifficultyChanged {
                new_lifetime_ms: self.current_lifetime_ms,
                new_interval_ms: self.calculate_spawn_interval(),
                reason,
            });
        }
    }

    fn calculate_spawn_interval(&self) -> u32 {
        difficulty::calculate_spawn_interval(self.current_lifetime_ms, &self.config)
    }

    /// Pick the best match when multiple exact matches exist
    /// Priority: oldest reveal (closest to expiring)
    fn find_best_match_index(&self, exact_matches: &[usize]) -> usize {
        if exact_matches.len() == 1 {
            return exact_matches[0];
        }

        // Pick the oldest (closest to expiring)
        *exact_matches.iter().min_by_key(|&&idx| self.active_reveals[idx].revealed_at_ms).unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn engine_with_config(config: GameConfig, mode: &str) -> GameEngine {
        GameEngine::new(config, mode.to_string())
    }

    fn engine_with(mode: &str) -> GameEngine {
        engine_with_config(GameConfig::default(), mode)
    }

    fn push_reveal(engine: &mut GameEngine, cell_id: &str, hangul: &str, expected_key: &str, revealed_at_ms: u64) {
        engine.active_reveals.push(ActiveReveal {
            hangul: hangul.to_string(),
            expected_key: expected_key.to_string(),
            revealed_at_ms,
            cell_id: cell_id.to_string(),
        });
    }

    #[test]
    fn process_input_exact_match_removes_reveal_and_emits_match_found() {
        let mut engine = engine_with("endless");
        push_reveal(&mut engine, "cell-1", "ㄱ", "r", 1000);

        let batch = engine.process_input("r".to_string(), 1200);

        match batch.primary {
            Some(PrimaryEvent::MatchFound { cell_id, hangul, .. }) => {
                assert_eq!(cell_id, "cell-1");
                assert_eq!(hangul, "ㄱ");
            }
            other => panic!("expected MatchFound, got {other:?}"),
        }
        assert_eq!(engine.get_active_count(), 0);
    }

    #[test]
    fn process_input_ambiguous_when_exact_and_extension_both_exist() {
        let mut engine = engine_with("endless");
        push_reveal(&mut engine, "cell-h", "ㅗ", "h", 1000);
        push_reveal(&mut engine, "cell-hk", "ㅘ", "hk", 1000);

        let batch = engine.process_input("h".to_string(), 1100);

        match batch.ui_hints.as_slice() {
            [UiHintEvent::AmbiguousInput {
                current_buffer,
                potential_matches,
            }] => {
                assert_eq!(current_buffer, "h");
                assert_eq!(potential_matches.len(), 2);
            }
            other => panic!("expected a single AmbiguousInput hint, got {other:?}"),
        }
        assert!(batch.primary.is_none());
        // Ambiguous input doesn't consume any reveal - both stay active.
        assert_eq!(engine.get_active_count(), 2);
    }

    #[test]
    fn process_input_prefix_only_emits_buffer_updated() {
        let mut engine = engine_with("endless");
        push_reveal(&mut engine, "cell-hk", "ㅘ", "hk", 1000);

        let batch = engine.process_input("h".to_string(), 1100);

        match batch.ui_hints.as_slice() {
            [UiHintEvent::BufferUpdated { current_buffer }] => assert_eq!(current_buffer, "h"),
            other => panic!("expected a single BufferUpdated hint, got {other:?}"),
        }
        assert_eq!(engine.get_active_count(), 1);
    }

    #[test]
    fn process_input_miss_when_no_match_or_prefix() {
        let mut engine = engine_with("endless");
        push_reveal(&mut engine, "cell-1", "ㄱ", "r", 1000);

        let batch = engine.process_input("z".to_string(), 1100);

        assert!(matches!(batch.primary, Some(PrimaryEvent::InputMissed)));
        assert_eq!(engine.get_stats().current_streak, 0);
    }

    #[test]
    fn tick_expires_stale_reveals_and_applies_miss_penalty() {
        let mut engine = engine_with("endless");
        push_reveal(&mut engine, "cell-1", "ㄱ", "r", 0);

        // current_lifetime_ms starts at the default max_time_window_ms (3000).
        let batch = engine.tick(3001);

        match batch.primary {
            Some(PrimaryEvent::CharactersExpired { count, .. }) => assert_eq!(count, 1),
            other => panic!("expected CharactersExpired, got {other:?}"),
        }
        assert_eq!(engine.get_active_count(), 0);
        assert_eq!(engine.get_stats().total_missed, 1);
        // points_per_miss is negative; score is clamped at zero, not negative.
        assert_eq!(engine.get_stats().score, 0);
    }

    #[test]
    fn tick_resets_streak_built_up_by_prior_matches() {
        let mut engine = engine_with("endless");
        push_reveal(&mut engine, "cell-1", "ㄱ", "r", 1000);
        engine.process_input("r".to_string(), 1000);
        assert_eq!(engine.get_stats().current_streak, 1);

        push_reveal(&mut engine, "cell-2", "ㄴ", "s", 0);
        engine.tick(3001);

        assert_eq!(engine.get_stats().current_streak, 0);
    }

    #[test]
    fn handle_match_awards_streak_bonus_every_divisor() {
        let mut engine = engine_with("endless");

        for i in 0..5 {
            push_reveal(&mut engine, &format!("cell-{i}"), "ㄱ", "r", 0);
            engine.process_input("r".to_string(), 100);
        }

        // streak 1-4: bonus 0, 10 pts each. streak 5: bonus 5/5=1, 11 pts.
        assert_eq!(engine.get_stats().current_streak, 5);
        assert_eq!(engine.get_stats().score, 51);
    }

    #[test]
    fn handle_match_emits_streak_milestone_every_five() {
        let mut engine = engine_with("endless");

        for i in 0..4 {
            push_reveal(&mut engine, &format!("cell-{i}"), "ㄱ", "r", 0);
            let batch = engine.process_input("r".to_string(), 100);
            assert!(!batch.secondary.iter().any(|e| matches!(e, SecondaryEvent::StreakMilestone { .. })));
        }

        push_reveal(&mut engine, "cell-4", "ㄱ", "r", 0);
        let batch = engine.process_input("r".to_string(), 100);

        assert!(batch.secondary.iter().any(|e| matches!(e, SecondaryEvent::StreakMilestone { streak } if *streak == 5)));
    }

    #[test]
    fn adjust_difficulty_faster_speeds_up_and_clamps_at_min() {
        let config = GameConfig {
            min_time_window_ms: 1000,
            max_time_window_ms: 1100,
            time_window_step_ms: 150,
            speed_increase_every_n_correct: 1,
            ..GameConfig::default()
        };
        let mut engine = engine_with_config(config, "endless");

        push_reveal(&mut engine, "cell-1", "ㄱ", "r", 0);
        engine.process_input("r".to_string(), 100);
        // 1100 - 150 = 950, clamped up to the 1000 floor.
        assert_eq!(engine.get_timing_params().character_lifetime_ms, 1000);

        push_reveal(&mut engine, "cell-2", "ㄴ", "s", 0);
        let batch = engine.process_input("s".to_string(), 100);
        // Already at the floor: no further decrease, no spurious event.
        assert_eq!(engine.get_timing_params().character_lifetime_ms, 1000);
        assert!(!batch.secondary.iter().any(|e| matches!(e, SecondaryEvent::DifficultyChanged { .. })));
    }

    #[test]
    fn adjust_difficulty_slower_on_miss_clamps_at_max() {
        let config = GameConfig {
            min_time_window_ms: 1000,
            max_time_window_ms: 1100,
            time_window_step_ms: 150,
            ..GameConfig::default()
        };
        let mut engine = engine_with_config(config, "endless");

        let batch = engine.process_input("z".to_string(), 100);

        assert!(matches!(batch.primary, Some(PrimaryEvent::InputMissed)));
        // Already at the ceiling (1100): +150 clamps back down to 1100.
        assert_eq!(engine.get_timing_params().character_lifetime_ms, 1100);
        assert!(!batch.secondary.iter().any(|e| matches!(e, SecondaryEvent::DifficultyChanged { .. })));
    }

    #[test]
    fn find_best_match_picks_oldest_reveal_on_tie() {
        let mut engine = engine_with("endless");
        push_reveal(&mut engine, "cell-new", "ㄱ", "r", 2000);
        push_reveal(&mut engine, "cell-old", "ㄱ", "r", 1000);

        let batch = engine.process_input("r".to_string(), 2500);

        match batch.primary {
            Some(PrimaryEvent::MatchFound { cell_id, .. }) => assert_eq!(cell_id, "cell-old"),
            other => panic!("expected MatchFound, got {other:?}"),
        }
    }

    #[test]
    fn spawn_character_reports_board_full_when_no_cells_available() {
        let mut engine = engine_with("completion");
        push_reveal(&mut engine, "cell-1", "ㄱ", "r", 0);

        let batch = engine.spawn_character(0, vec!["cell-1".to_string()]);

        assert!(matches!(batch.primary, Some(PrimaryEvent::BoardFull)));
    }

    #[test]
    fn reset_clears_reveals_stats_and_difficulty() {
        let mut engine = engine_with("completion");
        push_reveal(&mut engine, "cell-1", "ㄱ", "r", 0);
        engine.process_input("r".to_string(), 0);

        engine.reset();

        assert_eq!(engine.get_active_count(), 0);
        assert_eq!(engine.get_stats().score, 0);
        assert_eq!(engine.get_timing_params().character_lifetime_ms, GameConfig::default().max_time_window_ms);
    }
}
