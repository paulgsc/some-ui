// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Regression suite for the sporadic "tabs are never suspended" bug.
 *
 * The failure had no error and no log line, because nothing failed — the
 * periodic sweep alarm was simply re-armed from zero on every event-page
 * respawn, so during active browsing (when the page is woken every few
 * seconds) its scheduled time was pushed forward faster than it could ever
 * arrive. The first test below is the one that would have caught it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { number } from "./number"

type AlarmShape = {
  name: string
  scheduledTime: number
  periodInMinutes?: number
}

/** The cadence `install` derives from the default 10-minute age threshold. */
const DEFAULT_PERIOD_SECONDS = 10 * 60
const EXPECTED_MINUTES = DEFAULT_PERIOD_SECONDS / 3 / 60 // period/3, clamped to 1–20m

/** Install a fake `alarms.get` that resolves the given alarm (or nothing). */
function withExistingAlarm(alarm: AlarmShape | undefined): void {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the callback overload is the one typed; we exercise the promise form Firefox implements
  vi.mocked(chrome.alarms.get).mockImplementation((() =>
    Promise.resolve(alarm)) as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("number.install — scheduler idempotency", () => {
  it("creates the sweep alarm when none exists", async () => {
    withExistingAlarm(undefined)

    await number.install(DEFAULT_PERIOD_SECONDS)

    expect(chrome.alarms.create).toHaveBeenCalledWith(
      "number.check",
      expect.objectContaining({ periodInMinutes: EXPECTED_MINUTES })
    )
  })

  it("does NOT re-arm an alarm that already exists at the same cadence", async () => {
    // This is the bug. `install` runs from a `starters` callback, and starters
    // run at module evaluation on every worker generation — so an
    // unconditional `alarms.create` here pushes the next sweep a full interval
    // into the future every time the event page is woken by any listener.
    withExistingAlarm({
      name: "number.check",
      scheduledTime: Date.now() + 60_000,
      periodInMinutes: EXPECTED_MINUTES,
    })

    await number.install(DEFAULT_PERIOD_SECONDS)

    expect(chrome.alarms.create).not.toHaveBeenCalled()
  })

  it("keeps the original due time across repeated worker respawns", async () => {
    const scheduledTime = Date.now() + 90_000
    withExistingAlarm({
      name: "number.check",
      scheduledTime,
      periodInMinutes: EXPECTED_MINUTES,
    })

    // Ten wakes in a row — the shape of an active browsing session.
    for (let i = 0; i < 10; i += 1) {
      await number.install(DEFAULT_PERIOD_SECONDS)
    }

    expect(chrome.alarms.create).not.toHaveBeenCalled()
  })

  it("re-arms when the configured cadence changed", async () => {
    withExistingAlarm({
      name: "number.check",
      scheduledTime: Date.now() + 60_000,
      periodInMinutes: EXPECTED_MINUTES,
    })

    // 30-minute age threshold → 10-minute sweep cadence.
    await number.install(30 * 60)

    expect(chrome.alarms.create).toHaveBeenCalledWith(
      "number.check",
      expect.objectContaining({ periodInMinutes: 10 })
    )
  })

  it("re-arms when the existing alarm has no cadence at all", async () => {
    // A one-shot alarm left behind by an older version would otherwise be
    // mistaken for a healthy periodic one and never replaced.
    withExistingAlarm({
      name: "number.check",
      scheduledTime: Date.now() + 1000,
    })

    await number.install(DEFAULT_PERIOD_SECONDS)

    expect(chrome.alarms.create).toHaveBeenCalledWith(
      "number.check",
      expect.objectContaining({ periodInMinutes: EXPECTED_MINUTES })
    )
  })

  it("treats an unreadable alarms API as 'no alarm' and installs one", () => {
    vi.mocked(chrome.alarms.get).mockImplementation(() => {
      throw new Error("alarms unavailable")
    })

    return number.install(DEFAULT_PERIOD_SECONDS).then(() => {
      expect(chrome.alarms.create).toHaveBeenCalled()
    })
  })

  it("clamps the sweep cadence to at least one minute", async () => {
    withExistingAlarm(undefined)

    // A 30-second age threshold would otherwise ask for a 10-second alarm,
    // which the browser silently refuses to honour.
    await number.install(30)

    expect(chrome.alarms.create).toHaveBeenCalledWith(
      "number.check",
      expect.objectContaining({ periodInMinutes: 1 })
    )
  })

  it("clamps the sweep cadence to at most twenty minutes", async () => {
    withExistingAlarm(undefined)

    await number.install(24 * 60 * 60)

    expect(chrome.alarms.create).toHaveBeenCalledWith(
      "number.check",
      expect.objectContaining({ periodInMinutes: 20 })
    )
  })
})

describe("number.remove", () => {
  it("clears the sweep alarm", () => {
    number.remove()
    expect(chrome.alarms.clear).toHaveBeenCalledWith("number.check")
  })
})
