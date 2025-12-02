use leetype_wasm::TypingGameCore;

#[test]
fn test_spaces_count_as_units() {
    let mut game = TypingGameCore::new("a b c", Some(10));
    game.start(1000.0);

    game.handle_input("a");
    game.handle_input("a "); // space after a
    game.handle_input("a b");
    game.handle_input("a b "); // space after b
    game.handle_input("a b c");

    let stats = game.get_stats(2000.0);
    assert_eq!(stats.is_complete, true, "Should complete with proper spaces");
}

#[test]
fn test_wrong_whitespace_type_normalized() {
    let mut game = TypingGameCore::new("a\tb", Some(10));
    game.start(1000.0);

    // Type space instead of tab - should still match (both whitespace)
    let result = game.handle_input("a ");
    assert_eq!(result.consecutive_errors, 0, "Space and tab should both normalize to whitespace");

    // Complete with space instead of tab
    let result = game.handle_input("a b");
    assert_eq!(result.consecutive_errors, 0);

    let stats = game.get_stats(2000.0);
    assert!(stats.is_complete, "Should complete with normalized whitespace");
}

#[test]
fn test_multiline_input() {
    let target = "line1\nline2\nline3";
    let mut game = TypingGameCore::new(target, Some(10));
    game.start(1000.0);

    game.handle_input("line1");
    game.handle_input("line1\n");
    game.handle_input("line1\nline2");
    game.handle_input("line1\nline2\n");
    game.handle_input("line1\nline2\nline3");

    let stats = game.get_stats(2000.0);
    assert_eq!(stats.is_complete, true, "Multiline input should complete correctly");
}

#[test]
fn test_mixed_whitespace_in_multiline() {
    let mut game = TypingGameCore::new("foo\nbar\nbaz", Some(10));
    game.start(1000.0);

    // Use different whitespace types - should still match
    let result = game.handle_input("foo bar baz");

    let stats = game.get_stats(2000.0);
    assert!(stats.is_complete, "Mixed whitespace types should normalize and complete");
    assert_eq!(result.consecutive_errors, 0);
}
