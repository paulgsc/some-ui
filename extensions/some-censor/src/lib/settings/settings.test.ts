import { classify, estimate } from "@censor/lib/content/maturity/maturity"
import { describe, expect, it } from "vitest"

import type { Settings } from "./settings"
import {
  BOUNDARIES,
  BOUNDARY_CHANGES_KEY,
  boundaryDays,
  CHOICE_CHANGES_KEY,
  DEFAULT_SETTINGS,
  parseBoundaryChanges,
  parseChoiceChanges,
  parseSettings,
  SETTINGS_KEY,
  settingsWrite,
} from "./settings"

const settings = (overrides: Partial<Settings>): Settings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
})

describe("parseSettings", () => {
  it("reads a stored record", () => {
    expect(
      parseSettings({
        v: 1,
        boundary: "2y",
        mode: "strict",
        autoplay: "skip",
        enabled: false,
      })
    ).toEqual({
      boundary: "2y",
      mode: "strict",
      autoplay: "skip",
      enabled: false,
    })
  })

  it("reads a record from before the modes as Standard, stopping (#1966)", () => {
    expect(parseSettings({ v: 1, boundary: "2y", enabled: false })).toEqual(
      settings({ boundary: "2y", enabled: false })
    )
  })

  it("yields the defaults for no record, a foreign one or another version", () => {
    for (const raw of [undefined, null, "1y", [], { boundary: "2y" }]) {
      expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS)
    }
    expect(parseSettings({ v: 2, boundary: "2y", enabled: false })).toEqual(
      DEFAULT_SETTINGS
    )
  })

  it("defaults each unreadable field on its own", () => {
    expect(parseSettings({ v: 1, boundary: 30, enabled: false })).toEqual(
      settings({ enabled: false })
    )
    expect(parseSettings({ v: 1, boundary: "6mo", enabled: "no" })).toEqual(
      settings({ boundary: "6mo" })
    )
    expect(
      parseSettings({ v: 1, mode: "lenient", autoplay: true, enabled: false })
    ).toEqual(settings({ enabled: false }))
  })
})

describe("settingsWrite", () => {
  it("writes the record alone when the boundary stays", () => {
    expect(settingsWrite({}, settings({ enabled: false }), 5)).toEqual({
      [SETTINGS_KEY]: { v: 1, ...settings({ enabled: false }) },
    })
  })

  it("appends each boundary change to the log, from what was stored", () => {
    const first = settingsWrite({}, settings({ boundary: "6mo" }), 5)
    expect(first[BOUNDARY_CHANGES_KEY]).toEqual([
      { at: 5, from: "1y", to: "6mo" },
    ])
    const second = settingsWrite(first, settings({ boundary: "2y" }), 9)
    expect(parseBoundaryChanges(second[BOUNDARY_CHANGES_KEY])).toEqual([
      { at: 5, from: "1y", to: "6mo" },
      { at: 9, from: "6mo", to: "2y" },
    ])
  })

  it("keeps log entries it cannot read", () => {
    const stored = { [BOUNDARY_CHANGES_KEY]: { odd: true } }
    const next = settingsWrite(stored, settings({ boundary: "2y" }), 3)
    expect(next[BOUNDARY_CHANGES_KEY]).toEqual([
      { odd: true },
      { at: 3, from: "1y", to: "2y" },
    ])
    expect(parseBoundaryChanges(next[BOUNDARY_CHANGES_KEY])).toEqual([
      { at: 3, from: "1y", to: "2y" },
    ])
  })
})

describe("the mode and autoplay log (#1966)", () => {
  it("appends each change of mode or autoplay, and nothing else", () => {
    const first = settingsWrite({}, settings({ mode: "strict" }), 5)
    expect(first[CHOICE_CHANGES_KEY]).toEqual([
      { at: 5, choice: "mode", from: "standard", to: "strict" },
    ])
    expect(first[BOUNDARY_CHANGES_KEY]).toBeUndefined()
    const both = settingsWrite(
      first,
      settings({ mode: "open", autoplay: "skip" }),
      9
    )
    expect(parseChoiceChanges(both[CHOICE_CHANGES_KEY])).toEqual([
      { at: 5, choice: "mode", from: "standard", to: "strict" },
      { at: 9, choice: "mode", from: "strict", to: "open" },
      { at: 9, choice: "autoplay", from: "stop", to: "skip" },
    ])
    const same = settingsWrite(
      both,
      settings({ mode: "open", autoplay: "skip", enabled: false }),
      12
    )
    expect(same[CHOICE_CHANGES_KEY]).toBeUndefined()
  })

  it("keeps entries it cannot read, and reads only well-formed ones", () => {
    const stored = { [CHOICE_CHANGES_KEY]: [{ odd: true }] }
    const next = settingsWrite(stored, settings({ autoplay: "skip" }), 3)
    expect(next[CHOICE_CHANGES_KEY]).toEqual([
      { odd: true },
      { at: 3, choice: "autoplay", from: "stop", to: "skip" },
    ])
    expect(
      parseChoiceChanges([
        { at: 1, choice: "mode", from: "stop", to: "skip" },
        { at: 1, choice: "autoplay", from: "strict", to: "open" },
        { at: 1, choice: "boundary", from: "1y", to: "2y" },
        { at: "1", choice: "mode", from: "strict", to: "open" },
      ])
    ).toEqual([])
  })
})

describe("boundaryDays", () => {
  it("never plates a younger label while holding an older one", () => {
    // Youngest first. The estimator reads each label's youngest age, so
    // "1 year ago" (182 days) reads younger than "11 months ago" (294).
    const labels = [
      "6 months ago",
      "7 months ago",
      "8 months ago",
      "11 months ago",
      "1 year ago",
      "2 years ago",
      "3 years ago",
    ]
    for (const b of BOUNDARIES) {
      const plated = labels.map((label) => {
        const band = classify(estimate(label, 0), boundaryDays(b))
        return band === "QM3" || band === "QM4"
      })
      const first = plated.indexOf(true)
      expect(plated.slice(first).every(Boolean), b).toBe(true)
    }
  })
})
