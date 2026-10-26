import type { ComponentProps } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { LessonItem } from "@topik/lib/topik/core/lesson-feed"
import { afterEach, describe, expect, it } from "vitest"

import { MaterialList } from "."

const noop = (): void => undefined

const scene = (n: number, level: number | undefined): LessonItem => ({
  key: `scene/${n}`,
  kind: "scene",
  name: `Scene ${n}`,
  level,
  genre: undefined,
  premise: undefined,
  opened: false,
  sessions: [],
})

const list = (
  props: Partial<ComponentProps<typeof MaterialList>>
): ComponentProps<typeof MaterialList> => ({
  level: 1,
  onLevel: noop,
  dramas: [],
  onPlay: noop,
  onSeed: noop,
  loading: false,
  error: null,
  onReload: noop,
  onOpenRoutine: noop,
  ...props,
})

const shown = (): Array<string> =>
  screen
    .queryAllByRole("listitem")
    .map(
      (card) =>
        card.querySelector('[data-slot="feed-title"]')?.textContent ?? ""
    )

afterEach(cleanup)

describe("MaterialList's level filter", () => {
  it("shows every level again once its row is gone, unleveled ones included", () => {
    const { rerender } = render(
      <MaterialList
        {...list({ fromRoutine: [scene(1, 1), scene(2, 2), scene(3, 1)] })}
      />
    )
    fireEvent.click(screen.getByRole("radio", { name: "TOPIK 2" }))
    expect(shown()).toEqual(["Scene 2"])

    // A new answer holds one level and a scene with none: no row to undo it.
    rerender(
      <MaterialList
        {...list({ fromRoutine: [scene(2, 2), scene(4, undefined)] })}
      />
    )
    expect(screen.queryByRole("radiogroup")).toBeNull()
    expect(shown()).toEqual(["Scene 2", "Scene 4"])
  })

  it("offers no level only a section that isn't shown holds", () => {
    render(
      <MaterialList
        {...list({
          fromRoutine: [scene(1, 2)],
          // Without read-aloud, "Ready for you" isn't shown.
          readySets: [{ id: "a", title: "a", words: 1, lines: 1, level: 3 }],
        })}
      />
    )
    expect(screen.queryByRole("radiogroup")).toBeNull()
  })
})
