// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearSkipped,
  DISCARD_STATE_STORAGE_KEY,
  hydrateDiscardState,
  markSkipped,
  skipped,
  skipSummary,
  summarizeSkipReasons,
} from "./discard-state"

beforeEach(() => {
  vi.clearAllMocks()
  skipped.clear()
  vi.mocked(chrome.storage.session.get).mockImplementation(
    (_keys: unknown, cb: (items: Record<string, unknown>) => void) => cb({})
  )
  vi.mocked(chrome.storage.session.set).mockImplementation(
    (_items: unknown, cb?: () => void) => cb?.()
  )
})

describe("markSkipped / clearSkipped", () => {
  it("paints an ambient badge count, never per-tab UI on the tab strip", () => {
    markSkipped(101, "media")

    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: "1" })
  })

  it("clears the badge once every tracked tab is cleared", () => {
    markSkipped(102, "protected")
    clearSkipped(102)

    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: "" })
  })

  it("clearing an untracked tab is a no-op (no redundant storage write)", () => {
    clearSkipped(999999)

    expect(chrome.storage.session.set).not.toHaveBeenCalled()
  })

  it("mirrors every change to storage.session, keyed by the documented key", () => {
    markSkipped(103, "media")

    expect(chrome.storage.session.set).toHaveBeenLastCalledWith(
      expect.objectContaining({
        [DISCARD_STATE_STORAGE_KEY]: expect.objectContaining({
          103: { reason: "media", at: expect.any(Number) },
        }),
      }),
      expect.any(Function)
    )
  })
})

describe("skipSummary / summarizeSkipReasons", () => {
  it("returns nothing when no tab is currently kept awake", () => {
    expect(summarizeSkipReasons({})).toEqual([])
  })

  it("deduplicates repeated reasons across many tabs into one plain-language line each", () => {
    markSkipped(201, "protected")
    markSkipped(202, "protected")
    markSkipped(203, "media")

    expect(skipSummary()).toEqual([
      "Unsaved text or form inputs",
      "Active audio or video",
    ])
  })

  it("orders protected before media regardless of which was recorded first", () => {
    markSkipped(301, "media")
    markSkipped(302, "protected")

    expect(skipSummary()).toEqual([
      "Unsaved text or form inputs",
      "Active audio or video",
    ])
  })

  it("ignores corrupted or foreign entries rather than throwing", () => {
    expect(
      summarizeSkipReasons({
        401: { reason: "some-future-reason", at: Date.now() },
        402: "not even an object",
        403: { reason: "media" },
      })
    ).toEqual([])
  })
})

describe("hydrateDiscardState", () => {
  it("restores tracked tabs from storage.session and repaints the badge", async () => {
    vi.mocked(chrome.storage.session.get).mockImplementation(
      (_keys: unknown, cb: (items: Record<string, unknown>) => void) =>
        cb({
          [DISCARD_STATE_STORAGE_KEY]: {
            501: { reason: "protected", at: 1000 },
          },
        })
    )

    await hydrateDiscardState()

    expect(skipSummary()).toEqual(["Unsaved text or form inputs"])
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: "1" })
  })

  it("starts clean when storage has nothing persisted yet", async () => {
    await hydrateDiscardState()

    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: "" })
  })
})
