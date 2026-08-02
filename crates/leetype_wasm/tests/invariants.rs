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

use leetype_wasm::{Command, Progression, RevealConfig, Snapshot};
use support::{Frame, Player, Rng, Typist};

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

// ── The reveal loop ──────────────────────────────────────────────────────
//
// Everything above is algebra over one snapshot. What follows is about a
// *controller*, and controllers fail in ways a single state cannot express:
// they oscillate, they run away, they trap. Each of those has a shape a
// property over a whole timeline can hold, and this is where they are held.
//
// The synthetic player these run against lives in `support::Typist` — one
// fixture, parameterised by rate, jitter, hesitation and error rate, shared
// by every property below.

/// Sources with enough structure to have a reveal ladder worth climbing:
/// several runs, several lines, and one that is a single token.
const REVEAL_SOURCES: &[&str] = &[
    "map.entry(key).or_insert_with(Vec::new);",
    "let mut map = HashMap::new();",
    "fn main() {\n    let mut totals = HashMap::new();\n    totals.entry(word).or_insert(0);\n}",
];

fn baseline(wpm: f64) -> RevealConfig {
    RevealConfig {
        baseline_wpm: wpm,
        dispersion_wpm: 8.0,
    }
}

/// The properties every frame of every timeline must satisfy, whatever the
/// player did.
fn assert_frame_invariants(frames: &[Frame], label: &str) {
    for pair in frames.windows(2) {
        let (before, after) = (&pair[0], &pair[1]);

        // `0 ≤ k ≤ i` after every command.
        assert!(after.reveal_k <= after.run_count, "{label}: k={} exceeds {} runs", after.reveal_k, after.run_count);

        // Reveal is monotone at and behind the cursor: a token the player is
        // on, or has already passed, must never go back under a mask.
        for slot in 0..=before.cursor_slot.min(after.cursor_slot) {
            if before.visibility.get(slot) == Some(&1) {
                assert_eq!(
                    after.visibility.get(slot),
                    Some(&1),
                    "{label}: slot {slot} un-revealed at or behind the cursor \
                     (t={} -> t={})",
                    before.now,
                    after.now
                );
            }
        }
    }
}

/// How many times `k` changed direction — the flicker count.
fn reversals(frames: &[Frame]) -> usize {
    let ks: Vec<usize> = frames.iter().map(|frame| frame.reveal_k).collect();
    ks.windows(3)
        .filter(|window| (window[1] > window[0] && window[2] < window[1]) || (window[1] < window[0] && window[2] > window[1]))
        .count()
}

#[test]
fn no_timeline_ever_un_reveals_at_or_behind_the_cursor() {
    let typists = [
        Typist::steady(45.0),
        Typist::steady(45.0).with_jitter(0.8),
        Typist::steady(20.0).with_hesitations(0.25, 4_000.0),
        Typist::steady(90.0).with_errors(0.3),
        Typist::steady(30.0).with_jitter(0.6).with_hesitations(0.15, 2_500.0).with_errors(0.2),
    ];

    for source in REVEAL_SOURCES {
        for (index, typist) in typists.iter().enumerate() {
            for seed in [1_u64, 7, 4_242] {
                let (frames, _) = support::play_step(source, *typist, baseline(60.0), seed ^ (index as u64) << 32, 120_000.0);
                assert_frame_invariants(&frames, &format!("source={source:?} typist={index} seed={seed}"));
            }
        }
    }
}

#[test]
fn an_idle_player_reaches_a_fully_revealed_step_in_bounded_time() {
    // The anti-lockout property. A player who never touches a key must not be
    // able to reach a state the game will not get them out of.
    for source in REVEAL_SOURCES {
        let (frames, core) = support::idle_step(source, baseline(60.0), 60, 500.0);
        let last = frames.last().expect("idle_step always observes the start");

        assert_eq!(last.reveal_k, last.run_count, "source={source:?} never fully revealed");
        assert!(
            core.visibility_codes().iter().all(|&code| code == 1),
            "source={source:?} left something masked for a player who never typed"
        );
        assert_frame_invariants(&frames, source);
    }
}

#[test]
fn a_player_far_above_the_fast_band_settles_at_zero_and_stays_there() {
    for source in REVEAL_SOURCES {
        let (frames, _) = support::play_step(source, Typist::steady(200.0), baseline(60.0), 99, 120_000.0);

        // Give the loop the first few frames to close a window the initial
        // delay may have opened, then require it to stay shut.
        let tail: Vec<usize> = frames.iter().skip(4).map(|frame| frame.reveal_k).collect();
        assert!(tail.iter().all(|&k| k == 0), "source={source:?} tail={tail:?}");
    }
}

#[test]
fn a_constant_rate_player_inside_the_deadband_reaches_a_fixed_point() {
    // The hysteresis property. A metronome sitting between the two bands must
    // see `k` settle and stay settled — no flicker between `•` and glyph.
    let config = baseline(60.0);
    let mid = (config.slow_band() + config.fast_band()) / 2.0;

    for source in REVEAL_SOURCES {
        let (frames, _) = support::play_step(source, Typist::steady(mid).with_jitter(0.25), config, 3, 120_000.0);
        let settled: Vec<usize> = frames.iter().skip(3).map(|frame| frame.reveal_k).collect();

        assert!(
            reversals(&frames) == 0,
            "source={source:?} k reversed direction inside the deadband: {settled:?}"
        );
    }
}

#[test]
fn the_deadband_is_what_stops_the_flicker_rather_than_luck() {
    // The negative control, and the reason `next_k` takes its bands as
    // arguments: a hysteresis test that passes without hysteresis is not a
    // test. Same player, same readings, two controllers — one with the real
    // deadband, one with it collapsed to a single threshold.
    let config = baseline(60.0);
    let mid = (config.slow_band() + config.fast_band()) / 2.0;
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);

    let readings: Vec<f64> = (0..200).map(|_| mid + (rng.unit() * 2.0 - 1.0) * (config.fast_band() - config.slow_band()) / 2.2).collect();

    let run = |slow: f64, fast: f64| -> usize {
        let mut k = 4_usize;
        let mut flips = 0;
        let mut previous = k;
        let mut direction = 0_i8;

        for &reading in &readings {
            k = leetype_wasm::next_k(k, reading, slow, fast, 12);
            let step = match k.cmp(&previous) {
                std::cmp::Ordering::Greater => 1_i8,
                std::cmp::Ordering::Less => -1,
                std::cmp::Ordering::Equal => 0,
            };
            if step != 0 && direction != 0 && step != direction {
                flips += 1;
            }
            if step != 0 {
                direction = step;
            }
            previous = k;
        }
        flips
    };

    let with_deadband = run(config.slow_band(), config.fast_band());
    let without_deadband = run(mid, mid);

    assert_eq!(with_deadband, 0, "the real bands should absorb this player entirely");
    assert!(
        without_deadband > 10,
        "collapsing the deadband should make the same player flicker, got {without_deadband} reversals"
    );
}

#[test]
fn the_masked_and_unmasked_renderings_of_a_step_have_the_same_shape() {
    // The reflow property: unmasking must never change how wide anything is,
    // or the line jumps under the player's eye mid-word.
    for source in REVEAL_SOURCES {
        let (frames, core) = support::play_step(source, Typist::steady(25.0).with_hesitations(0.4, 3_000.0), baseline(60.0), 11, 60_000.0);

        for frame in &frames {
            let masked = render(source, &frame.visibility, &core);
            assert_eq!(
                masked.lines().map(str::chars).map(Iterator::count).collect::<Vec<_>>(),
                source.lines().map(str::chars).map(Iterator::count).collect::<Vec<_>>(),
                "source={source:?} masked rendering changed the line widths:\n{masked}"
            );
        }
    }
}

/// The renderer's job, done here so the invariant is about what the player
/// sees rather than about the map they see it through: one mask character
/// per masked slot, every other character as-is.
fn render(source: &str, visibility: &[u8], core: &leetype_wasm::TypingGameCore) -> String {
    let slot_of_display = core.slot_of_display_codes();

    source
        .chars()
        .enumerate()
        .map(|(index, ch)| {
            let slot = slot_of_display.get(index).copied().unwrap_or(-1);
            match usize::try_from(slot).ok().and_then(|slot| visibility.get(slot)) {
                Some(&0) => '•',
                _ => ch,
            }
        })
        .collect()
}

#[test]
fn every_exercise_terminates_however_slowly_the_player_types() {
    // The trap property. A player parked below the gate's threshold must
    // still reach the end: the step repeats, and then the repeats run out.
    let config = baseline(90.0);

    for source in REVEAL_SOURCES {
        let mut attempt = 0_usize;
        let mut outcomes = Vec::new();

        loop {
            assert!(attempt < 16, "source={source:?} never escaped: {outcomes:?}");

            // Deliberately hopeless: a 12 WPM typist against a 90 WPM
            // baseline can never clear a gate set at half of 90.
            let (frames, core) = support::play_step(source, Typist::steady(12.0), config, 5 + attempt as u64, 300_000.0);
            let progression = replay_attempts(&core, attempt, finished_at(&frames));
            outcomes.push(progression);

            match progression {
                Progression::Advance | Progression::Escape => break,
                Progression::Repeat => attempt += 1,
            }
        }

        assert!(
            matches!(outcomes.last(), Some(Progression::Escape | Progression::Advance)),
            "source={source:?} outcomes={outcomes:?}"
        );
        assert!(
            attempt < leetype_wasm::MAX_STEP_ATTEMPTS,
            "source={source:?} took {attempt} attempts to escape"
        );
    }
}

/// `play_step` always starts a step at attempt zero, so the attempt counter
/// the gate reads is threaded in here rather than replayed through
/// `RetryChunk` — the property under test is the gate's arithmetic, not the
/// command that re-arms it.
fn replay_attempts(core: &leetype_wasm::TypingGameCore, attempt: usize, at: f64) -> Progression {
    leetype_wasm::progression(core.snapshot(at).weighted_wpm, attempt, baseline(90.0))
}

#[test]
fn a_fast_accurate_run_opens_the_gate_and_a_slow_one_does_not() {
    let config = baseline(60.0);
    let source = "map.entry(key).or_insert_with(Vec::new);";

    let (fast_frames, fast) = support::play_step(source, Typist::steady(110.0), config, 21, 120_000.0);
    let (slow_frames, slow) = support::play_step(source, Typist::steady(10.0), config, 21, 300_000.0);

    // Read the gate at the moment the step finished, not at the clock budget:
    // weighted WPM is a rate, and asking a rate about time the player was not
    // typing in would answer a different question.
    assert_eq!(fast.progression(finished_at(&fast_frames)), Progression::Advance);
    assert_eq!(slow.progression(finished_at(&slow_frames)), Progression::Repeat);
}

/// When the last observed frame was taken — the step's completion time, for
/// a run that completed.
fn finished_at(frames: &[Frame]) -> f64 {
    frames.last().map_or(0.0, |frame| frame.now)
}
