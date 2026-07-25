# Virtual Package Manager: A Systems Programming Journey

> [!IMPORTANT] > **Canon-governed workspace — read the canon before editing this package.**
>
> - [`docs/canon/adaptive-learning-canon.typ`](../docs/canon/adaptive-learning-canon.typ) — _The Unobservable Learner_ — the level checklist below is an ordered syllabus with heading-derived concept identity and boolean gates — all three rejected in P.2, Thm. 1.1, and Prop. 2.2. The content here is the strongest in the repository and the learner model under it is the weakest; §11's obligation O1 is what changes that
>
> These are not background reading. They are the documents this package is
> _derived_ from: modules here are checked against a Definition / Axiom /
> Theorem number, not against a feature spec. If a change cannot be traced to
> a canon citation, either it belongs somewhere else or the canon is missing
> an amendment that should land first.
>
> **Human reviewers:** a diff that changes behaviour governed by a canon and
> cites nothing is incomplete — ask for the citation.
> **LLM agents:** read the cited sections before proposing a change, and never
> silently renumber or rewrite a canon result. See
> [`docs/canon/README.md`](../docs/canon/README.md) for the amendment
> discipline.

[![CI](https://github.com/YOUR_USERNAME/virtual-package-manager/workflows/CI/badge.svg)](https://github.com/YOUR_USERNAME/virtual-package-manager/actions)

> A progressive, hands-on implementation of pnpm's core architectural concepts: content-addressable storage, hard linking, and dependency resolution.

## 🎯 Project Overview

This project is a pedagogical journey through the fundamental computer science concepts that power modern package managers. By building a "Virtual Package Manager" from scratch, you'll gain deep understanding of:

- **Content-Addressable Storage (CAS)** - How Git and pnpm deduplicate data
- **File System Internals** - Inodes, hard links, and reference counting
- **Graph Algorithms** - Dependency resolution and topological sorting
- **Systems Design** - Building composable, testable system components

## 🏗️ Architecture

The project is structured in **4 progressive levels**, each building on the previous:

```
Level 1: Content-Addressable Storage (CAS)
         ↓
Level 2: Hard Links & Virtual File System
         ↓
Level 3: Dependency Graph Resolution
         ↓
Level 4: Integration - Full Package Manager
```

## 📋 Progress Tracker

### Level 1: Content-Addressable Storage

- [ ] Core CAS implementation
- [ ] SHA-256 hashing
- [ ] Reference counting
- [ ] Deduplication logic
- [ ] STATS command
- [ ] All tests passing

### Level 2: Hard Links & Virtual File System

- [ ] Inode simulation
- [ ] Path resolution
- [ ] Hard link creation
- [ ] Link counting
- [ ] Garbage collection
- [ ] All tests passing

### Level 3: Dependency Graph Resolution

- [ ] Semantic versioning parser
- [ ] Constraint satisfaction
- [ ] Topological sort
- [ ] Cycle detection
- [ ] Dependency hoisting
- [ ] All tests passing

### Level 4: Integration

- [ ] Module integration
- [ ] Project initialization
- [ ] Package installation
- [ ] Disk usage tracking
- [ ] Performance optimization
- [ ] All tests passing

## 🚀 Getting Started

### Prerequisites

- **Rust** (recommended) or **C compiler** (gcc/clang)
- Git
- Basic understanding of:
  - Hash tables and cryptographic hashing
  - File systems concepts
  - Graph theory basics

### Repository Setup

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/virtual-package-manager.git
cd virtual-package-manager

# Create your working branch for Level 1
git checkout -b level-1/cas-implementation

# Read the challenge specification
cat challenges/LEVEL_01_CAS.md
```

### Development Workflow

This project follows an **Agile/GitHub Issues workflow**:

1. **Pick a Level** - Start with Level 1
2. **Create Issues** - Break down the level into granular tasks (use issue templates)
3. **Create PR** - Open a PR for your level (use PR template)
4. **Implement & Commit** - Solve tasks, commit with meaningful messages
5. **Generate Tests** - Use the test generation prompt to create CI tests
6. **Verify** - Ensure all tests pass locally and in CI
7. **Merge** - Merge your PR and move to the next level

### Example Workflow

```bash
# Starting Level 1
gh issue create --template level-task.md --title "Implement STORE command"
git checkout -b level-1/store-command

# Implement the STORE command
cargo build && cargo test

# Generate tests using the prompt template
cat docs/TEST_GENERATION_PROMPT.md
# (Copy the prompt, fill in details, ask LLM to generate tests)

# Commit your work
git add .
git commit -m "feat(level-1): implement STORE command with deduplication

- Add SHA-256 hashing for content
- Implement hash table for storage
- Add duplicate detection
- Closes #1"

# Push and create PR
git push origin level-1/store-command
gh pr create --template level-pr.md
```

## 📚 Challenge Documentation

Each level has a dedicated specification document in the `challenges/` directory:

- [Level 1: Content-Addressable Storage](challenges/LEVEL_01_CAS.md)
- [Level 2: Hard Links & Virtual File System](challenges/LEVEL_02_VFS.md)
- [Level 3: Dependency Graph Resolution](challenges/LEVEL_03_RESOLVER.md)
- [Level 4: Integration - Full Package Manager](challenges/LEVEL_04_INTEGRATION.md)

## 🧪 Testing

### Running Tests

```bash
# Run all tests
cargo test

# Run tests for a specific level
cargo test level_1

# Run with verbose output
cargo test -- --nocapitulated --test-threads=1
```

### Test Generation

Tests are generated using LLM assistance with structured prompts. See:

- [Test Generation Guide](docs/TEST_GENERATION_PROMPT.md)
- [CI Configuration](.github/workflows/ci.yml)

### Performance Benchmarks

Each level has performance requirements:

| Level | Metric                  | Target  |
| ----- | ----------------------- | ------- |
| 1     | 100k STORE operations   | < 1s    |
| 2     | 10k hard links          | < 100ms |
| 3     | 1000-package resolution | < 5s    |
| 4     | 100-package install     | < 2s    |

## 📖 Learning Resources

### Required Readings by Level

**Level 1:**

- [How pnpm's store works](https://pnpm.io/symlinked-node-modules-structure)
- RFC 6920 - Naming Things with Hashes
- "A Git Horror Story" - Understanding content-addressable systems

**Level 2:**

- "The Design and Implementation of the FreeBSD Operating System" - Chapter 8
- Linux man pages: `stat(2)`, `link(2)`, `unlink(2)`
- "Understanding the Linux Kernel" - VFS and inode structures

**Level 3:**

- "Package Managers All The Way Down" - Russ Cox
- npm RFC 0000 - Dependency Resolution Algorithm
- "Efficient Algorithms for Graph Problems" - Tarjan's algorithms

**Level 4:**

- pnpm source code: `@pnpm/resolve-dependencies`
- "Design of the UNIX Operating System" - File systems chapter
- Your own implementations from Levels 1-3

### Additional Resources

- [Systems Programming Concepts](docs/CONCEPTS.md)
- [Debugging Guide](docs/DEBUGGING.md)
- [Performance Optimization Tips](docs/PERFORMANCE.md)

## 🤝 Contributing

lol, just vibe it!

## 📝 License

MIT License - See [LICENSE](LICENSE) file for details

## 🙏 Acknowledgments

- eh! eye!

## 📊 Project Stats

- **Language**: Rust (or C)
- **Total Challenges**: 4 levels
- **Estimated Time**: 40-60 hours
- **Difficulty**: Vibes

---

**Ready to start?** Jump into [Level 1: Content-Addressable Storage](challenges/LEVEL_01_CAS.md) and create your first issue!
