use rand::{prelude::*, rngs::ThreadRng};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

// Main struct that will be exposed to JavaScript
#[wasm_bindgen]
pub struct CrosswordGenerator {
    words: Vec<String>,
    max_group_size: usize,
    grid: Vec<Vec<char>>,
    width: usize,
    height: usize,
    word_positions: Vec<WordPlacement>,
    rng: ThreadRng,
}

// Make a Serialize and Deserialize version of WordPlacement for JS interop
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordPlacement {
    word: String,
    start_x: usize,
    start_y: usize,
    is_across: bool,
    group_id: Option<usize>,
    clue_num: i8,
}

#[derive(Debug, PartialEq, Eq, Hash, Clone)]
struct Position {
    x: usize,
    y: usize,
}

// JavaScript-compatible result type
#[wasm_bindgen]
#[derive(Serialize, Deserialize)]
pub struct CrosswordResult {
    grid: Vec<String>,
    width: usize,
    height: usize,
    #[serde(rename = "wordPlacements")]
    word_placements: Vec<JsWordPlacement>,
}

// JavaScript-friendly word placement
#[wasm_bindgen]
#[derive(Serialize, Deserialize)]
pub struct JsWordPlacement {
    word: String,
    #[serde(rename = "startX")]
    start_x: usize,
    #[serde(rename = "startY")]
    start_y: usize,
    #[serde(rename = "isAcross")]
    is_across: bool,
    #[serde(rename = "groupId")]
    group_id: Option<usize>,
    #[serde(rename = "clueNum")]
    clue_num: i8,
}

// Implementation for JavaScript exports
#[wasm_bindgen]
impl CrosswordGenerator {
    // Constructor exposed to JavaScript
    #[wasm_bindgen(constructor)]
    pub fn new_from_js(words_js: JsValue, max_group_size: usize) -> Result<CrosswordGenerator, JsValue> {
        // Set up panic hook for better error messages
        console_error_panic_hook::set_once();

        // Convert JS array of strings to Rust Vec<String>
        let words: Vec<String> = serde_wasm_bindgen::from_value(words_js).map_err(|e| JsValue::from_str(&format!("Failed to parse words: {}", e)))?;

        // Use the core implementation
        Self::create(words, max_group_size).map_err(|e| JsValue::from_str(&e))
    }

    // Generate the crossword and return a result object for JavaScript
    #[wasm_bindgen]
    pub fn generate(&mut self) -> Result<JsValue, JsValue> {
        match self.generate_internal() {
            Ok(_) => {
                // Convert grid to row strings for easier JS handling
                let grid_strings: Vec<String> = self.grid.iter().map(|row| row.iter().collect()).collect();

                // Convert word placements to JS-friendly format
                let js_placements: Vec<JsWordPlacement> = self
                    .word_positions
                    .iter()
                    .map(|p| JsWordPlacement {
                        word: p.word.clone(),
                        start_x: p.start_x,
                        start_y: p.start_y,
                        is_across: p.is_across,
                        group_id: p.group_id,
                        clue_num: p.clue_num,
                    })
                    .collect();

                // Create result object
                let result = CrosswordResult {
                    grid: grid_strings,
                    width: self.width,
                    height: self.height,
                    word_placements: js_placements,
                };

                // Convert to JS value
                Ok(serde_wasm_bindgen::to_value(&result).map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))?)
            }
            Err(msg) => Err(JsValue::from_str(&msg)),
        }
    }
}

// Private implementation methods not exposed to JS
impl CrosswordGenerator {
    pub fn new(words: Vec<String>, max_group_size: usize) -> Result<Self, String> {
        Self::create(words, max_group_size)
    }

    // Internal constructor that both implementations can use
    fn create(words: Vec<String>, max_group_size: usize) -> Result<Self, String> {
        // Ensure uniqueness and normalize to lowercase
        let normalized_words: Vec<String> = words.into_iter().map(|w| w.to_lowercase()).collect::<HashSet<_>>().into_iter().collect();

        if normalized_words.is_empty() {
            return Err("No valid words provided".to_string());
        }

        // Determine maximum word length to help with grid sizing
        let max_word_length = normalized_words.iter().map(|word| word.len()).max().unwrap_or(0);

        // Initialize grid with reasonable size
        let initial_size = max_word_length * 3;
        let grid = vec![vec![' '; initial_size]; initial_size];

        Ok(Self {
            words: normalized_words,
            max_group_size,
            grid,
            width: initial_size,
            height: initial_size,
            word_positions: Vec::new(),
            rng: rand::rng(),
        })
    }

    // Categorize words based on shared letters
    fn categorize_words(&self) -> (Vec<String>, Vec<String>) {
        let mut letter_word_map: HashMap<char, Vec<String>> = HashMap::new();

        // Build a map of letters to words containing them
        for word in &self.words {
            let chars: HashSet<char> = word.chars().collect();

            for &c in &chars {
                letter_word_map.entry(c).or_insert_with(Vec::new).push(word.clone());
            }
        }

        // Find words with unique letters (those that can't intersect)
        let mut isolated_words = Vec::new();
        let mut shared_words = Vec::new();

        for word in &self.words {
            let mut can_intersect = false;

            for c in word.chars() {
                let words_with_letter = letter_word_map.get(&c).unwrap();
                if words_with_letter.len() > 1 {
                    can_intersect = true;
                    break;
                }
            }

            if can_intersect {
                shared_words.push(word.clone());
            } else {
                isolated_words.push(word.clone());
            }
        }

        (shared_words, isolated_words)
    }

    // Find potential intersections between a new word and existing words
    fn find_intersections(&self, word: &str) -> Vec<(usize, usize, usize, usize, bool)> {
        let mut intersections = Vec::new();

        // For each existing word placement
        for placement in &self.word_positions {
            let existing_word = &placement.word;

            // Find shared letters
            for (i, c1) in word.chars().enumerate() {
                for (j, c2) in existing_word.chars().enumerate() {
                    if c1 == c2 {
                        // Calculate intersection point
                        let (x, y) = if placement.is_across {
                            (placement.start_x + j, placement.start_y)
                        } else {
                            (placement.start_x, placement.start_y + j)
                        };

                        // New word direction should be perpendicular to existing word
                        let is_across = !placement.is_across;

                        // Calculate starting position of new word
                        let (start_x, start_y) = if is_across { (x.saturating_sub(i), y) } else { (x, y.saturating_sub(i)) };

                        intersections.push((start_x, start_y, i, j, is_across));
                    }
                }
            }
        }

        intersections
    }

    // Check if a word placement would cause rule violations
    fn is_valid_placement(&self, word: &str, start_x: usize, start_y: usize, is_across: bool) -> bool {
        // Check boundaries
        let end_x = if is_across { start_x + word.len() - 1 } else { start_x };
        let end_y = if is_across { start_y } else { start_y + word.len() - 1 };

        if end_x >= self.width || end_y >= self.height {
            return false;
        }

        // Track which positions are intersections with existing words
        let mut intersections = HashSet::new();
        let word_chars: Vec<char> = word.chars().collect();

        // Check each position of the new word
        for i in 0..word.len() {
            let x = if is_across { start_x + i } else { start_x };
            let y = if is_across { start_y } else { start_y + i };
            let current_char = word_chars[i];

            // If position is not empty, check for valid intersection
            if self.grid[y][x] != ' ' {
                if self.grid[y][x] != current_char {
                    return false; // Conflict with existing character
                }
                intersections.insert(Position { x, y });
            }
        }

        // Check for adjacent words (not allowed except at intersections)
        for i in 0..word.len() {
            let x = if is_across { start_x + i } else { start_x };
            let y = if is_across { start_y } else { start_y + i };
            let pos = Position { x, y };

            // Skip intersection points
            if intersections.contains(&pos) {
                continue;
            }

            // Check surrounding positions (excluding diagonals)
            let check_positions = [
                (x.saturating_sub(1), y), // Left
                (x + 1, y),               // Right
                (x, y.saturating_sub(1)), // Up
                (x, y + 1),               // Down
            ];

            for (adj_x, adj_y) in check_positions {
                if adj_x < self.width && adj_y < self.height {
                    let adj_pos = Position { x: adj_x, y: adj_y };

                    // If adjacent position has a character and is not part of this word
                    // and is not an intersection point, it's an invalid adjacency
                    if self.grid[adj_y][adj_x] != ' ' && !intersections.contains(&adj_pos) {
                        let is_part_of_word = if is_across {
                            adj_y == y && (adj_x >= start_x && adj_x <= start_x + word.len() - 1)
                        } else {
                            adj_x == x && (adj_y >= start_y && adj_y <= start_y + word.len() - 1)
                        };

                        if !is_part_of_word {
                            return false;
                        }
                    }
                }
            }
        }

        true
    }

    // Find the group ID for a word placement
    fn find_group_id(&self, start_x: usize, start_y: usize, is_across: bool, word_len: usize) -> Option<usize> {
        let mut connected_groups = HashSet::new();

        for i in 0..word_len {
            let x = if is_across { start_x + i } else { start_x };
            let y = if is_across { start_y } else { start_y + i };

            // If this position intersects with another word
            if self.grid[y][x] != ' ' {
                // Find which word placement this is
                for placement in &self.word_positions {
                    if placement.group_id.is_some() {
                        let in_placement_range = if placement.is_across {
                            y == placement.start_y && x >= placement.start_x && x < placement.start_x + placement.word.len()
                        } else {
                            x == placement.start_x && y >= placement.start_y && y < placement.start_y + placement.word.len()
                        };

                        if in_placement_range {
                            connected_groups.insert(placement.group_id.unwrap());
                            break;
                        }
                    }
                }
            }
        }

        // If no connected groups, return None (will become a new group)
        if connected_groups.is_empty() {
            return None;
        }

        // Return the lowest group ID (this is arbitrary but consistent)
        connected_groups.iter().min().cloned()
    }

    // Count words in a group
    fn count_words_in_group(&self, group_id: usize) -> usize {
        self.word_positions.iter().filter(|p| p.group_id == Some(group_id)).count()
    }

    // Place a word on the grid
    fn place_word(&mut self, word: &str, start_x: usize, start_y: usize, is_across: bool, group_id: Option<usize>, clue_num: i8) {
        let chars: Vec<char> = word.chars().collect();

        // Place word on grid
        for (i, &c) in chars.iter().enumerate() {
            let x = if is_across { start_x + i } else { start_x };
            let y = if is_across { start_y } else { start_y + i };

            self.grid[y][x] = c;
        }

        // Record the placement
        self.word_positions.push(WordPlacement {
            word: word.to_string(),
            start_x,
            start_y,
            is_across,
            group_id,
            clue_num,
        });
    }

    // Generate the crossword puzzle (internal implementation)
    pub fn generate_internal(&mut self) -> Result<(), String> {
        if self.words.is_empty() {
            return Err("No words provided".to_string());
        }

        // Resize grid to be square with side length of max word length * 3
        let max_word_len = self.words.iter().map(|w| w.len()).max().unwrap();
        let grid_size = max_word_len * 3;
        self.width = grid_size;
        self.height = grid_size;
        self.grid = vec![vec![' '; grid_size]; grid_size];

        let mut clue_num: i8 = 0;

        // Categorize words
        let (shared_words, isolated_words) = self.categorize_words();

        // Create sets to track remaining words
        let mut remaining_shared_words: HashSet<String> = shared_words.into_iter().collect();
        let mut remaining_isolated_words: HashSet<String> = isolated_words.into_iter().collect();

        // Place first word in center (preferably from shared_words)
        let mut group_counter = 0;
        let first_word = if !remaining_shared_words.is_empty() {
            let word = remaining_shared_words.iter().next().unwrap().clone();
            remaining_shared_words.remove(&word);
            word
        } else if !remaining_isolated_words.is_empty() {
            let word = remaining_isolated_words.iter().next().unwrap().clone();
            remaining_isolated_words.remove(&word);
            word
        } else {
            return Err("No valid words found".to_string());
        };

        let center = grid_size / 2;
        let is_across = self.rng.random_bool(0.5);
        let start_x = if is_across { center - first_word.len() / 2 } else { center };
        let start_y = if is_across { center } else { center - first_word.len() / 2 };

        clue_num += 1;
        self.place_word(&first_word, start_x, start_y, is_across, Some(group_counter), clue_num);
        group_counter += 1;

        // Try to place words with intersections first
        let mut attempts = 0;
        let max_attempts = self.words.len() * 10;

        // First, place shared words (that can intersect)
        while !remaining_shared_words.is_empty() && attempts < max_attempts {
            attempts += 1;

            // Select a word to place
            let next_word = {
                let mut candidates: Vec<String> = remaining_shared_words
                    .iter()
                    .filter(|w| {
                        // Check if word can intersect with any placed word
                        w.chars().any(|c| self.word_positions.iter().any(|p| p.word.contains(c)))
                    })
                    .cloned()
                    .collect();

                if candidates.is_empty() {
                    // Take any shared word if no good candidates
                    if let Some(word) = remaining_shared_words.iter().next() {
                        word.clone()
                    } else {
                        break;
                    }
                } else {
                    candidates.shuffle(&mut self.rng);
                    candidates[0].clone()
                }
            };

            // Find possible intersections
            let intersections = self.find_intersections(&next_word);

            if !intersections.is_empty() {
                // Try intersection placements in random order
                let mut shuffled_intersections = intersections.clone();
                shuffled_intersections.shuffle(&mut self.rng);

                let mut placed = false;

                for (start_x, start_y, _, _, is_across) in shuffled_intersections {
                    // Check if placement is valid
                    if self.is_valid_placement(&next_word, start_x, start_y, is_across) {
                        // Find which group this word would join
                        let group_id = self.find_group_id(start_x, start_y, is_across, next_word.len());

                        // Handle max group size constraint
                        let group_id = if let Some(id) = group_id {
                            if self.count_words_in_group(id) >= self.max_group_size {
                                // Group is full, create a new disconnected placement
                                continue;
                            }
                            Some(id)
                        } else {
                            // New disconnected word, create new group
                            let new_id = group_counter;
                            group_counter += 1;
                            Some(new_id)
                        };

                        // Place the word
                        clue_num += 1;
                        self.place_word(&next_word, start_x, start_y, is_across, group_id, clue_num);
                        remaining_shared_words.remove(&next_word);
                        placed = true;
                        break;
                    }
                }

                // If word couldn't be placed at any intersection
                if !placed {
                    // Try random placement as a last resort
                    clue_num += 1;
                    if self.try_random_placement(&next_word, &mut group_counter, clue_num) {
                        remaining_shared_words.remove(&next_word);
                    }
                }
            } else {
                // No intersections found, try random placement
                clue_num += 1;
                if self.try_random_placement(&next_word, &mut group_counter, clue_num) {
                    remaining_shared_words.remove(&next_word);
                }
            }
        }

        // Now place isolated words (preferably around edges)
        let edge_buffer = 1;
        let mut edge_y = edge_buffer;

        for isolated_word in remaining_isolated_words {
            if edge_y >= self.height - edge_buffer {
                break; // No more room for isolated words
            }

            // Place horizontally near the bottom edge
            let is_across = true;
            let start_x = edge_buffer;
            let start_y = self.height - edge_buffer - edge_y;

            if start_x + isolated_word.len() < self.width - edge_buffer && self.is_valid_placement(&isolated_word, start_x, start_y, is_across) {
                let new_id = group_counter;
                group_counter += 1;

                clue_num += 1;
                self.place_word(&isolated_word, start_x, start_y, is_across, Some(new_id), clue_num);
                edge_y += 2; // Move up for next placement
            }
        }

        // Compress grid to remove empty space
        self.compress_grid();

        Ok(())
    }

    // Try to place a word at a random position
    fn try_random_placement(&mut self, word: &str, group_counter: &mut usize, clue_num: i8) -> bool {
        let max_attempts = 100;

        for _ in 0..max_attempts {
            let is_across = self.rng.random_bool(0.5);
            let max_x = if is_across {
                self.width.saturating_sub(word.len())
            } else {
                self.width.saturating_sub(1)
            };
            let max_y = if is_across {
                self.height.saturating_sub(1)
            } else {
                self.height.saturating_sub(word.len())
            };

            if max_x == 0 || max_y == 0 {
                continue;
            }

            let start_x = self.rng.random_range(0..max_x);
            let start_y = self.rng.random_range(0..max_y);

            if self.is_valid_placement(word, start_x, start_y, is_across) {
                // New disconnected word
                let new_id = *group_counter;
                *group_counter += 1;

                self.place_word(word, start_x, start_y, is_across, Some(new_id), clue_num);
                return true;
            }
        }

        false
    }

    // Compress the grid by removing empty rows and columns
    fn compress_grid(&mut self) {
        if self.word_positions.is_empty() {
            return;
        }

        // Find the boundaries of the used area
        let mut min_x = self.width;
        let mut min_y = self.height;
        let mut max_x = 0;
        let mut max_y = 0;

        for placement in &self.word_positions {
            let end_x = if placement.is_across {
                placement.start_x + placement.word.len() - 1
            } else {
                placement.start_x
            };

            let end_y = if placement.is_across {
                placement.start_y
            } else {
                placement.start_y + placement.word.len() - 1
            };

            min_x = min_x.min(placement.start_x);
            min_y = min_y.min(placement.start_y);
            max_x = max_x.max(end_x);
            max_y = max_y.max(end_y);
        }

        // Add a border of one empty cell
        min_x = min_x.saturating_sub(1);
        min_y = min_y.saturating_sub(1);
        max_x = (max_x + 1).min(self.width - 1);
        max_y = (max_y + 1).min(self.height - 1);

        // Create the compressed grid
        let new_width = max_x - min_x + 1;
        let new_height = max_y - min_y + 1;
        let mut new_grid = vec![vec![' '; new_width]; new_height];

        // Copy the content
        for y in 0..new_height {
            for x in 0..new_width {
                new_grid[y][x] = self.grid[y + min_y][x + min_x];
            }
        }

        // Update word positions
        for placement in &mut self.word_positions {
            placement.start_x -= min_x;
            placement.start_y -= min_y;
        }

        // Update grid dimensions
        self.grid = new_grid;
        self.width = new_width;
        self.height = new_height;
    }

    pub fn display(&self) -> String {
        let mut result = String::new();

        // Add a horizontal ruler
        result.push_str(&format!("  "));
        for x in 0..self.width {
            result.push_str(&format!("{}", x % 10));
        }
        result.push('\n');

        // Add the grid content with row numbers
        for y in 0..self.height {
            result.push_str(&format!("{} ", y % 10));
            for x in 0..self.width {
                result.push(self.grid[y][x]);
            }
            result.push('\n');
        }

        // Add word placements information
        result.push_str("\nWord placements:\n");
        for placement in &self.word_positions {
            result.push_str(&format!(
                "{}. '{}' at ({},{}) {} (Group: {:?})\n",
                placement.clue_num,
                placement.word,
                placement.start_x,
                placement.start_y,
                if placement.is_across { "across" } else { "down" },
                placement.group_id
            ));
        }

        result
    }
}

// Initialize panic hook for better error messages
#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_categorize_words() {
        let words = vec!["cat".to_string(), "dog".to_string(), "bat".to_string(), "xyz".to_string()];
        let generator = CrosswordGenerator::new(words, 5);

        let (shared_words, isolated_words) = generator.categorize_words();

        // "cat" and "bat" share the letter 'a' and 't'
        // "dog" shares no letters with others
        // "xyz" shares no letters with others
        assert_eq!(shared_words.len(), 2);
        assert_eq!(isolated_words.len(), 2);

        // Check that "cat" and "bat" are in shared_words
        assert!(shared_words.contains(&"cat".to_string()));
        assert!(shared_words.contains(&"bat".to_string()));

        // Check that "dog" and "xyz" are in isolated_words
        assert!(isolated_words.contains(&"dog".to_string()));
        assert!(isolated_words.contains(&"xyz".to_string()));
    }

    #[test]
    fn test_empty_input() {
        let mut generator = CrosswordGenerator::new(vec![], 5).unwrap();
        let result = generator.generate_internal();
        assert!(result.is_err());
    }

    #[test]
    fn test_single_word() {
        let words = vec!["hello".to_string()];
        let mut generator = CrosswordGenerator::new(words, 5).unwrap();

        let result = generator.generate_internal();
        assert!(result.is_ok());

        let placements = generator.get_word_placements();
        assert_eq!(placements.len(), 1);
        assert_eq!(placements[0].word, "hello");
    }

    #[test]
    fn test_case_insensitivity() {
        let words = vec!["Hello".to_string(), "hello".to_string(), "HELLO".to_string()];
        let mut generator = CrosswordGenerator::new(words, 5).unwrap();

        let result = generator.generate_internal();
        assert!(result.is_ok());

        let placements = generator.get_word_placements();
        assert_eq!(placements.len(), 1); // Should deduplicate
    }

    #[test]
    fn test_intersecting_words() {
        let words = vec!["hello".to_string(), "world".to_string()];
        let mut generator = CrosswordGenerator::new(words, 5).unwrap();

        let result = generator.generate_internal();
        assert!(result.is_ok());

        // Both words should be placed
        let placements = generator.get_word_placements();
        assert_eq!(placements.len(), 2);

        // Words should have different orientations
        assert!(placements[0].is_across != placements[1].is_across);
    }

    #[test]
    fn test_max_group_size() {
        // Create words that all share common letters
        let words = vec!["apple".to_string(), "pear".to_string(), "plum".to_string(), "peach".to_string(), "apricot".to_string()];

        // Set max group size to 3
        let mut generator = CrosswordGenerator::new(words.clone(), 3).unwrap();

        let result = generator.generate_internal();
        assert!(result.is_ok());

        // Check that no group exceeds max size
        let placements = generator.get_word_placements();
        let mut group_sizes: HashMap<usize, usize> = HashMap::new();

        for placement in placements {
            if let Some(group_id) = placement.group_id {
                *group_sizes.entry(group_id).or_insert(0) += 1;
            }
        }

        for (_, size) in group_sizes {
            assert!(size <= 3);
        }
    }

    #[test]
    fn test_no_adjacent_words() {
        let words = vec!["hello".to_string(), "world".to_string()];
        let mut generator = CrosswordGenerator::new(words, 5).unwrap();

        let result = generator.generate_internal();
        assert!(result.is_ok());

        let grid = generator.get_grid();
        let placements = generator.get_word_placements();

        // Create a set of positions that are part of words
        let mut word_positions = HashSet::new();
        let mut intersection_positions = HashSet::new();

        for placement in placements {
            let word_len = placement.word.len();

            for i in 0..word_len {
                let x = if placement.is_across { placement.start_x + i } else { placement.start_x };

                let y = if placement.is_across { placement.start_y } else { placement.start_y + i };

                let pos = Position { x, y };

                if word_positions.contains(&pos) {
                    intersection_positions.insert(pos.clone());
                } else {
                    word_positions.insert(pos);
                }
            }
        }

        // Check that no word positions are adjacent unless at intersections
        for pos in &word_positions {
            if intersection_positions.contains(pos) {
                continue;
            }

            let adjacent_positions = [
                Position {
                    x: pos.x.saturating_sub(1),
                    y: pos.y,
                },
                Position { x: pos.x + 1, y: pos.y },
                Position {
                    x: pos.x,
                    y: pos.y.saturating_sub(1),
                },
                Position { x: pos.x, y: pos.y + 1 },
            ];

            for adj_pos in &adjacent_positions {
                if adj_pos.x >= generator.width || adj_pos.y >= generator.height {
                    continue;
                }

                // Skip if position is part of a word or empty
                if word_positions.contains(adj_pos) || grid[adj_pos.y][adj_pos.x] == ' ' {
                    continue;
                }

                // This would indicate an adjacent non-intersecting word
                panic!("Found adjacent word at ({}, {})", adj_pos.x, adj_pos.y);
            }
        }
    }

    #[test]
    fn test_isolated_word_placement() {
        // Create words where some share letters and some don't
        let words = vec![
            "apple".to_string(),  // shares letters
            "orange".to_string(), // shares letters
            "xyz".to_string(),    // isolated
            "qwerty".to_string(), // isolated
        ];

        let mut generator = CrosswordGenerator::new(words, 5).unwrap();
        let result = generator.generate_internal();
        assert!(result.is_ok());

        // Check that all words are placed
        let placements = generator.get_word_placements();
        assert_eq!(placements.len(), 4);

        // Verify that isolated words have their own group IDs
        let mut isolated_word_groups = HashSet::new();
        for placement in placements {
            if placement.word == "xyz" || placement.word == "qwerty" {
                isolated_word_groups.insert(placement.group_id);
            }
        }

        // Each isolated word should be in its own group
        assert_eq!(isolated_word_groups.len(), 2);
    }
}
