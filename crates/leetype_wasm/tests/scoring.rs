//! Errors, the consecutive-error ceiling, backspacing, and the numbers the
//! HUD reads.

mod support;

use leetype_wasm::{Command, Rejection};
use support::Player;

const SOURCE: &str = "fn solve() {\n    total()\n}\n";

#[test]
fn a_clean_run_scores_perfectly() {
    let stream = Player::token_stream(SOURCE);
    let mut player = Player::start(SOURCE, None);
    player.advance_clock(60_000.0).type_text(&stream);

    let snapshot = player.snapshot();
    assert!(snapshot.is_complete);
    assert!((snapshot.accuracy - 100.0).abs() < f64::EPSILON);
    assert!((snapshot.progress - 100.0).abs() < f64::EPSILON);
    assert_eq!(snapshot.total_errors, 0);
    assert_eq!(snapshot.correct, snapshot.slot_count);
    assert!((snapshot.elapsed_time - 60.0).abs() < f64::EPSILON);
}

#[test]
fn progress_tracks_correct_slots_not_keystrokes() {
    let mut player = Player::start("abcd", None);
    player.type_text("ab");
    assert!((player.snapshot().progress - 50.0).abs() < f64::EPSILON);

    // A wrong key fills a slot but does not advance progress.
    player.press('z');
    assert!((player.snapshot().progress - 50.0).abs() < f64::EPSILON);
    assert_eq!(player.snapshot().filled, 3);
}

#[test]
fn accuracy_remembers_mistakes_that_were_corrected() {
    let mut player = Player::start("abcd", None);
    player.type_text("abz");
    player.send(&Command::Backspace);
    player.type_text("cd");

    let snapshot = player.snapshot();
    assert!(snapshot.is_complete);
    assert_eq!(snapshot.total_errors, 1);
    assert!((snapshot.accuracy - 80.0).abs() < f64::EPSILON);
}

#[test]
fn the_ceiling_blocks_input_until_the_streak_is_backspaced_away() {
    let mut player = Player::start("abcdefgh", Some(3));
    player.type_text("xyz");

    let snapshot = player.snapshot();
    assert_eq!(snapshot.consecutive_errors, 3);
    assert!(snapshot.show_error_alert);

    let blocked = player.press('q');
    assert_eq!(blocked.rejection, Some(Rejection::ErrorCeiling));
    assert_eq!(blocked.snapshot.total_errors, 3);

    player.send(&Command::Backspace);
    assert!(player.press('c').accepted);
}

#[test]
fn dismissing_the_alert_survives_until_the_streak_breaks() {
    let mut player = Player::start("abcdefgh", Some(2));
    player.type_text("xy");
    assert!(player.snapshot().show_error_alert);

    player.send(&Command::DismissAlert);
    assert!(!player.snapshot().show_error_alert);

    // Still blocked — dismissing hides the banner, it doesn't forgive.
    assert_eq!(player.press('q').rejection, Some(Rejection::ErrorCeiling));

    player.send(&Command::Backspace);
    player.send(&Command::Backspace);
    assert_eq!(player.snapshot().consecutive_errors, 0);
    assert!(!player.snapshot().show_error_alert);
}

#[test]
fn backspacing_past_the_start_is_a_no_op() {
    let mut player = Player::start("abc", None);
    for _ in 0..5 {
        player.send(&Command::Backspace);
    }
    assert_eq!(player.snapshot().cursor_slot, 0);
    assert_eq!(player.snapshot().filled, 0);
}

#[test]
fn backspacing_a_correct_slot_reopens_it() {
    let mut player = Player::start("abc", None);
    player.type_text("abc");
    assert!(player.snapshot().is_complete);

    player.send(&Command::Backspace);
    let snapshot = player.snapshot();
    assert!(!snapshot.is_complete);
    assert_eq!(snapshot.first_gap_slot, Some(2));
    assert_eq!(snapshot.correct, 2);
}

#[test]
fn wpm_counts_correct_characters_over_elapsed_minutes() {
    let source = "x".repeat(300);
    let mut player = Player::start(&source, None);
    player.advance_clock(60_000.0).type_text(&source);

    // 300 correct chars = 60 words in one minute.
    assert_eq!(player.snapshot().wpm, 60);
}

#[test]
fn the_clock_stays_still_until_the_run_starts() {
    let core = leetype_wasm::TypingGameCore::new(SOURCE, None, None);
    let snapshot = core.snapshot(60_000.0);
    assert!(!snapshot.started);
    assert!((snapshot.elapsed_time - 0.0).abs() < f64::EPSILON);
    assert_eq!(snapshot.wpm, 0);
}

#[test]
fn slot_status_marks_correct_wrong_and_untouched_slots() {
    let mut player = Player::start("abcd", None);
    player.type_text("az");

    let status = player.core().slot_status_codes();
    assert_eq!(status, vec![1, 2, 0, 0]);
}
