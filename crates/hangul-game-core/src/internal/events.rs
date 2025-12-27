use super::{GameStats, SpawnResult};
use serde::Serialize;

/// ============================================================
/// Primary game events - the "source of truth"
/// ============================================================

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PrimaryEvent {
    MatchFound {
        cell_id: String,
        hangul: String,
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
    BufferUpdated { current_buffer: String },
    AmbiguousInput { current_buffer: String, potential_matches: Vec<String> },
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
        cell_id: String,
        hangul: String,
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
    BufferUpdated {
        current_buffer: String,
    },
    AmbiguousInput {
        current_buffer: String,
        potential_matches: Vec<String>,
    },
    CharacterSpawned {
        spawn_result: SpawnResult,
    },
    BoardFull,
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
                    hangul,
                    points,
                    is_high_quality,
                    time_gap_ms,
                    counts_toward_completion,
                } => {
                    events.push(GameEvent::MatchFound {
                        cell_id,
                        hangul,
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
            }
        }

        events
    }
}
