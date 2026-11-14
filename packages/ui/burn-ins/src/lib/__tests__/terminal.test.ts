/** @vitest-environment node */
import { frameAt, prepare } from "@burn-ins/lib/burn-in"
import { ITEM, valueProblem } from "@burn-ins/lib/cards"
import { LANDSCAPE, PORTRAIT, type FrameSize } from "@burn-ins/lib/geometry"
import type { TerminalFrame } from "@burn-ins/lib/terminal"
import { describe, expect, it } from "vitest"

const terminal = (
  params: unknown,
  frame: FrameSize = LANDSCAPE
): ReturnType<typeof prepare> =>
  prepare({ kind: "terminal", design: "terminal-v1", params }, frame)

const at = (params: unknown, t: number): TerminalFrame => {
  const p = terminal(params)
  if (!p.ok) throw new Error(p.problems.join("; "))
  const f = frameAt(p.value, t)
  if (f.kind !== "terminal") throw new Error(f.kind)
  return f.frame
}

/** Vlog 0's "where values live" card. */
const WHERE_VALUES_LIVE = {
  kicker: "TERMINAL · WHERE VALUES LIVE",
  title: "Each value has one home, and the card shows none",
  bar: "deploy/",
  lines: [
    { keyword: "deploy/", comment: "  # one tree per machine", badge: "main" },
    {
      keyword: "  secrets.yaml",
      comment: "  # sops, ENC[…] only",
      badge: "main",
    },
    { text: "  DATABASE_URL=ENC[AES256_GCM,data:…]", badge: "main" },
    { text: "  API_TOKEN=<from the vault>", badge: "pr" },
    { prompt: "$", keyword: "sops edit deploy/secrets.yaml", badge: "you" },
  ],
}

describe("the terminal card", () => {
  it("draws vlog 0's card from its params alone, a line at a time", () => {
    expect(at(WHERE_VALUES_LIVE, ITEM.leadMs - 1).rows).toEqual([])
    const all = at(WHERE_VALUES_LIVE, 60_000).rows
    expect(all.map((r) => r.spans.map((s) => s.text).join(""))).toEqual([
      "deploy/  # one tree per machine",
      "  secrets.yaml  # sops, ENC[…] only",
      "  DATABASE_URL=ENC[AES256_GCM,data:…]",
      "  API_TOKEN=<from the vault>",
      "$ sops edit deploy/secrets.yaml",
    ])
    expect(all.every((r) => r.opacity === 1 && r.badge?.open === null)).toBe(
      true
    )
  })

  it("spells out each new state's badge on its first line only, moving that line's text aside", () => {
    // The fourth line's ◧ is held open; the first line's ■ closed long ago.
    const t = ITEM.leadMs + 3 * ITEM.gapMs + 1300
    const [first, second, , fourth] = at(WHERE_VALUES_LIVE, t).rows
    expect(first?.badge?.open).toBeNull()
    expect(second?.badge?.open).toBeNull()
    expect(fourth?.badge?.open?.amount).toBe(1)
    expect(fourth?.x).toBeGreaterThan(first?.x ?? Infinity)
    const seen = at({ ...WHERE_VALUES_LIVE, badgesSeen: ["pr"] }, t).rows[3]
    expect(seen?.badge?.open).toBeNull()
    expect(seen?.x).toBe(first?.x)
  })

  it.each([
    ["  GITHUB_TOKEN=ghp_abc123", "GITHUB_TOKEN"],
    ["export db_pass=hunter2", "db_pass"],
    ['env "KEY=value" run', "KEY"],
    ['export API_KEY="sk-live-abc"', "API_KEY"],
    ["export API_KEY='sk-live-abc'", "API_KEY"],
    ["export TOKEN=`cat f`", "TOKEN"],
    ["TOKEN=<x>sk-live-abc", "TOKEN"],
    ["TOKEN=ENC[x]plain", "TOKEN"],
    ["A=<x>,B=secret", "A"],
    ['KEY=""sk-live-abc', "KEY"],
    ["KEY=''sk-live-abc", "KEY"],
    ['KEY="<x>"sk-live', "KEY"],
    ['KEY="…"hunter2', "KEY"],
  ])("refuses a line that gives a value: %s", (text, name) => {
    const p = terminal({ title: "Values", lines: [{ text }] })
    expect(p.ok ? [] : p.problems).toEqual([
      `the terminal burn-in (terminal-v1): line 1 gives ${name} a value; a card shows a placeholder, never a value`,
    ])
  })

  it("spells out the badge of the line that appears first, whatever the order they're listed in", () => {
    const lines = [
      { text: "later", badge: "pr", atMs: 3000 },
      { text: "first", badge: "pr", atMs: 0 },
    ]
    const f = at({ title: "Order", lines }, 3500)
    expect(f.rows.map((r) => r.badge?.open === null)).toEqual([true, true])
    expect(
      at({ title: "Order", lines }, 500).rows[1]?.badge?.open
    ).not.toBeNull()
  })

  it("refuses a heading that gives a value", () => {
    const p = terminal({
      title: "Set API_KEY=sk-live-abc",
      lines: [{ text: "x" }],
    })
    expect(p.ok ? [] : p.problems).toEqual([
      "the terminal burn-in (terminal-v1): the heading gives API_KEY a value; a card shows a placeholder, never a value",
    ])
  })

  it.each([
    "KEY=",
    "KEY=…",
    "KEY=<placeholder>",
    'KEY=""',
    'KEY="<placeholder>"',
    "KEY=<a> && OTHER=…",
    "KEY=<from the vault, path=prod>",
    "KEY=ENC[AES256_GCM,data:…]",
    "--retries=3",
    "a == b",
  ])("lets a placeholder or no assignment through: %s", (text) => {
    expect(valueProblem(text)).toBeNull()
  })

  it("refuses, naming it, a line too long for the window, a character its type lacks, and more lines than fit", () => {
    const long = "x".repeat(60)
    const p = terminal(
      {
        title: "Too much",
        lines: [
          { text: "ok" },
          { text: long },
          { text: "Grafana → UPGRADES" },
          ...Array.from({ length: 9 }, () => ({ text: "ok" })),
        ],
      },
      PORTRAIT
    )
    expect(p.ok ? [] : p.problems).toEqual([
      "the terminal burn-in (terminal-v1): line 2 doesn't fit the window",
      `the terminal burn-in (terminal-v1): line 3 has "→", which the terminal's type can't draw`,
    ])
    const crowded = terminal({
      title: "Crowded",
      lines: Array.from({ length: 8 }, () => ({ text: "ok" })),
    })
    expect(crowded.ok ? [] : crowded.problems).toEqual([
      "the terminal burn-in (terminal-v1): 8 lines don't fit the window",
    ])
  })
})
