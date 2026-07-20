use std::marker::PhantomData;

use super::{
    content_domain::ContentDomain, create_game_mode, difficulty, ActiveReveal, DifficultyChangeReason, EventBatch, GameConfig, GameMode, GameStats, GameStatus,
    KeyBufferEntry, PrimaryEvent, SecondaryEvent, SpawnResult, TimingParams, UiHintEvent,
};

/// A challenge's total expiry budget is clamped here regardless of how many tokens it carries, so a
/// pathologically long answer sequence can never park a board cell indefinitely (canon Cor. 7.2.1).
const MAX_CHALLENGE_BUDGET_MS: u64 = 15_000;

/// The pure Rust game engine - no WASM dependencies. Generic over a content domain `D` (canon Def.
/// 11.1): every content-specific decision (which alphabet, which key a token maps to) is delegated
/// to `D` rather than hard-coded here.
pub struct GameEngine<D: ContentDomain> {
    config: GameConfig,
    active_reveals: Vec<ActiveReveal>,
    /// Cells holding a completed character. These persist on the board and are
    /// never reused for new spawns until the game is reset.
    completed_cells: Vec<String>,
    stats: GameStats,
    key_buffer: Vec<KeyBufferEntry>,
    buffer_timeout_ms: u64,
    /// The per-*token* time budget (canon Thm. 7.2, Cor. 7.2.1): a challenge's actual expiry is
    /// `revealed_at_ms + token_count * current_lifetime_ms`. This field's stored representation
    /// and default value are unchanged from before per-token normalization - at `token_count == 1`
    /// the formula is identical to treating it as a whole-challenge lifetime.
    current_lifetime_ms: u32,
    /// Tokens matched consecutively since the last miss/expiry or speed-up step (canon Thm.
    /// 7.2(b)): drives `adjust_difficulty_faster`'s trigger instead of counting challenges
    /// completed.
    streak_tokens: usize,
    // TODO: No dynamic dispatch in my code.
    game_mode: Box<dyn GameMode>,
    game_timer_start_ms: u64,
    game_duration_ms: u64,
    _domain: PhantomData<D>,
}

impl<D: ContentDomain> GameEngine<D> {
    pub fn new(config: GameConfig, mode: String) -> Self {
        let game_mode = create_game_mode::<D>(&mode);
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
            streak_tokens: 0,
            game_mode,
            game_timer_start_ms: 0,
            game_duration_ms,
            _domain: PhantomData,
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
        let mut expired_tokens = 0usize;

        self.active_reveals.retain(|reveal| {
            let age = now.saturating_sub(reveal.revealed_at_ms);
            let budget = (reveal.token_count as u64 * self.current_lifetime_ms as u64).min(MAX_CHALLENGE_BUDGET_MS);
            let is_expired = age > budget;

            if is_expired {
                expired_cells.push(reveal.cell_id.clone());
                expired_hanguls.push(reveal.hangul.clone());
                expired_tokens += reveal.token_count;
                self.game_mode.on_miss(&reveal.hangul);
            }

            !is_expired
        });

        let count = expired_cells.len();
        if count > 0 {
            self.stats.total_missed += count;
            self.stats.current_streak = 0;
            self.streak_tokens = 0;

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

            // Slow down once per expired token (canon Thm. 7.2(b)): at token_count == 1 this is exactly once
            // per expired challenge, unchanged.
            for _ in 0..expired_tokens {
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

        let expected_key = D::key_for(&hangul);

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
                // A content domain's spawn is a single token today; multi-token challenges
                // arrive only via ADR 0001 #422's word-answer matching, not yet landed.
                token_count: 1,
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
        self.streak_tokens = 0;
        self.game_mode.reset();
        self.game_timer_start_ms = 0;
    }

    // --- Private Helper Methods ---
    fn handle_match(&mut self, reveal: ActiveReveal, now: u64, batch: &mut EventBatch) {
        let time_gap = now.saturating_sub(reveal.revealed_at_ms);
        let is_high_quality = time_gap <= self.config.correctness_threshold_ms as u64;
        let token_count = reveal.token_count;

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
            self.adjust_difficulty_faster(token_count, batch);
        }
    }

    fn handle_miss(&mut self, batch: &mut EventBatch) {
        self.stats.current_streak = 0;
        self.streak_tokens = 0;

        // Primary event
        batch.primary = Some(PrimaryEvent::InputMissed);

        // Secondary: Stats update
        batch.add_secondary(SecondaryEvent::StatsUpdated { stats: self.stats.clone() });

        // Secondary: Difficulty adjustment
        self.adjust_difficulty_slower(DifficultyChangeReason::InputMiss, batch);
    }

    /// Steps the difficulty up once for every multiple of `speed_increase_every_n_correct` that
    /// `tokens_matched` crosses (canon Thm. 7.2(b)): a single multi-token match can therefore
    /// trigger more than one step, exactly as that many single-token matches would have. At
    /// `tokens_matched == 1` on every call (today's only production case), this reduces to the
    /// original "one step every Nth correct match" trigger.
    fn adjust_difficulty_faster(&mut self, tokens_matched: usize, batch: &mut EventBatch) {
        let step_every = self.config.speed_increase_every_n_correct;
        let old_level = self.streak_tokens / step_every;
        self.streak_tokens += tokens_matched;
        let new_level = self.streak_tokens / step_every;

        for _ in old_level..new_level {
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
    use crate::internal::content_domain::Korean;

    fn engine_with_config(config: GameConfig, mode: &str) -> GameEngine<Korean> {
        GameEngine::new(config, mode.to_string())
    }

    fn engine_with(mode: &str) -> GameEngine<Korean> {
        engine_with_config(GameConfig::default(), mode)
    }

    fn push_reveal(engine: &mut GameEngine<Korean>, cell_id: &str, hangul: &str, expected_key: &str, revealed_at_ms: u64) {
        push_reveal_with_tokens(engine, cell_id, hangul, expected_key, revealed_at_ms, 1);
    }

    fn push_reveal_with_tokens(engine: &mut GameEngine<Korean>, cell_id: &str, hangul: &str, expected_key: &str, revealed_at_ms: u64, token_count: usize) {
        engine.active_reveals.push(ActiveReveal {
            hangul: hangul.to_string(),
            expected_key: expected_key.to_string(),
            revealed_at_ms,
            cell_id: cell_id.to_string(),
            token_count,
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

    #[test]
    fn spawn_character_derives_expected_key_from_the_content_domain() {
        // Regression coverage for #715: the expected key is no longer read
        // off a hard-coded free function, but single-jamo Korean play must
        // still resolve to exactly the same key Korean::key_for produces.
        let mut engine = engine_with("completion");

        let batch = engine.spawn_character(0, vec!["cell-1".to_string()]);

        match batch.primary {
            Some(PrimaryEvent::CharacterSpawned { spawn_result }) => {
                assert_eq!(spawn_result.expected_key, Korean::key_for(&spawn_result.hangul));
                assert!(!spawn_result.expected_key.is_empty());
            }
            other => panic!("expected CharacterSpawned, got {other:?}"),
        }
    }

    #[test]
    fn tick_scales_expiry_budget_linearly_with_token_count() {
        // canon Thm. 7.2(a): total budget is token_count * current_lifetime_ms.
        // max_time_window_ms defaults to 3000, so a 4-token challenge's
        // budget is 12,000ms.
        let mut engine = engine_with_config(GameConfig::default(), "endless");
        push_reveal_with_tokens(&mut engine, "cell-word", "ㄱ", "r", 0, 4);

        let still_alive = engine.tick(11_999);
        assert!(still_alive.primary.is_none(), "must not expire before its scaled budget elapses");
        assert_eq!(engine.get_active_count(), 1);

        let now_expired = engine.tick(12_001);
        match now_expired.primary {
            Some(PrimaryEvent::CharactersExpired { count, .. }) => assert_eq!(count, 1),
            other => panic!("expected CharactersExpired, got {other:?}"),
        }
    }

    #[test]
    fn tick_leaves_single_token_timing_unchanged() {
        // token_count == 1 must reduce to exactly today's whole-challenge
        // lifetime: budget == current_lifetime_ms, not current_lifetime_ms * 1
        // computed some other way that could round differently.
        let mut engine = engine_with_config(GameConfig::default(), "endless");
        push_reveal(&mut engine, "cell-1", "ㄱ", "r", 0);

        assert!(engine.tick(3000).primary.is_none());
        match engine.tick(3001).primary {
            Some(PrimaryEvent::CharactersExpired { count, .. }) => assert_eq!(count, 1),
            other => panic!("expected CharactersExpired, got {other:?}"),
        }
    }

    #[test]
    fn tick_clamps_expiry_budget_at_the_configured_ceiling() {
        // canon Cor. 7.2.1: a pathologically long answer cannot park a cell
        // indefinitely. 100 tokens * 3000ms would be 300,000ms uncapped.
        let mut before_ceiling = engine_with_config(GameConfig::default(), "endless");
        push_reveal_with_tokens(&mut before_ceiling, "cell-huge", "ㄱ", "r", 0, 100);
        assert!(
            before_ceiling.tick(MAX_CHALLENGE_BUDGET_MS).primary.is_none(),
            "must not expire before reaching the ceiling"
        );

        let mut after_ceiling = engine_with_config(GameConfig::default(), "endless");
        push_reveal_with_tokens(&mut after_ceiling, "cell-huge", "ㄱ", "r", 0, 100);
        match after_ceiling.tick(MAX_CHALLENGE_BUDGET_MS + 1).primary {
            Some(PrimaryEvent::CharactersExpired { count, .. }) => assert_eq!(count, 1),
            other => panic!("expected the pathologically long challenge to expire at the ceiling, got {other:?}"),
        }
    }

    #[test]
    fn adjust_difficulty_faster_triggers_once_per_multiple_of_tokens_matched() {
        // canon Thm. 7.2(b): stepping counts tokens, not challenges. A
        // single challenge carrying 4 tokens at speed_increase_every_n_correct
        // = 4 must step exactly once, which a naive per-challenge counter
        // (needing 4 separate matches) could never do in one match.
        let config = GameConfig {
            min_time_window_ms: 1000,
            max_time_window_ms: 3000,
            time_window_step_ms: 150,
            speed_increase_every_n_correct: 4,
            ..GameConfig::default()
        };
        let mut engine = engine_with_config(config, "endless");
        push_reveal_with_tokens(&mut engine, "cell-word", "ㄱ", "r", 0, 4);

        let batch = engine.process_input("r".to_string(), 100);

        assert!(batch.secondary.iter().any(|e| matches!(e, SecondaryEvent::DifficultyChanged { .. })));
        assert_eq!(engine.get_timing_params().character_lifetime_ms, 2850);
    }

    #[test]
    fn adjust_difficulty_faster_does_not_trigger_below_the_token_threshold() {
        let config = GameConfig {
            speed_increase_every_n_correct: 4,
            ..GameConfig::default()
        };
        let mut engine = engine_with_config(config, "endless");
        push_reveal_with_tokens(&mut engine, "cell-word", "ㄱ", "r", 0, 3);

        let batch = engine.process_input("r".to_string(), 100);

        assert!(!batch.secondary.iter().any(|e| matches!(e, SecondaryEvent::DifficultyChanged { .. })));
    }
}
