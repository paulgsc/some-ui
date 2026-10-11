import { describe, expect, it } from "vitest"

import type { Brief, Desk } from "@/lib/job-brief"
import {
  confirmationOf,
  EMPTY,
  loadDesk,
  parseBrief,
  saveDesk,
  step,
} from "@/lib/job-brief"
import { createInMemoryStorage } from "@/lib/tenant/storage"

import raw from "./amplitude.brief.json?raw"

function amplitude(): Brief {
  const parsed = parseBrief(raw)
  if (!parsed.ok) throw new Error(parsed.problem)
  return parsed.brief
}

const AT = new Date("2026-10-11T16:42:00Z")

function opened(brief: Brief = amplitude()): Desk {
  return step(EMPTY, { type: "opened", brief })
}

describe("step", () => {
  it("opens a brief with nothing decided, and edits only an open one", () => {
    const desk = opened()
    expect(desk).toMatchObject({
      kind: "open",
      draft: { outcome: null, reason: null, notes: "" },
    })

    const worked = [
      { type: "outcome", outcome: "skipped" },
      { type: "reason", reason: "pay" },
      { type: "notes", notes: "Range tops out low." },
    ] as const
    expect(worked.reduce(step, desk)).toMatchObject({
      draft: {
        outcome: "skipped",
        reason: "pay",
        notes: "Range tops out low.",
      },
    })

    expect(step(EMPTY, { type: "notes", notes: "x" })).toBe(EMPTY)
  })

  it("keeps what was done when the same brief is opened again, and starts over for another", () => {
    const brief = amplitude()
    const worked = step(opened(brief), { type: "outcome", outcome: "applied" })

    expect(step(worked, { type: "opened", brief })).toMatchObject({
      draft: { outcome: "applied" },
    })
    expect(
      step(worked, { type: "opened", brief: { ...brief, id: "next-brief" } })
    ).toMatchObject({ kind: "open", draft: { outcome: null } })
  })

  it("confirms only the brief a shared confirmation names", () => {
    const desk = step(opened(), { type: "outcome", outcome: "applied" })
    const confirmation = confirmationOf(desk, AT)
    if (confirmation === null) throw new Error("nothing to confirm")

    const confirmed = step(desk, { type: "shared", confirmation })
    expect(confirmed).toMatchObject({ kind: "confirmed", confirmation })
    // Opening the confirmed brief's file again does not reopen it.
    expect(step(confirmed, { type: "opened", brief: amplitude() })).toEqual(
      confirmed
    )

    const stale = { ...confirmation, briefId: "an-older-brief" }
    expect(step(desk, { type: "shared", confirmation: stale })).toBe(desk)
  })
})

describe("confirmationOf", () => {
  it("waits for an outcome, keeps a reason only for a skip, and names the résumé built", () => {
    const desk = opened()
    expect(confirmationOf(desk, AT)).toBeNull()
    expect(confirmationOf(EMPTY, AT)).toBeNull()

    const applied = [
      { type: "reason", reason: "pay" },
      { type: "outcome", outcome: "applied" },
      { type: "notes", notes: "  Referral via a friend.  " },
    ] as const
    expect(confirmationOf(applied.reduce(step, desk), AT)).toEqual({
      schema: "some-ui.job-confirmation/1",
      briefId: "am-9c43",
      outcome: "applied",
      reason: null,
      notes: "Referral via a friend.",
      at: "2026-10-11T16:42:00.000Z",
      resume: { variant: "backend", template: "safe", ref: "b08c1ad" },
    })

    const skipped = step(step(desk, { type: "outcome", outcome: "skipped" }), {
      type: "reason",
      reason: "location",
    })
    expect(confirmationOf(skipped, AT)).toMatchObject({
      outcome: "skipped",
      reason: "location",
    })
  })
})

describe("the kept desk", () => {
  it("survives a restart, and reads anything unreadable as empty", () => {
    const storage = createInMemoryStorage()
    expect(loadDesk(storage)).toEqual(EMPTY)

    const desk = step(opened(), { type: "notes", notes: "Draft" })
    saveDesk(storage, desk)
    expect(loadDesk(storage)).toEqual(desk)

    storage.setItem("some-ui:job-desk", "{torn")
    expect(loadDesk(storage)).toEqual(EMPTY)
    storage.setItem("some-ui:job-desk", JSON.stringify({ kind: "open" }))
    expect(loadDesk(storage)).toEqual(EMPTY)
  })
})
