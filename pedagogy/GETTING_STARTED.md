# Getting Started Guide

Welcome! This guide will help you set up your development environment and begin your Virtual Package Manager journey.

## Prerequisites

### Required

- **Git** - Version control
- **Rust** (recommended) or **C/C++ compiler**
- **Basic terminal/command line knowledge**

### Recommended

- **Code editor** with language support (VS Code, Vim, Emacs, etc.)
- **Understanding of**:
  - Hash tables and basic data structures
  - File I/O operations
  - Command-line argument parsing

## Installation

### 1. Install Rust (Recommended Path)

```bash
# Install rustup (Rust installer)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Follow the prompts, then:
source $HOME/.cargo/env

# Verify installation
rustc --version
cargo --version
```

### 2. Alternative: Install C Compiler

**Linux/macOS:**

```bash
# Ubuntu/Debian
sudo apt-get install build-essential

# macOS
xcode-select --install

# Fedora
sudo dnf install gcc make
```

**Windows:**

- Install [MinGW](https://www.mingw-w64.org/) or
- Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/)

### 3. Install Development Tools (Optional but Helpful)

```bash
# For Rust developers
cargo install cargo-watch    # Auto-rebuild on changes
cargo install cargo-edit      # Manage dependencies easily
cargo install cargo-tarpaulin # Code coverage

# For VS Code users
# Install these extensions:
# - rust-analyzer (Rust)
# - C/C++ (Microsoft, for C)
# - GitLens (Git visualization)
```

## Project Setup

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/virtual-package-manager.git
cd virtual-package-manager
```

### 2. Read the Overview

```bash
# Read the main README
cat README.md

# Browse challenge specifications
ls challenges/
```

### 3. Set Up Your First Level

```bash
# Create Level 1 directory
mkdir level1
cd level1

# For Rust:
cargo init --name level1

# For C:
mkdir src tests
touch src/main.c Makefile
```

### 4. Read the Challenge Specification

```bash
cat ../challenges/LEVEL_01_CAS.md
```

## Your First Implementation

### Quick Start: Hello World Test

Before diving into Level 1, create a simple stdin/stdout program to verify your setup:

**Rust (level1/src/main.rs):**

```rust
use std::io::{self, BufRead};

fn main() {
    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        let line = line.unwrap();
        println!("ECHO: {}", line);
    }
}
```

**C (level1/src/main.c):**

```c
#include <stdio.h>
#include <string.h>

int main() {
    char buffer[1024];
    while (fgets(buffer, sizeof(buffer), stdin)) {
        buffer[strcspn(buffer, "\n")] = 0;  // Remove newline
        printf("ECHO: %s\n", buffer);
    }
    return 0;
}
```

**Test it:**

```bash
# Rust
cargo build
echo "hello" | ./target/debug/level1

# C
gcc -o level1 src/main.c
echo "hello" | ./level1

# Expected output:
# ECHO: hello
```

### Start Level 1 Proper

1. **Read the spec thoroughly**: `challenges/LEVEL_01_CAS.md`
2. **Plan your approach**:
   - What data structures do you need?
   - Which command will you implement first?
   - How will you parse commands?

3. **Implement incrementally**:

   ```bash
   # Create an issue for your first task
   gh issue create --template level-task.md --title "[LEVEL-1] Implement STORE command"

   # Create a branch
   git checkout -b level-1/store-command

   # Implement, test, commit
   # (See workflow below)
   ```

## Development Workflow

### The Iterative Cycle

```
1. Pick a task → 2. Implement → 3. Test → 4. Commit → 5. Repeat
                      ↓
                 6. Open PR → 7. CI passes → 8. Merge → 9. Next level
```

### Detailed Steps

**1. Create an issue**

```bash
gh issue create --template level-task.md --title "[LEVEL-1] Implement STORE command"
```

**2. Create a branch**

```bash
git checkout -b level-1/store-command
```

**3. Implement the feature**

Start with the simplest version that could work:

```rust
// Don't worry about perfection - start simple!
fn handle_store(content: &str) -> String {
    // TODO: Actually compute hash
    format!("STORED fake_hash_for_now")
}
```

**4. Write tests**

```rust
#[test]
fn test_store_command() {
    let result = handle_store("hello");
    assert!(result.starts_with("STORED"));
}
```

**5. Make it work**

Now actually implement it:

```rust
use sha2::{Sha256, Digest};

fn hash_content(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}
```

**6. Verify**

```bash
cargo test
cargo run < test_input.txt
```

**7. Commit**

```bash
git add .
git commit -m "feat(level-1): implement STORE command with SHA-256

- Add hash_content function
- Implement basic STORE command parsing
- Add tests for STORE functionality

Closes #1"
```

**8. Push and create PR**

```bash
git push origin level-1/store-command
gh pr create --template level-pr.md
```

## Common Issues and Solutions

### Issue: "Command not found: cargo"

**Solution:**

```bash
# Make sure Rust is in your PATH
source $HOME/.cargo/env

# Or restart your terminal
```

### Issue: "Cannot find crate sha2"

**Solution:**

```bash
# Add dependency to Cargo.toml
cargo add sha2
```

### Issue: Tests fail with "No such file or directory"

**Solution:**

```bash
# Make sure you're in the right directory
cd level1

# Check your file structure
ls -la src/
```

### Issue: "Permission denied" when running binary

**Solution:**

```bash
chmod +x level1
```

## Next Steps

Now that you're set up:

1. ✅ Environment configured
2. ✅ Repository cloned
3. ✅ First test program working
4. ➡️ **Start Level 1**: Read `challenges/LEVEL_01_CAS.md`
5. ➡️ **Read concepts**: `docs/CONCEPTS.md` for background theory
6. ➡️ **Implement**: Follow the challenge specification

## Learning Resources

### Before You Start Coding

- [Rust Book](https://doc.rust-lang.org/book/) - If using Rust
- [C Programming](https://www.learn-c.org/) - If using C
- [docs/CONCEPTS.md](docs/CONCEPTS.md) - CS concepts explained

### While Implementing

- [Challenge specs](challenges/) - Your primary reference
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/) - Practical Rust
- [PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) - Code organization

### When Stuck

- [docs/DEBUGGING.md](docs/DEBUGGING.md) - Debugging strategies
- [GitHub Issues](https://github.com/YOUR_USERNAME/virtual-package-manager/issues) - Ask for help
- Challenge hints - At the bottom of each level spec

## Getting Help

- **Read the hints** - Each challenge has hints at the bottom
- **Check examples** - The specs include example sessions
- **Use the debugger** - `println!` or actual debugger
- **Create an issue** - Describe what you tried and where you're stuck

## Tips for Success

1. **Read carefully** - The specs are detailed for a reason
2. **Start simple** - Get something working, then improve it
3. **Test incrementally** - Don't write all code before testing
4. **Commit often** - Small commits are easier to debug
5. **Take breaks** - Complex problems need fresh perspectives
6. **Enjoy the journey** - You're building a real package manager!

---

**Ready?** Head to [Level 1: Content-Addressable Storage](challenges/LEVEL_01_CAS.md) and begin your journey!

Good luck! 🚀
