use leetype_wasm::TypingGameCore;

#[test]
fn test_initial_stats() {
    let game = TypingGameCore::new("hello", None);
    let stats = game.get_stats(1000.0);

    assert_eq!(stats.progress, 0.0);
    assert_eq!(stats.accuracy, 100.0);
    assert_eq!(stats.wpm, 0);
    assert_eq!(stats.elapsed_time, 0.0);
    assert_eq!(stats.total_errors, 0);
    assert_eq!(stats.consecutive_errors, 0);
    assert_eq!(stats.is_complete, false);
}

#[test]
fn test_progress_calculation() {
    let mut game = TypingGameCore::new("hello", None);
    game.start(1000.0);

    // Type "hel" (3 out of 5 chars)
    game.handle_input("hel");
    let stats = game.get_stats(1000.0);
    assert_eq!(stats.progress, 60.0); // 3/5 * 100

    // Type "hell" (4 out of 5 chars)
    game.handle_input("hell");
    let stats = game.get_stats(1000.0);
    assert_eq!(stats.progress, 80.0); // 4/5 * 100

    // Complete
    game.handle_input("hello");
    let stats = game.get_stats(1000.0);
    assert_eq!(stats.progress, 100.0); // 5/5 * 100
}

#[test]
fn test_accuracy_with_no_errors() {
    let mut game = TypingGameCore::new("hello", None);
    game.start(1000.0);

    game.handle_input("hello");
    let stats = game.get_stats(1000.0);

    assert_eq!(stats.accuracy, 100.0);
    assert_eq!(stats.total_errors, 0);
}

#[test]
fn test_accuracy_with_errors() {
    let mut game = TypingGameCore::new("hello", None);
    game.start(1000.0);

    // Type one wrong character
    game.handle_input("x");
    let stats = game.get_stats(1000.0);

    // 1 char typed, 1 error = 0% accuracy
    assert_eq!(stats.accuracy, 0.0);
    assert_eq!(stats.total_errors, 1);

    // Backspace and type correctly
    game.handle_input("");
    game.handle_input("h");
    let stats = game.get_stats(1000.0);

    // 2 chars typed total (x + h), 1 error = 50% accuracy
    assert_eq!(stats.accuracy, 50.0);
    assert_eq!(stats.total_errors, 1);
}

#[test]
fn test_wpm_calculation() {
    let mut game = TypingGameCore::new("hello world", None);
    game.start(1000.0);

    // Type 10 characters in 12 seconds (12000ms)
    game.handle_input("hello worl");
    let stats = game.get_stats(13000.0); // 12 seconds elapsed

    // 10 chars = 2 words (chars/5)
    // 2 words / 0.2 minutes = 10 wpm
    assert_eq!(stats.wpm, 10);
    assert_eq!(stats.elapsed_time, 12.0);
}

#[test]
fn test_wpm_with_zero_time() {
    let mut game = TypingGameCore::new("hello", None);
    game.start(1000.0);

    game.handle_input("hello");
    let stats = game.get_stats(1000.0); // Same timestamp = 0 elapsed

    assert_eq!(stats.wpm, 0);
    assert_eq!(stats.elapsed_time, 0.0);
}

#[test]
fn test_completion_detection() {
    let mut game = TypingGameCore::new("hi", None);
    game.start(1000.0);

    // Not complete yet
    game.handle_input("h");
    let stats = game.get_stats(1000.0);
    assert_eq!(stats.is_complete, false);

    // Complete
    game.handle_input("hi");
    let stats = game.get_stats(1000.0);
    assert_eq!(stats.is_complete, true);
}

#[test]
fn test_completion_requires_exact_match() {
    let mut game = TypingGameCore::new("hello", None);
    game.start(1000.0);

    // Wrong input, same length
    game.handle_input("hallo");
    let stats = game.get_stats(1000.0);
    assert_eq!(stats.is_complete, false);

    // Too long
    game.handle_input("helloo");
    let stats = game.get_stats(1000.0);
    assert_eq!(stats.is_complete, false);
}

#[test]
fn test_cursor_position() {
    let mut game = TypingGameCore::new("hello", None);
    game.start(1000.0);

    game.handle_input("hel");
    let stats = game.get_stats(1000.0);
    assert_eq!(stats.cursor, 3);

    game.handle_input("hello");
    let stats = game.get_stats(1000.0);
    assert_eq!(stats.cursor, 5);

    // Backspace
    game.handle_input("hell");
    let stats = game.get_stats(1000.0);
    assert_eq!(stats.cursor, 4);
}

#[test]
fn test_show_error_alert() {
    let mut game = TypingGameCore::new("hello", Some(2));
    game.start(1000.0);

    // No errors initially
    let stats = game.get_stats(1000.0);
    assert_eq!(stats.show_error_alert, false);

    // One error
    game.handle_input("x");
    let stats = game.get_stats(1000.0);
    assert_eq!(stats.consecutive_errors, 1);
    assert_eq!(stats.show_error_alert, false);

    // Two consecutive errors - should show alert
    game.handle_input("xy");
    let stats = game.get_stats(1000.0);
    assert_eq!(stats.consecutive_errors, 2);
    assert_eq!(stats.show_error_alert, true);
}

#[test]
fn test_reset_clears_all_state() {
    let mut game = TypingGameCore::new("hello", None);
    game.start(1000.0);

    // Make some progress with errors
    game.handle_input("x");
    game.handle_input("xy");
    game.handle_input("xyz");

    // Reset
    game.reset();
    let stats = game.get_stats(2000.0);

    assert_eq!(stats.progress, 0.0);
    assert_eq!(stats.accuracy, 100.0);
    assert_eq!(stats.wpm, 0);
    assert_eq!(stats.elapsed_time, 0.0);
    assert_eq!(stats.total_errors, 0);
    assert_eq!(stats.consecutive_errors, 0);
    assert_eq!(stats.cursor, 0);
    assert_eq!(stats.is_complete, false);
    assert_eq!(game.get_user_input(), "");
}

#[test]
fn test_start_resets_and_sets_timestamp() {
    let mut game = TypingGameCore::new("hello", None);

    // Make some progress
    game.start(1000.0);
    game.handle_input("he");

    // Start again with new timestamp
    game.start(5000.0);
    let stats = game.get_stats(5000.0);

    // Should be reset
    assert_eq!(stats.progress, 0.0);
    assert_eq!(stats.elapsed_time, 0.0);
    assert_eq!(game.get_user_input(), "");
}

#[test]
fn test_whitespace_handling_in_progress() {
    let mut game = TypingGameCore::new("hello world", None);
    game.start(1000.0);

    // Type "hello " (with space)
    game.handle_input("hello ");
    let stats = game.get_stats(1000.0);

    // Should count both "hello" and the separator as units
    // Target: h e l l o [sep] w o r l d = 11 units
    // Typed: h e l l o [sep] = 6 units
    assert_eq!(stats.progress, (6.0 / 11.0) * 100.0);
}

#[test]
fn test_error_tracking_persists_after_backspace() {
    let mut game = TypingGameCore::new("hello", None);
    game.start(1000.0);

    // Type wrong character
    game.handle_input("x");
    let stats = game.get_stats(1000.0);
    assert_eq!(stats.total_errors, 1);

    // Backspace - total_errors should persist
    game.handle_input("");
    let stats = game.get_stats(1000.0);
    assert_eq!(stats.total_errors, 1);
    assert_eq!(stats.consecutive_errors, 0);
}

#[test]
fn test_multiple_errors_accumulate() {
    let mut game = TypingGameCore::new("hello", None);
    game.start(1000.0);

    // Make multiple mistakes
    game.handle_input("x"); // 1 error
    game.handle_input(""); // backspace
    game.handle_input("y"); // 2 errors
    game.handle_input(""); // backspace
    game.handle_input("z"); // 3 errors

    let stats = game.get_stats(1000.0);
    assert_eq!(stats.total_errors, 3);
}

#[test]
fn test_accuracy_floor_at_zero() {
    let mut game = TypingGameCore::new("a", None);
    game.start(1000.0);

    // Type 5 wrong characters (more errors than chars)
    game.handle_input("x");
    game.handle_input("xy");
    game.handle_input("xyz");
    game.handle_input("xyza");
    game.handle_input("xyzab");

    let stats = game.get_stats(1000.0);
    // Accuracy should be at least 0.0, not negative
    assert!(stats.accuracy >= 0.0);
}
