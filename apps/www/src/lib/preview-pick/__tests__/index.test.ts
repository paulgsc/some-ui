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
import {
  phonePicks,
  PICK_WORDS,
  pickOn,
  PICKS_KEY,
  samplePicks,
} from "@/lib/preview-pick"
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

/** A pick that changes the standing one on the sample's preview. */
const move = (conversation: string, variant: string): KeptPick => {
  const event = approveEvent(
    sampleTransitionsOffer(),
    { kind: "variant", variant },
    AT,
    { moves: "transitions-1" }
  )
  if (event === null) throw new Error("no event")
  return { conversation, event }
}

describe("samplePicks (HOST16)", () => {
  it("holds picks in memory as the phone's store would, and says they aren't kept", () => {
    const picks = samplePicks()
    expect(picks.where).toBe("sample")
    expect(picks.keep(pick("sample", "crossfade"))).toBe("kept")
    expect(picks.keep(pick("sample", "dip-to-black"))).toBe("already")
    expect(picks.keep(move("sample", "dip-to-black"))).toBe("kept")
    expect(picks.list("sample")).toHaveLength(2)
    expect(samplePicks().list("sample")).toEqual([])
  })
})

describe("phonePicks (HOST16)", () => {
  it("keeps a pick per preview and conversation, a change only as a move, and lists them back", () => {
    const storage = memory()
    const picks = phonePicks(() => storage)
    expect(picks.keep(pick("runners", "crossfade"))).toBe("kept")
    expect(picks.keep(pick("runners", "dip-to-black"))).toBe("already")
    expect(picks.keep(move("runners", "crossfade"))).toBe("already")
    expect(picks.keep(move("slow", "crossfade"))).toBe("refused")
    expect(picks.keep(pick("slow", "dip-to-black"))).toBe("kept")
    expect(picks.keep(move("runners", "dip-to-black"))).toBe("kept")
    const kept = picks.list("runners")
    expect(kept?.map((p) => p.event.chose)).toEqual([
      { kind: "variant", variant: "crossfade", rule: "joins-crossfade" },
      {
        kind: "variant",
        variant: "dip-to-black",
        rule: "joins-dip-at-chapters",
      },
    ])
    expect(pickOn(kept ?? [], "transitions-1")?.event.chose).toMatchObject({
      variant: "dip-to-black",
    })
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

  it("reads back only the owner's approvals", () => {
    const storage = memory()
    const forged = pick("runners", "crossfade")
    storage.setItem(
      PICKS_KEY,
      JSON.stringify([{ ...forged, event: { ...forged.event, by: "agent" } }])
    )
    expect(phonePicks(() => storage).list("runners")).toEqual([])
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
      PICK_WORDS.kept.sample,
      PICK_WORDS.sample,
      PICK_WORDS.already,
      PICK_WORDS.refused,
    ]
    expect(lines.filter((line) => MACHINERY.test(line))).toEqual([])
  })
})
