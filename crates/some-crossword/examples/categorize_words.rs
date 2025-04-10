use some_crossword::CrosswordGenerator;

fn main() {
    let words = vec![
        "rust".to_string(),
        "programming".to_string(),
        "language".to_string(),
        "crossword".to_string(),
        "puzzle".to_string(),
        "algorithm".to_string(),
        "generator".to_string(),
    ];

    let generator = CrosswordGenerator::new(words, 4);
    let (isolated_words, intersection_map) = generator.generate_internal();
    println!("isolated: {:?}", isolated_words);
    println!("map: {:?}", intersection_map);
}
