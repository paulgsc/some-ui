use super::{stimulus::Stimulus, GameStats, SpawnResult};
use serde::Serialize;

/// ============================================================
/// Primary game events - the "source of truth"
/// ============================================================

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PrimaryEvent {
    MatchFound {
        cell_id: String,
        cell_ids: Vec<String>,
        hangul: String,
        answer_glyphs: Vec<String>,
        /// The completed challenge's stimulus (canon Axiom 3.1: carried opaquely), so a
        /// completion ceremony (#426) can reference what was just matched - e.g. replaying an
        /// icon or TTS line alongside the revealed word.
        stimulus: Stimulus,
        points: i32,
        is_high_quality: bool,
        time_gap_ms: u32,
        counts_toward_completion: bool,
    },
    CharactersExpired {
        cell_ids: Vec<String>,
        hanguls: Vec<String>,
        count: usize,
    },
    InputMissed,
    CharacterSpawned {
        spawn_result: SpawnResult,
    },
    BoardFull,
}

/// ============================================================
/// Secondary events - derived state changes
/// ============================================================

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SecondaryEvent {
    DifficultyChanged {
        new_lifetime_ms: u32,
        new_interval_ms: u32,
        reason: DifficultyChangeReason,
    },
    StreakMilestone {
        streak: usize,
    },
    StatsUpdated {
        stats: GameStats,
    },
}

/// ============================================================
/// UI hint events - ephemeral display information
/// ============================================================

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum UiHintEvent {
    BufferUpdated {
        current_buffer: String,
    },
    AmbiguousInput {
        current_buffer: String,
        potential_matches: Vec<String>,
    },
    /// Emitted when a token-cursor advance (canon Def. 4.3) doesn't yet complete the challenge:
    /// mid-word progress for a multi-token answer. Never fired for a single-token (n=1) challenge,
    /// since its one and only token match is always the completing one (canon Thm. 4.1).
    AnswerProgress {
        cell_ids: Vec<String>,
        composed_so_far: Vec<String>,
        remaining: Vec<String>,
        cursor: usize,
        total: usize,
    },
}

/// ============================================================
/// Difficulty change reason enum
/// ============================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DifficultyChangeReason {
    PerfectMatch,
    InputMiss,
    CharacterExpired,
}

/// ============================================================
/// Flattened event for WASM boundary
/// ============================================================

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum GameEvent {
    MatchFound {
        #[serde(rename = "cellId")]
        cell_id: String,
        #[serde(rename = "cellIds")]
        cell_ids: Vec<String>,
        hangul: String,
        #[serde(rename = "answerGlyphs")]
        answer_glyphs: Vec<String>,
        stimulus: Stimulus,
        points: i32,
        #[serde(rename = "isHighQuality")]
        is_high_quality: bool,
        #[serde(rename = "timeGapMs")]
        time_gap_ms: u32,
        #[serde(rename = "countsTowardCompletion")]
        counts_toward_completion: bool,
    },
    CharactersExpired {
        #[serde(rename = "cellIds")]
        cell_ids: Vec<String>,
        hanguls: Vec<String>,
        count: usize,
    },
    InputMissed,
    BufferUpdated {
        #[serde(rename = "currentBuffer")]
        current_buffer: String,
    },
    AmbiguousInput {
        #[serde(rename = "currentBuffer")]
        current_buffer: String,
        #[serde(rename = "potentialMatches")]
        potential_matches: Vec<String>,
    },
    AnswerProgress {
        #[serde(rename = "cellIds")]
        cell_ids: Vec<String>,
        #[serde(rename = "composedSoFar")]
        composed_so_far: Vec<String>,
        remaining: Vec<String>,
        cursor: usize,
        total: usize,
    },
    CharacterSpawned {
        #[serde(rename = "spawnResult")]
        spawn_result: SpawnResult,
    },
    BoardFull,
    DifficultyChanged {
        #[serde(rename = "newLifetimeMs")]
        new_lifetime_ms: u32,
        #[serde(rename = "newIntervalMs")]
        new_interval_ms: u32,
        reason: DifficultyChangeReason,
    },
    StreakMilestone {
        streak: usize,
    },
    StatsUpdated {
        stats: GameStats,
    },
}

/// ============================================================
/// Event batch for phase-separated events
/// ============================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventBatch {
    pub primary: Option<PrimaryEvent>,
    pub secondary: Vec<SecondaryEvent>,
    pub ui_hints: Vec<UiHintEvent>,
}

impl EventBatch {
    pub fn new() -> Self {
        Self {
            primary: None,
            secondary: Vec::new(),
            ui_hints: Vec::new(),
        }
    }

    pub fn add_secondary(&mut self, event: SecondaryEvent) {
        self.secondary.push(event);
    }

    pub fn add_ui_hint(&mut self, event: UiHintEvent) {
        self.ui_hints.push(event);
    }

    /// Flatten to a single Vec<GameEvent> for WASM boundary
    pub fn flatten(self) -> Vec<GameEvent> {
        let mut events = Vec::new();

        if let Some(primary) = self.primary {
            match primary {
                PrimaryEvent::MatchFound {
                    cell_id,
                    cell_ids,
                    hangul,
                    answer_glyphs,
                    stimulus,
                    points,
                    is_high_quality,
                    time_gap_ms,
                    counts_toward_completion,
                } => {
                    events.push(GameEvent::MatchFound {
                        cell_id,
                        cell_ids,
                        hangul,
                        answer_glyphs,
                        stimulus,
                        points,
                        is_high_quality,
                        time_gap_ms,
                        counts_toward_completion,
                    });
                }
                PrimaryEvent::CharactersExpired { cell_ids, hanguls, count } => {
                    events.push(GameEvent::CharactersExpired { cell_ids, hanguls, count });
                }
                PrimaryEvent::InputMissed => events.push(GameEvent::InputMissed),
                PrimaryEvent::CharacterSpawned { spawn_result } => events.push(GameEvent::CharacterSpawned { spawn_result }),
                PrimaryEvent::BoardFull => events.push(GameEvent::BoardFull),
            }
        }

        for secondary in self.secondary {
            match secondary {
                SecondaryEvent::DifficultyChanged {
                    new_lifetime_ms,
                    new_interval_ms,
                    reason,
                } => {
                    events.push(GameEvent::DifficultyChanged {
                        new_lifetime_ms,
                        new_interval_ms,
                        reason,
                    });
                }
                SecondaryEvent::StreakMilestone { streak } => events.push(GameEvent::StreakMilestone { streak }),
                SecondaryEvent::StatsUpdated { stats } => events.push(GameEvent::StatsUpdated { stats }),
            }
        }

        for ui_hint in self.ui_hints {
            match ui_hint {
                UiHintEvent::BufferUpdated { current_buffer } => events.push(GameEvent::BufferUpdated { current_buffer }),
                UiHintEvent::AmbiguousInput {
                    current_buffer,
                    potential_matches,
                } => events.push(GameEvent::AmbiguousInput {
                    current_buffer,
                    potential_matches,
                }),
                UiHintEvent::AnswerProgress {
                    cell_ids,
                    composed_so_far,
                    remaining,
                    cursor,
                    total,
                } => events.push(GameEvent::AnswerProgress {
                    cell_ids,
                    composed_so_far,
                    remaining,
                    cursor,
                    total,
                }),
            }
        }

        events
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flatten_orders_primary_before_secondary_before_ui_hints() {
        let mut batch = EventBatch::new();
        batch.primary = Some(PrimaryEvent::InputMissed);
        batch.add_secondary(SecondaryEvent::StreakMilestone { streak: 5 });
        batch.add_ui_hint(UiHintEvent::BufferUpdated { current_buffer: "r".to_string() });

        let events = batch.flatten();

        assert!(matches!(events[0], GameEvent::InputMissed));
        assert!(matches!(events[1], GameEvent::StreakMilestone { streak: 5 }));
        assert!(matches!(events[2], GameEvent::BufferUpdated { .. }));
    }

    #[test]
    fn flatten_preserves_secondary_event_insertion_order() {
        let mut batch = EventBatch::new();
        batch.add_secondary(SecondaryEvent::StreakMilestone { streak: 10 });
        batch.add_secondary(SecondaryEvent::DifficultyChanged {
            new_lifetime_ms: 900,
            new_interval_ms: 1200,
            reason: DifficultyChangeReason::PerfectMatch,
        });

        let events = batch.flatten();

        assert!(matches!(events[0], GameEvent::StreakMilestone { streak: 10 }));
        assert!(matches!(events[1], GameEvent::DifficultyChanged { .. }));
    }

    #[test]
    fn flatten_with_no_events_produces_empty_vec() {
        let batch = EventBatch::new();
        assert!(batch.flatten().is_empty());
    }

    #[test]
    fn match_found_serializes_with_camel_case_wire_format() {
        let event = GameEvent::MatchFound {
            cell_id: "cell-1".to_string(),
            cell_ids: vec!["cell-1".to_string()],
            hangul: "ㄱ".to_string(),
            answer_glyphs: vec!["ㄱ".to_string()],
            stimulus: Stimulus::Glyph { text: "ㄱ".to_string() },
            points: 10,
            is_high_quality: true,
            time_gap_ms: 200,
            counts_toward_completion: false,
        };

        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "matchFound");
        assert_eq!(json["cellId"], "cell-1");
        assert_eq!(json["isHighQuality"], true);
        assert_eq!(json["timeGapMs"], 200);
        assert_eq!(json["countsTowardCompletion"], false);
    }

    #[test]
    fn difficulty_changed_serializes_with_camel_case_wire_format() {
        let event = GameEvent::DifficultyChanged {
            new_lifetime_ms: 900,
            new_interval_ms: 1200,
            reason: DifficultyChangeReason::CharacterExpired,
        };

        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "difficultyChanged");
        assert_eq!(json["newLifetimeMs"], 900);
        assert_eq!(json["newIntervalMs"], 1200);
        assert_eq!(json["reason"], "characterExpired");
    }
}
