# Level 1: Content-Addressable Storage (CAS)

## 🎯 Learning Objectives

By completing this level, you will understand:

- **Content-addressable storage** - Files identified by hash of contents, not location
- **Cryptographic hashing** - SHA-256 for content integrity
- **Deduplication** - Automatic elimination of duplicate data
- **Reference counting** - Tracking how many references point to data

## 🧠 Core Concept

Content-addressable storage (CAS) is the foundation of systems like Git, IPFS, and pnpm's global store. Instead of organizing files by arbitrary paths (`/usr/local/lib/lodash.js`), CAS organizes them by the **hash of their contents**.

**Key Insight**: Two files with identical content produce the same hash, enabling automatic deduplication.

```
"hello world" → SHA-256 → b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9

Any file with "hello world" as content always produces this exact hash.
```

## 📋 Challenge Specification

Build a virtual CAS system that stores, retrieves, and manages content-addressed data.

### Commands

Your program must read commands from **stdin** and write responses to **stdout**.

#### `STORE <content>`

Store content in the CAS and return its hash.

**Input:**

```
STORE hello world
```

**Output:**

```
STORED b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
```

**Behavior:**

- Compute SHA-256 hash of `<content>`
- If hash doesn't exist in store, save content
- If hash already exists, increment reference count
- Return `STORED <hash>` or `STORED <hash> [DUPLICATE]`

---

#### `RETRIEVE <hash>`

Retrieve content by its hash.

**Input:**

```
RETRIEVE b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
```

**Output:**

```
CONTENT hello world
```

**Behavior:**

- Look up content by hash
- If found, return `CONTENT <original_content>`
- If not found, return `ERROR: <hash> NOT_FOUND`

---

#### `DELETE <hash>`

Delete a reference to content (decrement ref count).

**Input:**

```
DELETE b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
```

**Output:**

```
DELETED b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
```

**Behavior:**

- Decrement reference count for this hash
- If ref count reaches 0, remove content from storage
- Return `DELETED <hash>` on success
- Return `ERROR: <hash> NOT_FOUND` if hash doesn't exist

---

#### `STATS`

Display statistics about the store.

**Input:**

```
STATS
```

**Output:**

```
STATS: files=2, unique_bytes=24, saved_bytes=11, refs=3
```

**Behavior:**

- `files`: Number of unique content hashes stored
- `unique_bytes`: Total bytes of unique content
- `saved_bytes`: Bytes saved through deduplication
- `refs`: Total reference count across all files

**Calculation:**

```
saved_bytes = (total_refs - unique_files) * average_file_size
// OR more precisely:
saved_bytes = sum(for each file: (refs - 1) * file_size)
```

---

## 📊 Example Session

```
Input:
STORE hello world
STORE hello world
STORE goodbye world
STATS
DELETE b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
STATS
RETRIEVE b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
DELETE b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9

Output:
STORED b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
STORED b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9 [DUPLICATE]
STORED 4c86e0e654b213b0fb9d75c7b24d04d6d974f6f9ea91e9e8e5e9f5b5d9e7f8a1
STATS: files=2, unique_bytes=24, saved_bytes=11, refs=3
DELETED b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
STATS: files=2, unique_bytes=24, saved_bytes=0, refs=2
CONTENT hello world
DELETED b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
```

### Explanation

1. First `STORE hello world` creates new entry with hash `b94d27b9...` (refs=1)
2. Second `STORE hello world` finds duplicate, increments refs to 2
3. `STORE goodbye world` creates new entry with different hash (refs=1)
4. `STATS` shows 2 files, 3 total refs, 11 bytes saved (one duplicate of "hello world")
5. First `DELETE` decrements refs for "hello world" to 1
6. `STATS` now shows saved_bytes=0 (no more duplicates)
7. `RETRIEVE` still works because refs=1
8. Second `DELETE` decrements refs to 0, removing the content entirely

---

## 🔨 Implementation Requirements

### Data Structures

You'll need:

1. **Hash Table** - Map hash → (content, ref_count)
2. **SHA-256 Hasher** - Cryptographic hash function

### Rust Suggestions

```rust
use std::collections::HashMap;
use sha2::{Sha256, Digest};

struct ContentStore {
    entries: HashMap<String, Entry>,
}

struct Entry {
    content: String,
    ref_count: usize,
}
```

### C Suggestions

```c
#include <openssl/sha.h>
#include <uthash.h>  // or implement your own hash table

typedef struct {
    char hash[65];           // 64 hex chars + null terminator
    char *content;
    size_t ref_count;
    UT_hash_handle hh;
} Entry;
```

---

## ✅ Acceptance Criteria

Your implementation must:

- [ ] Parse commands from stdin line-by-line
- [ ] Compute correct SHA-256 hashes (use a library, don't implement crypto yourself)
- [ ] Store content with reference counting
- [ ] Return exact output format specified above
- [ ] Handle all commands correctly
- [ ] Pass all generated tests
- [ ] Complete within performance target: 100k STORE operations in < 1s

---

## 🧪 Testing Strategy

### Manual Testing

Create a test file `test_level1.txt`:

```
STORE hello world
RETRIEVE b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
STATS
```

Run:

```bash
./level1 < test_level1.txt
```

### Automated Testing

Use the [Test Generation Prompt](../docs/TEST_GENERATION_PROMPT.md) to generate comprehensive tests covering:

- Basic STORE/RETRIEVE/DELETE operations
- Duplicate detection
- Reference counting accuracy
- Error cases (retrieve non-existent, delete non-existent)
- Statistics calculation
- Edge cases (empty content, very large content, special characters)

---

## 📚 Required Readings

### Before Implementation

1. **[How pnpm's store works](https://pnpm.io/symlinked-node-modules-structure)** - See how pnpm uses content-addressing
2. **[RFC 6920 - Naming Things with Hashes](https://datatracker.ietf.org/doc/html/rfc6920)** - Formal specification
3. **[A Git Horror Story](https://mikegerwitz.com/2012/05/a-git-horror-story-repository-integrity-with-signed-commits)** - Why content-addressing matters

### During Implementation

- SHA-256 documentation for your language
- Hash table implementation guide (if implementing from scratch)

---

## 🎓 What You're Learning

### Why This Matters for pnpm

When you run `pnpm add lodash` in multiple projects:

```
Project A installs lodash@4.17.21
  → pnpm computes SHA-256 of lodash files
  → Stores in ~/.pnpm-store/v3/files/<hash>/

Project B installs lodash@4.17.21
  → pnpm computes same SHA-256 (identical files)
  → Finds existing hash in store
  → Creates hard link instead of copying
  → Disk space saved!
```

Your CAS implementation is the core of this deduplication magic.

### Computer Science Concepts

- **Content-Addressable Storage**: Git, IPFS, Blockchain all use this
- **Cryptographic Hashing**: Security, integrity verification, distributed systems
- **Reference Counting**: Garbage collection, memory management
- **Deduplication**: Backup systems, compression, distributed storage

---

## 🐛 Common Pitfalls

1. **Incorrect hash format**: SHA-256 produces 64 hexadecimal characters
2. **Not handling newlines**: Content may include `\n` - hash it exactly as-is
3. **Reference count errors**: Forgetting to increment on duplicate STORE
4. **Memory leaks**: Not freeing content when ref_count reaches 0
5. **saved_bytes calculation**: Must account for all duplicates, not just last one

---

## 🚀 Next Steps

Once you've completed Level 1:

1. ✅ All tests passing
2. ✅ Performance benchmark met
3. ✅ PR merged

Move on to [Level 2: Hard Links & Virtual File System](LEVEL_02_VFS.md)

---

## 💡 Hints

<details>
<summary>Hint 1: SHA-256 in Rust</summary>

```rust
use sha2::{Sha256, Digest};

fn hash_content(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}
```

</details>

<details>
<summary>Hint 2: Handling stdin line-by-line</summary>

```rust
use std::io::{self, BufRead};

fn main() {
    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        let line = line.unwrap();
        // Parse and handle command
    }
}
```

</details>

<details>
<summary>Hint 3: Calculating saved_bytes</summary>

```rust
fn calculate_saved_bytes(&self) -> usize {
    self.entries.values()
        .map(|entry| (entry.ref_count - 1) * entry.content.len())
        .sum()
}
```

</details>

---

**Good luck! Remember: Start with the simplest working version, then optimize.**
