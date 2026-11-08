/**
 * @vitest-environment node
 *
 * A template's preview as home answers it (SFEED12): each answer read, and
 * the phone's copy kept only of the ready preview home still holds.
 */
import { describe, expect, it } from "vitest"

import type { Preview, PreviewState } from "@/lib/template-preview/model"
import {
  INITIAL,
  readMade,
  readPreview,
  step,
} from "@/lib/template-preview/model"

const ready = (over: Partial<Preview> = {}): Preview => ({
  id: "conference-call-20261108T074500Z",
  version: 2,
  state: "ready",
  made_at: 1_762_588_000,
  expires_at: 1_762_674_400,
  bytes: 1_000,
  ...over,
})

const answer = (
  status: number,
  body: unknown = ""
): { status: number; body: string } => ({
  status,
  body: typeof body === "string" ? body : JSON.stringify(body),
})

describe("readPreview", () => {
  it("reads home's newest preview, or none", () => {
    expect(readPreview(answer(200, { preview: ready() }))).toEqual({
      kind: "read",
      preview: ready(),
    })
    expect(readPreview(answer(200, { preview: null }))).toEqual({
      kind: "read",
      preview: null,
    })
  })

  it("reads a preview not yet ready with no version, size or times", () => {
    const waiting = { id: "conference-call-1", state: "waiting" }
    expect(readPreview(answer(200, { preview: waiting }))).toEqual({
      kind: "read",
      preview: waiting,
    })
  })

  it("reads a home without previews as older, and anything else as unreadable", () => {
    expect(readPreview(answer(404))).toEqual({ kind: "older" })
    expect(readPreview(answer(500))).toEqual({ kind: "unreadable" })
    expect(readPreview(answer(200, { preview: { id: "x" } }))).toEqual({
      kind: "unreadable",
    })
  })

  it("refuses a ready preview with no size, which can't be brought over", () => {
    const { bytes: _none, ...unsized } = ready()
    expect(readPreview(answer(200, { preview: unsized }))).toEqual({
      kind: "unreadable",
    })
  })
})

describe("readMade", () => {
  it("reads home's yes, a new preview or the one still being made", () => {
    const made = { id: "conference-call-20261108T074500Z", state: "waiting" }
    expect(readMade(answer(202, made))).toEqual({ kind: "asked" })
    expect(readMade(answer(200, { ...made, state: "rendering" }))).toEqual({
      kind: "asked",
    })
    expect(readMade(answer(404))).toEqual({ kind: "older" })
    expect(readMade(answer(202, {}))).toEqual({ kind: "unreadable" })
  })
})

describe("step", () => {
  const watched: PreviewState = {
    ...INITIAL,
    home: { kind: "read", preview: ready() },
    fetch: { id: ready().id, fetch: { kind: "ready", uri: "u", src: "s" } },
  }

  it("keeps the phone's copy while home still holds that preview ready", () => {
    const next = step(watched, {
      type: "readEnded",
      home: { kind: "read", preview: ready() },
    })
    expect(next.fetch).toEqual(watched.fetch)
  })

  it("forgets the phone's copy once home holds a newer preview, or none", () => {
    for (const preview of [ready({ id: "newer", bytes: 2_000 }), null]) {
      const next = step(watched, {
        type: "readEnded",
        home: { kind: "read", preview },
      })
      expect(next.fetch).toBeNull()
    }
  })

  it("keeps what was read, and says so once, when a read again gets no answer", () => {
    for (const kind of ["away", "unreadable"] as const) {
      const next = step(watched, { type: "readEnded", home: { kind } })
      expect(next.home).toEqual(watched.home)
      expect(next.fetch).toEqual(watched.fetch)
      expect(next.said).toEqual({ kind: "readFailed", why: kind })
    }
  })

  it("says once why a press of Preview didn't reach home", () => {
    const asking = step(INITIAL, { type: "makeAsked" })
    expect(asking.asking).toBe(true)
    const ended = step(asking, { type: "makeEnded", made: { kind: "away" } })
    expect(ended).toMatchObject({
      asking: false,
      said: { kind: "makeFailed", why: "away" },
    })
    expect(step(ended, { type: "saidSeen" }).said).toBeNull()
  })
})
