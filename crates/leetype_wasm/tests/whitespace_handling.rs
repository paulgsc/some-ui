use leetype_wasm::*;

#[test]
fn test_spaces_count_as_units() {
    let mut game = TypingGame::new("a b c", Some(10));
    game.start(1000.0);

    game.handle_input("a");
    game.handle_input("a "); // space after a
    game.handle_input("a b");
    game.handle_input("a b "); // space after b
    let _result: serde_json::Value = serde_wasm_bindgen::from_value(game.handle_input("a b c")).unwrap();

    let stats: serde_json::Value = serde_wasm_bindgen::from_value(game.get_stats(2000.0)).unwrap();
    assert_eq!(stats["is_complete"], true);
}

#[test]
fn test_wrong_whitespace_type() {
    let mut game = TypingGame::new("a\tb", Some(10));
    game.start(1000.0);

    // Type space instead of tab
    let result: serde_json::Value = serde_wasm_bindgen::from_value(game.handle_input("a ")).unwrap();

    // Separators should still match (both whitespace)
    assert_eq!(result["consecutive_errors"], 0);
}

#[test]
fn test_multiline_input() {
    let target = "line1\nline2\nline3";
    let mut game = TypingGame::new(target, Some(10));
    game.start(1000.0);

    game.handle_input("line1");
    game.handle_input("line1\n");
    game.handle_input("line1\nline2");
    game.handle_input("line1\nline2\n");
    game.handle_input("line1\nline2\nline3");

    let stats: serde_json::Value = serde_wasm_bindgen::from_value(game.get_stats(2000.0)).unwrap();
    assert_eq!(stats["is_complete"], true);
}
