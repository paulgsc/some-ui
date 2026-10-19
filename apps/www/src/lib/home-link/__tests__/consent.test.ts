/**
 * The consent log (LA11): choices only ever append, what is shared at any
 * time is a fold over them, and a log this phone cannot read is never
 * written over.
 */
import { describe, expect, it } from "vitest"

import type { ConsentLog } from "@/lib/home-link/consent-model"
import {
  appended,
  parseLog,
  sharedAt,
  sharedNow,
} from "@/lib/home-link/consent-model"
import { CONSENT_KEY, createConsent } from "@/lib/home-link/consent-runtime"

const SAID = "Keep sending these to home from now on."

function memory(initial: string | null = null): {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  writes: Array<string>
} {
  let value = initial
  const writes: Array<string> = []
  return {
    writes,
    getItem: (key) => (key === CONSENT_KEY ? value : null),
    setItem: (key, next): void => {
      expect(key).toBe(CONSENT_KEY)
      value = next
      writes.push(next)
    },
  }
}

describe("the consent log", () => {
  const kept = appended(
    [],
    { kind: "kept", scopes: ["sessions", "shelf"], said: SAID },
    100
  )
  const stopped = appended(kept, { kind: "stopped", scopes: ["shelf"] }, 200)

  it("answers what was shared at any time from the same events", () => {
    expect([...sharedAt(stopped, 50).keys()]).toEqual([])
    expect([...sharedAt(stopped, 150).entries()]).toEqual([
      ["sessions", { since: 100 }],
      ["shelf", { since: 100 }],
    ])
    expect([...sharedAt(stopped, 250).entries()]).toEqual([
      ["sessions", { since: 100 }],
    ])
    expect([...sharedNow(stopped).keys()]).toEqual(["sessions"])
  })

  it("only appends, keeping every earlier event as it was", () => {
    expect(stopped.slice(0, kept.length)).toEqual(kept)
    expect(stopped.map((event) => event.seq)).toEqual([1, 2])
    expect(stopped[0]).toMatchObject({ kind: "kept", said: SAID })
  })

  it("adds nothing for a choice that changes nothing", () => {
    expect(
      appended(kept, { kind: "kept", scopes: ["sessions"], said: SAID }, 300)
    ).toBe(kept)
    expect(
      appended([], { kind: "stopped", scopes: ["sessions"] }, 300)
    ).toEqual([])
    const again = appended(
      stopped,
      { kind: "kept", scopes: ["sessions", "shelf"], said: SAID },
      300
    )
    expect(again.at(-1)).toMatchObject({ seq: 3, scopes: ["shelf"] })
  })

  it("keeps a new since once a stopped scope is kept again", () => {
    const back = appended(
      stopped,
      { kind: "kept", scopes: ["shelf"], said: SAID },
      400
    )
    expect(sharedNow(back).get("shelf")).toEqual({ since: 400 })
  })

  it("reads back what it wrote, and refuses what is not a log", () => {
    expect(parseLog(JSON.stringify(stopped))).toEqual(stopped)
    expect(parseLog("not json")).toBeNull()
    expect(parseLog('{"seq":1}')).toBeNull()
    expect(
      parseLog(
        JSON.stringify([
          { seq: 1, at: 1, kind: "kept", scopes: ["reflections"], said: "" },
        ])
      )
    ).toBeNull()
    const outOfOrder: ConsentLog = [stopped[1], stopped[0]]
    expect(parseLog(JSON.stringify(outOfOrder))).toBeNull()
  })
})

describe("the log on this phone", () => {
  it("writes each choice and tells its readers", () => {
    const storage = memory()
    const consent = createConsent(storage, () => 5)
    let heard = 0
    consent.subscribe(() => (heard += 1))
    expect(
      consent.choose({ kind: "kept", scopes: ["sessions"], said: SAID })
    ).toBe(true)
    expect(heard).toBe(1)
    expect(parseLog(storage.writes.at(-1) ?? "")).toEqual(consent.getSnapshot())
    expect(createConsent(storage, () => 9).getSnapshot()).toHaveLength(1)
  })

  it("never writes over a log it cannot read", () => {
    const storage = memory("{ broken")
    const consent = createConsent(storage, () => 5)
    expect(
      consent.choose({ kind: "kept", scopes: ["sessions"], said: SAID })
    ).toBe(false)
    expect(storage.writes).toEqual([])
    expect(consent.getSnapshot()).toEqual([])
  })

  it("refuses a choice when there is no storage", () => {
    const consent = createConsent(null, () => 5)
    expect(
      consent.choose({ kind: "kept", scopes: ["sessions"], said: SAID })
    ).toBe(false)
  })
})
