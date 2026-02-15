# Level 3: Dependency Graph Resolution

## 🎯 Learning Objectives

By completing this level, you will understand:

- **Dependency graphs** - Directed acyclic graphs (DAGs) of package dependencies
- **Semantic versioning** - Version constraint satisfaction (^, ~, >=)
- **Topological sorting** - Ordering nodes in a DAG
- **Constraint satisfaction** - Resolving potentially conflicting requirements
- **Hoisting** - Optimizing dependency trees to maximize sharing

## 🧠 Core Concept

Package managers must solve a complex graph problem: given a set of packages with version constraints, find a valid assignment that satisfies all requirements while maximizing code reuse.

```
express@4.18.2
├─ requires: lodash ^4.17.0    (means >=4.17.0 <5.0.0)
└─ requires: body-parser ^1.20.0

body-parser@1.20.1
└─ requires: lodash ^4.17.0    (same constraint!)

Resolution:
  express@4.18.2
  ├─ lodash@4.17.21    ← Both share this version
  └─ body-parser@1.20.1
     └─ lodash@4.17.21 [SHARED]
```

**Key Insight**: The resolver must find versions that satisfy overlapping constraints and maximize sharing (hoisting) to minimize redundant code.

## 📋 Challenge Specification

Build a dependency resolver that handles semantic versioning, constraint satisfaction, and optimal hoisting.

### Commands

Your program must read commands from **stdin** and write responses to **stdout**.

#### `PACKAGE <name> <version>`

Register a package version in the registry.

**Input:**

```
PACKAGE lodash 4.17.21
```

**Output:**

```
REGISTERED lodash@4.17.21
```

**Behavior:**

- Add package to available registry
- Multiple versions of same package can exist

---

#### `DEPENDS <package> <dependency> <constraint>`

Declare a dependency relationship.

**Input:**

```
DEPENDS express@4.18.2 lodash ^4.17.0
```

**Output:**

```
DEPENDENCY express@4.18.2 -> lodash ^4.17.0
```

**Behavior:**

- Register that `express@4.18.2` depends on `lodash` with version constraint `^4.17.0`
- Constraints use semantic versioning syntax:
  - `^4.17.0` means `>=4.17.0 <5.0.0` (compatible changes)
  - `~4.17.0` means `>=4.17.0 <4.18.0` (patch updates only)
  - `>=4.17.0` means `>=4.17.0` (any version at least)
  - `4.17.21` means exactly `4.17.21`

---

#### `PEER <package> <peer_dependency> <constraint>`

Declare a peer dependency (must be provided by parent).

**Input:**

```
PEER react-dom@18.2.0 react ^18.0.0
```

**Output:**

```
PEER react-dom@18.2.0 -> react ^18.0.0
```

**Behavior:**

- Peer dependencies are not automatically installed
- Must be satisfied by a dependency already in the tree
- Used for plugins and extensions

---

#### `RESOLVE <package>`

Resolve all dependencies for a package and display the tree.

**Input:**

```
RESOLVE express@4.18.2
```

**Output:**

```
RESOLUTION express@4.18.2:
  express@4.18.2
  ├─ lodash@4.17.21
  └─ body-parser@1.20.1
     └─ lodash@4.17.21 [SHARED]
```

**Behavior:**

- Find valid versions for all dependencies (direct and transitive)
- Maximize sharing of compatible versions
- Detect and report errors:
  - `ERROR: CIRCULAR_DEPENDENCY <pkg1> -> <pkg2> -> <pkg1>`
  - `ERROR: UNRESOLVABLE <pkg> requires <dep> <constraint> [conflicts with <existing>@<version>]`
  - `ERROR: PACKAGE_NOT_FOUND <pkg>@<version>`

---

## 📊 Example Sessions

### Example 1: Simple Resolution

```
Input:
PACKAGE lodash 4.17.21
PACKAGE lodash 4.17.20
PACKAGE express 4.18.2
DEPENDS express@4.18.2 lodash ^4.17.0
RESOLVE express@4.18.2

Output:
REGISTERED lodash@4.17.21
REGISTERED lodash@4.17.20
REGISTERED express@4.18.2
DEPENDENCY express@4.18.2 -> lodash ^4.17.0
RESOLUTION express@4.18.2:
  express@4.18.2
  └─ lodash@4.17.21
```

### Example 2: Shared Dependencies (Hoisting)

```
Input:
PACKAGE lodash 4.17.21
PACKAGE express 4.18.2
PACKAGE body-parser 1.20.1
DEPENDS express@4.18.2 lodash ^4.17.0
DEPENDS express@4.18.2 body-parser ^1.20.0
DEPENDS body-parser@1.20.1 lodash ^4.17.0
RESOLVE express@4.18.2

Output:
REGISTERED lodash@4.17.21
REGISTERED express@4.18.2
REGISTERED body-parser@1.20.1
DEPENDENCY express@4.18.2 -> lodash ^4.17.0
DEPENDENCY express@4.18.2 -> body-parser ^1.20.0
DEPENDENCY body-parser@1.20.1 -> lodash ^4.17.0
RESOLUTION express@4.18.2:
  express@4.18.2
  ├─ lodash@4.17.21
  └─ body-parser@1.20.1
     └─ lodash@4.17.21 [SHARED]
```

### Example 3: Conflict Detection

```
Input:
PACKAGE lodash 4.17.21
PACKAGE lodash 3.10.1
PACKAGE express 4.18.2
PACKAGE legacy-lib 1.0.0
DEPENDS express@4.18.2 lodash ^4.17.0
DEPENDS legacy-lib@1.0.0 lodash ^3.0.0
DEPENDS express@4.18.2 legacy-lib ^1.0.0
RESOLVE express@4.18.2

Output:
REGISTERED lodash@4.17.21
REGISTERED lodash@3.10.1
REGISTERED express@4.18.2
REGISTERED legacy-lib@1.0.0
DEPENDENCY express@4.18.2 -> lodash ^4.17.0
DEPENDENCY legacy-lib@1.0.0 -> lodash ^3.0.0
DEPENDENCY express@4.18.2 -> legacy-lib ^1.0.0
ERROR: UNRESOLVABLE express@4.18.2 requires lodash ^4.17.0 [conflicts with legacy-lib@1.0.0 -> lodash@3.10.1]
```

### Example 4: Circular Dependency

```
Input:
PACKAGE pkg-a 1.0.0
PACKAGE pkg-b 1.0.0
DEPENDS pkg-a@1.0.0 pkg-b ^1.0.0
DEPENDS pkg-b@1.0.0 pkg-a ^1.0.0
RESOLVE pkg-a@1.0.0

Output:
REGISTERED pkg-a@1.0.0
REGISTERED pkg-b@1.0.0
DEPENDENCY pkg-a@1.0.0 -> pkg-b ^1.0.0
DEPENDENCY pkg-b@1.0.0 -> pkg-a ^1.0.0
ERROR: CIRCULAR_DEPENDENCY pkg-a@1.0.0 -> pkg-b@1.0.0 -> pkg-a@1.0.0
```

---

## 🔨 Implementation Requirements

### Core Algorithms

You'll need to implement:

1. **Semantic Version Parsing**: Parse version strings (e.g., "4.17.21")
2. **Constraint Matching**: Check if version satisfies constraint (e.g., "4.17.21" satisfies "^4.17.0")
3. **Graph Traversal**: Build dependency graph from package declarations
4. **Topological Sort**: Order packages respecting dependency order
5. **Cycle Detection**: Find circular dependencies using DFS
6. **Hoisting Algorithm**: Maximize sharing of compatible versions

### Data Structures

```rust
struct Registry {
    packages: HashMap<String, Vec<Version>>,
    dependencies: HashMap<PackageId, Vec<Dependency>>,
}

struct PackageId {
    name: String,
    version: Version,
}

struct Dependency {
    name: String,
    constraint: VersionConstraint,
    is_peer: bool,
}

struct Version {
    major: u32,
    minor: u32,
    patch: u32,
}
```

---

## ✅ Acceptance Criteria

Your implementation must:

- [ ] Parse semantic versions correctly (major.minor.patch)
- [ ] Support version constraints: `^`, `~`, `>=`, exact
- [ ] Resolve transitive dependencies (dependencies of dependencies)
- [ ] Detect circular dependencies
- [ ] Detect version conflicts
- [ ] Implement hoisting (mark shared dependencies with [SHARED])
- [ ] Handle peer dependencies correctly
- [ ] Return exact output format specified
- [ ] Pass all generated tests
- [ ] Complete within performance target: 1000-package resolution in < 5s

---

## 🧪 Testing Strategy

### Manual Testing

Create `test_level3.txt`:

```
PACKAGE lodash 4.17.21
PACKAGE express 4.18.2
DEPENDS express@4.18.2 lodash ^4.17.0
RESOLVE express@4.18.2
```

Run:

```bash
./level3 < test_level3.txt
```

### Automated Testing

Use the [Test Generation Prompt](../docs/TEST_GENERATION_PROMPT.md) to generate tests for:

- Basic single-level resolution
- Multi-level transitive dependencies
- Hoisting with shared dependencies
- Version constraint satisfaction (^, ~, >=, exact)
- Conflict detection
- Circular dependency detection
- Peer dependencies
- Edge cases (no dependencies, missing packages, invalid versions)

---

## 📚 Required Readings

### Before Implementation

1. **["Package Managers All The Way Down"](https://research.swtch.com/version-sat)** - Russ Cox on version resolution
2. **[npm RFC 0000 - Dependency Resolution](https://github.com/npm/rfcs)** - How npm resolves dependencies
3. **["Efficient Algorithms for Graph Problems"](https://dl.acm.org/doi/10.1145/322234.322237)** - Tarjan's algorithms

### During Implementation

- [Semantic Versioning 2.0.0 specification](https://semver.org/)
- Graph algorithms: DFS, topological sort, cycle detection
- Constraint satisfaction problems (CSP)

---

## 🎓 What You're Learning

### Why This Matters for pnpm

pnpm's resolver is stricter than npm's:

```
npm (hoisting, can break isolation):
node_modules/
  ├─ express/
  ├─ lodash/    ← Hoisted to top
  └─ body-parser/

pnpm (strict, uses symlinks):
node_modules/
  ├─ express/ → /.pnpm/express@4.18.2/node_modules/express
  └─ .pnpm/
     ├─ express@4.18.2/node_modules/
     │  ├─ express/
     │  ├─ lodash/ → /../lodash@4.17.21/node_modules/lodash
     │  └─ body-parser/ → /../body-parser@1.20.1/node_modules/body-parser
     ├─ lodash@4.17.21/node_modules/lodash/
     └─ body-parser@1.20.1/node_modules/body-parser/
```

Your resolver determines which packages can share versions and how they're linked.

### Computer Science Concepts

- **DAG Algorithms**: Topological sort, cycle detection
- **Constraint Satisfaction**: Boolean satisfiability applied to versions
- **Graph Traversal**: DFS/BFS for dependency walking
- **Optimization**: Maximizing shared resources under constraints
- **Semantic Versioning**: Formal specification for version compatibility

---

## 🐛 Common Pitfalls

1. **Incorrect semver parsing**: "4.17.21" is major=4, minor=17, patch=21
2. **Caret vs tilde confusion**: `^4.17.0` allows 4.x.x, `~4.17.0` allows 4.17.x
3. **Not resolving transitively**: Must follow dependencies recursively
4. **Missing cycle detection**: Circular deps cause infinite loops
5. **Incorrect hoisting**: Shared deps must satisfy ALL parent constraints
6. **Peer dependency violations**: Peers must exist in ancestor tree

---

## 🚀 Next Steps

Once you've completed Level 3:

1. ✅ All tests passing
2. ✅ Performance benchmark met
3. ✅ PR merged

Move on to [Level 4: Integration - Full Package Manager](LEVEL_04_INTEGRATION.md)

---

## 💡 Hints

<details>
<summary>Hint 1: Semantic Version Parsing</summary>

```rust
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
struct Version {
    major: u32,
    minor: u32,
    patch: u32,
}

impl Version {
    fn parse(s: &str) -> Result<Self, String> {
        let parts: Vec<&str> = s.split('.').collect();
        if parts.len() != 3 {
            return Err("Invalid version format".to_string());
        }
        Ok(Version {
            major: parts[0].parse().map_err(|_| "Invalid major")?,
            minor: parts[1].parse().map_err(|_| "Invalid minor")?,
            patch: parts[2].parse().map_err(|_| "Invalid patch")?,
        })
    }
}
```

</details>

<details>
<summary>Hint 2: Caret Constraint Matching</summary>

```rust
fn satisfies_caret(version: &Version, constraint: &Version) -> bool {
    if version.major != constraint.major {
        return false;
    }
    if version.major == 0 {
        // ^0.x.y is strict: only 0.x.z where z >= y
        version.minor == constraint.minor && version.patch >= constraint.patch
    } else {
        // ^x.y.z allows x.*.* where version >= x.y.z
        version >= constraint
    }
}
```

</details>

<details>
<summary>Hint 3: Cycle Detection with DFS</summary>

```rust
fn detect_cycle(
    pkg: &PackageId,
    graph: &HashMap<PackageId, Vec<PackageId>>,
    visited: &mut HashSet<PackageId>,
    rec_stack: &mut HashSet<PackageId>,
) -> Option<Vec<PackageId>> {
    visited.insert(pkg.clone());
    rec_stack.insert(pkg.clone());

    if let Some(deps) = graph.get(pkg) {
        for dep in deps {
            if !visited.contains(dep) {
                if let Some(cycle) = detect_cycle(dep, graph, visited, rec_stack) {
                    return Some(cycle);
                }
            } else if rec_stack.contains(dep) {
                // Found cycle
                return Some(vec![dep.clone(), pkg.clone()]);
            }
        }
    }

    rec_stack.remove(pkg);
    None
}
```

</details>

---

**This is the hardest level. Take your time. The algorithm is complex but the payoff is huge.**
