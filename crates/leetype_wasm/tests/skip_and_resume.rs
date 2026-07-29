//! Skipping ahead to a section and coming back for what was left behind —
//! the engine half of the "jump to slot j" workflow the UI dresses up as
//! "skip this section / resume where I was".

mod support;

use leetype_wasm::{Command, TypingGameCore};
use support::Player;

const SOURCE: &str = "\
import { thing } from \"./thing\"

function first(a) {
    return a + 1
}

function second(b) {
    return b * 2
}
";

#[test]
fn sections_partition_the_whole_token_stream() {
    let core = TypingGameCore::new(SOURCE, None);
    let sections = core.layout().sections;

    assert_eq!(sections.len(), 3);
    assert_eq!(sections[0].start_slot, 0);
    assert_eq!(sections[2].end_slot, core.slot_count());

    for pair in sections.windows(2) {
        assert_eq!(pair[0].end_slot, pair[1].start_slot, "sections left a gap");
    }
    assert!(sections.iter().all(|section| section.end_slot > section.start_slot));
}

#[test]
fn section_labels_read_like_the_code_they_open() {
    let core = TypingGameCore::new(SOURCE, None);
    let labels: Vec<String> = core.layout().sections.into_iter().map(|section| section.label).collect();

    assert_eq!(labels, vec!["import { thing } from \"./thing\"", "function first(a) {", "function second(b) {"]);
}

#[test]
fn a_closing_brace_is_not_offered_as_its_own_section() {
    let core = TypingGameCore::new(SOURCE, None);
    assert!(core.layout().sections.iter().all(|section| section.label != "}"));
}

#[test]
fn skipping_a_section_leaves_earlier_work_untouched() {
    let mut player = Player::start(SOURCE, None);
    player.type_text("import");

    let target = player.core().layout().sections[2].start_slot;
    let outcome = player.send(&Command::JumpToSection { section: 2 });

    assert!(outcome.accepted);
    assert_eq!(outcome.snapshot.cursor_slot, target);
    assert_eq!(outcome.snapshot.cursor_section, Some(2));
    assert_eq!(outcome.snapshot.filled, 6);
    assert_eq!(outcome.snapshot.first_gap_slot, Some(6));
}

#[test]
fn typing_resumes_correctly_after_a_jump() {
    let mut player = Player::start(SOURCE, None);
    let target = player.core().layout().sections[1].start_slot;
    player.send(&Command::JumpToSection { section: 1 });
    player.type_text("function");

    let status = player.core().slot_status_codes();
    assert!(status[target..target + 8].iter().all(|&code| code == 1));
    assert!(status[..target].iter().all(|&code| code == 0));
}

#[test]
fn resume_goes_back_to_the_first_hole() {
    let mut player = Player::start(SOURCE, None);
    player.type_text("import");
    player.send(&Command::JumpToSection { section: 2 });
    player.type_text("function");

    let outcome = player.send(&Command::ResumeAtFirstGap);
    assert_eq!(outcome.snapshot.cursor_slot, 6);
    assert_eq!(outcome.snapshot.cursor_section, Some(0));
}

#[test]
fn running_off_the_end_with_a_hole_left_behind_resumes_instead_of_finishing() {
    let mut player = Player::start("abcdef", None);
    player.send(&Command::JumpToSlot { slot: 3 });
    player.type_text("def");

    let snapshot = player.snapshot();
    assert!(!snapshot.is_complete);
    assert_eq!(snapshot.cursor_slot, 0, "the caret should have come back for the hole");

    player.type_text("abc");
    assert!(player.snapshot().is_complete);
}

#[test]
fn section_progress_reports_each_section_independently() {
    let mut player = Player::start(SOURCE, None);
    player.type_text("import");
    player.send(&Command::JumpToSection { section: 2 });
    player.type_text("fun");

    let progress = player.core().section_progress();
    assert_eq!(progress.len(), 3);
    assert_eq!(progress[0].filled, 6);
    assert_eq!(progress[0].correct, 6);
    assert_eq!(progress[1].filled, 0);
    assert_eq!(progress[2].filled, 3);
    assert!(progress.iter().all(|entry| entry.slot_count > 0));
}

#[test]
fn a_jump_beyond_the_last_slot_clamps_to_the_end() {
    let mut player = Player::start("abc", None);
    let outcome = player.send(&Command::JumpToSlot { slot: 9_999 });
    assert_eq!(outcome.snapshot.cursor_slot, 3);
    assert_eq!(outcome.snapshot.cursor_section, None);
}

#[test]
fn a_jump_to_a_section_that_is_not_there_changes_nothing() {
    let mut player = Player::start(SOURCE, None);
    player.type_text("import");
    let before = player.snapshot();

    let outcome = player.send(&Command::JumpToSection { section: 42 });
    assert!(!outcome.accepted);
    assert_eq!(outcome.snapshot.cursor_slot, before.cursor_slot);
}

#[test]
fn chunk_hand_off_recompiles_the_program_and_keeps_the_totals() {
    let mut player = Player::start("abc", None);
    player.advance_clock(30_000.0).type_text("abc");

    let completed = player.send(&Command::CompleteChunk);
    let chunk = completed.chunk.unwrap();
    assert_eq!(chunk.chars_typed, 3);
    assert!((chunk.elapsed_time - 30.0).abs() < f64::EPSILON);

    player.send(&Command::StartNextChunk {
        source: "def\n    ghi".to_owned(),
    });

    let snapshot = player.snapshot();
    assert_eq!(snapshot.slot_count, 6);
    assert_eq!(snapshot.filled, 0);
    assert_eq!(snapshot.cursor_slot, 0);
    assert!(snapshot.started, "the clock must survive the chunk hand-off");
    assert_eq!(player.core().cumulative().chars_typed, 3);
}
