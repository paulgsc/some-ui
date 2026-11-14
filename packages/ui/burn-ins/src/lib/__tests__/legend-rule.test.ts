/** @vitest-environment node */
import { BADGE_STATES } from "@burn-ins/lib/badge"
import { frameAt, prepare, type BurnInFrame } from "@burn-ins/lib/burn-in"
import { cardBody, ITEM, stampText } from "@burn-ins/lib/cards"
import {
  geometryOf,
  LANDSCAPE,
  PORTRAIT,
  type FrameSize,
} from "@burn-ins/lib/geometry"
import { WORDS } from "@burn-ins/lib/words"
import { describe, expect, it } from "vitest"

const STAMP = {
  sources: ["paulgsc/scratch@8468230", "paulgsc/dotfiles@91cb11b"],
  date: "2026-11-13",
}

const card = (
  kind: "legend" | "rule" | "terminal",
  params: object,
  frame: FrameSize = LANDSCAPE
): ReturnType<typeof prepare> =>
  prepare(
    {
      kind,
      design: { legend: "legend-v1", rule: "rule-v1", terminal: "terminal-v1" }[
        kind
      ],
      params: { title: "T", stamp: STAMP, ...params },
    },
    frame
  )

const at = (
  kind: "legend" | "rule" | "terminal",
  params: object,
  t: number,
  frame: FrameSize = LANDSCAPE
): BurnInFrame => {
  const p = card(kind, params, frame)
  if (!p.ok) throw new Error(p.problems.join("; "))
  return frameAt(p.value, t)
}

const RULE = { sources: ["make help", "the README"], wins: "the README" }

describe("the stamp", () => {
  it("names every commit and the day", () => {
    expect(stampText(STAMP)).toBe(
      "as of paulgsc/scratch@8468230 · paulgsc/dotfiles@91cb11b · 2026-11-13"
    )
  })

  it.each([LANDSCAPE, PORTRAIT])(
    "sits at the foot of every card's body, under its items, right-aligned ($width x $height)",
    (frame) => {
      const body = geometryOf(frame).regions.body
      const items = cardBody(geometryOf(frame))
      for (const kind of ["legend", "rule", "terminal"] as const) {
        const f = at(
          kind,
          kind === "rule"
            ? RULE
            : kind === "terminal"
              ? { lines: [{ text: "x" }] }
              : {},
          0,
          frame
        )
        if (!("stamp" in f.frame)) throw new Error(kind)
        const box = f.frame.stamp.box
        expect(box.x + box.width).toBe(body.x + body.width)
        expect(box.y + box.height).toBe(body.y + body.height)
        expect(box.y).toBeGreaterThanOrEqual(items.y + items.height)
      }
    }
  )

  it("is a card's to carry: a card without one is refused", () => {
    const p = prepare(
      { kind: "legend", design: "legend-v1", params: { title: "T" } },
      LANDSCAPE
    )
    expect(p.ok).toBe(false)
  })

  it("is refused, quoted, when it is wider than the card", () => {
    const stamp = {
      sources: [
        "paulgsc/some-ui@5f3dd29",
        "paulgsc/dotfiles@91cb11b",
        "paulgsc/scratch@8468230",
      ],
      date: "2026-11-13",
    }
    const p = prepare(
      { kind: "legend", design: "legend-v1", params: { title: "T", stamp } },
      PORTRAIT
    )
    expect(p.ok ? [] : p.problems).toEqual([
      `the legend burn-in (legend-v1): the stamp "${stampText(stamp)}" doesn't fit the card's width; name fewer sources, or shorter ones`,
    ])
  })
})

describe("the legend card", () => {
  it("shows the five badges, each shut, beside the words they spell out, a row at a time", () => {
    const f = at("legend", {}, 10_000)
    if (f.kind !== "legend") throw new Error(f.kind)
    expect(f.frame.rows.map((r) => [r.badge.state, r.meaning.rows])).toEqual(
      BADGE_STATES.map((s) => [s, [WORDS.badges[s]]])
    )
    expect(f.frame.rows.every((r) => r.badge.open === null)).toBe(true)
    const first = at("legend", {}, ITEM.leadMs + ITEM.gapMs - 1)
    if (first.kind !== "legend") throw new Error(first.kind)
    expect(first.frame.rows).toHaveLength(1)
  })
})

describe("the rule card", () => {
  it("draws its three lines from its sources, with ∩ and ⇒ as shapes and the badges as glyphs", () => {
    const f = at("rule", RULE, 10_000)
    if (f.kind !== "rule") throw new Error(f.kind)
    const said = f.frame.rows.map((r) =>
      r.pieces
        .map((p) =>
          p.kind === "words"
            ? p.text
            : p.kind === "sign"
              ? `[${p.sign}]`
              : `[${p.state}]`
        )
        .join("")
    )
    expect(said).toEqual([
      "what's true today = this card [and] make help [and] the README ",
      "card age ↑ [implies] trust in [pr][next][gap] ↓   ([main] decays slowest)",
      "if they disagree: the README wins",
    ])
    expect(f.frame.rows[1]?.badges.map((b) => b.state)).toEqual([
      "pr",
      "next",
      "gap",
      "main",
    ])
  })

  it("steps its type down to fit the short's narrower body", () => {
    const wide = at("rule", RULE, 0, LANDSCAPE)
    const narrow = at("rule", RULE, 0, PORTRAIT)
    if (wide.kind !== "rule" || narrow.kind !== "rule") throw new Error()
    expect(narrow.frame.sizePx).toBeLessThan(wide.frame.sizePx)
  })

  it("refuses, naming it, a source its type lacks, one that gives a value, and a line that fits at no size", () => {
    const p = card("rule", {
      sources: ["docs → here", "TOKEN=abc"],
      wins: "the doc",
    })
    expect(p.ok ? [] : p.problems).toEqual([
      "the rule burn-in (rule-v1): source 1 has \"→\", which the card's type can't draw",
      "the rule burn-in (rule-v1): source 2 gives TOKEN a value; a card shows a placeholder, never a value",
    ])
    const long = card("rule", { sources: ["x".repeat(130)], wins: "x" })
    expect(long.ok ? [] : long.problems).toEqual([
      "the rule burn-in (rule-v1): line 1 doesn't fit",
    ])
  })
})
