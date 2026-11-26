/**
 * HOST16 (#3558): Studio's Previews as a state and its runtime (R1). Family:
 * a read that answers, or says why not (each `NotShown`); a pick, its
 * outcome (kept, already, refused, unpaired, away, busy), a second pick
 * while one is on its way, a change of a standing pick (sent as a move),
 * and a read overtaken by a newer one; the sample's own rules; the words.
 */
import type { HomeRead } from "@some-ui/soundbites"
import type { ConversationEvent } from "@some-ui/video-render"
import { sampleTransitionsOffer } from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import {
  PICK_WORDS,
  previewsRuntime,
  SAMPLE_CONVERSATION,
  sampleSource,
  stepPreviews,
} from "@/lib/preview-pick"
import type {
  ConversationPreviews,
  PreviewSource,
  PreviewsState,
  PreviewWrite,
} from "@/lib/preview-pick"

const AT = "2026-11-26T10:00:00.000Z"
const OFFER = sampleTransitionsOffer()

const conversation = (
  standing: ConversationPreviews["previews"][number]["standing"] = null
): ConversationPreviews => ({
  id: "runners",
  topic: "The runners",
  previews: [{ ...OFFER, clips: {}, standing }],
  unshown: 0,
})

const shown = (c: ConversationPreviews = conversation()): PreviewsState =>
  stepPreviews(
    { phase: "reading" },
    { kind: "read", result: { kind: "read", value: [c] } }
  )

/** A promise and its resolve, to answer when the test says. */
function later<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const settled = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe("stepPreviews (HOST16)", () => {
  it.each(["unpaired", "away", "busy", "older", "unreadable"] as const)(
    "says why nothing is shown: %s",
    (why) => {
      expect(
        stepPreviews(
          { phase: "reading" },
          { kind: "read", result: { kind: why } }
        )
      ).toEqual({ phase: "nothing", why })
    }
  )

  it("takes one pick at a time, and says the outcome afresh each time", () => {
    const picking = stepPreviews(shown(), {
      kind: "pick",
      conversation: "runners",
      preview: OFFER.preview,
      pick: { kind: "variant", variant: "crossfade" },
    })
    expect(picking.phase === "shown" && picking.keeping?.preview).toBe(
      OFFER.preview
    )
    // A second pick while one is on its way is ignored.
    expect(
      stepPreviews(picking, {
        kind: "pick",
        conversation: "runners",
        preview: OFFER.preview,
        pick: { kind: "variant", variant: "dip-to-black" },
      })
    ).toBe(picking)
    const kept = stepPreviews(picking, {
      kind: "picked",
      outcome: "kept",
      now: conversation({
        kind: "variant",
        variant: "crossfade",
        rule: "joins-crossfade",
      }),
    })
    if (kept.phase !== "shown") throw new Error("not shown")
    expect(kept.keeping).toBeNull()
    expect(kept.said).toEqual({ n: 1, outcome: "kept" })
    expect(kept.conversations[0]?.previews[0]?.standing).toMatchObject({
      variant: "crossfade",
    })
    // Using the standing variant again asks nothing.
    const again = stepPreviews(kept, {
      kind: "pick",
      conversation: "runners",
      preview: OFFER.preview,
      pick: { kind: "variant", variant: "crossfade" },
    })
    expect(again.phase === "shown" && again.keeping).toBeNull()
    expect(again.phase === "shown" && again.said).toEqual({
      n: 2,
      outcome: "already",
    })
  })

  it("ignores a pick on a preview it doesn't show, and an answer to no pick", () => {
    const state = shown()
    expect(
      stepPreviews(state, {
        kind: "pick",
        conversation: "elsewhere",
        preview: OFFER.preview,
        pick: { kind: "variant", variant: "crossfade" },
      })
    ).toBe(state)
    expect(stepPreviews(state, { kind: "picked", outcome: "kept" })).toBe(state)
  })
})

/** A source that answers when the test says, and records what it was sent. */
function scripted(): {
  readonly source: PreviewSource
  readonly reads: Array<
    (value: HomeRead<ReadonlyArray<ConversationPreviews>>) => void
  >
  readonly sent: Array<Extract<ConversationEvent, { event: "approve" }>>
  readonly rereads: Array<(value: HomeRead<ConversationPreviews>) => void>
  readonly answer: Array<(value: PreviewWrite) => void>
} {
  const reads: Array<
    (value: HomeRead<ReadonlyArray<ConversationPreviews>>) => void
  > = []
  const sent: Array<Extract<ConversationEvent, { event: "approve" }>> = []
  const answer: Array<(value: PreviewWrite) => void> = []
  const rereads: Array<(value: HomeRead<ConversationPreviews>) => void> = []
  return {
    reads,
    sent,
    rereads,
    answer,
    source: {
      where: "home",
      reread: (): Promise<HomeRead<ConversationPreviews>> => {
        const l = later<HomeRead<ConversationPreviews>>()
        rereads.push(l.resolve)
        return l.promise
      },
      read: (): Promise<HomeRead<ReadonlyArray<ConversationPreviews>>> => {
        const l = later<HomeRead<ReadonlyArray<ConversationPreviews>>>()
        reads.push(l.resolve)
        return l.promise
      },
      approve: (_conversation, event): Promise<PreviewWrite> => {
        sent.push(event)
        const l = later<PreviewWrite>()
        answer.push(l.resolve)
        return l.promise
      },
    },
  }
}

describe("previewsRuntime (HOST16)", () => {
  it("drops a read a newer one overtook", async () => {
    const s = scripted()
    const runtime = previewsRuntime(s.source, () => AT)
    runtime.open()
    runtime.open()
    expect(s.reads).toHaveLength(2)
    s.reads[1]?.({ kind: "read", value: [conversation()] })
    await settled()
    s.reads[0]?.({ kind: "away" })
    await settled()
    expect(runtime.state.getSnapshot().phase).toBe("shown")
  })

  it("sends a first pick as an approval, and a change as one that moves it", async () => {
    const s = scripted()
    const runtime = previewsRuntime(s.source, () => AT)
    runtime.open()
    s.reads[0]?.({ kind: "read", value: [conversation()] })
    await settled()
    runtime.pick("runners", OFFER.preview, {
      kind: "variant",
      variant: "crossfade",
    })
    expect(s.sent[0]).toMatchObject({
      event: "approve",
      by: "owner",
      preview: OFFER.preview,
      chose: { kind: "variant", variant: "crossfade" },
    })
    expect(s.sent[0]?.moves).toBeUndefined()
    s.answer[0]?.({
      kind: "written",
      value: conversation({
        kind: "variant",
        variant: "crossfade",
        rule: "joins-crossfade",
      }),
    })
    await settled()
    runtime.pick("runners", OFFER.preview, {
      kind: "variant",
      variant: "dip-to-black",
    })
    expect(s.sent[1]?.moves).toBe(OFFER.preview)
  })

  it.each(["refused", "unpaired", "away", "busy"] as const)(
    "says a pick home didn't keep: %s",
    async (kind) => {
      const s = scripted()
      const runtime = previewsRuntime(s.source, () => AT)
      runtime.open()
      s.reads[0]?.({ kind: "read", value: [conversation()] })
      await settled()
      runtime.pick("runners", OFFER.preview, {
        kind: "variant",
        variant: "crossfade",
      })
      s.answer[0]?.({ kind })
      await settled()
      const state = runtime.state.getSnapshot()
      expect(state.phase === "shown" && state.said?.outcome).toBe(kind)
      expect(state.phase === "shown" && state.keeping).toBeNull()
    }
  )

  it("lets a pick kept and not read back stand, so the next follows it", async () => {
    const s = scripted()
    const runtime = previewsRuntime(s.source, () => AT)
    runtime.open()
    s.reads[0]?.({ kind: "read", value: [conversation()] })
    await settled()
    runtime.pick("runners", OFFER.preview, {
      kind: "variant",
      variant: "dip-to-black",
    })
    s.answer[0]?.({ kind: "written", value: null })
    await settled()
    const state = runtime.state.getSnapshot()
    expect(
      state.phase === "shown" && state.conversations[0]?.previews[0]?.standing
    ).toEqual({
      kind: "variant",
      variant: "dip-to-black",
      rule: "joins-dip-at-chapters",
    })
    // Back to crossfade: sent, as a move.
    runtime.pick("runners", OFFER.preview, {
      kind: "variant",
      variant: "crossfade",
    })
    expect(s.sent[1]?.moves).toBe(OFFER.preview)
  })

  it.each(["refused", "unreadable"] as const)(
    "reads the conversation again after a pick %s, keeping its words and topic",
    async (kind) => {
      const s = scripted()
      const runtime = previewsRuntime(s.source, () => AT)
      runtime.open()
      s.reads[0]?.({ kind: "read", value: [conversation()] })
      await settled()
      runtime.pick("runners", OFFER.preview, {
        kind: "variant",
        variant: "crossfade",
      })
      s.answer[0]?.({ kind })
      await settled()
      expect(s.rereads).toHaveLength(1)
      s.rereads[0]?.({
        kind: "read",
        value: {
          ...conversation({
            kind: "variant",
            variant: "dip-to-black",
            rule: "joins-dip-at-chapters",
          }),
          topic: "",
        },
      })
      await settled()
      const state = runtime.state.getSnapshot()
      if (state.phase !== "shown") throw new Error("not shown")
      expect(state.said?.outcome).toBe(kind)
      expect(state.conversations[0]?.topic).toBe("The runners")
      expect(state.conversations[0]?.previews[0]?.standing).toMatchObject({
        variant: "dip-to-black",
      })
    }
  )

  it("names the preview whose rule a pick would set again as the one it moves", async () => {
    const s = scripted()
    const runtime = previewsRuntime(s.source, () => AT)
    const again = { ...OFFER, preview: "transitions-2" }
    runtime.open()
    s.reads[0]?.({
      kind: "read",
      value: [
        {
          ...conversation({
            kind: "variant",
            variant: "crossfade",
            rule: "joins-crossfade",
          }),
          previews: [
            {
              ...OFFER,
              clips: {},
              standing: {
                kind: "variant",
                variant: "crossfade",
                rule: "joins-crossfade",
              },
            },
            { ...again, clips: {}, standing: null },
          ],
        },
      ],
    })
    await settled()
    runtime.pick("runners", again.preview, {
      kind: "variant",
      variant: "crossfade",
    })
    expect(s.sent[0]?.moves).toBe(OFFER.preview)
    // A rule no other preview sets moves nothing.
    s.answer[0]?.({ kind: "refused" })
    await settled()
  })

  it("sends nothing for something else said in no words", async () => {
    const s = scripted()
    const runtime = previewsRuntime(s.source, () => AT)
    runtime.open()
    s.reads[0]?.({ kind: "read", value: [conversation()] })
    await settled()
    runtime.pick("runners", OFFER.preview, { kind: "else", said: "   " })
    expect(s.sent).toEqual([])
    const state = runtime.state.getSnapshot()
    expect(state.phase === "shown" && state.said?.outcome).toBe("refused")
  })
})

describe("sampleSource (HOST16)", () => {
  it("holds a pick in memory, a change only as a move, and keeps nothing else", async () => {
    const sample = sampleSource()
    const runtime = previewsRuntime(sample, () => AT)
    runtime.open()
    await settled()
    runtime.pick(SAMPLE_CONVERSATION, OFFER.preview, {
      kind: "variant",
      variant: "dip-to-black",
    })
    await settled()
    runtime.pick(SAMPLE_CONVERSATION, OFFER.preview, {
      kind: "variant",
      variant: "crossfade",
    })
    await settled()
    const state = runtime.state.getSnapshot()
    expect(state.phase === "shown" && state.said?.outcome).toBe("kept")
    expect(
      state.phase === "shown" && state.conversations[0]?.previews[0]?.standing
    ).toEqual({
      kind: "variant",
      variant: "crossfade",
      rule: "joins-crossfade",
    })
    // A second sample starts over: nothing was kept.
    const fresh = await sampleSource().read()
    expect(
      fresh.kind === "read" && fresh.value[0]?.previews[0]?.standing
    ).toBeNull()
  })

  it("refuses a change that doesn't name the pick it moves", async () => {
    const sample = sampleSource()
    const pick = (
      moves?: string
    ): Extract<ConversationEvent, { event: "approve" }> => ({
      event: "approve",
      by: "owner",
      at: AT,
      preview: OFFER.preview,
      chose: { kind: "variant", variant: "crossfade" },
      ...(moves === undefined ? {} : { moves }),
    })
    expect((await sample.approve(SAMPLE_CONVERSATION, pick())).kind).toBe(
      "written"
    )
    expect((await sample.approve(SAMPLE_CONVERSATION, pick())).kind).toBe(
      "refused"
    )
    expect(
      (await sample.approve(SAMPLE_CONVERSATION, pick(OFFER.preview))).kind
    ).toBe("written")
  })
})

describe("the preview card's words", () => {
  it("says every line without the machinery", () => {
    const lines = [
      PICK_WORDS.intro,
      PICK_WORDS.sample,
      PICK_WORDS.label("How one scene gives way to the next"),
      PICK_WORDS.recommended,
      PICK_WORDS.inIt,
      PICK_WORDS.use,
      PICK_WORDS.own,
      PICK_WORDS.none,
      PICK_WORDS.ownPrompt,
      PICK_WORDS.ownSend,
      PICK_WORDS.noClip,
      PICK_WORDS.watchFirst,
      PICK_WORDS.reading,
      PICK_WORDS.again,
      PICK_WORDS.empty,
      PICK_WORDS.unshown(1),
      PICK_WORDS.unshown(2),
      ...Object.values(PICK_WORDS.nothing),
      ...Object.values(PICK_WORDS.picked),
      PICK_WORDS.already,
      PICK_WORDS.refused,
      PICK_WORDS.unreadable,
      PICK_WORDS.unpaired,
      PICK_WORDS.away,
      PICK_WORDS.busy,
    ]
    expect(lines.filter((line) => MACHINERY.test(line))).toEqual([])
  })
})
