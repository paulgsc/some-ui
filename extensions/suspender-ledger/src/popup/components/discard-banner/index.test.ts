// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"

import { DiscardBanner } from "."

describe("DiscardBanner", () => {
  it("renders hidden with no reasons", () => {
    const el = DiscardBanner({ reasons: [] })

    expect(el.hidden).toBe(true)
    expect(el.textContent).toBe("")
  })

  it("renders the plain-language heading and each reason, never the raw browser state name", () => {
    const el = DiscardBanner({
      reasons: ["Unsaved text or form inputs", "Active audio or video"],
    })

    expect(el.hidden).toBe(false)
    expect(el.querySelector(".discard-banner__heading")?.textContent).toBe(
      "Some tabs were kept awake by Chrome"
    )
    const items = Array.from(
      el.querySelectorAll(".discard-banner__list li")
    ).map((li) => li.textContent)
    expect(items).toEqual([
      "Unsaved text or form inputs",
      "Active audio or video",
    ])
    expect(el.textContent).not.toMatch(
      /FormInteracted|CanDiscardTab|beforeunload/i
    )
  })
})
