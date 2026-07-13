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

    let mut generator = match CrosswordGenerator::new(words, 4) {
        Ok(generator) => generator,
        Err(e) => {
            println!("Failed to create generator: {}", e);
            return;
        }
    };

    match generator.generate() {
        Ok(_) => {
            println!("Crossword puzzle generated successfully!\n");
            println!("{}", generator.display());
        }
        Err(e) => {
            println!("Failed to generate crossword: {:?}", e);
        }
    }
}
