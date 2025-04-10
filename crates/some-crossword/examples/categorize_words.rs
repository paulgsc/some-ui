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

    let mut generator = CrosswordGenerator::new(words, 4).unwrap();
    let _ = generator.generate_internal();
    println!("{}", generator.display());
}
