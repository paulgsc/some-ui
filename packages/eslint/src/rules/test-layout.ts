import { readdirSync } from "node:fs"
import { basename, dirname, sep } from "node:path"
import type { Rule } from "eslint"

// The test-layout convention (#772, enforced here by #1475): a source directory
// keeps at most one `*.test.*` file. A second one means all of that
// directory's tests live in `<dir>/__tests__/` instead, basenames unchanged, so
// test modules stop crowding source modules out of the directory listing. The
// generated TanStack routing tree (`src/routes/**`) keeps none at all outside
// `__tests__/`: a stray test there is route-file noise at best.
//
// Colocating beside the file under edit is the path of least resistance, so
// without a static check the layout drifts straight back. ESLint sees one file
// at a time, which is why "this directory has two tests" is answered with a
// readdirSync of the file's own directory: one directory read per test file
// linted, never a walk.
//
// Directories exempt from the one-test limit are the dedicated test trees,
// named `__tests__` or `tests` (packages/eslint/tests,
// packages/some-styles/styles-build/tests). The exemption is by the file's own
// directory name only, not by any ancestor, so `tests/fixtures/x/` with two
// tests is still crowded.

const TEST_FILE = /\.test\.[cm]?[jt]sx?$/
const DEDICATED_TEST_DIRS = new Set(["__tests__", "tests"])

export const testLayout: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Keep at most one *.test.* file per source directory (more move to __tests__/), and none in a src/routes/ tree outside __tests__/.",
    },
    schema: [],
    messages: {
      crowded:
        "{{ dir }}/ holds {{ count }} test files. A source directory keeps at most one *.test.* file; move all of this directory's tests to {{ dir }}/__tests__/ (basenames unchanged).",
      routesTree:
        "A *.test.* file inside a src/routes/ tree must live in a __tests__/ directory, not beside the generated route files.",
    },
  },

  create(context) {
    const filename = context.filename
    if (!TEST_FILE.test(filename)) return {}

    const dir = dirname(filename)
    const dirName = basename(dir)
    const inRoutesTree = filename.split(sep).join("/").includes("/src/routes/")

    return {
      Program(node): void {
        // Checked before the dedicated-directory exemption: under src/routes/
        // a directory named `tests` is itself a route segment, not a test tree.
        if (inRoutesTree) {
          if (dirName !== "__tests__") {
            context.report({ node, messageId: "routesTree" })
          }
          return
        }
        if (DEDICATED_TEST_DIRS.has(dirName)) return

        let testsHere: Array<string>
        try {
          testsHere = readdirSync(dir).filter((name) => TEST_FILE.test(name))
        } catch {
          // Linting text that has no directory on disk (stdin, a virtual
          // path): there is nothing to count.
          return
        }
        if (testsHere.length > 1) {
          context.report({
            node,
            messageId: "crowded",
            data: { dir: dirName, count: String(testsHere.length) },
          })
        }
      },
    }
  },
}
