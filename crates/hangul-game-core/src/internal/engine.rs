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
            current_lifetime_ms: config.time_window_step_ms,
            config,
            active_reveals: Vec::new(),
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

        // Find available cell
        let available: Vec<String> = available_cell_ids.into_iter().filter(|id| !self.active_reveals.iter().any(|r| &r.cell_id == id)).collect();

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
