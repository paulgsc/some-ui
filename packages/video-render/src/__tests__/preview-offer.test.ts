/**
 * HOST16 (#3558): a pick on a preview is the record's `approve` event,
 * accepted as it is. Family: each variant offered, something else in the
 * owner's words, a variant the offer doesn't hold, and words left empty.
 */
import {
  approvedRules,
  replayConversation,
  stepConversation,
} from "@video-render/conversation"
import {
  approveEvent,
  parsePreviewOffer,
  sampleTransitionsOffer,
} from "@video-render/preview-offer"
import { describe, expect, it } from "vitest"

const AT = "2026-11-26T10:00:00.000Z"

const greenLit = (): ReturnType<typeof replayConversation> =>
  replayConversation([
    { event: "topic", by: "owner", at: AT, topic: { said: "The runners" } },
    { event: "point", by: "owner", at: AT, take: "take-a" },
    {
      event: "version",
      by: "agent",
      at: AT,
      version: {
        n: 1,
        speakers: [
          { id: "tin", character: "tin-owlet", voice: { kind: "kokoro" } },
          { id: "mochi", character: "mochi", voice: { kind: "owner" } },
        ],
        turns: [
          { id: "k1", speaker: "tin", voice: "kokoro", said: "Why one door?" },
          { id: "o1", speaker: "mochi", voice: "owner", take: "take-a" },
        ],
        answers: [],
      },
    },
    { event: "heard", by: "home", at: AT, version: 1, ms: 60_000 },
    { event: "green-light", by: "owner", at: AT, version: 1 },
  ])

describe("approveEvent (HOST16)", () => {
  const offer = sampleTransitionsOffer()

  it("reads its own sample", () => {
    expect(parsePreviewOffer(offer)).toEqual({ ok: true, value: offer })
  })

  it.each(offer.variants.map((v) => v.variant))(
    "turns using %s into an approval the record accepts, setting its rule",
    (variant) => {
      const start = greenLit()
      if (!start.ok) throw new Error("no record")
      const event = approveEvent(offer, { kind: "variant", variant }, AT)
      if (event === null) throw new Error("no event")
      const stepped = stepConversation(start.state, event)
      if (!stepped.ok) throw new Error(stepped.refusal.why)
      expect(approvedRules(stepped.state)).toEqual([
        offer.variants.find((v) => v.variant === variant)?.rule,
      ])
    }
  )

  it("keeps something else in the owner's words, setting no rule", () => {
    const start = greenLit()
    if (!start.ok) throw new Error("no record")
    const event = approveEvent(
      offer,
      { kind: "else", said: "  Softer, like a page turning. " },
      AT
    )
    expect(event?.chose).toEqual({
      kind: "else",
      said: "Softer, like a page turning.",
    })
    if (event === null) throw new Error("no event")
    const stepped = stepConversation(start.state, event)
    expect(stepped.ok && approvedRules(stepped.state)).toEqual([])
  })

  it("makes nothing of a variant it doesn't offer, or of no words", () => {
    expect(approveEvent(offer, { kind: "variant", variant: "wipe" }, AT)).toBe(
      null
    )
    expect(approveEvent(offer, { kind: "else", said: "   " }, AT)).toBe(null)
  })

  it("changes a pick by an approval that moves the earlier one: both kept, the latest the rule", () => {
    const start = greenLit()
    if (!start.ok) throw new Error("no record")
    const first = approveEvent(
      offer,
      { kind: "variant", variant: "crossfade" },
      AT
    )
    const again = approveEvent(
      offer,
      { kind: "variant", variant: "dip-to-black" },
      AT
    )
    const change = approveEvent(
      offer,
      { kind: "variant", variant: "dip-to-black" },
      AT,
      { moves: offer.preview }
    )
    if (first === null || again === null || change === null)
      throw new Error("no event")
    const picked = stepConversation(start.state, first)
    if (!picked.ok) throw new Error(picked.refusal.why)
    const unnamed = stepConversation(picked.state, again)
    expect(!unnamed.ok && unnamed.refusal.why).toBe("preview-again")
    const changed = stepConversation(picked.state, change)
    if (!changed.ok) throw new Error(changed.refusal.why)
    expect(
      changed.state.phase === "green-lit" && changed.state.approvals.length
    ).toBe(2)
    expect(approvedRules(changed.state)).toEqual(["joins-dip-at-chapters"])
  })

  it("refuses an offer whose recommended variant it doesn't hold", () => {
    expect(parsePreviewOffer({ ...offer, recommended: "wipe" }).ok).toBe(false)
  })

  const [a, b] = offer.variants
  if (a === undefined || b === undefined) throw new Error("no sample")
  const third = { ...b, variant: "cut", title: "Cut", rule: "joins-cut" }
  it.each([
    ["one variant, nothing to choose between", [a]],
    [
      "four variants, more than three",
      [a, b, third, { ...third, variant: "wipe", rule: "joins-wipe" }],
    ],
    ["two variants with one id", [a, { ...b, variant: a.variant }]],
    ["two variants setting one rule", [a, { ...b, rule: a.rule }]],
    ["a callout listed twice", [a, { ...b, callouts: ["Cut", "Cut"] }]],
  ])("refuses an offer of %s", (_, variants) => {
    expect(parsePreviewOffer({ ...offer, variants }).ok).toBe(false)
  })

  it("reads three variants", () => {
    expect(parsePreviewOffer({ ...offer, variants: [a, b, third] }).ok).toBe(
      true
    )
  })
})
