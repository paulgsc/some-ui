import type { Ledger, Objective } from "@assurance/ledger"
import { parseLedger, readLedgerLeniently } from "@assurance/ledger"
import type { Surroundings } from "@assurance/rules"
import { findLedgerViolations, findRatchetViolations } from "@assurance/rules"
import { describe, expect, it } from "vitest"

const DECISION = "https://github.com/paulgsc/some-ui/issues/1#issuecomment-1"

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
  watch: { by: "dashboard" },
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
  isFile: (path) => path === "src/thing.test.ts",
  exists: (path) => path === "src/thing.test.ts" || path === "src",
  contains: (_path, text) => text === "arrives",
  routeModules: ["jobs", "health"],
  declaredIds: new Set(["L3"]),
  ...overrides,
})

const errors = (
  findings: ReadonlyArray<{ message: string; level: string }>
): string =>
  findings
    .filter((f) => f.level === "error")
    .map((f) => f.message)
    .join("\n")

describe("parseLedger", () => {
  it("names every problem, not only the first, an unknown field and a wrong shape among them", () => {
    const parsed = parseLedger({
      schema: "other",
      families: [
        {
          id: "f",
          name: "F",
          why: "W",
          paths: [],
          modules: [],
          objectives: [{ id: "A1", retierd: {} }],
        },
      ],
      synchronous: {},
    })
    const problems = parsed.ok ? "" : parsed.problems.join("\n")
    expect(problems).toContain("schema")
    expect(problems).toContain("needs a claim")
    expect(problems).toContain('unknown field "retierd"')
    expect(problems).toContain("synchronous: is a list")
  })

  it("rejects a malformed measurement rather than leaving it out of the comparison", () => {
    const comparison = {
      what: "Steps",
      x: "asks",
      y: "steps",
      limits: "Local.",
      series: [
        {
          label: "today",
          points: [
            [1000, 12066],
            [100000, "1200066"],
          ],
        },
        { label: "with the index", points: [[1000, 312]] },
      ],
    }
    const parsed = parseLedger({
      ...ledgerOf([objective()]),
      families: [
        {
          id: "f",
          name: "F",
          why: "W",
          paths: [],
          modules: ["jobs"],
          objectives: [{ ...objective(), comparison }],
        },
      ],
    })
    expect(parsed.ok ? "" : parsed.problems.join("\n")).toContain(
      "points[1]: is an [x, y] pair of numbers"
    )
  })

  it("reads what it can of a ledger another grammar wrote, for the ratchet's base", () => {
    const old = {
      ...ledgerOf([objective()]),
      schema: "some-ui.assurance-ledger/0",
    }
    expect(parseLedger(old).ok).toBe(false)
    expect(readLedgerLeniently(old)?.families[0]?.objectives[0]?.id).toBe("ZZ1")
  })
})

describe("proof or issue", () => {
  it("passes a holds whose proof is a tracked file that names it", () => {
    expect(findLedgerViolations(ledgerOf([objective()]), around())).toEqual([])
  })

  it.each([
    [{ proof: [] }, "names the proof"],
    [{ proof: ["some-ui:src/gone.test.ts#arrives"] }, "not a tracked file"],
    [{ proof: ["some-ui:src#arrives"] }, "not a tracked file"],
    [
      { proof: ["some-ui:src/thing.test.ts#elsewhere"] },
      'does not mention "elsewhere"',
    ],
    [{ proof: ["some-ui:src/thing.test.ts"] }, "some-ui:<file>#<name>"],
    [{ proof: ["some-ui:src/thing.test.ts#ar"] }, "at least 3 characters"],
    [{ verdict: "broken" as const, proof: undefined }, "names the issue"],
    [{ verdict: "unproven" as const, tracked: "#12" }, "names the issue"],
    [{ id: "mi1" }, "area prefix"],
    [{ id: "L3" }, "already an invariant"],
    [{ kind: "OA9" }, "is not one of"],
    [
      {
        evidence: [
          { class: "measured" as const, says: "x", ref: "some-ui:gone.ts" },
        ],
      },
      "evidence gone.ts does not exist",
    ],
    [
      { watch: { by: "dashboard" as const, ref: "some-ui:gone.json" } },
      "watch gone.json does not exist",
    ],
    [
      {
        amendments: [
          { on: "2026-10-27", change: "c", why: "w", decision: "x" },
        ],
      },
      "decision is a link",
    ],
  ])("fails %o", (overrides, expected) => {
    expect(
      errors(findLedgerViolations(ledgerOf([objective(overrides)]), around()))
    ).toContain(expected)
  })

  it("takes a server proof's path as written, until the server checks it (server#526)", () => {
    const o = objective({ proof: ["server:src/pass.rs#a_test"] })
    expect(findLedgerViolations(ledgerOf([o]), around())).toEqual([])
  })

  it("fails an ID used twice", () => {
    const found = findLedgerViolations(
      ledgerOf([objective(), objective()]),
      around()
    )
    expect(errors(found)).toContain("ID is used twice")
  })
})

describe("coverage of the server's routes (GC2)", () => {
  it("fails a server module that is in no family and not synchronous", () => {
    const found = findLedgerViolations(
      ledgerOf([objective()]),
      around({ routeModules: ["jobs", "health", "voice"] })
    )
    expect(errors(found)).toContain('"voice" is in no family')
  })

  it("warns of a module the server does not serve, so one can be placed ahead of its snapshot", () => {
    const found = findLedgerViolations(
      ledgerOf([objective()]),
      around({ routeModules: ["jobs"] })
    )
    expect(errors(found)).toBe("")
    expect(found.map((f) => f.message).join("\n")).toContain(
      '"health" is not one the server serves'
    )
  })

  it("fails a module placed twice", () => {
    const found = findLedgerViolations(
      ledgerOf([objective()], ["jobs"], ["jobs", "health"]),
      around()
    )
    expect(errors(found)).toContain('"jobs" is in both')
  })
})

describe("the ratchet against the base branch (GC3)", () => {
  const amendment = {
    on: "2026-10-27",
    change: "Loosened to 30 minutes.",
    why: "Home's disk is slower than measured.",
    decision: DECISION,
  }

  it.each([
    [
      "a holds that stops holding",
      { verdict: "broken" as const },
      "from holds to broken",
    ],
    [
      "a changed claim",
      { claim: "A thing reaches home, eventually." },
      "claim changed",
    ],
    [
      "a changed requirement",
      { requirement: "Within a day." },
      "requirement changed",
    ],
    ["a changed kind", { kind: "OA6" }, "kind changed"],
    ["a changed property", { property: "work" as const }, "property changed"],
    [
      "a weaker watch",
      { watch: { by: "none" as const } },
      "watch went from dashboard to none",
    ],
    [
      "a loosened bound",
      { bound: { value: 1800, unit: "seconds", tighter: "lower" as const } },
      "loosened from 1200 to 1800",
    ],
    ["a dropped bound", { bound: undefined }, "bound was dropped"],
    [
      "a bound that measures something else",
      { bound: { value: 1200, unit: "seconds", tighter: "higher" as const } },
      "changed what it measures",
    ],
    [
      "a retirement",
      { retired: { on: "2026-10-27", why: "Gone." } },
      "it retired",
    ],
  ])(
    "fails %s with no new amendment, and passes it with one",
    (_name, change, expected) => {
      const base = ledgerOf([objective()])
      expect(
        errors(findRatchetViolations(base, ledgerOf([objective(change)])))
      ).toContain(expected)

      const amended = ledgerOf([
        objective({ ...change, amendments: [amendment] }),
      ])
      expect(findRatchetViolations(base, amended)).toEqual([])
    }
  )

  it("lets a bound tighten, a watch strengthen and a verdict improve without an amendment", () => {
    const base = ledgerOf([
      objective({ verdict: "broken", tracked: "some-ui#1" }),
    ])
    const better = ledgerOf([
      objective({
        bound: { value: 600, unit: "seconds", tighter: "lower" },
        watch: { by: "alert" },
      }),
    ])
    expect(findRatchetViolations(base, better)).toEqual([])
  })

  it("never lets an objective disappear", () => {
    const found = findRatchetViolations(ledgerOf([objective()]), ledgerOf([]))
    expect(errors(found)).toContain("retires instead")
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
      errors(findRatchetViolations(ledgerOf([retired]), ledgerOf([back])))
    ).toContain("stays retired")
    expect(
      errors(findRatchetViolations(ledgerOf([retired]), ledgerOf([rewritten])))
    ).toContain("only appended")
  })

  it("lets a module leave a family for synchronous only with a decision", () => {
    const base = ledgerOf([objective()], ["jobs"], ["health"])
    const quiet = ledgerOf([objective()], [], ["health", "jobs"])
    expect(errors(findRatchetViolations(base, quiet))).toContain(
      "left family f for synchronous"
    )

    const decided: Ledger = {
      ...quiet,
      synchronous: [
        { module: "health", why: "At once." },
        { module: "jobs", why: "At once.", decision: DECISION },
      ],
    }
    expect(findRatchetViolations(base, decided)).toEqual([])
  })
})
