/** @vitest-environment node */
import { frameAt, prepare } from "@burn-ins/lib/burn-in"
import { ITEM, valueProblem } from "@burn-ins/lib/cards"
import { LANDSCAPE, PORTRAIT, type FrameSize } from "@burn-ins/lib/geometry"
import type { TerminalFrame } from "@burn-ins/lib/terminal"
import { TYPING } from "@burn-ins/lib/terminal"
import { describe, expect, it } from "vitest"

/** A card's params with the stamp the renderer gives every card. */
const stamped = (params: object): object => ({
  stamp: { sources: ["paulgsc/dotfiles@91cb11b"], date: "2026-11-13" },
  ...params,
})

const terminal = (
  params: object,
  frame: FrameSize = LANDSCAPE,
  design = "terminal-v1"
): ReturnType<typeof prepare> =>
  prepare({ kind: "terminal", design, params: stamped(params) }, frame)

const at = (
  params: object,
  t: number,
  design = "terminal-v1"
): TerminalFrame => {
  const p = terminal(params, LANDSCAPE, design)
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

  it("never reads a placeholder across two lines", () => {
    expect(valueProblem("KEY=<x\nB=sk-live-abc>")).toBe("KEY")
    const p = terminal({
      kicker: "KEY=<x",
      title: "B=sk-live-abc>",
      lines: [{ text: "x" }],
    })
    expect(p.ok).toBe(false)
  })

  it.each([
    ['export KEY="', 'sk-live-abc"'],
    ["export KEY='", "sk-live-abc'"],
    ["export KEY=", "sk-live-abc"],
  ])(
    "refuses a value that opens in the kicker and closes in the title: %s",
    (k, title) => {
      const p = terminal({ kicker: k, title, lines: [{ text: "x" }] })
      expect(p.ok).toBe(false)
    }
  )

  it.each([
    ["SET KEY=<token>", "Rotate it weekly"],
    ["SET KEY=ENC[x]", "then deploy"],
    ["SET KEY=", "<token>"],
  ])("lets a placeholder in the kicker sit over any title: %s", (k, title) => {
    expect(terminal({ kicker: k, title, lines: [{ text: "x" }] }).ok).toBe(true)
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
      `the terminal burn-in (terminal-v1): line 3 has "→", which the card's type can't draw`,
    ])
    const crowded = terminal({
      title: "Crowded",
      lines: Array.from({ length: 8 }, () => ({ text: "ok" })),
    })
    expect(crowded.ok ? [] : crowded.problems).toEqual([
      "the terminal burn-in (terminal-v1): 8 lines don't fit the window",
    ])
  })

  describe("terminal-v2, which types its commands (#3476)", () => {
    const lead = ITEM.leadMs + TYPING.leadMs
    /** When a command of `n` characters, appearing at `at`, lets the next line come. */
    const free = (at: number, n: number): number =>
      at + TYPING.leadMs + n * TYPING.charMs + TYPING.afterMs
    /** The diagnosis essay's first look: a command, what it prints, then the next. */
    const LOGS = {
      kicker: "TERMINAL · ON HOME",
      title: "What the render worker said",
      bar: "home",
      lines: [
        { prompt: "$", keyword: "docker logs", text: " render", badge: "main" },
        {
          text: "render: waits for room on home",
          badge: "you",
          atMs: free(ITEM.leadMs, 18),
        },
        {
          prompt: "$",
          keyword: "ls",
          text: " /essays",
          comment: "  # given?",
          atMs: free(ITEM.leadMs, 18) + ITEM.gapMs,
        },
      ],
    }
    const v2 = (t: number): TerminalFrame => at(LOGS, t, "terminal-v2")
    const said = (f: TerminalFrame): ReadonlyArray<string> =>
      f.rows.map((r) => r.spans.map((s) => s.text).join(""))

    it("shows the prompt first, then types the command a character at a time behind a cursor", () => {
      expect(said(v2(ITEM.leadMs))).toEqual(["$ "])
      expect(said(v2(lead))).toEqual(["$ d"])
      expect(said(v2(lead + 5 * TYPING.charMs))).toEqual(["$ docker"])
      expect(v2(lead + 5 * TYPING.charMs).rows[0]?.cursor).not.toBeNull()
      const typed = lead + 18 * TYPING.charMs
      expect(said(v2(typed))).toEqual(["$ docker logs render"])
      expect(v2(typed).rows[0]?.cursor).toBeNull()
    })

    it("shows each line at the time v1 gives it, and a comment once its command is typed", () => {
      for (const t of [0, 800, 1500, 2600, 3600, 5000, 60_000])
        expect(v2(t).rows.map((r) => [r.line, r.y, r.opacity])).toEqual(
          at(LOGS, t).rows.map((r) => [r.line, r.y, r.opacity])
        )
      expect(said(v2(60_000))).toEqual([
        "$ docker logs render",
        "render: waits for room on home",
        "$ ls /essays  # given?",
      ])
      expect(v2(60_000).rows.every((r) => r.cursor === null)).toBe(true)
    })

    it("refuses a line that would appear while a command is still typing, naming when it may", () => {
      const early = terminal(
        {
          title: "Too soon",
          lines: [
            { prompt: "$", keyword: "docker logs", text: " render" },
            { text: "render: waits for room on home" },
          ],
        },
        LANDSCAPE,
        "terminal-v2"
      )
      expect(early.ok ? [] : early.problems).toEqual([
        `the terminal burn-in (terminal-v2): line 2 appears while line 1 is still typing: give it an atMs of ${free(ITEM.leadMs, 18)} or later`,
      ])
      // v1 draws the same card.
      expect(
        terminal(
          {
            title: "Too soon",
            lines: [
              { prompt: "$", keyword: "docker logs", text: " render" },
              { text: "render: waits for room on home" },
            ],
          },
          LANDSCAPE
        ).ok
      ).toBe(true)
    })

    it("types nothing on a card with no prompt, which draws as v1 draws it", () => {
      const plain = {
        ...WHERE_VALUES_LIVE,
        lines: WHERE_VALUES_LIVE.lines.filter((l) => !("prompt" in l)),
      }
      for (const t of [0, 900, 2000, 3500, 60_000])
        expect(at(plain, t, "terminal-v2")).toEqual(at(plain, t, "terminal-v1"))
    })

    it("draws the same frame for the same card at the same moment, pinned", () => {
      const f = v2(lead + 5 * TYPING.charMs)
      expect(f.rows).toEqual([
        {
          line: 0,
          x: f.rows[0]?.x,
          y: f.rows[0]?.y,
          spans: [
            { text: "$ ", colour: expect.any(String), part: "prompt" },
            { text: "docker", colour: expect.any(String), part: "keyword" },
          ],
          opacity: 1,
          badge: expect.anything(),
          cursor: {
            x: (f.rows[0]?.x ?? 0) + 8 * 28 * 0.6,
            y: expect.any(Number),
            width: 28 * 0.6,
            height: 28 * 1.15,
          },
        },
      ])
      expect(JSON.stringify(v2(2345))).toBe(
        JSON.stringify(at(structuredClone(LOGS), 2345, "terminal-v2"))
      )
    })

    it("refuses what v1 refuses", () => {
      const p = terminal(
        {
          title: "Too wide",
          lines: [{ prompt: "$", keyword: "x".repeat(200) }],
        },
        LANDSCAPE,
        "terminal-v2"
      )
      expect(p.ok ? [] : p.problems).toEqual([
        "the terminal burn-in (terminal-v2): line 1 doesn't fit the window",
      ])
    })
  })
})
