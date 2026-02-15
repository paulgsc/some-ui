#!/bin/bash
# Setup script for Virtual Package Manager project

set -e

echo "🚀 Virtual Package Manager - Setup Script"
echo "=========================================="
echo

# Check for required tools
check_tool() {
    if command -v $1 &> /dev/null; then
        echo "✓ $1 is installed"
        return 0
    else
        echo "✗ $1 is not installed"
        return 1
    fi
}

echo "Checking prerequisites..."
check_tool git || { echo "Please install Git first"; exit 1; }

# Check for Rust or C compiler
if check_tool rustc && check_tool cargo; then
    LANG="rust"
    echo "→ Using Rust"
elif check_tool gcc || check_tool clang; then
    LANG="c"
    echo "→ Using C"
else
    echo
    echo "No compiler found. Please install either:"
    echo "  - Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo "  - GCC: sudo apt-get install build-essential (Ubuntu/Debian)"
    exit 1
fi

echo
echo "Would you like to set up Level 1 now? (y/n)"
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    echo
    echo "Creating Level 1 directory structure..."
    
    mkdir -p level1/{src,tests}
    cd level1
    
    if [ "$LANG" = "rust" ]; then
        echo "Initializing Rust project..."
        cargo init --name vpkg-level1-cas
        
        # Add dependencies
        cargo add sha2
        cargo add anyhow
        
        # Create placeholder files
        cat > src/cas.rs << 'EOF'
use sha2::{Sha256, Digest};
use std::collections::HashMap;

pub struct ContentStore {
    entries: HashMap<String, Entry>,
}

struct Entry {
    content: String,
    ref_count: usize,
}

impl ContentStore {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }
    
    pub fn store(&mut self, content: &str) -> String {
        let hash = Self::compute_hash(content);
        
        self.entries
            .entry(hash.clone())
            .and_modify(|e| e.ref_count += 1)
            .or_insert(Entry {
                content: content.to_string(),
                ref_count: 1,
            });
        
        hash
    }
    
    fn compute_hash(content: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    }
    
    // TODO: Implement other methods (retrieve, delete, stats)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_basic_store() {
        let mut store = ContentStore::new();
        let hash = store.store("hello");
        assert_eq!(hash.len(), 64); // SHA-256 produces 64 hex chars
    }
}
EOF
        
        # Update main.rs
        cat > src/main.rs << 'EOF'
use std::io::{self, BufRead};

mod cas;
use cas::ContentStore;

fn main() {
    let mut store = ContentStore::new();
    let stdin = io::stdin();
    
    for line in stdin.lock().lines() {
        match line {
            Ok(line) => {
                let response = process_command(&mut store, &line);
                println!("{}", response);
            }
            Err(e) => {
                eprintln!("Error reading input: {}", e);
                break;
            }
        }
    }
}

fn process_command(store: &mut ContentStore, cmd: &str) -> String {
    let parts: Vec<&str> = cmd.splitn(2, ' ').collect();
    
    match parts.get(0) {
        Some(&"STORE") => {
            if let Some(content) = parts.get(1) {
                let hash = store.store(content);
                format!("STORED {}", hash)
            } else {
                "ERROR: STORE requires content".to_string()
            }
        }
        // TODO: Implement RETRIEVE, DELETE, STATS
        Some(cmd) => format!("ERROR: Unknown command: {}", cmd),
        None => "ERROR: Empty command".to_string(),
    }
}
EOF
        
        echo "✓ Rust project created with starter code"
        
    else
        echo "Creating C project structure..."
        
        cat > Makefile << 'EOF'
CC = gcc
CFLAGS = -Wall -Wextra -O2 -std=c11
LDFLAGS = -lssl -lcrypto

SRC = src/main.c src/cas.c
OBJ = $(SRC:.c=.o)
TARGET = level1

all: $(TARGET)

$(TARGET): $(OBJ)
  $(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)

%.o: %.c
  $(CC) $(CFLAGS) -c $< -o $@

clean:
  rm -f $(OBJ) $(TARGET)

test: $(TARGET)
  @echo "Running tests..."
  @./run_tests.sh

.PHONY: all clean test
EOF
        
        echo "✓ C project created with Makefile"
    fi
    
    cd ..
    
    echo
    echo "✓ Level 1 structure created!"
    echo
    echo "Next steps:"
    echo "  1. cd level1"
    echo "  2. Read ../challenges/LEVEL_01_CAS.md"
    echo "  3. Start implementing!"
    echo
    if [ "$LANG" = "rust" ]; then
        echo "To test: cargo test"
        echo "To run: cargo run < test_input.txt"
    else
        echo "To build: make"
        echo "To run: ./level1 < test_input.txt"
    fi
fi

echo
echo "=========================================="
echo "Setup complete! Happy coding! 🎉"
