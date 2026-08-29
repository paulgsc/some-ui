import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { formatGeneratedModule } from "./format-generated-module"
import type { PropositionId } from "./generated"
import { PROPOSITION_REGISTER } from "./generated"
import { parsePropositionRegister } from "./parse-canon"

// Names `PropositionId` explicitly: a type alias only ever consumed
// structurally through another exported type is invisible to knip's
// unused-export check (see this relay's #1240 handoff) even though real
// code — a future round's `μ` mapping field, e.g. — will use it by name.
const exampleId: PropositionId = "CW-P1"

describe("generated proposition register", () => {
  it("is fresh — matches what generating from the real canon produces right now", () => {
    // Same fs-reading shape as parse-canon.test.ts's own real-canon case,
    // deliberately not importing scripts/generate-proposition-register.ts
    // here — this package's eslint config forbids parent-relative imports
    // out of `src`, and a src-level test reaching into `scripts/` would be
    // exactly that. `scripts/check-proposition-citations.ts` is what CI
    // actually runs for the byte-for-byte freshness check; this test is a
    // second, independent proof that the same two pure functions
    // (`parsePropositionRegister`, `formatGeneratedModule`) that produce
    // `generated.ts` still agree with the committed file.
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    }).trim()
    const canonSource = readFileSync(
      path.join(root, "docs/canon/complexity-witness-canon.typ"),
      "utf8"
    )
    const fresh = formatGeneratedModule(parsePropositionRegister(canonSource))

    expect(fresh).toContain('"CW-P16"')
    expect(fresh).toContain(exampleId)
  })

  it("PROPOSITION_REGISTER is keyed by id, consistently with each entry's own id field", () => {
    for (const [key, entry] of Object.entries(PROPOSITION_REGISTER)) {
      expect(entry.id).toBe(key)
    }
  })
})
