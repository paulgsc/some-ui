use std::marker::PhantomData;

use super::{
    content_domain::ContentDomain, create_game_mode, difficulty, ActiveChallenge, ChallengeSeed, DifficultyChangeReason, EventBatch, GameConfig, GameMode, GameStats,
    GameStatus, KeyBufferEntry, PrimaryEvent, SecondaryEvent, SpawnResult, TimingParams, UiHintEvent,
};

/// A challenge's total expiry budget is clamped here regardless of how many tokens it carries, so a
/// pathologically long answer sequence can never park a board cell indefinitely (canon Cor. 7.2.1).
const MAX_CHALLENGE_BUDGET_MS: u64 = 15_000;

/// `advance_or_complete`'s two possible outcomes (canon Axiom 12.1, ADR 0004 #751): the caller
/// switches on this instead of handing down a live `&mut EventBatch` for the helper to populate.
enum AdvanceOutcome {
    /// The challenge's cursor advanced but did not complete it.
    Progressed(UiHintEvent),
    /// This was the challenge's last token; it is now removed from `active_reveals`.
    Completed(PrimaryEvent, Vec<SecondaryEvent>),
}

/// The part of `handle_match`'s work that is a pure function of prior stats, config, and elapsed
/// time alone (canon Axiom 12.1, ADR 0004 #752) - everything except the stateful `GameMode::on_match`
/// mastery check, which `handle_match` still performs itself as the one genuine mutation this
/// calculation cannot make on the caller's behalf.
struct MatchCalc {
    is_high_quality: bool,
    points: i32,
    time_gap_ms: u32,
    /// `Some(streak)` exactly on the tick a multiple-of-5 streak is first reached.
    streak_milestone: Option<usize>,
}

fn compute_match_outcome(stats: &GameStats, config: &GameConfig, revealed_at_ms: u64, now: u64) -> (GameStats, MatchCalc) {
    let time_gap = now.saturating_sub(revealed_at_ms);
    let is_high_quality = time_gap <= config.correctness_threshold_ms as u64;
    let prev_streak = stats.current_streak;

    let mut new_stats = stats.clone();
    new_stats.total_correct += 1;
    new_stats.current_streak += 1;
    new_stats.best_streak = new_stats.best_streak.max(new_stats.current_streak);

    let streak_bonus = (new_stats.current_streak / config.streak_bonus_divisor) as i32;
    let points = config.points_per_correct + streak_bonus;
    new_stats.score += points;

    let streak_milestone = if new_stats.current_streak > 0 && new_stats.current_streak % 5 == 0 && new_stats.current_streak != prev_streak {
        Some(new_stats.current_streak)
    } else {
        None
    };

    (
        new_stats,
        MatchCalc {
            is_high_quality,
            points,
            time_gap_ms: time_gap as u32,
            streak_milestone,
        },
    )
}

/// The pure Rust game engine - no WASM dependencies. Generic over a content domain `D` (canon Def.
/// 11.1): every content-specific decision (which alphabet, which key a token maps to) is delegated
/// to `D` rather than hard-coded here.
pub struct GameEngine<D: ContentDomain> {
    config: GameConfig,
    active_reveals: Vec<ActiveChallenge>,
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
    pub fn new(config: GameConfig, mode: String, word_pool: Vec<ChallengeSeed>) -> Self {
        let game_mode = create_game_mode::<D>(&mode, word_pool);
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

    /// Process input with ambiguity resolution. Generalizes canon Def. 4.3's token-cursor matching:
    /// every occurrence of a reveal's single `expected_key` is replaced by its *current* token,
    /// `current_key()` (= `answer_keys[cursor]`). At `answer_keys.len() == 1` this is
    /// observationally identical to the pre-#421/#422 matcher (canon Thm. 4.1) - the only new
    /// reachable branch is an exact match that doesn't yet complete the challenge (§ below).
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
            .filter(|(_, r)| r.current_key() == buffer_str)
            .map(|(i, _)| i)
            .collect();

        let potential_extensions = self
            .active_reveals
            .iter()
            .any(|r| r.current_key().starts_with(&buffer_str) && r.current_key().len() > buffer_str.len());

        // Resolve intent
        if !exact_matches.is_empty() {
            if potential_extensions {
                // AMBIGUOUS: exact match exists but also potential extensions
                let potentials: Vec<String> = self
                    .active_reveals
                    .iter()
                    .filter(|r| r.current_key().starts_with(&buffer_str))
                    .map(|r| r.answer_glyphs[r.cursor].clone())
                    .collect();

                batch.add_ui_hint(UiHintEvent::AmbiguousInput {
                    current_buffer: buffer_str,
                    potential_matches: potentials,
                });
            } else {
                // CLEAR MATCH: Only one possibility
                let idx = self.find_best_match_index(&exact_matches);
                self.key_buffer.clear();
                match self.advance_or_complete(idx, now) {
                    AdvanceOutcome::Progressed(hint) => batch.add_ui_hint(hint),
                    AdvanceOutcome::Completed(primary, secondary) => {
                        batch.primary = Some(primary);
                        batch.secondary.extend(secondary);
                    }
                }
            }
        } else if potential_extensions {
            // PARTIAL MATCH: Valid prefix
            batch.add_ui_hint(UiHintEvent::BufferUpdated { current_buffer: buffer_str });
        } else {
            // INVALID: No match, no prefix
            let (primary, secondary) = self.handle_miss();
            batch.primary = Some(primary);
            batch.secondary.extend(secondary);
            self.key_buffer.clear();
        }

        batch
    }

    /// Clears the last entry of the *current token's* key buffer only (ADR 0003 §2(b)): the same
    /// timeout-gated buffer `process_input` maintains. Cannot un-advance a challenge's cursor past
    /// an already-matched token, cannot reopen an already-revealed cell, and never touches score,
    /// streak, or mastery state - it only pops the transient buffer every miss/match already clears.
    pub fn process_backspace(&mut self, now: u64) -> EventBatch {
        let mut batch = EventBatch::new();

        self.key_buffer.retain(|entry| now.saturating_sub(entry.timestamp_ms) < self.buffer_timeout_ms);
        self.key_buffer.pop();

        let buffer_str: String = self.key_buffer.iter().map(|e| e.key).collect();
        batch.add_ui_hint(UiHintEvent::BufferUpdated { current_buffer: buffer_str });

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
            let token_count = reveal.answer_keys.len() as u64;
            let budget = (token_count * self.current_lifetime_ms as u64).min(MAX_CHALLENGE_BUDGET_MS);
            let is_expired = age > budget;

            if is_expired {
                expired_cells.extend(reveal.cell_ids.iter().cloned());
                expired_hanguls.push(reveal.answer_glyphs.join(""));
                expired_tokens += reveal.answer_keys.len();
                self.game_mode.on_miss(&reveal.identity);
            }

            !is_expired
        });

        // count is the number of expired *challenges* (matches expired_hanguls, one entry per
        // challenge), not expired cells - a multi-cell word challenge contributes many entries to
        // expired_cells but is still exactly one miss for stats/scoring purposes.
        let count = expired_hanguls.len();
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
                if let Some(event) = self.adjust_difficulty_slower(DifficultyChangeReason::CharacterExpired) {
                    batch.add_secondary(event);
                }
            }
        }

        batch
    }

    /// Spawn a new challenge. Reserves `answer_keys.len()` cells at once (ADR 0003 §2(a),
    /// multi-cell binding): a single-token challenge (today's jamo play) reserves exactly one cell,
    /// unchanged in behavior; a multi-token word reserves all of them simultaneously, each a
    /// placeholder until its token is typed in order.
    pub fn spawn_character(&mut self, now: u64, available_cell_ids: Vec<String>) -> EventBatch {
        let mut batch = EventBatch::new();

        // Get next challenge from game mode
        let seed = match self.game_mode.get_next_challenge() {
            Some(seed) => seed,
            None => return batch, // No more challenges
        };
        let n = seed.answer_keys.len().max(1);

        // Find available cells (exclude both active reveals and persisted completed cells)
        let available: Vec<String> = available_cell_ids
            .into_iter()
            .filter(|id| !self.active_reveals.iter().any(|r| r.cell_ids.contains(id)) && !self.completed_cells.contains(id))
            .collect();

        if available.len() < n {
            batch.primary = Some(PrimaryEvent::BoardFull);
            return batch;
        }

        // Pick n random, distinct cells
        use rand::seq::SliceRandom;
        let cell_ids: Vec<String> = available.choose_multiple(&mut rand::thread_rng(), n).cloned().collect();

        let spawn_result = SpawnResult {
            cell_id: cell_ids[0].clone(),
            cell_ids: cell_ids.clone(),
            hangul: seed.answer_glyphs.join(""),
            expected_key: seed.answer_keys[0].clone(),
            stimulus: seed.stimulus.clone(),
            answer_keys: seed.answer_keys.clone(),
            answer_glyphs: seed.answer_glyphs.clone(),
            revealed_at_ms: now,
            play_spawn_sound: true,
        };

        self.active_reveals.push(ActiveChallenge {
            stimulus: seed.stimulus,
            answer_keys: seed.answer_keys,
            answer_glyphs: seed.answer_glyphs,
            cursor: 0,
            revealed_at_ms: now,
            cell_ids,
            identity: seed.identity,
        });

        batch.primary = Some(PrimaryEvent::CharacterSpawned { spawn_result });

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
        self.clear_session_state();
        self.game_mode.reset();
    }

    /// Switches to a different game mode (and word pool, for vocabulary modes) as a genuine,
    /// isolated state transition (canon Axiom 12.1, ADR 0004) rather than requiring a fresh
    /// `GameEngine`: mode/word_pool are lifecycle state a session can legitimately change at
    /// runtime, not fixed construction-time configuration the way `config` is. Clears
    /// board/stats/difficulty exactly like `reset()` - a new mode's challenges are not
    /// comparable to the old one's - then rebuilds `game_mode` via the same factory `new` uses.
    pub fn set_mode(&mut self, mode: String, word_pool: Vec<ChallengeSeed>) {
        self.clear_session_state();
        self.game_mode = create_game_mode::<D>(&mode, word_pool);
    }

    // --- Private Helper Methods ---

    /// The session-state clearing shared by `reset` and `set_mode` (canon Axiom 12.1): everything
    /// except the decision of what `game_mode` should be afterward, which the two callers make
    /// differently (keep and reset it in place, vs. replace it outright).
    fn clear_session_state(&mut self) {
        self.active_reveals.clear();
        self.completed_cells.clear();
        self.current_lifetime_ms = self.config.max_time_window_ms;
        self.stats = GameStats::new();
        self.key_buffer.clear();
        self.streak_tokens = 0;
        self.game_timer_start_ms = 0;
    }

    /// Advances a matched challenge's cursor (canon Def. 4.3): completes it (today's
    /// `handle_match`) if this was its last token, otherwise emits `AnswerProgress` and leaves it
    /// active. At `answer_keys.len() == 1` the only reachable branch is completion, on the same
    /// condition as before #422 (canon Thm. 4.1) - score/streak/difficulty are touched only here,
    /// never on an intermediate token match.
    ///
    /// Returns its outcome instead of taking `&mut EventBatch` (canon Axiom 12.1, ADR 0004 #751):
    /// `process_input` is the only function that owns a live `EventBatch` binding, so this and
    /// every helper below it compute a value and hand it back rather than mutating one passed in.
    fn advance_or_complete(&mut self, idx: usize, now: u64) -> AdvanceOutcome {
        let is_last_token = self.active_reveals[idx].cursor + 1 == self.active_reveals[idx].answer_keys.len();

        if is_last_token {
            let challenge = self.active_reveals.swap_remove(idx);
            let (primary, secondary) = self.handle_match(challenge, now);
            return AdvanceOutcome::Completed(primary, secondary);
        }

        let challenge = &mut self.active_reveals[idx];
        challenge.cursor += 1;

        AdvanceOutcome::Progressed(UiHintEvent::AnswerProgress {
            cell_ids: challenge.cell_ids.clone(),
            composed_so_far: challenge.answer_glyphs[..challenge.cursor].to_vec(),
            remaining: challenge.answer_glyphs[challenge.cursor..].to_vec(),
            cursor: challenge.cursor,
            total: challenge.answer_keys.len(),
        })
    }

    fn handle_match(&mut self, challenge: ActiveChallenge, now: u64) -> (PrimaryEvent, Vec<SecondaryEvent>) {
        let show_romanization = self.stats.current_streak < self.config.hide_romanization_streak;
        let token_count = challenge.answer_keys.len();

        let (new_stats, calc) = compute_match_outcome(&self.stats, &self.config, challenge.revealed_at_ms, now);
        self.stats = new_stats;

        // Check game mode completion - the one mutation compute_match_outcome cannot perform
        // itself, since it is a stateful mastery check against the game mode's own pool, not a
        // function of stats/config/timing alone.
        let counts_toward_completion = self.game_mode.on_match(&challenge.identity, calc.is_high_quality, show_romanization);

        // When a challenge is completed it locks into its cell(s): reserve them
        // so no future challenge spawns on top of the persisted glyph(s).
        if counts_toward_completion {
            self.completed_cells.extend(challenge.cell_ids.iter().cloned());
        }

        let mut secondary = vec![SecondaryEvent::StatsUpdated { stats: self.stats.clone() }];
        if let Some(streak) = calc.streak_milestone {
            secondary.push(SecondaryEvent::StreakMilestone { streak });
        }
        if calc.is_high_quality {
            secondary.extend(self.adjust_difficulty_faster(token_count));
        }

        let primary = PrimaryEvent::MatchFound {
            cell_id: challenge.cell_ids[0].clone(),
            cell_ids: challenge.cell_ids.clone(),
            hangul: challenge.answer_glyphs.join(""),
            answer_glyphs: challenge.answer_glyphs.clone(),
            stimulus: challenge.stimulus.clone(),
            points: calc.points,
            is_high_quality: calc.is_high_quality,
            time_gap_ms: calc.time_gap_ms,
            counts_toward_completion,
        };

        (primary, secondary)
    }

    fn handle_miss(&mut self) -> (PrimaryEvent, Vec<SecondaryEvent>) {
        self.stats.current_streak = 0;
        self.streak_tokens = 0;

        let mut secondary = vec![SecondaryEvent::StatsUpdated { stats: self.stats.clone() }];
        if let Some(event) = self.adjust_difficulty_slower(DifficultyChangeReason::InputMiss) {
            secondary.push(event);
        }

        (PrimaryEvent::InputMissed, secondary)
    }

    /// Steps the difficulty up once for every multiple of `speed_increase_every_n_correct` that
    /// `tokens_matched` crosses (canon Thm. 7.2(b)): a single multi-token match can therefore
    /// trigger more than one step, exactly as that many single-token matches would have. At
    /// `tokens_matched == 1` on every call (today's only production case), this reduces to the
    /// original "one step every Nth correct match" trigger.
    fn adjust_difficulty_faster(&mut self, tokens_matched: usize) -> Vec<SecondaryEvent> {
        let (new_streak_tokens, new_lifetime, events) = difficulty::compute_speedup(self.streak_tokens, tokens_matched, self.current_lifetime_ms, &self.config);
        self.streak_tokens = new_streak_tokens;
        self.current_lifetime_ms = new_lifetime;
        events
    }

    fn adjust_difficulty_slower(&mut self, reason: DifficultyChangeReason) -> Option<SecondaryEvent> {
        let (new_lifetime, event) = difficulty::compute_slowdown(self.current_lifetime_ms, &self.config, reason);
        self.current_lifetime_ms = new_lifetime;
        event
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
    use crate::internal::{content_domain::Korean, Stimulus};

    fn engine_with_config(config: GameConfig, mode: &str) -> GameEngine<Korean> {
        GameEngine::new(config, mode.to_string(), vec![])
    }

    fn engine_with(mode: &str) -> GameEngine<Korean> {
        engine_with_config(GameConfig::default(), mode)
    }

    /// Direct unit tests for `compute_match_outcome` (canon Axiom 12.1, ADR 0004 #752): no
    /// `GameEngine` construction needed, since the function is a pure calculation over
    /// `GameStats`/`GameConfig`/timing alone.
    mod compute_match_outcome_tests {
        use super::*;

        #[test]
        fn fast_match_is_high_quality_and_awards_points() {
            let stats = GameStats::new();
            let config = GameConfig::default();

            let (new_stats, calc) = compute_match_outcome(&stats, &config, 1000, 1100);

            assert!(calc.is_high_quality);
            assert_eq!(calc.time_gap_ms, 100);
            assert_eq!(new_stats.current_streak, 1);
            assert_eq!(new_stats.total_correct, 1);
            assert_eq!(new_stats.score, calc.points);
        }

        #[test]
        fn slow_match_is_not_high_quality_but_still_counts() {
            let stats = GameStats::new();
            let config = GameConfig::default();
            let slow_gap = u64::from(config.correctness_threshold_ms) + 1;

            let (new_stats, calc) = compute_match_outcome(&stats, &config, 0, slow_gap);

            assert!(!calc.is_high_quality);
            assert_eq!(new_stats.current_streak, 1);
            assert_eq!(new_stats.total_correct, 1);
        }

        #[test]
        fn streak_milestone_fires_only_on_the_fifth_match() {
            let config = GameConfig::default();
            let mut stats = GameStats::new();

            for _ in 0..4 {
                let (new_stats, calc) = compute_match_outcome(&stats, &config, 0, 0);
                assert!(calc.streak_milestone.is_none());
                stats = new_stats;
            }

            let (new_stats, calc) = compute_match_outcome(&stats, &config, 0, 0);
            assert_eq!(calc.streak_milestone, Some(5));
            assert_eq!(new_stats.current_streak, 5);
        }

        #[test]
        fn best_streak_only_grows_never_shrinks() {
            let config = GameConfig::default();
            let stats = GameStats {
                current_streak: 2,
                best_streak: 10,
                ..GameStats::new()
            };

            let (new_stats, _) = compute_match_outcome(&stats, &config, 0, 0);

            assert_eq!(new_stats.current_streak, 3);
            assert_eq!(new_stats.best_streak, 10);
        }

        #[test]
        fn does_not_mutate_the_stats_passed_in() {
            // Purity check: compute_match_outcome takes &GameStats, so the caller's original value
            // must be observable, unchanged, after the call.
            let stats = GameStats::new();
            let config = GameConfig::default();

            let (_, _) = compute_match_outcome(&stats, &config, 0, 0);

            assert_eq!(stats.current_streak, 0);
            assert_eq!(stats.total_correct, 0);
        }
    }

    /// Single-token challenge (n=1) - the exact pre-#421/#422 shape, just built through the new
    /// `ActiveChallenge` struct.
    fn push_reveal(engine: &mut GameEngine<Korean>, cell_id: &str, hangul: &str, expected_key: &str, revealed_at_ms: u64) {
        push_word_challenge(engine, &[cell_id], &[hangul], &[expected_key], revealed_at_ms);
    }

    /// A genuine multi-token challenge with distinct, individually-typeable tokens, for tests that
    /// drive `process_input` all the way through cursor advancement to completion.
    fn push_word_challenge(engine: &mut GameEngine<Korean>, cell_ids: &[&str], glyphs: &[&str], keys: &[&str], revealed_at_ms: u64) {
        assert_eq!(cell_ids.len(), glyphs.len());
        assert_eq!(glyphs.len(), keys.len());
        let identity: String = glyphs.concat();
        engine.active_reveals.push(ActiveChallenge {
            stimulus: Stimulus::Glyph { text: identity.clone() },
            answer_keys: keys.iter().map(|s| s.to_string()).collect(),
            answer_glyphs: glyphs.iter().map(|s| s.to_string()).collect(),
            cursor: 0,
            revealed_at_ms,
            cell_ids: cell_ids.iter().map(|s| s.to_string()).collect(),
            identity,
        });
    }

    /// A challenge with `token_count` tokens for tests that only exercise `tick()`'s expiry-budget
    /// scaling and never call `process_input` against it - repeated glyph/key content is harmless
    /// there since the matcher itself is never touched.
    fn push_reveal_with_token_count(engine: &mut GameEngine<Korean>, cell_id: &str, hangul: &str, expected_key: &str, revealed_at_ms: u64, token_count: usize) {
        let cell_ids: Vec<String> = (0..token_count).map(|i| format!("{cell_id}-{i}")).collect();
        engine.active_reveals.push(ActiveChallenge {
            stimulus: Stimulus::Glyph { text: hangul.to_string() },
            answer_keys: vec![expected_key.to_string(); token_count],
            answer_glyphs: vec![hangul.to_string(); token_count],
            cursor: 0,
            revealed_at_ms,
            cell_ids,
            identity: hangul.to_string(),
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
    fn set_mode_clears_session_state_like_reset() {
        let mut engine = engine_with("completion");
        push_reveal(&mut engine, "cell-1", "ㄱ", "r", 0);
        engine.process_input("r".to_string(), 0);
        assert!(engine.get_stats().score > 0);

        engine.set_mode("endless".to_string(), vec![]);

        assert_eq!(engine.get_active_count(), 0);
        assert_eq!(engine.get_stats().score, 0);
        assert_eq!(engine.get_timing_params().character_lifetime_ms, GameConfig::default().max_time_window_ms);
    }

    #[test]
    fn set_mode_actually_swaps_the_game_mode_not_just_its_state() {
        // "completion" has a 40-entry pool with a finite progress; "endless"
        // always reports zero total_keys (canon Rem. 6.1's degenerate
        // instance) - this is only true if set_mode really replaces
        // game_mode, not merely resets the previous mode in place.
        let mut engine = engine_with("completion");
        assert_eq!(engine.get_status(0).progress.total_keys, 40);

        engine.set_mode("endless".to_string(), vec![]);

        assert_eq!(engine.get_status(0).progress.total_keys, 0);
    }

    #[test]
    fn set_mode_to_vocabulary_spawns_from_the_new_word_pool_not_the_old_mode() {
        let mut engine = engine_with("endless");

        let word_pool = vec![ChallengeSeed {
            stimulus: Stimulus::Icon { name: "apple".to_string() },
            answer_keys: vec!["t".to_string(), "k".to_string()],
            answer_glyphs: vec!["ㅅ".to_string(), "ㅏ".to_string()],
            identity: "사과".to_string(),
        }];
        engine.set_mode("vocabulary".to_string(), word_pool);

        let batch = engine.spawn_character(0, vec!["cell-1".to_string(), "cell-2".to_string()]);
        match batch.primary {
            Some(PrimaryEvent::CharacterSpawned { spawn_result }) => {
                assert_eq!(spawn_result.answer_glyphs, vec!["ㅅ".to_string(), "ㅏ".to_string()]);
            }
            other => panic!("expected CharacterSpawned from the new word pool, got {other:?}"),
        }
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
        push_reveal_with_token_count(&mut engine, "cell-word", "ㄱ", "r", 0, 4);

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
        push_reveal_with_token_count(&mut before_ceiling, "cell-huge", "ㄱ", "r", 0, 100);
        assert!(
            before_ceiling.tick(MAX_CHALLENGE_BUDGET_MS).primary.is_none(),
            "must not expire before reaching the ceiling"
        );

        let mut after_ceiling = engine_with_config(GameConfig::default(), "endless");
        push_reveal_with_token_count(&mut after_ceiling, "cell-huge", "ㄱ", "r", 0, 100);
        match after_ceiling.tick(MAX_CHALLENGE_BUDGET_MS + 1).primary {
            Some(PrimaryEvent::CharactersExpired { count, .. }) => assert_eq!(count, 1),
            other => panic!("expected the pathologically long challenge to expire at the ceiling, got {other:?}"),
        }
    }

    #[test]
    fn adjust_difficulty_faster_triggers_once_per_multiple_of_tokens_matched() {
        // canon Thm. 7.2(b): stepping counts tokens, not challenges. A single
        // 4-token challenge, typed token by token to completion, must step
        // exactly once at speed_increase_every_n_correct = 4 - the same total
        // step a naive per-challenge counter would need 4 separate
        // *challenges* to produce.
        let config = GameConfig {
            min_time_window_ms: 1000,
            max_time_window_ms: 3000,
            time_window_step_ms: 150,
            speed_increase_every_n_correct: 4,
            ..GameConfig::default()
        };
        let mut engine = engine_with_config(config, "endless");
        push_word_challenge(&mut engine, &["cell-0", "cell-1", "cell-2", "cell-3"], &["ㄱ", "ㄴ", "ㅅ", "ㄷ"], &["r", "s", "t", "e"], 0);

        engine.process_input("r".to_string(), 100);
        engine.process_input("s".to_string(), 100);
        engine.process_input("t".to_string(), 100);
        let batch = engine.process_input("e".to_string(), 100);

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
        push_word_challenge(&mut engine, &["cell-0", "cell-1", "cell-2"], &["ㄱ", "ㄴ", "ㅅ"], &["r", "s", "t"], 0);

        engine.process_input("r".to_string(), 100);
        engine.process_input("s".to_string(), 100);
        let batch = engine.process_input("t".to_string(), 100);

        assert!(!batch.secondary.iter().any(|e| matches!(e, SecondaryEvent::DifficultyChanged { .. })));
    }

    #[test]
    fn mid_word_match_emits_answer_progress_and_keeps_challenge_active() {
        // canon Def. 4.3: an exact match that doesn't complete the answer
        // advances the cursor and emits AnswerProgress, but the challenge
        // stays active (not swap_removed) until its last token matches.
        let mut engine = engine_with("endless");
        push_word_challenge(&mut engine, &["cell-0", "cell-1"], &["ㅅ", "ㅏ"], &["t", "k"], 0);

        let batch = engine.process_input("t".to_string(), 100);

        match batch.ui_hints.as_slice() {
            [UiHintEvent::AnswerProgress {
                cell_ids,
                composed_so_far,
                remaining,
                cursor,
                total,
            }] => {
                assert_eq!(cell_ids, &vec!["cell-0".to_string(), "cell-1".to_string()]);
                assert_eq!(composed_so_far, &vec!["ㅅ".to_string()]);
                assert_eq!(remaining, &vec!["ㅏ".to_string()]);
                assert_eq!(*cursor, 1);
                assert_eq!(*total, 2);
            }
            other => panic!("expected a single AnswerProgress hint, got {other:?}"),
        }
        assert!(batch.primary.is_none());
        assert_eq!(engine.get_active_count(), 1);

        let complete_batch = engine.process_input("k".to_string(), 200);
        match complete_batch.primary {
            Some(PrimaryEvent::MatchFound { cell_ids, hangul, .. }) => {
                assert_eq!(cell_ids, vec!["cell-0".to_string(), "cell-1".to_string()]);
                // Raw jamo stream (ADR 0001 §2(b), resolved as Option A - no syllable
                // composition layer): the joined glyphs, not the precomposed Unicode block.
                assert_eq!(hangul, "ㅅㅏ");
            }
            other => panic!("expected MatchFound, got {other:?}"),
        }
        assert_eq!(engine.get_active_count(), 0);
    }

    #[test]
    fn spawn_character_reserves_all_cells_for_a_multi_token_challenge() {
        // ADR 0003 §2(a): a word challenge reserves |w| cells simultaneously.
        // Simulated here via a synthetic word-pool game mode is out of scope
        // for this file (see game_modes/vocabulary.rs); this test exercises
        // spawn_character's cell-reservation arithmetic directly by pushing a
        // pre-built two-token challenge and confirming a subsequent spawn
        // cannot reuse either of its cells.
        let mut engine = engine_with("endless");
        push_word_challenge(&mut engine, &["cell-0", "cell-1"], &["ㅅ", "ㅏ"], &["t", "k"], 0);

        let batch = engine.spawn_character(0, vec!["cell-0".to_string(), "cell-1".to_string()]);

        assert!(matches!(batch.primary, Some(PrimaryEvent::BoardFull)));
    }

    #[test]
    fn batchim_word_completes_like_any_other_multi_token_challenge() {
        // Regression coverage for a false constraint that briefly lived in a
        // seed-data comment (fixed alongside this test): 사람 (saram,
        // "person") has two batchim (ㄹ after ㅏ, ㅁ after ㅏ). The engine has
        // no concept of "batchim" anywhere in this file or in
        // content_domain/korean.rs - process_input just matches
        // answer_keys[cursor] against typed input, so a batchim jamo (ㄹ/ㅁ
        // here) is matched exactly the same way any onset jamo would be.
        // `Korean::key_for` isn't even called for word-mode challenges (see
        // VocabularyMode::get_next_challenge) - answer_keys/answer_glyphs
        // arrive pre-built from the seed and are used verbatim.
        let mut engine = engine_with("endless");
        push_word_challenge(
            &mut engine,
            &["cell-0", "cell-1", "cell-2", "cell-3", "cell-4"],
            &["ㅅ", "ㅏ", "ㄹ", "ㅏ", "ㅁ"],
            &["t", "k", "f", "k", "a"],
            0,
        );

        for key in ["t", "k", "f", "k"] {
            let batch = engine.process_input(key.to_string(), 100);
            assert!(batch.primary.is_none(), "expected progress, not completion, on {key}");
        }
        let final_batch = engine.process_input("a".to_string(), 100);
        match final_batch.primary {
            Some(PrimaryEvent::MatchFound { hangul, .. }) => assert_eq!(hangul, "ㅅㅏㄹㅏㅁ"),
            other => panic!("expected MatchFound, got {other:?}"),
        }
        assert_eq!(engine.get_active_count(), 0);
    }

    #[test]
    fn compound_batchim_as_one_glyph_with_a_combined_key_completes_too() {
        // 닭 (dalg, "chicken"): batchim ㄺ is a compound (ㄹ+ㄱ). Korean::key_for
        // has no table entry for "ㄺ" as one character, but nothing in
        // process_input requires answer_keys[i] to be a single QWERTY
        // character or to come from key_for at all for vocabulary-mode
        // challenges - this mirrors exactly how composite vowels like ㅘ
        // already work (one glyph slot, a 2-char key "hk").
        let mut engine = engine_with("endless");
        push_word_challenge(&mut engine, &["cell-0", "cell-1", "cell-2"], &["ㄷ", "ㅏ", "ㄺ"], &["e", "k", "fr"], 0);

        engine.process_input("e".to_string(), 100);
        engine.process_input("k".to_string(), 100);
        // "f" alone should be a partial/prefix match (ambiguity/extension), not a miss.
        let partial = engine.process_input("f".to_string(), 100);
        assert!(partial.primary.is_none(), "expected a partial-match hint, not a miss, got {partial:?}");
        let complete = engine.process_input("r".to_string(), 100);
        match complete.primary {
            Some(PrimaryEvent::MatchFound { hangul, .. }) => assert_eq!(hangul, "ㄷㅏㄺ"),
            other => panic!("expected MatchFound, got {other:?}"),
        }
    }
}
