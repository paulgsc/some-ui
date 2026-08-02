//! The contract that makes the overlaid single-card layout bearable: the
//! caret sits on the exact character the player owes a keystroke for, and
//! layout whitespace is the machine's problem, not theirs.

mod support;

use leetype_wasm::{Command, Rejection, TypingGameCore};
use support::Player;

const RUST_SOURCE: &str = "\
fn solve(input: &str) -> usize {
    let mut total = 0;
    for line in input.lines() {
        total += line.len();
    }
    total
}
";

#[test]
fn indentation_is_never_part_of_the_token_stream() {
    let stream = Player::token_stream(RUST_SOURCE);

    assert!(!stream.contains('\n'), "newlines leaked into the token stream");
    assert!(!stream.contains('\t'), "tabs leaked into the token stream");
    assert!(!stream.contains("  "), "an indentation run leaked into the token stream");
    assert!(stream.starts_with("fn solve(input: &str) -> usize {let mut total = 0;"));
}

#[test]
fn the_caret_only_ever_rests_on_a_typeable_character() {
    let mut player = Player::start(RUST_SOURCE, None);
    let roles = player.core().role_codes();
    let stream = Player::token_stream(RUST_SOURCE);

    for key in stream.chars() {
        let cursor = player.snapshot().cursor_display;
        assert_eq!(roles[cursor], 1, "caret parked on layout at display index {cursor}");
        assert!(player.press(key).accepted);
    }

    assert!(player.snapshot().is_complete);
    // Finished: the caret parks one past the last rendered character.
    assert_eq!(player.snapshot().cursor_display, RUST_SOURCE.chars().count());
}

#[test]
fn the_caret_crosses_a_newline_and_its_indentation_in_one_keystroke() {
    let mut player = Player::start("fn a() {\n    b();\n}\n", None);
    player.type_text("fn a() {");

    // The '{' is display index 7; everything from 8 to 12 is the newline
    // plus four spaces of indentation, which the caret must have flown over.
    assert_eq!(player.snapshot().cursor_display, 13);
}

#[test]
fn a_second_space_bar_is_gated_rather_than_scored() {
    let mut player = Player::start(RUST_SOURCE, None);
    player.type_text("fn");

    // The single space between "fn" and "solve" is a real token.
    assert!(player.press(' ').accepted);

    // The next one is the old "match the indentation" reflex — refused,
    // caret unmoved, no error charged.
    let before = player.snapshot();
    let outcome = player.press(' ');
    assert!(!outcome.accepted);
    assert_eq!(outcome.rejection, Some(Rejection::ExtraSpace));
    assert_eq!(outcome.snapshot.cursor_slot, before.cursor_slot);
    assert_eq!(outcome.snapshot.total_errors, 0);
}

#[test]
fn enter_and_tab_are_ignored_instead_of_counted_as_mistakes() {
    let mut player = Player::start(RUST_SOURCE, None);
    player.type_text("fn solve(input: &str) -> usize {");

    for key in ['\n', '\r', '\t'] {
        let outcome = player.press(key);
        assert!(!outcome.accepted);
        assert_eq!(outcome.rejection, Some(Rejection::NotTypeable));
        assert_eq!(outcome.snapshot.total_errors, 0);
    }
}

#[test]
fn tabs_used_as_indentation_are_skipped_like_spaces() {
    assert_eq!(Player::token_stream("fn a() {\n\t\tb();\n}"), "fn a() {b();}");
}

#[test]
fn blank_lines_between_blocks_cost_nothing() {
    assert_eq!(Player::token_stream("a;\n\n\n\nb;"), "a;b;");
}

#[test]
fn the_role_map_lines_up_with_the_rendered_source() {
    let core = TypingGameCore::new(RUST_SOURCE, None, None);
    let roles = core.role_codes();
    let slots = core.slot_of_display_codes();

    assert_eq!(roles.len(), RUST_SOURCE.chars().count());
    assert_eq!(slots.len(), roles.len());

    let typeable = roles.iter().filter(|&&role| role == 1).count();
    assert_eq!(typeable, core.slot_count());

    for (index, &role) in roles.iter().enumerate() {
        assert_eq!(slots[index] >= 0, role == 1, "role/slot maps disagree at {index}");
    }
}

#[test]
fn a_source_that_is_only_whitespace_asks_for_nothing() {
    let mut core = TypingGameCore::new("   \n\t\n   ", None, None);
    let outcome = core.dispatch(&Command::Press { key: 'a' }, 0.0);

    assert_eq!(outcome.rejection, Some(Rejection::NothingPending));
    assert_eq!(outcome.snapshot.slot_count, 0);
    assert!(!outcome.snapshot.is_complete);
}
