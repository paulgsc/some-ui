// The test-layout convention (#772, enforced by #1475): a source directory
// keeps at most one `*.test.*` file. A second one means all of that
// directory's tests live in `<dir>/__tests__/` instead, basenames unchanged, so
// test modules stop crowding source modules out of the directory listing. A
// generated TanStack routing tree (`src/routes/**`) keeps none at all outside
// `__tests__/`.
//
// Directories exempt from the one-test limit are the dedicated test trees,
// named `__tests__` or `tests` (packages/eslint/tests,
// packages/some-styles/styles-build/tests). The exemption is by a test's own
// directory name only, not by any ancestor, so `tests/fixtures/x/` with two
// tests is still crowded. Under `src/routes/` only `__tests__` is exempt: a
// `tests` directory there is a route segment.
//
// Why this is a pure function over a path list rather than an ESLint rule: the
// verdict for one file depends on its siblings, and every workspace lints with
// `eslint --cache`, which re-uses a file's cached result until that file's own
// content changes. Delete one of two crowded tests and the survivor's cached
// "crowded" error outlives the fix (bot-found on #1531, and reproduced). A
// directory-level invariant needs an uncached, whole-tree check:
// `scripts/check-test-layout.ts` runs this over `git ls-files`.

const TEST_FILE = /\.test\.[cm]?[jt]sx?$/
const DEDICATED_TEST_DIRS = new Set(["__tests__", "tests"])
const ROUTES_TREE = /(^|\/)src\/routes\//

export type TestLayoutViolation =
  | {
      readonly kind: "crowded"
      readonly dir: string
      readonly files: ReadonlyArray<string>
    }
  | { readonly kind: "routesTree"; readonly file: string }

function dirOf(path: string): string {
  const slash = path.lastIndexOf("/")
  return slash === -1 ? "" : path.slice(0, slash)
}

function baseOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1)
}

/**
 * Violations among `paths` (repo-relative, `/`-separated; anything that is not
 * a `*.test.*` file is ignored), in a stable order: crowded directories first,
 * sorted by directory, then routes-tree files, sorted by path.
 */
export function findTestLayoutViolations(
  paths: Iterable<string>
): Array<TestLayoutViolation> {
  const byDir = new Map<string, Array<string>>()
  const routesTree: Array<string> = []

  for (const path of paths) {
    if (!TEST_FILE.test(path) || path.includes("/node_modules/")) continue
    const dir = dirOf(path)
    const dirName = baseOf(dir)
    if (ROUTES_TREE.test(path)) {
      if (dirName !== "__tests__") routesTree.push(path)
      continue
    }
    if (DEDICATED_TEST_DIRS.has(dirName)) continue
    const files = byDir.get(dir) ?? []
    files.push(path)
    byDir.set(dir, files)
  }

  const crowded: Array<TestLayoutViolation> = [...byDir]
    .filter(([, files]) => files.length > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, files]) => ({ kind: "crowded", dir, files: files.sort() }))

  return [
    ...crowded,
    ...routesTree
      .sort()
      .map((file): TestLayoutViolation => ({ kind: "routesTree", file })),
  ]
}

/** One human-readable line per violation, naming the fix. */
export function describeTestLayoutViolation(
  violation: TestLayoutViolation
): string {
  switch (violation.kind) {
    case "crowded": {
      return (
        `${violation.dir}/ holds ${violation.files.length} test files ` +
        `(${violation.files.map(baseOf).join(", ")}). A source directory keeps ` +
        `at most one *.test.* file; move all of them to ${violation.dir}/__tests__/.`
      )
    }
    case "routesTree": {
      return (
        `${violation.file}: a *.test.* file inside a src/routes/ tree must live ` +
        `in a __tests__/ directory, not beside the generated route files.`
      )
    }
    default: {
      const unhandled: never = violation
      throw new Error(`Unhandled test-layout violation: ${String(unhandled)}`)
    }
  }
}
