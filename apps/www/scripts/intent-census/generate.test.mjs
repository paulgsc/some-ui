/**
 * The generator's own regression coverage, run by the ordinary `pnpm test`
 * (see vitest.config.ts) rather than a separate CI step - a stale census is
 * a regression like any other.
 *
 * Three things have to hold for "derived, not hand-maintained" (#938) to be
 * true rather than aspirational: the walk and the annotations can't drift
 * apart in either direction, the two independent counts have to agree with
 * what they claim to agree with, and re-running on an unchanged tree has to
 * produce a byte-identical file.
 */

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { ROWS, SITE_ANNOTATIONS } from "./annotations.mjs"
import { idOf, walkIntentProducers } from "./walk.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, "../../../..")
const SRC_ROOT = resolve(REPO_ROOT, "apps/www/src")
const GENERATE_SCRIPT = resolve(HERE, "generate.mjs")
const OUTPUT_PATH = resolve(REPO_ROOT, "docs/intent-census.md")

describe("intent census generator", () => {
  it("has no call site the walk finds without an annotation, and no annotation without a matching call site", () => {
    const sites = walkIntentProducers(SRC_ROOT, REPO_ROOT)
    const foundIds = new Set(sites.map(idOf))
    const annotatedIds = new Set(Object.keys(SITE_ANNOTATIONS))

    const uncovered = [...foundIds].filter((id) => !annotatedIds.has(id))
    const stale = [...annotatedIds].filter((id) => !foundIds.has(id))

    expect(uncovered, "call sites with no annotation").toEqual([])
    expect(stale, "annotations with no matching call site").toEqual([])
  })

  it("every ROWS entry is referenced by at least one site, and every site's row exists", () => {
    const referencedRows = new Set(
      Object.values(SITE_ANNOTATIONS)
        .map((a) => a.row)
        .filter((row) => row !== null)
    )
    const missingRowRefs = [...referencedRows].filter((row) => !(row in ROWS))
    const orphanRows = Object.keys(ROWS).filter(
      (row) => !referencedRows.has(row)
    )

    expect(
      missingRowRefs,
      "site annotations pointing at an undefined row"
    ).toEqual([])
    expect(orphanRows, "ROWS entries no site points at").toEqual([])
  })

  it("finds exactly 17 mutate()/mutateAsync() call sites, matching #934's preliminary count", () => {
    const sites = walkIntentProducers(SRC_ROOT, REPO_ROOT)
    const mutateCalls = sites.filter((s) => s.kind === "mutate-call")
    expect(mutateCalls).toHaveLength(17)
  })

  it("finds exactly 8 useMutation( definitions, matching #934's preliminary count", () => {
    const sites = walkIntentProducers(SRC_ROOT, REPO_ROOT)
    const definitions = sites.filter(
      (s) => s.kind === "use-mutation-definition"
    )
    expect(definitions).toHaveLength(8)
  })

  it("regenerates docs/intent-census.md byte-identical on an unchanged tree", () => {
    execFileSync(process.execPath, [GENERATE_SCRIPT, "--write"], {
      cwd: REPO_ROOT,
    })
    const first = readFileSync(OUTPUT_PATH, "utf8")
    execFileSync(process.execPath, [GENERATE_SCRIPT, "--write"], {
      cwd: REPO_ROOT,
    })
    const second = readFileSync(OUTPUT_PATH, "utf8")
    expect(second).toBe(first)
  })

  it("--check passes against the checked-in docs/intent-census.md", () => {
    // Regenerate first so this test isn't sensitive to run order against the
    // "byte-identical" test above - it asserts --check's own logic, not
    // incidentally relying on a previous test having just written the file.
    execFileSync(process.execPath, [GENERATE_SCRIPT, "--write"], {
      cwd: REPO_ROOT,
    })
    const result = execFileSync(
      process.execPath,
      [GENERATE_SCRIPT, "--check"],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
      }
    )
    expect(result).toContain("up to date")
  })
})
