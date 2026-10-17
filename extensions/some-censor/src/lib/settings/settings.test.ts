import { describe, expect, it } from "vitest"

import {
  BOUNDARY_CHANGES_KEY,
  DEFAULT_SETTINGS,
  parseBoundaryChanges,
  parseSettings,
  SETTINGS_KEY,
  settingsWrite,
} from "./settings"

describe("parseSettings", () => {
  it("reads a stored record", () => {
    expect(parseSettings({ v: 1, boundary: "2y", enabled: false })).toEqual({
      boundary: "2y",
      enabled: false,
    })
  })

  it("yields the defaults for no record, a foreign one or another version", () => {
    for (const raw of [undefined, null, "1y", [], { boundary: "2y" }]) {
      expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS)
    }
    expect(parseSettings({ v: 2, boundary: "2y", enabled: false })).toEqual(
      DEFAULT_SETTINGS
    )
  })

  it("defaults each unreadable field on its own, never to a wider one", () => {
    expect(parseSettings({ v: 1, boundary: 30, enabled: false })).toEqual({
      boundary: "1y",
      enabled: false,
    })
    expect(parseSettings({ v: 1, boundary: "6mo", enabled: "no" })).toEqual({
      boundary: "6mo",
      enabled: true,
    })
  })
})

describe("settingsWrite", () => {
  it("writes the record alone when the boundary stays", () => {
    expect(settingsWrite({}, { boundary: "1y", enabled: false }, 5)).toEqual({
      [SETTINGS_KEY]: { v: 1, boundary: "1y", enabled: false },
    })
  })

  it("appends each boundary change to the log, from what was stored", () => {
    const first = settingsWrite({}, { boundary: "6mo", enabled: true }, 5)
    expect(first[BOUNDARY_CHANGES_KEY]).toEqual([
      { at: 5, from: "1y", to: "6mo" },
    ])
    const second = settingsWrite(first, { boundary: "2y", enabled: true }, 9)
    expect(parseBoundaryChanges(second[BOUNDARY_CHANGES_KEY])).toEqual([
      { at: 5, from: "1y", to: "6mo" },
      { at: 9, from: "6mo", to: "2y" },
    ])
  })

  it("keeps log entries it cannot read", () => {
    const stored = { [BOUNDARY_CHANGES_KEY]: { odd: true } }
    const next = settingsWrite(stored, { boundary: "2y", enabled: true }, 3)
    expect(next[BOUNDARY_CHANGES_KEY]).toEqual([
      { odd: true },
      { at: 3, from: "1y", to: "2y" },
    ])
    expect(parseBoundaryChanges(next[BOUNDARY_CHANGES_KEY])).toEqual([
      { at: 3, from: "1y", to: "2y" },
    ])
  })
})
