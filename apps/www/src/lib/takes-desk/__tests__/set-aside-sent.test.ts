/**
 * @vitest-environment jsdom
 *
 * A take an answer said again replaced, set aside once its idea is sent
 * again (ST26, #2579; the owner's ruling on #2453): on the idea desk that
 * lists it, as a sent take, with its mark owed first (LA13), kept with its
 * audio; one still waiting is never set aside; and one no desk lists any
 * more is owed its mark alone, which goes once home holds the note.
 */
import { memoryShelf } from "@some-ui/voice-capture/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setAsideReplaced } from "@/lib/idea-takes"
import type { PatternDesk } from "@/lib/takes-desk"
import { deskList, patternDesk } from "@/lib/takes-desk"
import type { Take } from "@/lib/takes-desk/runtime"
import type { MarkOwing } from "@/lib/voice-marks"
import { wireVoiceMarks } from "@/lib/voice-marks"

const AT = "2026-11-08T10:00:00.000Z"

const take = (id: string, waits = false): Take => ({
  id,
  line: "idea:idea-1:what",
  takenAt: Date.parse("2026-11-01T09:00:00.000Z"),
  durationMs: 3000,
  mimeType: "audio/webm",
  ...(waits ? { waits: true as const } : {}),
})

let made = 0

function deskOf(takes: ReadonlyArray<Take>): {
  desk: PatternDesk
  listed: () => ReadonlyArray<Take>
} {
  made += 1
  const key = `set-aside-sent-${String(made)}`
  const shelf = memoryShelf()
  const desk = patternDesk({
    key,
    screen: "test",
    dbName: key,
    from: "studio",
    limits: { max: 40, maxMs: 60_000 },
    shelf: {
      shelf: () => shelf,
      saving: (): void => undefined,
      isSaving: (): boolean => false,
    },
  })
  const list = deskList(key, 40)
  for (const each of takes) list.add(each)
  return { desk, listed: list.read }
}

/** The lane's owing of marks, as a test records it. */
function owing(keeps = true): MarkOwing & { owed: Array<unknown> } {
  const owed: Array<unknown> = []
  return {
    owed,
    owe: (id, at, from): boolean => {
      if (keeps) owed.push({ id, at, from })
      return keeps
    },
    unowe: vi.fn(),
  }
}

let unwire: () => void = () => undefined

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  unwire()
  vi.restoreAllMocks()
})

describe("a take an answer said again replaced (#2579)", () => {
  it("is set aside where it is listed, its mark owed first, and kept", () => {
    const marks = owing()
    unwire = wireVoiceMarks(marks)
    const { desk, listed } = deskOf([take("t0")])
    expect(desk.setAsideSent("t0", AT)).toBe(true)
    expect(marks.owed).toEqual([{ id: "t0", at: AT, from: "studio" }])
    expect(listed()).toEqual([
      { ...take("t0"), standing: "set-aside", setAsideAt: Date.parse(AT) },
    ])
    // Once is enough: the first time stands.
    expect(desk.setAsideSent("t0", "2026-11-09T10:00:00.000Z")).toBe(true)
    expect(marks.owed).toHaveLength(1)
  })

  it("is never a take still waiting, nor one the desk doesn't list", () => {
    unwire = wireVoiceMarks(owing())
    const { desk, listed } = deskOf([take("r1", true)])
    expect(desk.setAsideSent("r1", AT)).toBe("absent")
    expect(desk.setAsideSent("nope", AT)).toBe("absent")
    expect(listed()[0]?.standing).toBeUndefined()
  })

  it("stays as it was when its mark can't be kept", () => {
    unwire = wireVoiceMarks(owing(false))
    const { desk, listed } = deskOf([take("t0")])
    expect(desk.setAsideSent("t0", AT)).toBe(false)
    expect(listed()[0]?.standing).toBeUndefined()
  })

  it("on the phone's idea desks: set aside where listed, and owed its mark alone once it left the phone", () => {
    const marks = owing()
    unwire = wireVoiceMarks(marks)
    deskList("some-ui:idea-bundle-takes", 40).add(take("t0"))
    expect(setAsideReplaced(["t0", "left"], AT)).toBe(true)
    expect(marks.owed).toEqual([
      { id: "t0", at: AT, from: "studio" },
      { id: "left", at: AT, from: "studio" },
    ])
    expect(deskList("some-ui:idea-bundle-takes", 40).read()[0]?.standing).toBe(
      "set-aside"
    )
  })
})
