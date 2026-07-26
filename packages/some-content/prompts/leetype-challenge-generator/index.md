# LeetType Challenge Generator

Prompt template for generating a `Leetype` challenge-pool override: a corpus
of data-structure/algorithm challenges, each with real, idiomatic code
samples in all four supported languages, used in place of the bundled demo
pool (`@some-ui/content`'s `CHALLENGES`, currently just "Two Sum") when
running `apps/www` against `localhost` or Docker (see
`apps/www/src/lib/leetype-challenges`). Not used by the GitHub Pages build,
which always plays the bundled demo pool instead.

---

## Usage Example Header

```
Topics: [e.g. "stack, queue, binary search tree"]
Difficulty spread: [e.g. "2 easy, 2 medium, 1 hard"]
T: [Apply LeetType Challenge Generator v1.0]
```

The generator produces:

1. One JSON array (`challenges.json`) following the schema below.
2. One source file per `codePaths` entry per challenge (4 languages × N
   challenges) - a complete, compilable/runnable, idiomatic reference
   solution, not a stub. This is the text the player types verbatim, so it
   must be real code a fluent developer in that language would write.

---

## Output Destination

Write the manifest to:

```
packages/some-content/public/leetype/challenges.json
```

Write each challenge's code samples under the same root, e.g.:

```
packages/some-content/public/leetype/samples/<challenge-id>.ts
packages/some-content/public/leetype/samples/<challenge-id>.rs
packages/some-content/public/leetype/samples/<challenge-id>.cpp
packages/some-content/public/leetype/samples/<challenge-id>.c
```

`codePaths` in the manifest must point at these with a leading slash, e.g.
`"/leetype/samples/ds-stack.ts"` - **not** `/code-samples/...` (that's the
small, committed demo set that ships on GitHub Pages; this corpus is a
separate, wholly local override).

This whole `packages/some-content/public/leetype/` tree is gitignored
(`packages/**/public` in the repo root's `.gitignore`) - it is expected to
be regenerated locally, never committed. Overwrite the manifest and any
regenerated sample files each time; there is currently one active corpus,
not one per topic set.

---

## Schema

`challenges.json` is a JSON array of these, with **at least one entry**:

```ts
{
  id: string                    // stable slug, kebab-case ASCII, unique within the file
  title: string                 // display name, e.g. "Binary Search Tree"
  description: string           // one or two sentences: what to implement, constraints
  difficulty: "easy" | "medium" | "hard"
  mode: "data-structure" | "algorithm"
  tags: string[]                // free-form, e.g. ["bst", "trees", "recursion"]
  codePaths: {                  // all four required, no partial sets
    typescript: string
    rust: string
    cpp: string
    c: string
  }
  levelRequired: number          // player level gate (see @some-ui/leetype's PlayerProgress) - 1 unless the caller specifies otherwise
}
```

---

## Code Sample Constraints

- Each language's file for a given challenge must implement the **same**
  data structure or algorithm - a player switching languages mid-selection
  should see equivalent logic, not a different problem.
- Prefer a self-contained file (no external crates/headers beyond the
  language's standard library) so it compiles/runs on its own if extracted.
- No TODOs, `unimplemented!()`, or stub bodies - the typing game replays
  this text character-for-character, so an incomplete solution reads as
  intentional (and untypeable) filler to the player.
- Keep formatting consistent with idiomatic style for the language (rustfmt-
  style for Rust, Prettier-style for TypeScript/C++, standard K&R for C) -
  `Leetype` re-runs Prettier over TypeScript/C++ at load time
  (`PRETTIER_PARSER_MAP` in `packages/ui/leetype/src/components/typing-game/
leetype/index.tsx`), but Rust and C are displayed as authored.

---

## Worked Example

```json
{
  "id": "ds-stack",
  "title": "Stack",
  "description": "Implement a stack (LIFO) using an array backing store with push and pop.",
  "difficulty": "easy",
  "mode": "data-structure",
  "tags": ["stack", "lifo", "array"],
  "codePaths": {
    "typescript": "/leetype/samples/ds-stack.ts",
    "rust": "/leetype/samples/ds-stack.rs",
    "cpp": "/leetype/samples/ds-stack.cpp",
    "c": "/leetype/samples/ds-stack.c"
  },
  "levelRequired": 1
}
```

paired with four files at `packages/some-content/public/leetype/samples/`:
`ds-stack.ts`, `ds-stack.rs`, `ds-stack.cpp`, `ds-stack.c`, each a complete
stack implementation in that language.

---

## Self-Check Before Returning

- [ ] Every `id` is unique within the array.
- [ ] Every `codePaths` entry has all four languages, each a non-empty
      `/leetype/samples/...` path (not `/code-samples/...`).
- [ ] Every referenced sample file is actually being written out, and its
      content is a complete, idiomatic solution - not a stub.
- [ ] `difficulty` is one of `easy`/`medium`/`hard` and `mode` is one of
      `data-structure`/`algorithm` - no other values.
- [ ] The array has at least one entry.
