//! Algebraic invariants of a session, checked against every state a random
//! command walk can reach.
//!
//! The rest of the suite replays scenarios: given these keystrokes, expect
//! that snapshot. Scenarios are easy for a wrong implementation to satisfy —
//! it only has to be right on the paths someone thought to write down. What
//! follows instead are relationships that must hold in *every* reachable
//! state, and that cross-check functions implemented independently of one
//! another (`correct_count`, `filled_count`, `first_gap`, `is_complete`,
//! `consecutive_errors`). If any one of them drifts from the others, a walk
//! trips over it without anyone having predicted the sequence that would.
//!
//! Driven through `TypingGameCore`'s public `Snapshot` rather than the
//! session internals, so what is being checked is the surface the UI actually
//! reads.

mod support;

use leetype_wasm::{Command, Snapshot};
use support::Player;

/// Sources chosen to cover the shapes the compiler treats differently:
/// skipped indentation, interior spaces, multiple sections, and the
/// degenerate empty program.
const SOURCES: &[&str] = &[
    "",
    "a",
    "bar foo",
    "let x = 1",
    "fn a() {\n    b();\n}",
    "fn one() {\n    a();\n}\nfn two() {\n    b();\n}\n",
];

/// xorshift64*, so a failure is reproducible from its seed alone and the
/// crate stays dependency-free.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn below(&mut self, bound: usize) -> usize {
        if bound == 0 {
            return 0;
        }
        usize::try_from(self.next() % bound as u64).unwrap_or(0)
    }
}

/// Every relationship that must hold of a session, whatever it has been put
/// through. Each is stated in terms of at least two separately-computed
/// fields, which is what makes them hard to satisfy by accident.
fn assert_invariants(snapshot: &Snapshot, source: &str, ceiling: usize, history: &[String]) {
    let ctx = || format!("source={source:?} ceiling={ceiling} history={history:?} snapshot={snapshot:?}");

    assert!(snapshot.correct <= snapshot.filled, "a correct slot is a filled slot: {}", ctx());
    assert!(snapshot.filled <= snapshot.slot_count, "there are only so many slots to fill: {}", ctx());

    // `is_complete` is deliberately false for a program with no slots — an
    // empty chunk is inert, not finished (see game_core's
    // `an_empty_program_is_inert_rather_than_complete`). That guard is the one
    // place the plain "complete iff every slot correct" reading does not hold,
    // so it is stated here rather than quietly assumed.
    assert_eq!(
        snapshot.is_complete,
        snapshot.slot_count > 0 && snapshot.correct == snapshot.slot_count,
        "completion is exactly 'every slot correct', on a non-empty program: {}",
        ctx()
    );

    assert_eq!(
        snapshot.first_gap_slot.is_none(),
        snapshot.filled == snapshot.slot_count,
        "a gap exists exactly when some slot is unfilled: {}",
        ctx()
    );

    if let Some(gap) = snapshot.first_gap_slot {
        assert!(gap < snapshot.slot_count, "a gap is a real slot: {}", ctx());
    }

    assert!(snapshot.cursor_slot <= snapshot.slot_count, "the caret sits on a slot or one past the end: {}", ctx());

    // Wrong slots are the ones filled but not correct, and every one of them
    // was produced by a keystroke the lifetime tally already counted. This is
    // the cross-check that catches `total_errors` being decremented on
    // backspace, which would quietly inflate accuracy.
    let wrong_now = snapshot.filled - snapshot.correct;
    assert!(wrong_now <= snapshot.total_errors, "every currently-wrong slot was a counted mistake: {}", ctx());

    // The streak is a distance back from the caret, so it cannot reach past
    // the start of the program.
    assert!(
        snapshot.consecutive_errors <= snapshot.cursor_slot,
        "the streak cannot extend before the first slot: {}",
        ctx()
    );

    // A streak of zero and an unrepaired divergence behind the caret are
    // mutually exclusive by construction; if the streak is non-zero there must
    // be at least one wrong slot to account for it.
    if snapshot.consecutive_errors > 0 {
        assert!(wrong_now > 0, "a streak implies a wrong slot: {}", ctx());
    }

    // The alert never fires below the ceiling. The other half of the
    // biconditional needs the dismissal flag, which the snapshot does not
    // expose - the walk tracks it independently instead, below.
    if snapshot.show_error_alert {
        assert!(snapshot.consecutive_errors >= ceiling, "the alert never fires below the ceiling: {}", ctx());
    }

    assert!((0.0..=100.0).contains(&snapshot.progress), "progress is a percentage: {}", ctx());
    assert!((0.0..=100.0).contains(&snapshot.accuracy), "accuracy is a percentage: {}", ctx());
}

/// The character slot `slot` owes, read off the engine's own token stream so
/// the walk types real keys as often as wrong ones.
fn expected_key_at(stream: &[char], slot: usize) -> Option<char> {
    stream.get(slot).copied()
}

#[test]
fn every_reachable_state_satisfies_the_metric_relationships() {
    for (source_index, source) in SOURCES.iter().enumerate() {
        for ceiling in [1_usize, 3, 99] {
            let mut rng = Rng(0x2545_F491_4F6C_DD1D ^ (source_index as u64) << 8 ^ ceiling as u64);
            let stream: Vec<char> = Player::token_stream(source).chars().collect();
            let mut player = Player::start(source, Some(ceiling));
            let mut history: Vec<String> = Vec::new();
            let mut dismissed = false;

            assert_invariants(&player.snapshot(), source, ceiling, &history);

            for _ in 0..400 {
                let slot_count = player.snapshot().slot_count;
                let cursor = player.snapshot().cursor_slot;

                let command = match rng.below(10) {
                    // Weighted towards typing, so runs actually get deep enough
                    // to complete a chunk rather than thrashing at slot zero.
                    0..=4 => {
                        // The right key half the time, so both alignment and
                        // divergence are exercised.
                        let key = expected_key_at(&stream, cursor)
                            .filter(|_| rng.below(2) == 0)
                            .unwrap_or_else(|| ['q', 'z', ' ', '\n', '\t'][rng.below(5)]);
                        Command::Press { key }
                    }
                    5..=7 => Command::Backspace,
                    8 => Command::JumpToSlot {
                        slot: rng.below(slot_count.saturating_add(2)),
                    },
                    _ => Command::DismissAlert,
                };

                history.push(format!("{command:?}"));
                player.send(&command);
                let snapshot = player.snapshot();
                assert_invariants(&snapshot, source, ceiling, &history);

                // An independent model of `settle_alert`: a dismissal sticks
                // until the streak that raised it is broken. Re-deriving it
                // here rather than reading it back off `show_error_alert`
                // means the assertion below is a real cross-check and not a
                // restatement of the field it is checking.
                if matches!(command, Command::DismissAlert) {
                    dismissed = true;
                }
                if snapshot.consecutive_errors == 0 {
                    dismissed = false;
                }
                assert_eq!(
                    snapshot.show_error_alert,
                    snapshot.consecutive_errors >= ceiling && !dismissed,
                    "the alert is exactly 'at the ceiling and not waved off': \
                     source={source:?} ceiling={ceiling} history={history:?} snapshot={snapshot:?}"
                );
            }
        }
    }
}

#[test]
fn typing_a_source_out_completes_it_and_the_metrics_agree() {
    // The one walk worth pinning end to end: the invariants must still hold at
    // the terminal state, which a random walk reaches only by luck.
    for source in SOURCES.iter().filter(|source| !source.is_empty()) {
        let stream = Player::token_stream(source);
        let mut player = Player::start(source, None);
        player.type_text(&stream);

        let snapshot = player.snapshot();
        assert!(snapshot.is_complete, "source={source:?} snapshot={snapshot:?}");
        assert_eq!(snapshot.correct, snapshot.slot_count);
        assert_eq!(snapshot.filled, snapshot.slot_count);
        assert_eq!(snapshot.first_gap_slot, None);
        assert_eq!(snapshot.consecutive_errors, 0);
        assert_eq!(snapshot.total_errors, 0);
        assert_invariants(&snapshot, source, 3, &[]);
    }
}

#[test]
fn an_empty_program_is_inert_rather_than_complete() {
    // The single exception to "complete iff every slot correct", stated on its
    // own so the guarded form in `assert_invariants` is not mistaken for
    // defensive noise.
    let player = Player::start("", None);
    let snapshot = player.snapshot();

    assert_eq!(snapshot.slot_count, 0);
    assert_eq!(snapshot.correct, snapshot.slot_count);
    assert!(!snapshot.is_complete);
}
