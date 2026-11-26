/**
 * HOST16 (#3558): a pick on a preview is kept whole, once, and the screen
 * says it without the machinery. Family: a variant used, something else
 * said, a second pick on the same preview, another conversation's picks,
 * and a store that can't be read.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { approveEvent, sampleTransitionsOffer } from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import { phonePicks, PICK_WORDS, pickOn, PICKS_KEY } from "@/lib/preview-pick"
import type { KeptPick } from "@/lib/preview-pick"

const AT = "2026-11-26T10:00:00.000Z"

const memory = (): KeyedStorage & { readonly held: Map<string, string> } => {
  const held = new Map<string, string>()
  return {
    held,
    getItem: (k) => held.get(k) ?? null,
    setItem: (k, v): void => {
      held.set(k, v)
    },
    removeItem: (k): void => {
      held.delete(k)
    },
  }
}

const pick = (conversation: string, variant: string): KeptPick => {
  const event = approveEvent(
    sampleTransitionsOffer(),
    { kind: "variant", variant },
    AT
  )
  if (event === null) throw new Error("no event")
  return { conversation, event }
}

describe("phonePicks (HOST16)", () => {
  it("keeps a pick once, per preview and conversation, and lists it back", () => {
    const storage = memory()
    const picks = phonePicks(() => storage)
    expect(picks.keep(pick("runners", "crossfade"))).toBe("kept")
    expect(picks.keep(pick("runners", "dip-to-black"))).toBe("already")
    expect(picks.keep(pick("slow", "dip-to-black"))).toBe("kept")
    const kept = picks.list("runners")
    expect(kept?.map((p) => p.event.chose)).toEqual([
      { kind: "variant", variant: "crossfade", rule: "joins-crossfade" },
    ])
    expect(pickOn(kept ?? [], "transitions-1")?.conversation).toBe("runners")
    // A fresh store over the same storage reads the same picks.
    expect(phonePicks(() => storage).list("slow")).toHaveLength(1)
  })

  it("keeps something else in the owner's words", () => {
    const storage = memory()
    const event = approveEvent(
      sampleTransitionsOffer(),
      { kind: "else", said: "Softer, like a page turning." },
      AT
    )
    if (event === null) throw new Error("no event")
    expect(phonePicks(() => storage).keep({ conversation: "c", event })).toBe(
      "kept"
    )
  })

  it("never writes over picks it can't read: they are moved aside first", () => {
    const storage = memory()
    storage.setItem(PICKS_KEY, "{not json")
    phonePicks(() => storage).keep(pick("runners", "crossfade"))
    expect([...storage.held.values()]).toContain("{not json")
  })
})

describe("the preview card's words", () => {
  it("says every line without the machinery", () => {
    const lines = [
      PICK_WORDS.intro,
      PICK_WORDS.label("How one scene gives way to the next"),
      PICK_WORDS.recommended,
      PICK_WORDS.inIt,
      PICK_WORDS.use,
      PICK_WORDS.own,
      PICK_WORDS.none,
      PICK_WORDS.ownPrompt,
      PICK_WORDS.ownSend,
      PICK_WORDS.noClip,
      PICK_WORDS.kept.phone,
      PICK_WORDS.kept.home,
      PICK_WORDS.already,
      PICK_WORDS.refused,
    ]
    expect(lines.filter((line) => MACHINERY.test(line))).toEqual([])
  })
})
