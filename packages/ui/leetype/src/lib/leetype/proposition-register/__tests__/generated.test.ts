import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { formatGeneratedModule } from "@leetype/lib/leetype/proposition-register/format-generated-module"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import { parsePropositionRegister } from "@leetype/lib/leetype/proposition-register/parse-canon"
import { describe, expect, it } from "vitest"

// Names `PropositionId` so knip's unused-export check sees it referenced.
const exampleId: PropositionId = "CW-P1"

describe("generated proposition register", () => {
  it("is fresh — matches what generating from the real canon produces right now", () => {
    // Not importing scripts/ (parent-relative imports out of src are banned).
    // CI's byte-for-byte check is check-proposition-citations.ts; this is an
    // independent check of the two pure functions behind generated.ts.
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
