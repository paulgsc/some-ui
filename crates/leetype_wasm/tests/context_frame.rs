//! F4: reveal sufficiency for `Role::Context`, proved without a DOM.
//!
//! The epic's stated hazard is specific: model the frame as typeable slots
//! that start pre-revealed, and `weightedWpm` — the only figure the gate
//! reads — silently stops measuring anything, with no failing test and no
//! visible symptom short of "the rail says escaped a lot" (see
//! `crates/leetype_wasm/src/leetype/program.rs`'s `Role` docs). A frame that
//! is genuinely a third role rather than a pre-reveal cannot do that,
//! because it never owns a slot in the first place — so every figure the
//! gate reads is structurally blind to it.
//!
//! What follows proves that blindness directly: the same player, typing the
//! same keystrokes at the same times, against a source and a
//! context-wrapped version of the same source, must produce identical
//! numbers everywhere except the purely cosmetic display-index fields a
//! longer rendered string necessarily shifts.

mod support;

use leetype_wasm::{Command, RevealConfig, Snapshot};
use support::Player;

/// Two sources whose typeable stream is character-for-character identical,
/// one with an added leading context frame. Any test in this file that
/// leans on this pairing re-asserts the streams match before drawing any
/// conclusion from the numbers, so a mistake in the fixture itself fails
/// loudly rather than quietly validating nothing.
const BARE: &str = "fn area(width: u32, height: u32) -> u32 {\n    width * height\n}";
const FRAMED: &str = "‹the function computes the rectangle's area›\nfn area(width: u32, height: u32) -> u32 {\n    width * height\n}";

fn assert_same_typeable_stream() -> Vec<char> {
    let stream = Player::token_stream(BARE);
    assert_eq!(stream, Player::token_stream(FRAMED), "fixture invalid: BARE and FRAMED must demand the same keystrokes");
    stream.chars().collect()
}

/// Every field of [`Snapshot`] the gate, the HUD or the reveal loop reads —
/// everything except `cursor_display` and `cursor_section`, which are
/// display-index projections that a longer rendered string necessarily
/// shifts and which nothing downstream of the gate consults.
fn assert_gate_relevant_figures_agree(bare: &Snapshot, framed: &Snapshot, context: &str) {
    assert_eq!(bare.cursor_slot, framed.cursor_slot, "{context}: cursor_slot");
    assert_eq!(bare.slot_count, framed.slot_count, "{context}: slot_count");
    assert_eq!(bare.filled, framed.filled, "{context}: filled");
    assert_eq!(bare.correct, framed.correct, "{context}: correct");
    assert_eq!(bare.first_gap_slot, framed.first_gap_slot, "{context}: first_gap_slot");
    assert!(
        (bare.progress - framed.progress).abs() < 1e-9,
        "{context}: progress {} vs {}",
        bare.progress,
        framed.progress
    );
    assert!(
        (bare.accuracy - framed.accuracy).abs() < 1e-9,
        "{context}: accuracy {} vs {}",
        bare.accuracy,
        framed.accuracy
    );
    assert_eq!(bare.wpm, framed.wpm, "{context}: wpm");
    assert!(
        (bare.instant_wpm - framed.instant_wpm).abs() < 1e-9,
        "{context}: instant_wpm {} vs {}",
        bare.instant_wpm,
        framed.instant_wpm
    );
    assert!(
        (bare.weighted_wpm - framed.weighted_wpm).abs() < 1e-9,
        "{context}: weighted_wpm {} vs {} — the one figure the gate reads must not move",
        bare.weighted_wpm,
        framed.weighted_wpm
    );
    assert!((bare.gate_threshold - framed.gate_threshold).abs() < 1e-9, "{context}: gate_threshold");
    assert_eq!(bare.attempt, framed.attempt, "{context}: attempt");
    assert_eq!(bare.reveal_k, framed.reveal_k, "{context}: reveal_k");
    assert_eq!(bare.run_count, framed.run_count, "{context}: run_count — context must not add or remove a reveal unit");
    assert_eq!(bare.assisted, framed.assisted, "{context}: assisted — context is never assistance");
    assert_eq!(bare.total_errors, framed.total_errors, "{context}: total_errors");
    assert_eq!(bare.consecutive_errors, framed.consecutive_errors, "{context}: consecutive_errors");
    assert_eq!(bare.show_error_alert, framed.show_error_alert, "{context}: show_error_alert");
    assert_eq!(bare.is_complete, framed.is_complete, "{context}: is_complete");
}

#[test]
fn context_changes_no_figure_the_gate_reads() {
    let stream = assert_same_typeable_stream();

    let mut bare = Player::start(BARE, Some(5));
    let mut framed = Player::start(FRAMED, Some(5));

    for (index, &key) in stream.iter().enumerate() {
        bare.advance_clock(80.0);
        framed.advance_clock(80.0);

        // A deliberate mistake and its correction partway through, so
        // total_errors, consecutive_errors and the assistance discount are
        // all actually exercised rather than trivially zero.
        if index == 3 {
            let wrong = if key == 'q' { 'z' } else { 'q' };
            bare.press(wrong);
            framed.press(wrong);
            bare.advance_clock(50.0);
            framed.advance_clock(50.0);
            bare.send(&Command::Backspace);
            framed.send(&Command::Backspace);
        }

        bare.press(key);
        framed.press(key);

        assert_gate_relevant_figures_agree(&bare.snapshot(), &framed.snapshot(), &format!("after keystroke {index}"));
    }

    let bare_snapshot = bare.snapshot();
    let framed_snapshot = framed.snapshot();
    assert!(bare_snapshot.is_complete, "the fixture should actually finish: {bare_snapshot:?}");
    assert!(framed_snapshot.is_complete, "the fixture should actually finish: {framed_snapshot:?}");
}

#[test]
fn context_is_never_assistance_even_once_the_reveal_window_is_fully_open() {
    // The hazard, stated as directly as it can be: let the reveal window
    // open all the way (the state a wrongly pre-revealed frame would be
    // permanently stuck in) and then type the step. If context slots
    // counted toward `assisted`, a longer context frame would inflate this
    // number relative to the same step without one. It must not, because
    // context never had a slot to be "shown" through in the first place.
    let stream = assert_same_typeable_stream();
    let config = RevealConfig {
        baseline_wpm: 60.0,
        dispersion_wpm: 8.0,
    };

    let (_, mut bare_core) = support::idle_step(BARE, config, 60, 500.0);
    let (_, mut framed_core) = support::idle_step(FRAMED, config, 60, 500.0);

    assert!(bare_core.visibility_codes().iter().all(|&code| code == 1), "bare should be fully revealed by now");
    assert!(framed_core.visibility_codes().iter().all(|&code| code == 1), "framed should be fully revealed by now");

    let mut now = 60.0 * 500.0;
    for &key in &stream {
        now += 80.0;
        bare_core.dispatch(&Command::Press { key }, now);
        framed_core.dispatch(&Command::Press { key }, now);
    }

    let bare_snapshot = bare_core.snapshot(now);
    let framed_snapshot = framed_core.snapshot(now);

    assert_eq!(bare_snapshot.correct, framed_snapshot.correct);
    assert_eq!(
        bare_snapshot.assisted, framed_snapshot.assisted,
        "a longer context frame must not inflate assisted: bare={} framed={}",
        bare_snapshot.assisted, framed_snapshot.assisted
    );
    assert!(
        (bare_snapshot.weighted_wpm - framed_snapshot.weighted_wpm).abs() < 1e-9,
        "weighted_wpm diverged under full reveal: bare={} framed={}",
        bare_snapshot.weighted_wpm,
        framed_snapshot.weighted_wpm
    );
}

#[test]
fn every_frame_of_a_simulated_run_agrees_between_bare_and_framed() {
    // The property version of the test above: not one snapshot at the end,
    // but every observation across a whole simulated timeline, for several
    // players. `Frame` carries only slot-indexed and count fields (no
    // display index), so an exact match here is the strongest form of "the
    // reveal loop cannot tell a context frame is there".
    let config = RevealConfig {
        baseline_wpm: 60.0,
        dispersion_wpm: 8.0,
    };
    let typists = [
        support::Typist::steady(45.0),
        support::Typist::steady(45.0).with_jitter(0.6),
        support::Typist::steady(20.0).with_hesitations(0.25, 3_000.0),
        support::Typist::steady(90.0).with_errors(0.25),
    ];

    for (index, typist) in typists.iter().enumerate() {
        let seed = 1_000 + index as u64;
        let (bare_frames, _) = support::play_step(BARE, *typist, config, seed, 60_000.0);
        let (framed_frames, _) = support::play_step(FRAMED, *typist, config, seed, 60_000.0);

        assert_eq!(bare_frames.len(), framed_frames.len(), "typist {index}: timelines diverged in length");

        for (frame_index, (bare_frame, framed_frame)) in bare_frames.iter().zip(framed_frames.iter()).enumerate() {
            assert!((bare_frame.now - framed_frame.now).abs() < 1e-9, "typist {index} frame {frame_index}: clock diverged");
            assert_eq!(bare_frame.cursor_slot, framed_frame.cursor_slot, "typist {index} frame {frame_index}: cursor_slot");
            assert_eq!(bare_frame.reveal_k, framed_frame.reveal_k, "typist {index} frame {frame_index}: reveal_k");
            assert_eq!(bare_frame.run_count, framed_frame.run_count, "typist {index} frame {frame_index}: run_count");
            assert_eq!(bare_frame.visibility, framed_frame.visibility, "typist {index} frame {frame_index}: visibility");
        }
    }
}

#[test]
fn the_gates_progression_verdict_is_unchanged_by_a_context_frame() {
    // A slow-enough player misses the gate on both; a fast-enough one clears
    // it on both. The verdict `progression()` reaches is the thing every
    // other test in this file is ultimately in service of.
    let config = RevealConfig {
        baseline_wpm: 60.0,
        dispersion_wpm: 8.0,
    };

    let (bare_slow_frames, bare_slow) = support::play_step(BARE, support::Typist::steady(10.0), config, 7, 300_000.0);
    let (framed_slow_frames, framed_slow) = support::play_step(FRAMED, support::Typist::steady(10.0), config, 7, 300_000.0);
    let bare_slow_end = bare_slow_frames.last().map_or(0.0, |frame| frame.now);
    let framed_slow_end = framed_slow_frames.last().map_or(0.0, |frame| frame.now);

    assert_eq!(
        leetype_wasm::progression(bare_slow.snapshot(bare_slow_end).weighted_wpm, 0, config),
        leetype_wasm::progression(framed_slow.snapshot(framed_slow_end).weighted_wpm, 0, config),
    );

    let (bare_fast_frames, bare_fast) = support::play_step(BARE, support::Typist::steady(110.0), config, 7, 120_000.0);
    let (framed_fast_frames, framed_fast) = support::play_step(FRAMED, support::Typist::steady(110.0), config, 7, 120_000.0);
    let bare_fast_end = bare_fast_frames.last().map_or(0.0, |frame| frame.now);
    let framed_fast_end = framed_fast_frames.last().map_or(0.0, |frame| frame.now);

    assert_eq!(
        leetype_wasm::progression(bare_fast.snapshot(bare_fast_end).weighted_wpm, 0, config),
        leetype_wasm::progression(framed_fast.snapshot(framed_fast_end).weighted_wpm, 0, config),
        "a fast, accurate run should clear the gate the same way with or without a context frame"
    );
}
