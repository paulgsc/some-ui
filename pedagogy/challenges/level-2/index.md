# Level 2: Hard Links & Virtual File System

## 🎯 Learning Objectives

By completing this level, you will understand:

- **Inodes** - The fundamental abstraction for file storage
- **Hard links** - Multiple directory entries pointing to the same inode
- **Path resolution** - How file systems translate paths to inodes
- **Link counting** - Automatic garbage collection via reference counting

## 🧠 Core Concept

A **hard link** creates a new directory entry that points to an existing inode. This is fundamentally different from copying:

```
COPY:
/projectA/lodash.js (100KB)  ← Separate file
/projectB/lodash.js (100KB)  ← Separate file
Total: 200KB

HARD LINK:
/projectA/lodash.js ───┐
                       ├──→ inode#1234 (100KB)
/projectB/lodash.js ───┘
Total: 100KB (plus tiny metadata)
```

**Key Insight**: pnpm uses hard links to create `node_modules` that appear to contain files, but actually point to a single global store. Changes to one "file" affect all links because they're the same inode.

## 📋 Challenge Specification

Build a virtual file system that simulates inodes, hard links, and path-based file operations.

### Commands

Your program must read commands from **stdin** and write responses to **stdout**.

#### `CREATE <path> <content>`

Create a new file with content at the specified path.

**Input:**

```
CREATE /store/a1b2c3/lodash.js function lodash() { return 42; }
```

**Output:**

```
CREATED /store/a1b2c3/lodash.js inode=1001
```

**Behavior:**

- Create new inode with unique ID
- Store content in inode
- Create path entry pointing to inode
- Initialize link count to 1
- Return inode ID

---

#### `LINK <source_path> <dest_path>`

Create a hard link from source to destination.

**Input:**

```
LINK /store/a1b2c3/lodash.js /project1/node_modules/lodash/index.js
```

**Output:**

```
LINKED /project1/node_modules/lodash/index.js -> /store/a1b2c3/lodash.js inode=1001 links=2
```

**Behavior:**

- Look up inode of source path
- Create new path entry for destination pointing to same inode
- Increment link count
- Return inode ID and new link count
- Return `ERROR: SOURCE_NOT_FOUND` if source doesn't exist

---

#### `READ <path>`

Read the content of a file at the given path.

**Input:**

```
READ /project1/node_modules/lodash/index.js
```

**Output:**

```
CONTENT function lodash() { return 42; }
```

**Behavior:**

- Resolve path to inode
- Return content stored in inode
- Return `ERROR: PATH_NOT_FOUND` if path doesn't exist

---

#### `UNLINK <path>`

Remove a path entry (decrement link count).

**Input:**

```
UNLINK /project1/node_modules/lodash/index.js
```

**Output:**

```
UNLINKED /project1/node_modules/lodash/index.js inode=1001 links=1
```

**Behavior:**

- Remove path entry
- Decrement link count
- If links reaches 0, delete inode and its content
- Return `[DELETED inode=<id>]` on final unlink
- Return `ERROR: PATH_NOT_FOUND` if path doesn't exist

**Example with deletion:**

```
Input:
UNLINK /store/a1b2c3/lodash.js

Output:
UNLINKED /store/a1b2c3/lodash.js inode=1001 links=0
[DELETED inode=1001]
```

---

#### `STAT <path>`

Display metadata about a file.

**Input:**

```
STAT /store/a1b2c3/lodash.js
```

**Output:**

```
STAT /store/a1b2c3/lodash.js: inode=1001, links=3, size=35
```

**Behavior:**

- Look up path
- Return inode ID, link count, and content size in bytes
- Return `ERROR: PATH_NOT_FOUND` if path doesn't exist

---

#### `LIST <directory>`

List all entries in a directory (non-recursive).

**Input:**

```
LIST /project1/node_modules
```

**Output:**

```
LIST /project1/node_modules: lodash, express, body-parser
```

**Behavior:**

- List immediate children of directory
- Return comma-separated list
- Return `LIST <directory>: [EMPTY]` if directory has no children
- Return `ERROR: PATH_NOT_FOUND` if directory doesn't exist

---

## 📊 Example Session

```
Input:
CREATE /store/a1b2c3/lodash.js function lodash() { return 42; }
LINK /store/a1b2c3/lodash.js /project1/node_modules/lodash/index.js
LINK /store/a1b2c3/lodash.js /project2/node_modules/lodash/index.js
STAT /store/a1b2c3/lodash.js
READ /project2/node_modules/lodash/index.js
UNLINK /project1/node_modules/lodash/index.js
STAT /store/a1b2c3/lodash.js
UNLINK /project2/node_modules/lodash/index.js
UNLINK /store/a1b2c3/lodash.js

Output:
CREATED /store/a1b2c3/lodash.js inode=1001
LINKED /project1/node_modules/lodash/index.js -> /store/a1b2c3/lodash.js inode=1001 links=2
LINKED /project2/node_modules/lodash/index.js -> /store/a1b2c3/lodash.js inode=1001 links=3
STAT /store/a1b2c3/lodash.js: inode=1001, links=3, size=35
CONTENT function lodash() { return 42; }
UNLINKED /project1/node_modules/lodash/index.js inode=1001 links=2
STAT /store/a1b2c3/lodash.js: inode=1001, links=2, size=35
UNLINKED /project2/node_modules/lodash/index.js inode=1001 links=1
UNLINKED /store/a1b2c3/lodash.js inode=1001 links=0
[DELETED inode=1001]
```

### Explanation

1. Create file at `/store/a1b2c3/lodash.js` → inode 1001 created, links=1
2. Link to `/project1/node_modules/lodash/index.js` → links=2
3. Link to `/project2/node_modules/lodash/index.js` → links=3
4. All three paths point to the same inode with same content
5. Unlinking decrements count but preserves inode while links > 0
6. Final unlink removes the inode and frees memory

---

## 🔨 Implementation Requirements

### Data Structures

You'll need:

1. **Inode Table** - Map inode_id → Inode (content, link_count, size)
2. **Path Table** - Map path → inode_id
3. **Directory Tree** - For LIST operations (optional, can derive from paths)

### Rust Suggestions

```rust
use std::collections::HashMap;

struct VFS {
    inodes: HashMap<u64, Inode>,
    paths: HashMap<String, u64>,
    next_inode_id: u64,
}

struct Inode {
    id: u64,
    content: String,
    link_count: usize,
}
```

### C Suggestions

```c
typedef struct {
    uint64_t id;
    char *content;
    size_t link_count;
    size_t size;
} Inode;

typedef struct {
    char path[PATH_MAX];
    uint64_t inode_id;
    UT_hash_handle hh;
} PathEntry;
```

---

## ✅ Acceptance Criteria

Your implementation must:

- [ ] Maintain unique inode IDs (auto-incrementing is fine)
- [ ] Correctly track link counts
- [ ] Delete inodes when link count reaches 0
- [ ] Support nested directory paths (e.g., `/a/b/c/file.txt`)
- [ ] Handle all commands correctly
- [ ] Return exact output format specified
- [ ] Pass all generated tests
- [ ] Complete within performance target: 10k hard links in < 100ms

---

## 🧪 Testing Strategy

### Manual Testing

Create `test_level2.txt`:

```
CREATE /store/lib.js const x = 42;
LINK /store/lib.js /app/lib.js
STAT /store/lib.js
READ /app/lib.js
UNLINK /app/lib.js
UNLINK /store/lib.js
```

Run:

```bash
./level2 < test_level2.txt
```

### Automated Testing

Use the [Test Generation Prompt](../docs/TEST_GENERATION_PROMPT.md) to generate tests for:

- Basic CREATE/LINK/UNLINK operations
- Multiple links to same inode
- Link count accuracy
- Inode deletion on final unlink
- Path resolution
- Directory listing
- Error cases (link non-existent source, unlink non-existent path)
- Edge cases (deep paths, empty content)

---

## 📚 Required Readings

### Before Implementation

1. **["The Design and Implementation of the FreeBSD Operating System"](https://www.amazon.com/Design-Implementation-FreeBSD-Operating-System/dp/0321968972)** - Chapter 8 (File Systems)
2. **[Linux man pages](https://man7.org/linux/man-pages/)**: `stat(2)`, `link(2)`, `unlink(2)`
3. **[Understanding the Linux Kernel](https://www.oreilly.com/library/view/understanding-the-linux/0596005652/)** - VFS and inode structures

### During Implementation

- File system implementation guides for your language
- Path parsing and directory traversal algorithms

---

## 🎓 What You're Learning

### Why This Matters for pnpm

When pnpm installs packages:

```
Global store:
~/.pnpm-store/v3/files/a1/b2c3d4.../lodash.js (actual file)

Project A:
node_modules/lodash/index.js (hard link to store)

Project B:
node_modules/lodash/index.js (hard link to store)
```

**Result:**

- 3 directory entries (1 store + 2 projects)
- 1 inode (physical file on disk)
- Instant "copying" (just metadata changes)
- Projects appear to have their own lodash, but share one copy

### Computer Science Concepts

- **Inodes**: How UNIX file systems actually work
- **Hard vs Soft Links**: Pointer vs reference semantics
- **Reference Counting**: Automatic memory management
- **Path Resolution**: Tree traversal and lookup tables
- **Space Efficiency**: Trading metadata for data duplication

---

## 🐛 Common Pitfalls

1. **Confusing paths with inodes**: A path is just a name; the inode holds the data
2. **Not decrementing link count on UNLINK**: Memory leak if you forget
3. **Deleting inodes too early**: Must wait until links=0
4. **Path parsing errors**: Handle nested directories correctly
5. **Not creating parent directories**: Decide if `CREATE /a/b/c.txt` requires `/a/b` to exist

---

## 🚀 Next Steps

Once you've completed Level 2:

1. ✅ All tests passing
2. ✅ Performance benchmark met
3. ✅ PR merged

Move on to [Level 3: Dependency Graph Resolution](LEVEL_03_RESOLVER.md)

---

## 💡 Hints

<details>
<summary>Hint 1: Path to Parent Directory</summary>

```rust
fn parent_dir(path: &str) -> Option<&str> {
    path.rfind('/').and_then(|pos| {
        if pos == 0 {
            Some("/")
        } else {
            Some(&path[..pos])
        }
    })
}
```

</details>

<details>
<summary>Hint 2: Automatic Inode Cleanup</summary>

```rust
fn unlink(&mut self, path: &str) -> Result<String> {
    let inode_id = self.paths.remove(path)
        .ok_or("PATH_NOT_FOUND")?;

    let inode = self.inodes.get_mut(&inode_id).unwrap();
    inode.link_count -= 1;

    let response = format!(
        "UNLINKED {} inode={} links={}",
        path, inode_id, inode.link_count
    );

    if inode.link_count == 0 {
        self.inodes.remove(&inode_id);
        Ok(format!("{}\n[DELETED inode={}]", response, inode_id))
    } else {
        Ok(response)
    }
}
```

</details>

<details>
<summary>Hint 3: LIST Command Implementation</summary>

```rust
fn list_directory(&self, dir: &str) -> Vec<String> {
    let prefix = if dir.ends_with('/') {
        dir.to_string()
    } else {
        format!("{}/", dir)
    };

    self.paths.keys()
        .filter(|path| path.starts_with(&prefix))
        .filter_map(|path| {
            path.strip_prefix(&prefix)
                .and_then(|rest| rest.split('/').next())
        })
        .collect()
}
```

</details>

---

**Remember: The VFS is just metadata. The real "files" are inodes. Paths are labels pointing to inodes.**
