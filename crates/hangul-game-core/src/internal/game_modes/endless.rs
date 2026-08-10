use rand::{seq::SliceRandom, thread_rng};

use super::{ChallengeSeed, GameConfig, GameMode, GameProgress};

/// Endless mode - game never completes, challenges spawn infinitely from whatever pool it was
/// built with (today, always the content domain's single-jamo pool via `korean_seed_pool`).
#[derive(Debug, Clone)]
pub struct EndlessMode {
    pool: Vec<ChallengeSeed>,
}

impl EndlessMode {
    pub const fn new(pool: Vec<ChallengeSeed>) -> Self {
        Self { pool }
    }
}

impl GameMode for EndlessMode {
    fn initialize(&mut self, _config: &GameConfig) {
        // Nothing to initialize
    }

    fn get_next_challenge(&self) -> Option<ChallengeSeed> {
        // Draw a genuine challenge from the pool instead of the "random" sentinel no
        // host-layer code ever consumed.
        self.pool.choose(&mut thread_rng()).cloned()
    }

    fn on_match(&mut self, _identity: &str, _is_high_quality: bool, show_romanization: bool) -> bool {
        // Persisting a cell as "completed" is this mode's only stand-in for a mastery signal;
        // withhold it while the QWERTY hint is on screen, same as every other mode (canon Rem. 6.2).
        !show_romanization
    }

    fn on_miss(&self, _identity: &str) {
        // Misses handled by streak system
    }

    fn is_complete(&self) -> bool {
        false // Never completes
    }

    fn has_time_limit(&self) -> bool {
        false // Endless means endless - no wall-clock cutoff either
    }

    fn get_progress(&self) -> GameProgress {
        GameProgress {
            total_keys: 0,
            completed_keys: 0,
            remaining_keys: 0,
            completion_percentage: 0.0,
            keys_completed_list: vec![],
        }
    }

    fn reset(&mut self) {
        // Nothing to reset
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::internal::{
        content_domain::{ContentDomain, Korean},
        game_modes::korean_seed_pool,
    };

    #[test]
    fn get_next_challenge_never_returns_the_unconsumed_random_sentinel() {
        let mode = EndlessMode::new(korean_seed_pool::<Korean>());

        for _ in 0..200 {
            let Some(seed) = mode.get_next_challenge() else {
                panic!("endless mode always has a next challenge");
            };
            assert_ne!(seed.identity, "random");
            assert!(
                !Korean::key_for(&seed.identity).is_empty(),
                "spawned {} has no qwerty mapping and can never be matched",
                seed.identity
            );
            assert_eq!(seed.answer_keys, vec![Korean::key_for(&seed.identity)]);
        }
    }
}
