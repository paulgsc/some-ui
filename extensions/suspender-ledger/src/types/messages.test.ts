// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"

import {
  isContentToWorkerMessage,
  isPopupToWorkerMessage,
} from "./messages"

describe("isPopupToWorkerMessage", () => {
  it("accepts a popup command", () => {
    expect(
      isPopupToWorkerMessage({ method: "popup", cmd: "discard-tab" })
    ).toBe(true)
  })

  it("accepts a storage read", () => {
    expect(isPopupToWorkerMessage({ method: "storage", local: {} })).toBe(true)
  })

  it("rejects unrelated shapes", () => {
    expect(isPopupToWorkerMessage({ method: "simulate" })).toBe(false)
    expect(isPopupToWorkerMessage({ type: "TAB_IDLE" })).toBe(false)
    expect(isPopupToWorkerMessage(null)).toBe(false)
    expect(isPopupToWorkerMessage("popup")).toBe(false)
  })

  it("does not confuse the two protocols", () => {
    const content = { type: "TAB_ACTIVE", timestamp: 1 }
    expect(isContentToWorkerMessage(content)).toBe(true)
    expect(isPopupToWorkerMessage(content)).toBe(false)
  })
})
