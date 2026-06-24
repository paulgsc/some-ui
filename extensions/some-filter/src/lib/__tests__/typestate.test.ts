import { describe, expect, it } from "vitest"

import type { ContentPhase, ContentState } from "../typestate"
import { nextPhase, PHASE_TRANSITIONS, vendorBgCovered } from "../typestate"

// ── PHASE_TRANSITIONS table ────────────────────────────────────────────────

describe("PHASE_TRANSITIONS table", () => {
  it("covers every ContentPhase as a source", () => {
    const phases: Array<ContentPhase> = ["prepaint", "init", "settled", "repainting"]
    for (const p of phases) {
      expect(Object.keys(PHASE_TRANSITIONS)).toContain(p)
    }
  })

  it("declares the full happy-path chain prepaint → init → settled", () => {
    expect(PHASE_TRANSITIONS.prepaint.script_start).toBe("init")
    expect(PHASE_TRANSITIONS.init.state_committed).toBe("settled")
  })

  it("declares the repaint sub-cycle settled → repainting → settled", () => {
    expect(PHASE_TRANSITIONS.settled.vendor_repaint).toBe("repainting")
    expect(PHASE_TRANSITIONS.repainting.state_committed).toBe("settled")
  })

  it("declares re-init triggers from settled", () => {
    expect(PHASE_TRANSITIONS.settled.user_cycle).toBe("init")
    expect(PHASE_TRANSITIONS.settled.bg_reconcile).toBe("init")
  })
})

// ── nextPhase ──────────────────────────────────────────────────────────────

describe("nextPhase — declared transitions", () => {
  it("prepaint × script_start → init", () => {
    expect(nextPhase("prepaint", "script_start")).toBe("init")
  })

  it("init × state_committed → settled", () => {
    expect(nextPhase("init", "state_committed")).toBe("settled")
  })

  it("settled × vendor_repaint → repainting", () => {
    expect(nextPhase("settled", "vendor_repaint")).toBe("repainting")
  })

  it("settled × user_cycle → init", () => {
    expect(nextPhase("settled", "user_cycle")).toBe("init")
  })

  it("settled × bg_reconcile → init", () => {
    expect(nextPhase("settled", "bg_reconcile")).toBe("init")
  })

  it("repainting × state_committed → settled", () => {
    expect(nextPhase("repainting", "state_committed")).toBe("settled")
  })
})

describe("nextPhase — no-op for undeclared transitions", () => {
  it("prepaint ignores state_committed", () => {
    expect(nextPhase("prepaint", "state_committed")).toBe("prepaint")
  })

  it("prepaint ignores vendor_repaint", () => {
    expect(nextPhase("prepaint", "vendor_repaint")).toBe("prepaint")
  })

  it("prepaint ignores user_cycle", () => {
    expect(nextPhase("prepaint", "user_cycle")).toBe("prepaint")
  })

  it("prepaint ignores bg_reconcile", () => {
    expect(nextPhase("prepaint", "bg_reconcile")).toBe("prepaint")
  })

  it("init ignores vendor_repaint", () => {
    expect(nextPhase("init", "vendor_repaint")).toBe("init")
  })

  it("init ignores user_cycle", () => {
    expect(nextPhase("init", "user_cycle")).toBe("init")
  })

  it("init ignores bg_reconcile", () => {
    expect(nextPhase("init", "bg_reconcile")).toBe("init")
  })

  it("init ignores script_start", () => {
    expect(nextPhase("init", "script_start")).toBe("init")
  })

  it("repainting ignores vendor_repaint", () => {
    expect(nextPhase("repainting", "vendor_repaint")).toBe("repainting")
  })

  it("repainting ignores user_cycle", () => {
    expect(nextPhase("repainting", "user_cycle")).toBe("repainting")
  })

  it("repainting ignores bg_reconcile", () => {
    expect(nextPhase("repainting", "bg_reconcile")).toBe("repainting")
  })

  it("repainting ignores script_start", () => {
    expect(nextPhase("repainting", "script_start")).toBe("repainting")
  })
})

describe("nextPhase — composite sequences", () => {
  it("happy-path: prepaint → init → settled", () => {
    let p: ContentPhase = "prepaint"
    p = nextPhase(p, "script_start")
    expect(p).toBe("init")
    p = nextPhase(p, "state_committed")
    expect(p).toBe("settled")
  })

  it("repaint sub-cycle: settled → repainting → settled", () => {
    let p: ContentPhase = "settled"
    p = nextPhase(p, "vendor_repaint")
    expect(p).toBe("repainting")
    p = nextPhase(p, "state_committed")
    expect(p).toBe("settled")
  })

  it("user cycle: settled → init → settled", () => {
    let p: ContentPhase = "settled"
    p = nextPhase(p, "user_cycle")
    expect(p).toBe("init")
    p = nextPhase(p, "state_committed")
    expect(p).toBe("settled")
  })

  it("bg reconcile: settled → init → settled", () => {
    let p: ContentPhase = "settled"
    p = nextPhase(p, "bg_reconcile")
    expect(p).toBe("init")
    p = nextPhase(p, "state_committed")
    expect(p).toBe("settled")
  })

  it("full lifecycle: prepaint → init → settled → repainting → settled → init → settled", () => {
    let p: ContentPhase = "prepaint"
    p = nextPhase(p, "script_start") // → init
    p = nextPhase(p, "state_committed") // → settled
    p = nextPhase(p, "vendor_repaint") // → repainting
    p = nextPhase(p, "state_committed") // → settled
    p = nextPhase(p, "user_cycle") // → init
    p = nextPhase(p, "state_committed") // → settled
    expect(p).toBe("settled")
  })
})

// ── vendorBgCovered invariant ──────────────────────────────────────────────

describe("vendorBgCovered — prepaint phase", () => {
  it("prepaint:auto has vendor BG covered", () => {
    expect(vendorBgCovered({ phase: "prepaint", mode: "auto" })).toBe(true)
  })

  it("prepaint:legacy has vendor BG covered", () => {
    expect(vendorBgCovered({ phase: "prepaint", mode: "legacy" })).toBe(true)
  })

  it("prepaint:off has vendor BG covered (veil is up regardless of mode)", () => {
    expect(vendorBgCovered({ phase: "prepaint", mode: "off" })).toBe(true)
  })
})

describe("vendorBgCovered — init phase", () => {
  it("init:auto has vendor BG covered", () => {
    expect(vendorBgCovered({ phase: "init", mode: "auto" })).toBe(true)
  })

  it("init:legacy has vendor BG covered", () => {
    expect(vendorBgCovered({ phase: "init", mode: "legacy" })).toBe(true)
  })

  it("init:off has vendor BG covered (veil still up while applying off state)", () => {
    expect(vendorBgCovered({ phase: "init", mode: "off" })).toBe(true)
  })
})

describe("vendorBgCovered — settled phase", () => {
  it("settled:auto has vendor BG covered (dark theme active)", () => {
    expect(vendorBgCovered({ phase: "settled", mode: "auto" })).toBe(true)
  })

  it("settled:legacy has vendor BG covered (invert filter active)", () => {
    expect(vendorBgCovered({ phase: "settled", mode: "legacy" })).toBe(true)
  })

  it("settled:off intentionally exposes vendor BG (covered = false)", () => {
    expect(vendorBgCovered({ phase: "settled", mode: "off" })).toBe(false)
  })
})

describe("vendorBgCovered — repainting phase", () => {
  it("repainting:auto has vendor BG covered (veil re-raised)", () => {
    expect(vendorBgCovered({ phase: "repainting", mode: "auto" })).toBe(true)
  })

  it("repainting:legacy has vendor BG covered", () => {
    expect(vendorBgCovered({ phase: "repainting", mode: "legacy" })).toBe(true)
  })

  it("repainting:off has vendor BG covered (veil re-raised)", () => {
    expect(vendorBgCovered({ phase: "repainting", mode: "off" })).toBe(true)
  })
})

describe("vendorBgCovered — exhaustive invariant", () => {
  it("only settled:off is the unique state that intentionally exposes vendor BG", () => {
    const allPhases: Array<ContentPhase> = [
      "prepaint",
      "init",
      "settled",
      "repainting",
    ]
    const exposed: Array<ContentState> = []

    for (const phase of allPhases) {
      for (const mode of ["auto", "legacy", "off"] as const) {
        const state: ContentState = { phase, mode }
        if (!vendorBgCovered(state)) {
          exposed.push(state)
        }
      }
    }

    expect(exposed).toHaveLength(1)
    expect(exposed[0]).toEqual({ phase: "settled", mode: "off" })
  })

  it("settled:auto and settled:legacy always satisfy the invariant", () => {
    expect(vendorBgCovered({ phase: "settled", mode: "auto" })).toBe(true)
    expect(vendorBgCovered({ phase: "settled", mode: "legacy" })).toBe(true)
  })
})

// ── State machine completeness ─────────────────────────────────────────────

describe("state machine property: covered states stay covered across transitions", () => {
  // Every transition that arrives at a non-settled phase must have
  // vendorBgCovered = true regardless of mode — the veil is either up or
  // a theme makes it irrelevant.

  it("script_start always lands in init, which has vendor BG covered", () => {
    const phase = nextPhase("prepaint", "script_start")
    expect(phase).toBe("init")
    for (const mode of ["auto", "legacy", "off"] as const) {
      expect(vendorBgCovered({ phase, mode })).toBe(true)
    }
  })

  it("vendor_repaint always lands in repainting, which has vendor BG covered", () => {
    const phase = nextPhase("settled", "vendor_repaint")
    expect(phase).toBe("repainting")
    for (const mode of ["auto", "legacy", "off"] as const) {
      expect(vendorBgCovered({ phase, mode })).toBe(true)
    }
  })

  it("user_cycle and bg_reconcile land in init, which has vendor BG covered", () => {
    for (const event of ["user_cycle", "bg_reconcile"] as const) {
      const phase = nextPhase("settled", event)
      expect(phase).toBe("init")
      for (const mode of ["auto", "legacy", "off"] as const) {
        expect(vendorBgCovered({ phase, mode })).toBe(true)
      }
    }
  })
})
