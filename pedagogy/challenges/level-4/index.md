# Level 4: Integration - Full Package Manager

## 🎯 Learning Objectives

By completing this level, you will understand:

- **Systems integration** - Combining independent modules into a cohesive system
- **End-to-end workflows** - Complete package manager operations from request to installation
- **Performance optimization** - Making the integrated system efficient
- **Error handling** - Graceful failures across subsystem boundaries

## 🧠 Core Concept

This level brings together everything you've built:

```
Level 1 (CAS) + Level 2 (VFS) + Level 3 (Resolver) = Complete Package Manager

User runs: vpkg install express
    ↓
Resolver: Find express@4.18.2 and dependencies
    ↓
CAS: Check if packages already in store (by hash)
    ↓
VFS: Create hard links from store to project node_modules
    ↓
Result: Instant installation with maximum deduplication
```

**Key Insight**: Real-world systems are about **composition**. Each level solved one problem well; now they must work together seamlessly.

## 📋 Challenge Specification

Build the complete Virtual Package Manager by integrating your previous solutions.

### Commands

Your program must read commands from **stdin** and write responses to **stdout**.

#### `INIT <project_name>`

Initialize a new project.

**Input:**

```
INIT projectA
```

**Output:**

```
INITIALIZED projectA
```

**Behavior:**

- Create project metadata
- Initialize empty dependency list
- Create project directory structure

---

#### `ADD <project_name> <package>@<version>`

Add a package to project's dependencies.

**Input:**

```
ADD projectA express@4.18.2
```

**Output:**

```
RESOLVED express@4.18.2 (requires lodash@^4.17.0, body-parser@^1.20.0)
```

**Behavior:**

- Resolve package and all transitive dependencies
- Add to project's dependency list (don't install yet)
- Show what will be installed
- Return errors if resolution fails

---

#### `INSTALL <project_name>`

Install all dependencies for a project.

**Input:**

```
INSTALL projectA
```

**Output:**

```
INSTALLED projectA: 3 packages, 2.3 MB, 0 MB saved via deduplication
PACKAGES:
  express@4.18.2 -> /store/a1b2/node_modules/express
  lodash@4.17.21 -> /store/c3d4/node_modules/lodash
  body-parser@1.20.1 -> /store/e5f6/node_modules/body-parser
```

**Behavior:**

- For each resolved dependency:
  1. Hash package content (CAS)
  2. Store in global store if not present (CAS)
  3. Create hard link from store to project (VFS)
- Track disk usage and deduplication savings
- Report installed packages with their store locations

---

#### `LIST <project_name>`

List installed packages for a project.

**Input:**

```
LIST projectA
```

**Output:**

```
PACKAGES:
  express@4.18.2 -> /store/a1b2/node_modules/express
  lodash@4.17.21 -> /store/c3d4/node_modules/lodash
  body-parser@1.20.1 -> /store/e5f6/node_modules/body-parser
```

**Behavior:**

- Show all packages installed in project
- Show their store locations (hash-based paths)

---

#### `DISK_USAGE`

Show global disk usage statistics.

**Input:**

```
DISK_USAGE
```

**Output:**

```
DISK_USAGE: store=2.3MB, projects=0MB (links), total_saved=4.6MB
```

**Behavior:**

- `store`: Total size of unique content in CAS
- `projects`: Size of project metadata (links are ~0MB)
- `total_saved`: Bytes saved via deduplication across all projects

**Calculation:**

```
total_saved = (total_links - unique_packages) * avg_package_size
```

---

## 📊 Example Session

```
Input:
INIT projectA
INIT projectB
ADD projectA express@4.18.2
ADD projectB express@4.18.2
INSTALL projectA
INSTALL projectB
LIST projectA
LIST projectB
DISK_USAGE

Output:
INITIALIZED projectA
INITIALIZED projectB
RESOLVED express@4.18.2 (requires lodash@^4.17.0, body-parser@^1.20.0)
RESOLVED express@4.18.2 [CACHED]
INSTALLED projectA: 3 packages, 2.3 MB
PACKAGES:
  express@4.18.2 -> /store/a1b2c3/node_modules/express
  lodash@4.17.21 -> /store/c3d4e5/node_modules/lodash
  body-parser@1.20.1 -> /store/e5f6g7/node_modules/body-parser
INSTALLED projectB: 3 packages, 0 MB (all hard-linked)
PACKAGES:
  express@4.18.2 -> /store/a1b2c3/node_modules/express [SHARED]
  lodash@4.17.21 -> /store/c3d4e5/node_modules/lodash [SHARED]
  body-parser@1.20.1 -> /store/e5f6g7/node_modules/body-parser [SHARED]
PACKAGES:
  express@4.18.2 -> /store/a1b2c3/node_modules/express
  lodash@4.17.21 -> /store/c3d4e5/node_modules/lodash
  body-parser@1.20.1 -> /store/e5f6g7/node_modules/body-parser
PACKAGES:
  express@4.18.2 -> /store/a1b2c3/node_modules/express
  lodash@4.17.21 -> /store/c3d4e5/node_modules/lodash
  body-parser@1.20.1 -> /store/e5f6g7/node_modules/body-parser
DISK_USAGE: store=2.3MB, projects=0MB (links), total_saved=2.3MB
```

### Explanation

1. Two projects initialized
2. Both add express@4.18.2 (resolver runs, finds dependencies)
3. projectA installs first: 3 packages stored in CAS, 2.3 MB used
4. projectB installs second: All packages already in store (hash matches), just creates links
5. Total disk: 2.3 MB in store, 0 MB in projects (hard links), 2.3 MB saved (projectB reused all)

---

## 🔨 Implementation Requirements

### Architecture

```
┌─────────────────────────────────────┐
│     Package Manager (Level 4)      │
├─────────────────────────────────────┤
│  - INIT, ADD, INSTALL, LIST         │
│  - Project management               │
│  - Orchestration                    │
└──────────┬─────────────┬───────────┘
           │             │
    ┌──────▼──────┐ ┌───▼────────────┐
    │  Resolver   │ │      CAS       │
    │  (Level 3)  │ │   (Level 1)    │
    └──────┬──────┘ └───┬────────────┘
           │            │
           │      ┌─────▼──────┐
           └──────►    VFS     │
                  │ (Level 2)  │
                  └────────────┘
```

### Integration Points

1. **Resolver → CAS**: Hash package content to check if already stored
2. **CAS → VFS**: Store location provides path for hard linking
3. **Resolver → VFS**: Create project's node_modules structure
4. **All → Package Manager**: Error propagation and logging

---

## ✅ Acceptance Criteria

Your implementation must:

- [ ] Integrate all three previous levels (CAS, VFS, Resolver)
- [ ] Support all commands with correct output format
- [ ] Correctly track deduplication savings
- [ ] Handle errors gracefully across subsystems
- [ ] Maintain consistency (e.g., uninstall should cleanup store if no links remain)
- [ ] Pass all generated tests
- [ ] Complete within performance target: 100-package install in < 2s

### Advanced Features (Optional)

- [ ] `REMOVE <project> <package>` - Uninstall a package
- [ ] `UPDATE <project> <package>` - Update to latest compatible version
- [ ] `PRUNE` - Remove unused packages from store
- [ ] `WORKSPACE <name>` - Support monorepos with workspace protocol

---

## 🧪 Testing Strategy

### Manual Testing

Create `test_level4.txt`:

```
INIT myapp
ADD myapp express@4.18.2
INSTALL myapp
LIST myapp
DISK_USAGE
```

Run:

```bash
./level4 < test_level4.txt
```

### Integration Testing

Create test scenarios that exercise cross-module interactions:

```
# Scenario: Deduplication across projects
INIT proj1
INIT proj2
ADD proj1 lodash@4.17.21
ADD proj2 lodash@4.17.21
INSTALL proj1
INSTALL proj2
DISK_USAGE  # Should show savings

# Scenario: Version conflicts
INIT proj3
ADD proj3 package-a@1.0.0
ADD proj3 package-b@1.0.0
# where package-a needs lodash@^4 and package-b needs lodash@^3
INSTALL proj3  # Should error with conflict
```

Use the [Test Generation Prompt](../docs/TEST_GENERATION_PROMPT.md) to generate comprehensive integration tests.

---

## 📚 Required Readings

### Before Implementation

1. **[pnpm source code](https://github.com/pnpm/pnpm)**: `@pnpm/resolve-dependencies`, `@pnpm/store-controller-types`
2. **"Design of the UNIX Operating System"** - Chapters on modularity
3. **Your own implementations from Levels 1-3** (refactoring exercise)

### During Implementation

- Software architecture patterns: layered architecture, dependency injection
- Error handling strategies: Result types, error propagation
- Performance profiling tools

---

## 🎓 What You're Learning

### Why This Matters

This level teaches **systems thinking**:

- **Modularity**: Each level is independent but composable
- **Interface Design**: Clean boundaries between subsystems
- **Error Propagation**: Failures in one layer affect others
- **Performance**: Integrated system must meet combined performance targets
- **Testing**: Integration tests different from unit tests

### Real-World Applications

Package managers like pnpm are **distributed systems disguised as build tools**:

- Content-addressable storage (CAS) is like a distributed cache
- Dependency resolution is like distributed consensus
- Hard links are like copy-on-write in databases
- The whole system must handle partial failures gracefully

---

## 🐛 Common Pitfalls

1. **Tight coupling**: Don't call Level 1/2/3 internals directly; use clean interfaces
2. **Error swallowing**: Propagate errors from subsystems properly
3. **State inconsistency**: If INSTALL fails halfway, ensure clean rollback
4. **Memory leaks**: Track all resources and cleanup on error paths
5. **Performance regression**: Integration overhead shouldn't slow down subsystems
6. **Missing edge cases**: What if store and project disagree on installed packages?

---

## 🚀 Completion

Once you've completed Level 4:

1. ✅ All integration tests passing
2. ✅ Performance benchmarks met for all levels
3. ✅ Final PR merged
4. ✅ Complete system demonstrated

**Congratulations!** You've built a working package manager from scratch and understand pnpm's core architecture.

### What's Next?

- **Optimize**: Profile and improve performance bottlenecks
- **Extend**: Add more features (workspaces, update, prune)
- **Real Implementation**: Try contributing to actual pnpm
- **Apply Knowledge**: Use these concepts in other systems projects

---

## 💡 Hints

<details>
<summary>Hint 1: Clean Module Boundaries</summary>

```rust
// Define clear interfaces
trait ContentStore {
    fn store(&mut self, content: &[u8]) -> Result<Hash>;
    fn retrieve(&self, hash: &Hash) -> Result<Vec<u8>>;
    fn delete(&mut self, hash: &Hash) -> Result<()>;
}

trait FileSystem {
    fn create(&mut self, path: &Path, content: &[u8]) -> Result<Inode>;
    fn link(&mut self, src: &Path, dst: &Path) -> Result<()>;
    fn unlink(&mut self, path: &Path) -> Result<()>;
}

trait Resolver {
    fn resolve(&self, pkg: &PackageId) -> Result<DependencyTree>;
}

// Package manager orchestrates but doesn't know internals
struct PackageManager {
    store: Box<dyn ContentStore>,
    fs: Box<dyn FileSystem>,
    resolver: Box<dyn Resolver>,
}
```

</details>

<details>
<summary>Hint 2: Installation Workflow</summary>

```rust
fn install(&mut self, project: &str) -> Result<InstallReport> {
    // 1. Get dependency list for project
    let deps = self.projects.get(project)?;

    // 2. Resolve all dependencies
    let tree = self.resolver.resolve(&deps)?;

    let mut report = InstallReport::new();

    // 3. For each package in tree
    for pkg in tree.packages() {
        // Hash package content
        let hash = compute_hash(&pkg.content);

        // Store if not present (CAS handles dedup)
        let store_path = self.store.store(&hash, &pkg.content)?;

        // Create hard link in project
        let project_path = format!("/{}/node_modules/{}", project, pkg.name);
        self.fs.link(&store_path, &project_path)?;

        report.add_package(pkg, store_path);
    }

    Ok(report)
}
```

</details>

<details>
<summary>Hint 3: Error Handling Across Modules</summary>

```rust
#[derive(Debug)]
enum PackageManagerError {
    ResolverError(ResolverError),
    StoreError(StoreError),
    FileSystemError(FSError),
    ProjectNotFound(String),
}

impl From<ResolverError> for PackageManagerError {
    fn from(e: ResolverError) -> Self {
        PackageManagerError::ResolverError(e)
    }
}

// Now errors propagate cleanly:
fn add_package(&mut self, project: &str, pkg: &str) -> Result<(), PackageManagerError> {
    let resolved = self.resolver.resolve(pkg)?;  // Auto-converts ResolverError
    self.projects.get_mut(project)?.add_dep(resolved);
    Ok(())
}
```

</details>

---

## 🎉 Final Notes

This is where everything comes together. Take pride in what you've built:

- A **content-addressable store** that deduplicates automatically
- A **virtual file system** with hard links and reference counting
- A **dependency resolver** that handles complex version constraints
- A **complete package manager** that rivals real-world tools

You didn't just learn about these systems — you **built them from scratch**.

**Well done.**
