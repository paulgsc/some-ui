/**
 * The `/assurance` page's model: broken first, counts per verdict and never
 * one score, every reference a link, and the ledger as committed shown whole.
 */
import type { Ledger, Objective } from "@some-ui/assurance"
import { LEDGER } from "@some-ui/assurance"
import { describe, expect, it } from "vitest"

import { assurancePageOf, linkOf } from "@/lib/assurance"

const objective = (id: string, verdict: Objective["verdict"]): Objective => ({
  id,
  kind: "OA2",
  property: "outcome",
  claim: id,
  requirement: id,
  verdict,
  conclusion: id,
  evidence: [{ class: "structural", says: id }],
  ...(verdict === "holds"
    ? { proof: ["some-ui:a.test.ts#a"] }
    : { tracked: "some-ui#1" }),
  watch: { by: "none" },
  amendments: [],
})

const ledger = (...families: Array<Array<Objective>>): Ledger => ({
  schema: "some-ui.assurance-ledger/1",
  families: families.map((objectives, i) => ({
    id: `f${i}`,
    name: `F${i}`,
    why: "",
    paths: [],
    modules: [],
    objectives,
  })),
  synchronous: [],
})

describe("assurancePageOf", () => {
  it("puts broken first, then not yet shown, within and across families", () => {
    const page = assurancePageOf(
      ledger(
        [objective("A1", "holds"), objective("A2", "unproven")],
        [objective("B1", "holds"), objective("B2", "broken")]
      ),
      ""
    )
    expect(page.families.map((f) => f.family.id)).toEqual(["f1", "f0"])
    expect(page.families[0]?.rows.map((r) => r.objective.id)).toEqual([
      "B2",
      "B1",
    ])
    expect(page.families[1]?.rows.map((r) => r.objective.id)).toEqual([
      "A2",
      "A1",
    ])
  })

  it("counts each verdict apart, and leaves a retired promise out", () => {
    const retired = {
      ...objective("A3", "broken"),
      retired: { on: "2026-10-27", why: "Gone." },
    }
    const page = assurancePageOf(
      ledger([objective("A1", "holds"), objective("A2", "unproven"), retired]),
      ""
    )
    expect(page.tally).toEqual({ holds: 1, unproven: 1, broken: 0 })
    expect(page.families[0]?.rows).toHaveLength(2)
  })

  it("says merges are open until the promise that a failing check stops one holds", () => {
    expect(
      assurancePageOf(ledger([objective("GC1", "broken")]), "").mergesBlocked
    ).toBe(false)
    expect(
      assurancePageOf(ledger([objective("GC1", "holds")]), "").mergesBlocked
    ).toBe(true)
  })

  it("shows every promise in the ledger as committed, each with its proof or its issue", () => {
    const page = assurancePageOf(LEDGER, "abc1234")
    const rows = page.families.flatMap((f) => f.rows)
    const live = LEDGER.families
      .flatMap((f) => f.objectives)
      .filter((o) => !o.retired)
    expect(rows).toHaveLength(live.length)
    for (const row of rows) {
      if (row.objective.verdict === "holds")
        expect(row.proofs.length).toBeGreaterThan(0)
      else expect(row.tracked).not.toBeNull()
    }
  })
})

describe("linkOf", () => {
  it("opens a some-ui path at the commit the page was built from", () => {
    expect(linkOf("some-ui:docs/x.md#Part", "abc")).toEqual({
      label: "docs/x.md · Part",
      href: "https://github.com/paulgsc/some-ui/blob/abc/docs/x.md",
    })
  })

  it("opens a server path at main, and some-ui's when the commit is unknown", () => {
    expect(linkOf("server:src/a.rs", "abc")?.href).toBe(
      "https://github.com/paulgsc/server/blob/main/src/a.rs"
    )
    expect(linkOf("some-ui:a.ts", "")?.href).toBe(
      "https://github.com/paulgsc/some-ui/blob/main/a.ts"
    )
  })

  it("opens an issue, keeps a URL, and has no link for anything else", () => {
    expect(linkOf("server#525", "")?.href).toBe(
      "https://github.com/paulgsc/server/issues/525"
    )
    expect(linkOf("https://example.org/x", "")?.href).toBe(
      "https://example.org/x"
    )
    expect(linkOf("a note", "")).toBeNull()
  })
})
