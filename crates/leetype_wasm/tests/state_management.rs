use leetype_wasm::*;

#[test]
fn test_reset_clears_state() {
    let mut game = TypingGame::new("hello", Some(3));
    game.start(1000.0);

    game.handle_input("hx");
    game.handle_input("hxx");

    game.reset();

    assert_eq!(game.get_user_input(), "");
    let stats: serde_json::Value = serde_wasm_bindgen::from_value(game.get_stats(2000.0)).unwrap();
    assert_eq!(stats["total_errors"], 0);
    assert_eq!(stats["consecutive_errors"], 0);
}

#[test]
fn test_multiple_games_same_instance() {
    let mut game = TypingGame::new("hello", Some(3));

    // Game 1
    game.start(1000.0);
    game.handle_input("hello");
    let stats1: serde_json::Value = serde_wasm_bindgen::from_value(game.get_stats(2000.0)).unwrap();
    assert_eq!(stats1["is_complete"], true);

    // Reset and play again
    game.reset();
    game.start(3000.0);
    game.handle_input("hx");
    let stats2: serde_json::Value = serde_wasm_bindgen::from_value(game.get_stats(4000.0)).unwrap();
    assert_eq!(stats2["total_errors"], 1);
    assert_eq!(stats2["is_complete"], false);
}
