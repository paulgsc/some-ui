/** @vitest-environment node */
import { frameAt, prepare } from "@burn-ins/lib/burn-in"
import { ITEM } from "@burn-ins/lib/cards"
import type { FlowFrame } from "@burn-ins/lib/flow"
import { LANDSCAPE, PORTRAIT, type FrameSize } from "@burn-ins/lib/geometry"
import { describe, expect, it } from "vitest"

const flow = (
  params: object,
  frame: FrameSize = LANDSCAPE
): ReturnType<typeof prepare> =>
  prepare(
    {
      kind: "flow",
      design: "flow-v1",
      params: {
        title: "T",
        stamp: { sources: ["paulgsc/dotfiles@91cb11b"], date: "2026-11-13" },
        ...params,
      },
    },
    frame
  )

const at = (
  params: object,
  t: number,
  frame: FrameSize = LANDSCAPE
): FlowFrame => {
  const p = flow(params, frame)
  if (!p.ok) throw new Error(p.problems.join("; "))
  const f = frameAt(p.value, t)
  if (f.kind !== "flow") throw new Error(f.kind)
  return f.frame
}

/** The NixOS video's loop, as the prototype drew it. */
const LOOP = {
  steps: [
    {
      badge: "pr",
      label: "Monday 06:00 UTC",
      command: "nix flake update",
      note: "CI builds both closures and opens one lockfile PR with the diff.",
    },
    {
      badge: "you",
      label: "You review and merge",
      note: "The only manual step.",
    },
    {
      badge: "main",
      label: "Nightly 04:40",
      note: "The box pulls main and switches; a night missed runs on next boot.",
    },
    {
      badge: "main",
      label: "Home follows",
      note: "home-manager switches to the commit the system was built from.",
    },
  ],
}

describe("the flow card", () => {
  it("sets the steps side by side in the 16:9 video, one size, an arrow into each but the first, a step at a time", () => {
    const end = at(LOOP, 20_000)
    expect(end.down).toBe(false)
    const panels = end.steps.map((s) => s.panel)
    expect(
      new Set(panels.map((p) => `${p.y},${p.width},${p.height}`)).size
    ).toBe(1)
    for (const [i, s] of end.steps.entries()) {
      if (i === 0) expect(s.arrow).toBeNull()
      else {
        const before = panels[i - 1]
        if (!s.arrow || !before) throw new Error("no arrow")
        expect(s.arrow.x).toBeGreaterThanOrEqual(before.x + before.width)
        expect(s.arrow.x + s.arrow.width).toBeLessThanOrEqual(s.panel.x)
      }
    }
    expect(at(LOOP, ITEM.leadMs + ITEM.gapMs - 1).steps).toHaveLength(1)
  })

  it("stacks them in the 9:16 short, each arrow pointing down between two", () => {
    const end = at(LOOP, 20_000, PORTRAIT)
    expect(end.down).toBe(true)
    for (const [i, s] of end.steps.entries()) {
      const before = end.steps[i - 1]?.panel
      if (!before) continue
      expect(s.panel.y).toBeGreaterThan(before.y + before.height)
      expect(s.arrow?.y).toBeGreaterThanOrEqual(before.y + before.height)
    }
  })

  it("spells out each new state's badge on its first step only", () => {
    expect(at(LOOP, ITEM.leadMs + 1000).steps[0]?.badge?.open).not.toBeNull()
    // Step 4 repeats step 3's state, so it shows the glyph alone.
    const fourth = at(LOOP, ITEM.leadMs + 3 * ITEM.gapMs + 1000).steps[3]
    expect(fourth?.badge?.state).toBe("main")
    expect(fourth?.badge?.open).toBeNull()
    expect(at(LOOP, 20_000).steps.map((s) => s.badge?.open ?? null)).toEqual([
      null,
      null,
      null,
      null,
    ])
  })

  it("refuses, naming the step, a value, a character its type lacks, a step that doesn't fit, and fewer than two steps", () => {
    const p = flow({
      steps: [
        { label: "Config", command: "export TOKEN=abc" },
        { label: "Arrow", command: "a → b" },
        { label: "Long", command: "x".repeat(200) },
      ],
    })
    expect(p.ok ? [] : p.problems).toEqual([
      "the flow burn-in (flow-v1): step 1 gives TOKEN a value; a card shows a placeholder, never a value",
      "the flow burn-in (flow-v1): step 2's command has \"→\", which the card's type can't draw",
      "the flow burn-in (flow-v1): step 3: its command doesn't fit",
    ])
    expect(flow({ steps: [{ label: "Alone" }] }).ok).toBe(false)
  })
})
