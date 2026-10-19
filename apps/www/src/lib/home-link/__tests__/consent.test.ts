/**
 * The consent log (LA11): choices only ever append, what is shared at any
 * time is a fold over them, and a log this phone cannot read is never
 * written over.
 */
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
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
const HOME = "https://home.example/api/v1"

describe("the consent log", () => {
  const kept = appended(
    [],
    { kind: "kept", home: HOME, scopes: ["sessions", "shelf"], said: SAID },
    100
  )
  const stopped = appended(
    kept,
    { kind: "stopped", home: HOME, scopes: ["shelf"] },
    200
  )

  it("answers what was shared at any time from the same events", () => {
    expect([...sharedAt(stopped, 50, HOME).keys()]).toEqual([])
    expect([...sharedAt(stopped, 150, HOME).entries()]).toEqual([
      ["sessions", { since: 100 }],
      ["shelf", { since: 100 }],
    ])
    expect([...sharedAt(stopped, 250, HOME).entries()]).toEqual([
      ["sessions", { since: 100 }],
    ])
    expect([...sharedNow(stopped, HOME).keys()]).toEqual(["sessions"])
  })

  it("only appends, keeping every earlier event as it was", () => {
    expect(stopped.slice(0, kept.length)).toEqual(kept)
    expect(stopped.map((event) => event.seq)).toEqual([1, 2])
    expect(stopped[0]).toMatchObject({ kind: "kept", said: SAID })
  })

  it("adds nothing for a choice that changes nothing", () => {
    expect(
      appended(
        kept,
        { kind: "kept", home: HOME, scopes: ["sessions"], said: SAID },
        300
      )
    ).toBe(kept)
    expect(
      appended([], { kind: "stopped", home: HOME, scopes: ["sessions"] }, 300)
    ).toEqual([])
    const again = appended(
      stopped,
      { kind: "kept", home: HOME, scopes: ["sessions", "shelf"], said: SAID },
      300
    )
    expect(again.at(-1)).toMatchObject({ seq: 3, scopes: ["shelf"] })
  })

  it("keeps a new since once a stopped scope is kept again", () => {
    const back = appended(
      stopped,
      { kind: "kept", home: HOME, scopes: ["shelf"], said: SAID },
      400
    )
    expect(sharedNow(back, HOME).get("shelf")).toEqual({ since: 400 })
  })

  it("counts a choice for the home it was made for alone", () => {
    expect(sharedNow(stopped, "https://other.example/api/v1").size).toBe(0)
    expect(sharedNow(stopped, null).size).toBe(0)
  })

  it("reads back what it wrote, and refuses what is not a log", () => {
    expect(parseLog(JSON.stringify(stopped))).toEqual(stopped)
    expect(parseLog("not json")).toBeNull()
    expect(parseLog('{"seq":1}')).toBeNull()
    expect(
      parseLog(
        JSON.stringify([
          {
            seq: 1,
            at: 1,
            home: HOME,
            kind: "kept",
            scopes: ["reflections"],
            said: "",
          },
        ])
      )
    ).toBeNull()
    const outOfOrder: ConsentLog = [stopped[1], stopped[0]]
    expect(parseLog(JSON.stringify(outOfOrder))).toBeNull()
  })
})

describe("the log on this phone", () => {
  it("writes each choice and tells its readers", () => {
    const storage = memoryStorage()
    const consent = createConsent(storage, () => 5)
    let heard = 0
    consent.subscribe(() => (heard += 1))
    expect(
      consent.choose({
        kind: "kept",
        home: HOME,
        scopes: ["sessions"],
        said: SAID,
      })
    ).toBe(true)
    expect(heard).toBe(1)
    expect(createConsent(storage, () => 9).getSnapshot()).toHaveLength(1)
  })

  it("never writes over a log it cannot read", () => {
    const storage = memoryStorage([[CONSENT_KEY, "{ broken"]])
    const consent = createConsent(storage, () => 5)
    expect(
      consent.choose({
        kind: "kept",
        home: HOME,
        scopes: ["sessions"],
        said: SAID,
      })
    ).toBe(false)
    expect(storage.map.get(CONSENT_KEY)).toBe("{ broken")
    expect(consent.getSnapshot()).toEqual([])
  })

  it("refuses a choice when there is no storage", () => {
    const consent = createConsent(null, () => 5)
    expect(
      consent.choose({
        kind: "kept",
        home: HOME,
        scopes: ["sessions"],
        said: SAID,
      })
    ).toBe(false)
  })
})
