use leetype_wasm::*;

#[test]
fn test_completion_requires_exact_match() {
    let mut game = TypingGame::new("abc", Some(10));
    game.start(1000.0);

    game.handle_input("abx");
    let stats: serde_json::Value = serde_wasm_bindgen::from_value(game.get_stats(2000.0)).unwrap();
    assert_eq!(stats["is_complete"], false);

    // Fix it
    game.handle_input("ab");
    game.handle_input("abc");
    let stats: serde_json::Value = serde_wasm_bindgen::from_value(game.get_stats(2000.0)).unwrap();
    assert_eq!(stats["is_complete"], true);
}

#[test]
fn test_completion_with_whitespace() {
    let mut game = TypingGame::new("a b c", Some(10));
    game.start(1000.0);

    game.handle_input("a b c");
    let stats: serde_json::Value = serde_wasm_bindgen::from_value(game.get_stats(2000.0)).unwrap();
    assert_eq!(stats["is_complete"], true);
}
