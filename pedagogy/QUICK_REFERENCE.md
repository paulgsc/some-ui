# Quick Reference Guide

A cheat sheet for working with the Virtual Package Manager project.

## Project Structure

```
virtual-package-manager/
├── README.md                    # Start here
├── GETTING_STARTED.md          # Setup instructions
├── challenges/                  # Level specifications
├── docs/                        # Additional documentation
├── .github/                     # GitHub templates and CI
└── scripts/                     # Helper scripts
```

## Essential Commands

### Git Workflow

```bash
# Create a new branch for a task
git checkout -b level-1/task-name

# Stage and commit changes
git add .
git commit -m "feat(level-1): description"

# Push and create PR
git push origin level-1/task-name
gh pr create
```

### Rust Development

```bash
# Create new project
cargo init --name level1

# Add dependencies
cargo add sha2 anyhow

# Build
cargo build
cargo build --release  # Optimized

# Test
cargo test
cargo test test_name    # Specific test
cargo test -- --nocapture  # Show output

# Run
cargo run
cargo run < input.txt

# Format and lint
cargo fmt
cargo clippy

# Watch for changes
cargo watch -x test
```

### C Development

```bash
# Compile
gcc -o level1 src/*.c -lssl -lcrypto

# With Makefile
make
make clean
make test

# Run
./level1 < input.txt

# Debug
gdb ./level1
```

## Issue Management

### Create Issue

```bash
# Using GitHub CLI
gh issue create --template level-task.md --title "[LEVEL-X] Task"

# Or via web
# Go to: Issues → New Issue → Choose template
```

### Link Issues in Commits

```bash
git commit -m "feat: implement feature

Closes #123
Part of #456"
```

## Testing

### Manual Testing

```bash
# Create test input file
cat > test.txt << EOF
STORE hello world
STATS
EOF

# Run and check output
./level1 < test.txt
```

### Integration Tests (Rust)

```rust
// tests/integration_tests.rs
#[test]
fn test_store_and_retrieve() {
    // Test code here
}
```

### Run specific test

```bash
cargo test test_name
```

## Test Generation

1. Open `docs/TEST_GENERATION_PROMPT.md`
2. Copy the template
3. Fill in level-specific details
4. Submit to an LLM (Claude, GPT-4)
5. Save generated tests

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `test`: Add tests
- `refactor`: Code restructuring
- `docs`: Documentation
- `perf`: Performance improvement
- `chore`: Maintenance

**Examples:**

```
feat(level-1): implement STORE command

Add SHA-256 hashing and basic storage functionality.

Closes #5

---

fix(level-2): correct link count on UNLINK

Link count was not decrementing properly.

Fixes #12

---

test(level-3): add semver constraint tests

Add comprehensive tests for ^, ~, and >= operators.

Part of #20
```

## Performance Benchmarks

### Targets

| Level | Metric              | Target  |
| ----- | ------------------- | ------- |
| 1     | 100k STORE ops      | < 1s    |
| 2     | 10k hard links      | < 100ms |
| 3     | 1000-pkg resolution | < 5s    |
| 4     | 100-pkg install     | < 2s    |

### Running Benchmarks

```bash
# Rust
cargo bench

# Manual timing
time ./level1 < large_input.txt
```

## Debugging

### Print Debugging

```rust
// Rust
println!("Debug: value = {:?}", value);
eprintln!("Error: {}", error);  // stderr

// C
printf("Debug: value = %d\n", value);
fprintf(stderr, "Error: %s\n", error);
```

### GDB (C)

```bash
gdb ./level1
(gdb) break main
(gdb) run < input.txt
(gdb) next
(gdb) print variable
(gdb) continue
```

### LLDB (Rust)

```bash
rust-lldb target/debug/level1
(lldb) breakpoint set --name main
(lldb) run < input.txt
```

## Common Patterns

### Reading stdin line-by-line

**Rust:**

```rust
use std::io::{self, BufRead};

let stdin = io::stdin();
for line in stdin.lock().lines() {
    let line = line.unwrap();
    // Process line
}
```

**C:**

```c
char buffer[1024];
while (fgets(buffer, sizeof(buffer), stdin)) {
    buffer[strcspn(buffer, "\n")] = 0;
    // Process buffer
}
```

### SHA-256 Hashing

**Rust:**

```rust
use sha2::{Sha256, Digest};

let mut hasher = Sha256::new();
hasher.update(content.as_bytes());
let hash = format!("{:x}", hasher.finalize());
```

**C:**

```c
#include <openssl/sha.h>

unsigned char hash[SHA256_DIGEST_LENGTH];
SHA256((unsigned char*)content, strlen(content), hash);

char hex[65];
for(int i = 0; i < SHA256_DIGEST_LENGTH; i++) {
    sprintf(&hex[i*2], "%02x", hash[i]);
}
```

## File Locations

### Documentation

- **Challenge specs**: `challenges/LEVEL_0X_*.md`
- **Concepts**: `docs/CONCEPTS.md`
- **Project structure**: `docs/PROJECT_STRUCTURE.md`
- **Test generation**: `docs/TEST_GENERATION_PROMPT.md`

### Templates

- **Issue templates**: `.github/ISSUE_TEMPLATE/`
- **PR template**: `.github/pull_request_template.md`
- **CI config**: `.github/workflows/ci.yml`

## Help Resources

### When Stuck

1. **Check hints** - Bottom of each challenge spec
2. **Review concepts** - `docs/CONCEPTS.md`
3. **Read examples** - Challenge specs include detailed examples
4. **Search issues** - Similar problems may be documented
5. **Create issue** - Ask for help with details

### Learning Resources

- [Rust Book](https://doc.rust-lang.org/book/)
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/)
- [C Programming](https://www.learn-c.org/)
- [pnpm Documentation](https://pnpm.io/)

## Progress Tracking

### Check Progress

```bash
# View README checkboxes
cat README.md | grep "\[ \]"  # Incomplete
cat README.md | grep "\[x\]"  # Complete
```

### Update Progress

Edit `README.md` and change:

```markdown
- [ ] Task name
```

to:

```markdown
- [x] Task name
```

## CI Status

### View CI Runs

```bash
gh run list
gh run view <run-id>
```

### Re-run Failed CI

```bash
gh run rerun <run-id>
```

## Quick Setup

```bash
# Clone and enter repository
git clone https://github.com/YOUR_USERNAME/virtual-package-manager.git
cd virtual-package-manager

# Run setup script
./scripts/setup.sh

# Or manually create Level 1
mkdir level1 && cd level1
cargo init --name level1  # For Rust
# OR create Makefile for C

# Start working
cat ../challenges/LEVEL_01_CAS.md
```

## Cheat Sheet Summary

| Task         | Command                                    |
| ------------ | ------------------------------------------ |
| New branch   | `git checkout -b level-X/task`             |
| Build (Rust) | `cargo build`                              |
| Test (Rust)  | `cargo test`                               |
| Run (Rust)   | `cargo run < input.txt`                    |
| Compile (C)  | `gcc -o level1 src/*.c -lssl -lcrypto`     |
| Create issue | `gh issue create --template level-task.md` |
| Create PR    | `gh pr create`                             |
| View tests   | `cargo test -- --list`                     |
| Format       | `cargo fmt` / `clang-format`               |
| Lint         | `cargo clippy`                             |

---

**Need more detail?** Refer to the full documentation in the `docs/` directory!
