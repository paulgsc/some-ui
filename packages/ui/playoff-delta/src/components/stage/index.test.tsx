/**
 * VS1 (promise, #2796): the stage draws every format version it knows and
 * refuses the next one, on the frame where the recorder reads it, for the
 * legend and for a week; a stage behind its recorders then fails a recording
 * instead of drawing a newer template in an older look.
 */
import { PlayoffDeltaStage } from "@playoff-delta/components/stage"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { FORMAT_VERSION, kindOf } from "@playoff-delta/lib/show"
import { LEGEND_WEEK } from "@playoff-delta/lib/slides"
import type * as ReactHooks from "@some-ui/react-hooks"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// The frame measures its overflow; jsdom has no layout to measure.
vi.mock(
  "@some-ui/react-hooks",
  async (actual): Promise<Hooks> => ({
    ...(await actual<Hooks>()),
    useOverflows: (): ReturnType<Hooks["useOverflows"]> => ({
      ref: (): void => undefined,
      overflows: false,
    }),
  })
)

type Hooks = typeof ReactHooks

afterEach(cleanup)

const WEEK = SAMPLE_SEASON.weeks[0]?.week ?? 1

describe("the stage asked for a format version (VS1)", () => {
  it.each([LEGEND_WEEK, WEEK])("week %i: draws each it knows", (week) => {
    const newest = FORMAT_VERSION[kindOf(week)]
    for (let version = 1; version <= newest; version++) {
      const { container, unmount } = render(
        <PlayoffDeltaStage week={week} record version={version} />
      )
      expect(container.querySelector("[data-refused]")).toBeNull()
      expect(container.textContent).not.toBe("")
      unmount()
    }
  })

  it.each([LEGEND_WEEK, WEEK])(
    "week %i: refuses the one after its newest",
    (week) => {
      const next = FORMAT_VERSION[kindOf(week)] + 1
      const { container } = render(
        <PlayoffDeltaStage week={week} record version={next} />
      )
      const refused = container.querySelector("[data-refused]")
      expect(refused?.getAttribute("data-refused")).toContain(
        `asked for version ${String(next)}`
      )
    }
  )
})
