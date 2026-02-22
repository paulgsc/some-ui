# Test Generation Prompt Template

Use this prompt with an LLM to generate comprehensive tests for your Virtual Package Manager implementation.

## How to Use

1. Copy the template below
2. Fill in the placeholders with your specific level details
3. Submit to an LLM (Claude, GPT-4, etc.)
4. Save the generated tests to your test suite
5. Add them to your CI pipeline

---

## Prompt Template

```
I'm building a Virtual Package Manager as part of a systems programming learning project.
I need comprehensive test cases for Level [LEVEL_NUMBER]: [LEVEL_NAME].

## Context

**What the level does:**
[BRIEF DESCRIPTION - e.g., "Implements content-addressable storage with SHA-256 hashing and reference counting"]

**Input/Output Format:**
- Input: Commands from stdin, one per line
- Output: Responses to stdout, one per line
- Format: [DESCRIBE FORMAT - e.g., "STORE <content> → STORED <hash>"]

## Commands to Test

[LIST ALL COMMANDS WITH BRIEF DESCRIPTION]

Example:
- STORE <content>: Store content and return hash
- RETRIEVE <hash>: Retrieve content by hash
- DELETE <hash>: Delete a reference to content
- STATS: Display storage statistics

## Test Requirements

Generate test cases that cover:

1. **Happy Path Tests**
   - Basic functionality for each command
   - Commands working in typical sequences
   - [ADD LEVEL-SPECIFIC REQUIREMENTS]

2. **Edge Cases**
   - Empty content
   - Very large content (e.g., 1MB strings)
   - Special characters in content (newlines, unicode, etc.)
   - Maximum values (e.g., 1000 simultaneous stored items)
   - [ADD LEVEL-SPECIFIC EDGE CASES]

3. **Error Handling**
   - Invalid commands
   - Missing required arguments
   - Operations on non-existent items
   - [ADD LEVEL-SPECIFIC ERROR CASES]

4. **State Verification**
   - Verify state consistency after operations
   - Ensure cleanup happens correctly
   - [ADD LEVEL-SPECIFIC STATE CHECKS]

5. **Performance Tests**
   - Target: [SPECIFY TARGET - e.g., "100k STORE operations in <1s"]
   - Generate input that can verify this benchmark
   - [ADD LEVEL-SPECIFIC PERFORMANCE REQUIREMENTS]

## Invariants to Verify

[LIST CRITICAL INVARIANTS THAT MUST ALWAYS HOLD]

Examples:
- Reference count must never be negative
- Hash of content must always be deterministic (same content → same hash)
- Total saved_bytes must equal sum of (refs-1)*size for each file
- [ADD MORE INVARIANTS]

## Output Format

For each test case, provide:

```

TEST: [Test Name]
DESCRIPTION: [What this tests]
INPUT:
[Multi-line input commands]
EXPECTED_OUTPUT:
[Expected output with exact formatting]
INVARIANTS_CHECKED:

- [Invariant 1]
- [Invariant 2]

```

## Additional Requirements

- Generate at least 15-20 test cases
- Include both simple and complex scenarios
- Ensure tests are deterministic (same input always gives same output)
- Make tests self-contained (each test can run independently)
- For hash values, use realistic SHA-256 hashes (64 hex characters)
- Include comments explaining complex test scenarios

Please generate comprehensive test cases now.
```

---

## Level-Specific Details

### Level 1: CAS

**Brief Description:**

```
Implements content-addressable storage with SHA-256 hashing, reference counting,
and automatic deduplication.
```

**Commands:**

```
- STORE <content>: Store content and return SHA-256 hash
- RETRIEVE <hash>: Retrieve content by hash
- DELETE <hash>: Delete a reference (decrement ref count)
- STATS: Display files, unique_bytes, saved_bytes, refs
```

**Invariants:**

```
- ref_count must never be negative
- Content with same bytes must produce identical hash
- saved_bytes = sum((ref_count - 1) * size) for all entries
- Retrieving non-existent hash must error
- Deleting when ref_count=0 must remove entry entirely
```

---

### Level 2: VFS

**Brief Description:**

```
Implements a virtual file system with inodes, hard links, path resolution,
and automatic garbage collection via link counting.
```

**Commands:**

```
- CREATE <path> <content>: Create file with content at path
- LINK <source> <dest>: Create hard link from source to dest
- READ <path>: Read content at path
- UNLINK <path>: Remove path entry (decrement link count)
- STAT <path>: Show inode metadata
- LIST <directory>: List directory entries
```

**Invariants:**

```
- Multiple paths can point to same inode
- link_count must equal number of paths pointing to inode
- Reading any path to same inode returns same content
- Unlinking last path must delete the inode
- Inode IDs must be unique
- Cannot link to non-existent source
```

---

### Level 3: Resolver

**Brief Description:**

```
Implements dependency graph resolution with semantic versioning, constraint
satisfaction, cycle detection, and optimal hoisting.
```

**Commands:**

```
- PACKAGE <name> <version>: Register package version
- DEPENDS <pkg> <dep> <constraint>: Declare dependency
- PEER <pkg> <peer> <constraint>: Declare peer dependency
- RESOLVE <pkg>: Resolve all dependencies and display tree
```

**Invariants:**

```
- Circular dependencies must be detected and reported
- Version constraints must be satisfied (^, ~, >=, exact)
- Shared dependencies must be marked with [SHARED]
- Resolution must be deterministic (same input → same output)
- Conflicts must be detected (incompatible version requirements)
- Topological ordering must be preserved
```

---

### Level 4: Integration

**Brief Description:**

```
Integrates CAS, VFS, and Resolver into a complete package manager with
project management, installation, and deduplication tracking.
```

**Commands:**

```
- INIT <project>: Initialize new project
- ADD <project> <pkg@version>: Add package to project dependencies
- INSTALL <project>: Install all project dependencies
- LIST <project>: List installed packages
- DISK_USAGE: Show global storage statistics
```

**Invariants:**

```
- Packages stored once in global store regardless of projects
- Hard links must point to correct store locations
- Deduplication savings must be accurately calculated
- Installing same package in multiple projects creates links, not copies
- Disk usage: store size + projects metadata ≈ store size (links ~0MB)
- Resolution errors must prevent installation
```

---

## Example Generated Test

```
TEST: CAS_001_BasicStoreAndRetrieve
DESCRIPTION: Verify basic STORE and RETRIEVE functionality with simple content
INPUT:
STORE hello world
RETRIEVE b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
EXPECTED_OUTPUT:
STORED b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
CONTENT hello world
INVARIANTS_CHECKED:
- Hash is deterministic (same content produces same hash)
- Stored content can be retrieved exactly
- Output format matches specification
```

---

## CI Integration

Once you have tests, integrate them into your CI pipeline:

```yaml
# .github/workflows/ci.yml
- name: Run Level Tests
  run: |
    ./level1 < tests/level1_tests.txt > tests/level1_output.txt
    diff tests/level1_output.txt tests/level1_expected.txt
```

See [CI Configuration](.github/workflows/ci.yml) for complete setup.

---

## Tips

1. **Start Simple**: Generate basic tests first, then add complexity
2. **Use Real Hashes**: Calculate actual SHA-256 hashes for test data
3. **Test Incrementally**: Run tests as you implement features
4. **Version Control Tests**: Commit tests alongside code
5. **Update Tests**: As you fix bugs, add regression tests

---

## Troubleshooting

**LLM generates invalid hashes:**

- Provide example: `echo -n "content" | sha256sum`
- Specify: "Use actual SHA-256 algorithm, not placeholder hashes"

**Tests are non-deterministic:**

- Specify: "Avoid timestamps, random values, or system-dependent output"
- Use fixed test data

**Output format doesn't match:**

- Provide exact format examples from challenge spec
- Specify: "Match format character-by-character"

---

**Ready to generate tests?** Copy the template above, fill in your level details, and submit to an LLM!
