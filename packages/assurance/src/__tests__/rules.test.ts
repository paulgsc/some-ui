import { readFileSync } from "node:fs"
import { LEDGER } from "@assurance/index"
import type { Ledger, Objective } from "@assurance/ledger"
import { parseLedger } from "@assurance/ledger"
import type { Surroundings } from "@assurance/rules"
import { findLedgerViolations, findRatchetViolations } from "@assurance/rules"
import { describe, expect, it } from "vitest"

const objective = (overrides: Partial<Objective> = {}): Objective => ({
  id: "ZZ1",
  kind: "OA2",
  property: "outcome",
  claim: "A thing reaches home.",
  requirement: "Within 20 minutes.",
  bound: { value: 1200, unit: "seconds", tighter: "lower" },
  verdict: "holds",
  conclusion: "It does.",
  evidence: [{ class: "measured", says: "A test shows it." }],
  proof: ["some-ui:src/thing.test.ts#arrives"],
  watch: { by: "none" },
  amendments: [],
  ...overrides,
})

const ledgerOf = (
  objectives: ReadonlyArray<Objective>,
  modules: ReadonlyArray<string> = ["jobs"],
  synchronous: ReadonlyArray<string> = ["health"]
): Ledger => ({
  schema: "some-ui.assurance-ledger/1",
  families: [
    { id: "f", name: "F", why: "Why.", paths: [], modules, objectives },
  ],
  synchronous: synchronous.map((module) => ({ module, why: "At once." })),
})

const around = (overrides: Partial<Surroundings> = {}): Surroundings => ({
  exists: (path) => path === "src/thing.test.ts",
  contains: (_path, text) => text === "arrives",
  routeModules: ["jobs", "health"],
  declaredIds: new Set(["L3"]),
  ...overrides,
})

const messages = (
  findings: ReadonlyArray<{ message: string }>
): Array<string> => findings.map((f) => f.message)

describe("the ledger as committed", () => {
  it("parses, and every objective holds with a proof or names its issue", () => {
    const parsed = parseLedger(
      JSON.parse(
        readFileSync(new URL("../ledger.json", import.meta.url), "utf8")
      )
    )
    expect(parsed.ok ? [] : parsed.problems).toEqual([])
    expect(LEDGER.families.length).toBeGreaterThan(0)
  })
})

describe("parseLedger", () => {
  it("names every problem, not only the first", () => {
    const parsed = parseLedger({
      schema: "other",
      families: [
        {
          id: "f",
          name: "F",
          why: "W",
          paths: [],
          modules: [],
          objectives: [{ id: "A1" }],
        },
      ],
      synchronous: [{}],
    })
    expect(parsed.ok).toBe(false)
    const problems = parsed.ok ? [] : parsed.problems
    expect(problems.some((p) => p.startsWith("schema"))).toBe(true)
    expect(problems.some((p) => p.includes("needs a claim"))).toBe(true)
    expect(problems.some((p) => p.startsWith("synchronous[0]"))).toBe(true)
  })
})

describe("proof or issue", () => {
  it("passes a holds whose proof exists and mentions its name", () => {
    expect(findLedgerViolations(ledgerOf([objective()]), around())).toEqual([])
  })

  it.each([
    [{ proof: [] }, "names the proof"],
    [{ proof: ["some-ui:src/gone.test.ts"] }, "does not exist"],
    [
      { proof: ["some-ui:src/thing.test.ts#elsewhere"] },
      'does not mention "elsewhere"',
    ],
    [{ proof: ["src/thing.test.ts"] }, "some-ui:<path>"],
    [{ verdict: "broken" as const, proof: undefined }, "names the issue"],
    [{ verdict: "unproven" as const, tracked: "#12" }, "names the issue"],
    [{ id: "mi1" }, "area prefix"],
    [{ id: "L3" }, "already an invariant"],
    [{ kind: "OA9" }, "is not one of"],
  ])("fails %o", (overrides, expected) => {
    const found = messages(
      findLedgerViolations(ledgerOf([objective(overrides)]), around())
    )
    expect(found.join("\n")).toContain(expected)
  })

  it("takes a server proof as written, which the server's CI checks", () => {
    const o = objective({ proof: ["server:src/pass.rs#a_test"] })
    expect(findLedgerViolations(ledgerOf([o]), around())).toEqual([])
  })

  it("fails an ID used twice", () => {
    const found = findLedgerViolations(
      ledgerOf([objective(), objective()]),
      around()
    )
    expect(messages(found)).toContain("ID is used twice")
  })
})

describe("coverage of the server's routes (GC2)", () => {
  it("fails a server module that is in no family and not synchronous", () => {
    const found = findLedgerViolations(
      ledgerOf([objective()]),
      around({ routeModules: ["jobs", "health", "voice"] })
    )
    expect(messages(found).join("\n")).toContain('"voice" is in no family')
  })

  it("fails a module the server no longer serves", () => {
    const found = findLedgerViolations(
      ledgerOf([objective()]),
      around({ routeModules: ["jobs"] })
    )
    expect(messages(found).join("\n")).toContain(
      '"health" is not one the server serves'
    )
  })

  it("fails a module placed twice", () => {
    const found = findLedgerViolations(
      ledgerOf([objective()], ["jobs"], ["jobs", "health"]),
      around()
    )
    expect(messages(found).join("\n")).toContain('"jobs" is in both')
  })
})

describe("the ratchet against the base branch (GC3)", () => {
  const amendment = {
    on: "2026-10-27",
    change: "Loosened to 30 minutes.",
    why: "Home's disk is slower than measured.",
    decision: "https://github.com/paulgsc/some-ui/issues/1#issuecomment-1",
  }

  it.each([
    [
      "a holds that stops holding",
      { verdict: "broken" as const },
      "from holds to broken",
    ],
    [
      "a loosened bound",
      { bound: { value: 1800, unit: "seconds", tighter: "lower" as const } },
      "loosened from 1200 to 1800",
    ],
    ["a dropped bound", { bound: undefined }, "bound was dropped"],
    [
      "a bound that measures something else",
      { bound: { value: 1200, unit: "minutes", tighter: "lower" as const } },
      "changed what it measures",
    ],
    [
      "a changed requirement",
      { requirement: "Within a day." },
      "requirement changed",
    ],
    ["a changed kind", { kind: "OA6" }, "kind changed"],
    [
      "a retirement",
      { retired: { on: "2026-10-27", why: "Gone." } },
      "it retired",
    ],
  ])(
    "fails %s with no new amendment, and passes it with one",
    (_name, change, expected) => {
      const base = ledgerOf([objective()])
      const quiet = findRatchetViolations(base, ledgerOf([objective(change)]))
      expect(messages(quiet).join("\n")).toContain(expected)

      const amended = ledgerOf([
        objective({ ...change, amendments: [amendment] }),
      ])
      expect(findRatchetViolations(base, amended)).toEqual([])
    }
  )

  it("lets a bound tighten and a verdict improve without an amendment", () => {
    const base = ledgerOf([
      objective({ verdict: "broken", tracked: "some-ui#1" }),
    ])
    const better = ledgerOf([
      objective({ bound: { value: 600, unit: "seconds", tighter: "lower" } }),
    ])
    expect(findRatchetViolations(base, better)).toEqual([])
  })

  it("never lets an objective disappear, even with an amendment elsewhere", () => {
    const found = findRatchetViolations(ledgerOf([objective()]), ledgerOf([]))
    expect(messages(found).join("\n")).toContain("retires instead")
  })

  it("never lets a retired objective come back, or an amendment be rewritten", () => {
    const retired = objective({
      retired: { on: "2026-10-27", why: "Gone." },
      amendments: [amendment],
    })
    const back = objective({ amendments: [amendment, amendment] })
    const rewritten = objective({
      retired: retired.retired,
      amendments: [{ ...amendment, why: "Something else." }],
    })
    expect(
      messages(
        findRatchetViolations(ledgerOf([retired]), ledgerOf([back]))
      ).join("\n")
    ).toContain("stays retired")
    expect(
      messages(
        findRatchetViolations(ledgerOf([retired]), ledgerOf([rewritten]))
      ).join("\n")
    ).toContain("only appended")
  })
})
