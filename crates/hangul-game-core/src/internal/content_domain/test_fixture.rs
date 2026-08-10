//! Proves `ContentDomain` genericity (canon §11.1, Theorem 11.1) with a second, deliberately
//! minimal implementation, distinct from `Korean`, that exercises `GameEngine` end-to-end. "A trait
//! with exactly one implementer is unfalsified, not proven" (epic #709's design notes) - this
//! fixture is the falsification attempt. It is `#[cfg(test)]`-only: never reachable from
//! `src/lib.rs` or any host-layer code, per epic #709's acceptance criteria.

use super::{
    super::{engine::GameEngine, events::PrimaryEvent, types::GameConfig},
    ContentDomain,
};

/// A synthetic, non-Korean domain: a five-digit alphabet mapped to its own digit as a key. Not real
/// curriculum content - see module docs.
struct TestDigits;

const DIGIT_ALPHABET: &[&str] = &["0", "1", "2", "3", "4"];

impl ContentDomain for TestDigits {
    fn key_for(token: &str) -> String {
        if DIGIT_ALPHABET.contains(&token) {
            token.to_string()
        } else {
            String::new()
        }
    }

    fn completion_alphabet() -> Vec<String> {
        DIGIT_ALPHABET.iter().copied().map(String::from).collect()
    }
}

#[test]
fn full_challenge_lifecycle_against_a_non_korean_domain() {
    // hide_romanization_streak: 0 keeps this test's concern isolated to ContentDomain genericity -
    // otherwise the very first match of a fresh session runs with the hint on screen
    // (current_streak 0 < the default 5), which now correctly withholds completion credit
    // (canon Rem. 6.2) regardless of domain.
    let config = GameConfig {
        hide_romanization_streak: 0,
        ..GameConfig::default()
    };
    let mut engine = GameEngine::<TestDigits>::new(config, "completion".to_string(), vec![]);
    engine.start_timer(0);

    let batch = engine.spawn_character(0, vec!["cell-0".to_string()]);
    let spawn_result = match batch.primary {
        Some(PrimaryEvent::CharacterSpawned { spawn_result }) => spawn_result,
        other => panic!("expected CharacterSpawned, got {other:?}"),
    };
    assert_eq!(spawn_result.expected_key, TestDigits::key_for(&spawn_result.hangul));

    let match_batch = engine.process_input(spawn_result.expected_key.clone(), 100);
    match match_batch.primary {
        Some(PrimaryEvent::MatchFound {
            hangul, counts_toward_completion, ..
        }) => {
            assert_eq!(hangul, spawn_result.hangul);
            assert!(counts_toward_completion, "a high-quality, unhinted match on a fresh domain must count toward completion");
        }
        other => panic!("expected MatchFound, got {other:?}"),
    }

    let progress = engine.get_status(100).progress;
    assert_eq!(progress.total_keys, DIGIT_ALPHABET.len());
    assert_eq!(progress.completed_keys, 1);
}
