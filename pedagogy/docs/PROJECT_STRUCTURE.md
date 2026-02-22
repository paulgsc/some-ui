# Project Structure Guide

This document explains the recommended structure for implementing each level of the Virtual Package Manager.

## Overview

Each level should be a self-contained project with its own build configuration, tests, and documentation.

```
virtual-package-manager/
├── README.md                    # Main project overview
├── LICENSE
├── .gitignore
├── .github/
│   ├── workflows/
│   │   └── ci.yml              # CI configuration
│   ├── ISSUE_TEMPLATE/
│   │   ├── level-task.md       # Task issue template
│   │   └── level-tracking.md   # Level tracking template
│   └── pull_request_template.md
├── challenges/
│   ├── LEVEL_01_CAS.md         # Level 1 specification
│   ├── LEVEL_02_VFS.md         # Level 2 specification
│   ├── LEVEL_03_RESOLVER.md    # Level 3 specification
│   └── LEVEL_04_INTEGRATION.md # Level 4 specification
├── docs/
│   ├── CONCEPTS.md              # Core CS concepts
│   ├── TEST_GENERATION_PROMPT.md
│   ├── DEBUGGING.md
│   └── PERFORMANCE.md
├── scripts/
│   ├── run_benchmarks.sh
│   └── setup_dev.sh
├── level1/                      # Level 1: CAS
│   ├── Cargo.toml              # Rust project (or Makefile for C)
│   ├── src/
│   │   ├── main.rs
│   │   ├── cas.rs              # CAS implementation
│   │   └── lib.rs
│   ├── tests/
│   │   ├── integration_tests.rs
│   │   └── test_data/
│   │       └── sample_inputs.txt
│   └── README.md               # Level-specific notes
├── level2/                      # Level 2: VFS
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs
│   │   ├── vfs.rs              # VFS implementation
│   │   ├── inode.rs
│   │   └── lib.rs
│   ├── tests/
│   └── README.md
├── level3/                      # Level 3: Resolver
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs
│   │   ├── resolver.rs
│   │   ├── semver.rs
│   │   ├── graph.rs
│   │   └── lib.rs
│   ├── tests/
│   └── README.md
└── level4/                      # Level 4: Integration
    ├── Cargo.toml
    ├── src/
    │   ├── main.rs
    │   ├── manager.rs
    │   ├── cas.rs              # Re-use from level1
    │   ├── vfs.rs              # Re-use from level2
    │   ├── resolver.rs         # Re-use from level3
    │   └── lib.rs
    ├── tests/
    └── README.md
```

---

## Level Structure

### Rust Implementation

Each level should be a Cargo project:

```toml
# level1/Cargo.toml
[package]
name = "vpkg-level1-cas"
version = "0.1.0"
edition = "2021"

[dependencies]
sha2 = "0.10"
anyhow = "1.0"

[dev-dependencies]
criterion = "0.5"

[[bin]]
name = "level1"
path = "src/main.rs"

[[bench]]
name = "cas_benchmark"
harness = false
```

### C Implementation

Alternatively, use a Makefile:

```makefile
# level1/Makefile
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

test: $(TARGET)
    ./run_tests.sh

clean:
    rm -f $(OBJ) $(TARGET)

.PHONY: all test clean
```

---

## Recommended File Organization

### Level 1: CAS

```
level1/
├── Cargo.toml
├── src/
│   ├── main.rs              # Entry point, command parser
│   ├── cas.rs               # ContentStore implementation
│   └── lib.rs               # Public API
└── tests/
    ├── integration_tests.rs # Full command tests
    └── unit_tests.rs        # Module-specific tests
```

**main.rs:**

```rust
use std::io::{self, BufRead};
use vpkg_level1_cas::ContentStore;

fn main() {
    let mut store = ContentStore::new();
    let stdin = io::stdin();

    for line in stdin.lock().lines() {
        let line = line.unwrap();
        let response = process_command(&mut store, &line);
        println!("{}", response);
    }
}

fn process_command(store: &mut ContentStore, cmd: &str) -> String {
    // Parse and dispatch commands
}
```

**cas.rs:**

```rust
use std::collections::HashMap;
use sha2::{Sha256, Digest};

pub struct ContentStore {
    entries: HashMap<String, Entry>,
}

struct Entry {
    content: String,
    ref_count: usize,
}

impl ContentStore {
    pub fn new() -> Self { /* ... */ }
    pub fn store(&mut self, content: &str) -> String { /* ... */ }
    pub fn retrieve(&self, hash: &str) -> Option<&str> { /* ... */ }
    pub fn delete(&mut self, hash: &str) -> bool { /* ... */ }
    pub fn stats(&self) -> Stats { /* ... */ }
}
```

---

### Level 2: VFS

```
level2/
├── Cargo.toml
├── src/
│   ├── main.rs              # Entry point
│   ├── vfs.rs               # VirtualFS coordinator
│   ├── inode.rs             # Inode implementation
│   ├── path.rs              # Path utilities
│   └── lib.rs
└── tests/
    └── integration_tests.rs
```

**Separate concerns:**

- `inode.rs` - Inode data structure and operations
- `path.rs` - Path parsing and manipulation
- `vfs.rs` - Orchestrates inodes and paths

---

### Level 3: Resolver

```
level3/
├── Cargo.toml
├── src/
│   ├── main.rs              # Entry point
│   ├── resolver.rs          # Resolution algorithm
│   ├── semver.rs            # Version parsing and matching
│   ├── graph.rs             # DAG operations
│   ├── registry.rs          # Package registry
│   └── lib.rs
└── tests/
    └── integration_tests.rs
```

**Module responsibilities:**

- `semver.rs` - Version comparison logic
- `graph.rs` - Topological sort, cycle detection
- `registry.rs` - Package and dependency storage
- `resolver.rs` - Main resolution algorithm

---

### Level 4: Integration

```
level4/
├── Cargo.toml
├── src/
│   ├── main.rs              # Entry point
│   ├── manager.rs           # PackageManager orchestration
│   ├── project.rs           # Project metadata
│   ├── cas.rs               # From level1 (may refactor)
│   ├── vfs.rs               # From level2 (may refactor)
│   ├── resolver.rs          # From level3 (may refactor)
│   └── lib.rs
└── tests/
    ├── integration_tests.rs # End-to-end tests
    └── unit_tests.rs
```

**Integration approach:**

**Option 1: Copy-Paste (Simple)**

- Copy implementations from level1-3
- Modify as needed for integration
- Easier to start, harder to maintain

**Option 2: Workspace (Better)**

```toml
# Cargo.toml (root)
[workspace]
members = [
    "level1",
    "level2",
    "level3",
    "level4",
]

# level4/Cargo.toml
[dependencies]
vpkg-level1-cas = { path = "../level1" }
vpkg-level2-vfs = { path = "../level2" }
vpkg-level3-resolver = { path = "../level3" }
```

---

## Testing Structure

### Unit Tests

Test individual functions/modules:

```rust
// In cas.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_store_and_retrieve() {
        let mut store = ContentStore::new();
        let hash = store.store("hello");
        assert_eq!(store.retrieve(&hash), Some("hello"));
    }
}
```

### Integration Tests

Test complete command sequences:

```rust
// tests/integration_tests.rs
#[test]
fn test_deduplication() {
    let mut store = ContentStore::new();
    let commands = vec![
        "STORE hello",
        "STORE hello",
        "STATS",
    ];

    let expected = vec![
        "STORED abc123...",
        "STORED abc123... [DUPLICATE]",
        "STATS: files=1, unique_bytes=5, saved_bytes=5, refs=2",
    ];

    // Run commands and verify output
}
```

### End-to-End Tests

Test via stdin/stdout:

```bash
# tests/e2e_test.sh
#!/bin/bash

echo "STORE hello world" | ./level1 > output.txt
diff output.txt expected.txt
```

---

## Git Workflow

### Branch Naming

```
level-1/cas-implementation
level-1/store-command
level-1/tests
level-2/inode-implementation
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(level-1): implement STORE command with SHA-256 hashing

- Add ContentStore struct
- Implement SHA-256 computation
- Add duplicate detection
- Update tests

Closes #5
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `test`: Adding tests
- `refactor`: Code restructuring
- `docs`: Documentation changes
- `perf`: Performance improvement

### Pull Request Workflow

1. Create branch: `git checkout -b level-1/store-command`
2. Implement feature
3. Add tests
4. Commit with good messages
5. Push: `git push origin level-1/store-command`
6. Create PR using template
7. Wait for CI to pass
8. Merge

---

## Development Tools

### Recommended Setup

**Rust:**

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install dev tools
cargo install cargo-watch  # Auto-rebuild on file changes
cargo install cargo-tarpaulin  # Code coverage
cargo install cargo-criterion  # Benchmarking
```

**Editor Setup (VS Code):**

```json
{
  "rust-analyzer.checkOnSave.command": "clippy",
  "editor.formatOnSave": true,
  "[rust]": {
    "editor.defaultFormatter": "rust-lang.rust-analyzer"
  }
}
```

### Useful Commands

```bash
# Development cycle
cargo watch -x 'test'  # Auto-run tests on changes

# Run specific test
cargo test test_store_command

# Run with output
cargo test -- --nocapture

# Benchmarks
cargo bench

# Code coverage
cargo tarpaulin --out Html

# Lint
cargo clippy -- -D warnings

# Format
cargo fmt
```

---

## Tips

1. **Start Small**: Implement one command at a time
2. **Test Early**: Write tests as you implement
3. **Commit Often**: Small, focused commits are easier to review
4. **Read Specs**: Reference the challenge docs frequently
5. **Use Debugger**: `println!` debugging or `lldb`/`gdb`

---

**Ready to start?** Set up your Level 1 project structure and begin implementing!
