/**
 * The test-layout convention (#772/#1475), as a pure function over a path list.
 * `scripts/check-test-layout.ts` feeds it `git ls-files`; these cases pin the
 * rule itself. See src/test-layout.ts for why it is not an ESLint rule.
 */

import {
  describeTestLayoutViolation,
  findTestLayoutViolations,
} from "@eslint/test-layout.js"
import { describe, expect, it } from "vitest"

describe("findTestLayoutViolations", () => {
  it("flags a source directory holding two tests, naming both", () => {
    expect(
      findTestLayoutViolations([
        "packages/x/src/lib/a.test.ts",
        "packages/x/src/lib/b.test.tsx",
        "packages/x/src/lib/index.ts",
      ])
    ).toEqual([
      {
        kind: "crowded",
        dir: "packages/x/src/lib",
        files: [
          "packages/x/src/lib/a.test.ts",
          "packages/x/src/lib/b.test.tsx",
        ],
      },
    ])
  })

  it("allows a directory's single test (the index.ts + index.test.ts shape)", () => {
    expect(
      findTestLayoutViolations([
        "packages/x/src/lib/index.ts",
        "packages/x/src/lib/index.test.ts",
        "packages/x/src/other/only.test.ts",
      ])
    ).toEqual([])
  })

  it("exempts __tests__/ and tests/ by the test's own directory name", () => {
    expect(
      findTestLayoutViolations([
        "packages/x/src/lib/__tests__/a.test.ts",
        "packages/x/src/lib/__tests__/b.test.ts",
        "packages/eslint/tests/a.lint.test.ts",
        "packages/eslint/tests/b.config.test.ts",
      ])
    ).toEqual([])
  })

  it("does not exempt a crowded directory merely nested under tests/", () => {
    expect(
      findTestLayoutViolations([
        "packages/x/tests/fixtures/a.test.ts",
        "packages/x/tests/fixtures/b.test.ts",
      ])
    ).toEqual([
      {
        kind: "crowded",
        dir: "packages/x/tests/fixtures",
        files: [
          "packages/x/tests/fixtures/a.test.ts",
          "packages/x/tests/fixtures/b.test.ts",
        ],
      },
    ])
  })

  it("counts only *.test.* files: specs, stories and sources never crowd a directory", () => {
    expect(
      findTestLayoutViolations([
        "extensions/x/src/a.test.ts",
        "extensions/x/src/a.spec.ts",
        "extensions/x/src/a.stories.tsx",
        "extensions/x/src/a.ts",
      ])
    ).toEqual([])
  })

  it("counts every test-file extension, including .mjs/.cts and dotted basenames", () => {
    expect(
      findTestLayoutViolations([
        "p/src/a.property.test.ts",
        "p/src/b.test.mjs",
        "p/src/c.test.cts",
      ])[0]
    ).toMatchObject({ kind: "crowded", dir: "p/src" })
  })

  it("ignores node_modules", () => {
    expect(
      findTestLayoutViolations([
        "p/node_modules/dep/a.test.js",
        "p/node_modules/dep/b.test.js",
      ])
    ).toEqual([])
  })

  describe("a src/routes/ tree keeps no test outside __tests__/", () => {
    it("flags even a lone test beside route files", () => {
      expect(
        findTestLayoutViolations(["apps/www/src/routes/about.test.tsx"])
      ).toEqual([
        { kind: "routesTree", file: "apps/www/src/routes/about.test.tsx" },
      ])
    })

    it("flags a routes directory named tests/, which is a route segment there", () => {
      expect(
        findTestLayoutViolations([
          "apps/www/src/routes/tests/index.test.tsx",
        ])[0]
      ).toMatchObject({ kind: "routesTree" })
    })

    it("allows routes tests inside __tests__/", () => {
      expect(
        findTestLayoutViolations([
          "apps/www/src/routes/_dashboard/__tests__/a.test.tsx",
          "apps/www/src/routes/_dashboard/__tests__/b.test.tsx",
        ])
      ).toEqual([])
    })
  })

  it("orders crowded directories before routes-tree files, each sorted", () => {
    const kinds = findTestLayoutViolations([
      "apps/www/src/routes/z.test.tsx",
      "p/src/b/x.test.ts",
      "p/src/b/y.test.ts",
      "p/src/a/x.test.ts",
      "p/src/a/y.test.ts",
    ]).map((v) => (v.kind === "crowded" ? v.dir : v.file))
    expect(kinds).toEqual([
      "p/src/a",
      "p/src/b",
      "apps/www/src/routes/z.test.tsx",
    ])
  })
})

describe("describeTestLayoutViolation", () => {
  it("names the directory, the files and the fix", () => {
    const [violation] = findTestLayoutViolations([
      "p/src/lib/a.test.ts",
      "p/src/lib/b.test.ts",
    ])
    expect(violation).toBeDefined()
    if (violation === undefined) return
    expect(describeTestLayoutViolation(violation)).toBe(
      "p/src/lib/ holds 2 test files (a.test.ts, b.test.ts). A source directory " +
        "keeps at most one *.test.* file; move all of them to p/src/lib/__tests__/."
    )
  })
})
