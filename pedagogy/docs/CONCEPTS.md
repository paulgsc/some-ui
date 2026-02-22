# Core Systems Programming Concepts

This document provides background on the computer science concepts you'll encounter while building the Virtual Package Manager.

## Table of Contents

1. [Content-Addressable Storage (CAS)](#content-addressable-storage)
2. [File Systems and Inodes](#file-systems-and-inodes)
3. [Graph Algorithms](#graph-algorithms)
4. [Semantic Versioning](#semantic-versioning)
5. [Systems Integration](#systems-integration)

---

## Content-Addressable Storage

### What is CAS?

Content-addressable storage (CAS) is a storage system where data is identified and accessed by its **content**, not its location. The identifier is typically a cryptographic hash of the content.

### Why Content Addressing?

**Location-based addressing (traditional):**

```
/home/user/documents/report.pdf
```

- Identifier is arbitrary (filename can be anything)
- Same content at different locations = different identifiers
- Moving or renaming breaks references

**Content-based addressing:**

```
sha256:a3f5b1c2d4e6f7a8b9c0d1e2f3a4b5c6...
```

- Identifier is deterministic (same content → same hash)
- Same content anywhere = same identifier
- Automatic deduplication
- Tamper-proof (changed content → different hash)

### Real-World Examples

1. **Git**: Every commit, tree, and blob is identified by SHA-1 hash
2. **Docker**: Image layers identified by SHA-256 hash
3. **IPFS**: Distributed file system using content addressing
4. **pnpm**: Package files stored by hash in global store

### Cryptographic Hash Properties

A good hash function for CAS must be:

1. **Deterministic**: Same input always produces same output
2. **Uniform**: Output evenly distributed across hash space
3. **Fast**: Quick to compute
4. **Collision-resistant**: Extremely unlikely two inputs produce same hash
5. **One-way**: Cannot derive input from hash

**SHA-256** is the current standard, producing 256-bit (64 hex character) hashes.

---

## File Systems and Inodes

### What is an Inode?

An **inode** (index node) is a data structure that stores metadata about a file:

- File size
- Permissions
- Timestamps
- Pointer to data blocks
- Link count

**Important:** The inode stores everything about a file **except** its name and actual data location.

### Directory Entries

A directory is a mapping of **names → inode numbers**:

```
/home/user/documents/
├─ report.pdf     → inode 12345
├─ backup.pdf     → inode 12345  (hard link!)
└─ notes.txt      → inode 67890
```

### Hard Links vs Soft Links

**Hard Link:**

- Multiple directory entries pointing to the same inode
- All "files" are equal (no original vs copy)
- Deleting one entry doesn't delete the file (until link count = 0)
- Cannot cross file system boundaries
- Cannot link directories (would create cycles)

**Soft Link (Symlink):**

- A special file containing a path to another file
- If target is deleted, symlink becomes broken
- Can cross file systems
- Can link directories

```
Hard Links:          Soft Links:
/a/file ──┐         /a/file → data
          ├─→ inode          ↑
/b/file ──┘         /b/link ─┘ (just stores path "/a/file")
```

### Why pnpm Uses Hard Links

**npm approach:**

```
project1/node_modules/lodash/  (100 MB)
project2/node_modules/lodash/  (100 MB)
Total: 200 MB
```

**pnpm approach:**

```
~/.pnpm-store/lodash@4.17.21/  (100 MB actual data)
project1/node_modules/lodash/  (hard link, ~0 bytes)
project2/node_modules/lodash/  (hard link, ~0 bytes)
Total: 100 MB
```

Hard links make it appear like each project has its own copy, but physically only one copy exists.

---

## Graph Algorithms

### Directed Acyclic Graphs (DAGs)

A **DAG** is a directed graph with no cycles. Dependency graphs are DAGs:

```
express
├─→ lodash
└─→ body-parser
    └─→ lodash
```

Properties:

- Edges have direction (A depends on B, but not vice versa)
- No cycles (A → B → C → A is forbidden)
- Multiple paths can exist (lodash reached via two paths above)

### Topological Sorting

**Problem:** Given a DAG, order nodes so that for every edge A→B, A comes before B.

**Example:**

```
Graph:           Valid orderings:
A → B → D        A, B, C, D
A → C → D        A, C, B, D
                 A, B, D, C (invalid if D→C exists)
```

**Algorithm (Kahn's):**

1. Find all nodes with no incoming edges (in-degree = 0)
2. Add them to result, remove from graph
3. Repeat until graph is empty

Used for: Install order (must install dependencies before dependents)

### Cycle Detection

**Problem:** Detect if a cycle exists in the graph.

**Algorithm (DFS with recursion stack):**

```python
def has_cycle(node, visited, rec_stack):
    visited.add(node)
    rec_stack.add(node)

    for neighbor in node.neighbors:
        if neighbor not in visited:
            if has_cycle(neighbor, visited, rec_stack):
                return True
        elif neighbor in rec_stack:  # Back edge!
            return True

    rec_stack.remove(node)
    return False
```

Used for: Detecting circular dependencies (A depends on B depends on A)

### Hoisting Algorithm

**Problem:** Maximize sharing of compatible dependency versions.

**Example:**

```
Before hoisting:          After hoisting:
A → lodash@4.17.21        A ─┐
B → lodash@4.17.21        B ─┼→ lodash@4.17.21 (shared)
C → lodash@4.17.20        C → lodash@4.17.20 (conflict)
```

**Algorithm:**

1. Build dependency tree
2. For each package, try to use highest compatible version already in tree
3. If no compatible version exists, add new version
4. Mark shared dependencies

---

## Semantic Versioning

### Version Format

Semantic Versioning (semver) uses the format: `MAJOR.MINOR.PATCH`

```
4.17.21
│ │  │
│ │  └─ Patch: Bug fixes (backward compatible)
│ └──── Minor: New features (backward compatible)
└────── Major: Breaking changes (not backward compatible)
```

### Version Constraints

**Caret (`^`)**: Compatible with version (up to next major)

```
^4.17.0  means  >=4.17.0 <5.0.0
^0.2.3   means  >=0.2.3 <0.3.0  (special case for 0.x)
```

**Tilde (`~`)**: Approximately equivalent (patch updates only)

```
~4.17.0  means  >=4.17.0 <4.18.0
~4.17    means  >=4.17.0 <4.18.0
```

**Comparison operators:**

```
>=4.17.0  means  4.17.0 or higher
>4.17.0   means  greater than 4.17.0
<=4.17.0  means  4.17.0 or lower
```

**Exact:**

```
4.17.0   means  exactly 4.17.0
```

### Version Resolution

**Problem:** Given constraints from multiple packages, find valid versions.

```
Package A requires: lodash ^4.17.0  (means 4.17.0 - 4.99.99)
Package B requires: lodash ~4.17.5  (means 4.17.5 - 4.17.99)

Solution: Any version from 4.17.5 to 4.99.99
Choose latest: lodash@4.17.21
```

**Conflict:**

```
Package A requires: lodash ^4.17.0  (means 4.17.0+)
Package B requires: lodash ^3.10.0  (means 3.10.0+)

Conflict! No version satisfies both ^4.17.0 and ^3.10.0
```

---

## Systems Integration

### Modularity

**Principle:** Build independent modules with clean interfaces.

```
Module A                Module B
┌─────────┐            ┌─────────┐
│ Public  │◄───────────│ Depends │
│ API     │            │ on A    │
├─────────┤            └─────────┘
│ Private │ (hidden)
│ Impl    │
└─────────┘
```

Benefits:

- Modules can be developed independently
- Changes to private implementation don't affect other modules
- Easier to test (mock dependencies)
- Can replace modules with different implementations

### Interface Design

**Good interface:**

```rust
trait ContentStore {
    fn store(&mut self, content: &[u8]) -> Result<Hash, Error>;
    fn retrieve(&self, hash: &Hash) -> Result<Vec<u8>, Error>;
}
```

- Clear contract (what it does)
- Error handling explicit
- No leaky abstractions (caller doesn't need to know about internals)

**Bad interface:**

```rust
fn store(content: &[u8], hash_table: &mut HashMap, ...) -> Hash
```

- Exposes internal data structures
- Caller must know too much
- Hard to change implementation

### Error Propagation

Errors in one module must be properly handled by caller:

```rust
fn install() -> Result<(), InstallError> {
    // Resolve dependencies
    let tree = resolver.resolve()?;  // May fail with ResolverError

    // Store packages
    for pkg in tree {
        store.add(pkg)?;  // May fail with StoreError
        fs.link(pkg)?;    // May fail with FSError
    }

    Ok(())
}
```

Each layer converts errors to its own error type and adds context.

### Performance Considerations

**Integration overhead:** Combining modules adds overhead

- Function calls across module boundaries
- Data serialization/deserialization
- Abstraction penalties

**Optimization strategies:**

- Minimize cross-module calls in hot paths
- Batch operations where possible
- Profile to find actual bottlenecks (not premature optimization)

---

## Further Reading

### Books

- "The Algorithm Design Manual" - Steven Skiena
- "Understanding the Linux Kernel" - Bovet & Cesati
- "Software Architecture in Practice" - Bass, Clements, Kazman

### Papers

- "The Git Index" - Understanding Git's content-addressable store
- "Semantic Versioning 2.0.0" - Tom Preston-Werner
- "Graph Algorithms" - Shimon Even

### Online Resources

- [pnpm Documentation](https://pnpm.io/)
- [Git Internals](https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain)
- [Linux VFS Documentation](https://www.kernel.org/doc/html/latest/filesystems/vfs.html)

---

**Next:** Apply these concepts in the challenges! Start with [Level 1: Content-Addressable Storage](../challenges/LEVEL_01_CAS.md).
