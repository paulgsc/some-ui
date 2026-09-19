/**
 * @vitest-environment jsdom
 *
 * "Fully operable by keyboard" is an acceptance criterion of #855, so it is
 * asserted here rather than inspected: arrow through, Enter launches, Escape
 * restores the recommended set.
 */

import type { ActivityDefinition } from "@some-ui/activity-catalog"
import {
  rankActivities,
  SEARCH_RESULT_LIMIT,
  syntheticCatalogue,
} from "@some-ui/activity-catalog"
import { act, renderHook } from "@testing-library/react"
import type { RenderHookResult } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { OverlayKeyEvent, SearchOverlay } from "./use-search-overlay"
import { useSearchOverlay } from "./use-search-overlay"

const CATALOGUE = rankActivities(syntheticCatalogue(50))

type Harness = RenderHookResult<SearchOverlay, unknown>

function setup(
  onLaunch: (activity: ActivityDefinition) => void = vi.fn()
): Harness {
  return renderHook(() => useSearchOverlay({ catalogue: CATALOGUE, onLaunch }))
}

function press({ result }: Harness, key: string): void {
  const event: OverlayKeyEvent = { key, preventDefault: vi.fn() }
  act(() => {
    result.current.handleKeyDown(event)
  })
}

describe("useSearchOverlay", () => {
  it("is closed, with no results, before anything is typed", () => {
    const harness = setup()
    const { result } = harness

    expect(result.current.isOpen).toBe(false)
    expect(result.current.results).toEqual([])
    expect(result.current.active).toBeUndefined()
  })

  it("opens on a query and bounds the results to m", () => {
    const harness = setup()
    const { result } = harness

    act(() => result.current.setQuery("drill"))

    expect(result.current.isOpen).toBe(true)
    expect(result.current.results.length).toBeGreaterThan(0)
    expect(result.current.results.length).toBeLessThanOrEqual(
      SEARCH_RESULT_LIMIT
    )
  })

  it("starts on the first result and arrows down through them", () => {
    const harness = setup()
    const { result } = harness
    act(() => result.current.setQuery("drill"))

    const ids = result.current.results.map((activity) => activity.id)
    expect(result.current.active?.id).toBe(ids[0])

    press(harness, "ArrowDown")
    expect(result.current.active?.id).toBe(ids[1])

    press(harness, "ArrowDown")
    expect(result.current.active?.id).toBe(ids[2])
  })

  it("wraps at both ends, so ArrowUp from the top lands on the last result", () => {
    const harness = setup()
    const { result } = harness
    act(() => result.current.setQuery("drill"))

    const ids = result.current.results.map((activity) => activity.id)

    press(harness, "ArrowUp")
    expect(result.current.active?.id).toBe(ids.at(-1))

    press(harness, "ArrowDown")
    expect(result.current.active?.id).toBe(ids[0])
  })

  it("launches the active result on Enter", () => {
    const onLaunch = vi.fn()
    const harness = setup(onLaunch)
    const { result } = harness

    act(() => result.current.setQuery("drill"))
    press(harness, "ArrowDown")
    const expected = result.current.active

    press(harness, "Enter")

    expect(onLaunch).toHaveBeenCalledTimes(1)
    expect(onLaunch).toHaveBeenCalledWith(expected)
  })

  it("does not launch anything on Enter with no matches", () => {
    const onLaunch = vi.fn()
    const harness = setup(onLaunch)
    const { result } = harness

    act(() => result.current.setQuery("zzzqqq"))
    expect(result.current.isOpen).toBe(true)
    expect(result.current.results).toEqual([])

    press(harness, "Enter")

    expect(onLaunch).not.toHaveBeenCalled()
  })

  it("restores the recommended set on Escape", () => {
    const harness = setup()
    const { result } = harness

    act(() => result.current.setQuery("drill"))
    press(harness, "Escape")

    expect(result.current.query).toBe("")
    expect(result.current.isOpen).toBe(false)
    expect(result.current.results).toEqual([])
  })

  it("keeps the active index valid as a query narrows under it", () => {
    const harness = setup()
    const { result } = harness

    act(() => result.current.setQuery("drill"))
    press(harness, "ArrowDown")
    press(harness, "ArrowDown")
    press(harness, "ArrowDown")

    // "Hangul Drill" matches far fewer entries than "drill" did.
    act(() => result.current.setQuery("hangul drill"))

    expect(result.current.activeIndex).toBeLessThan(
      Math.max(1, result.current.results.length)
    )
    expect(result.current.active).toBeDefined()
  })

  it("reaches every activity in a 50-entry catalogue by name", () => {
    const launched: Array<string> = []
    const harness = setup((activity) => launched.push(activity.id))
    const { result } = harness

    for (const activity of CATALOGUE) {
      act(() => result.current.setQuery(activity.name))
      press(harness, "Enter")
    }

    expect(launched).toEqual(CATALOGUE.map((activity) => activity.id))
  })
})
