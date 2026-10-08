import type { Route } from "@some-ui/makjang"
import { sceneAt, scenesOf } from "@some-ui/makjang"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { DramaPointStore } from "@topik/lib/topik/core/drama-runtime"
import { workedLesson } from "@topik/lib/topik/generation/tree-intake/worked-example"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DramaLesson } from "."

afterEach(cleanup)

const lesson = workedLesson()

function memoryPoints(held?: unknown): DramaPointStore & {
  saved: () => unknown
} {
  let point = held
  return {
    saved: () => point,
    get: () => point,
    set: (_, next): void => {
      point = next
    },
  }
}

const renderDrama = (
  points = memoryPoints()
): { points: typeof points; onLeave: ReturnType<typeof vi.fn> } => {
  const onLeave = vi.fn()
  render(
    <DramaLesson
      lesson={lesson}
      voice={null}
      points={points}
      short={false}
      onLeave={onLeave}
    />
  )
  return { points, onLeave }
}

const next = (): void => {
  fireEvent.click(screen.getByRole("button", { name: /Next/ }))
}
const choose = (text: string): void => {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(text) }))
}
const slots = (): Array<string | null> =>
  Array.from(document.querySelectorAll("[data-slot^='drama-']"), (node) =>
    node.getAttribute("data-slot")
  )

describe("DramaLesson", () => {
  it("plays root, choice, consequence, repair and leaf, each scene in its feeling", () => {
    renderDrama()
    expect(slots()).toEqual(["drama-cover", "drama-narration"])
    expect(screen.getByText("숨 막히는 긴장감")).toBeTruthy()
    next()
    next()
    expect(slots().at(-1)).toBe("drama-choice")
    expect(screen.getByText("서연은 뭐라고 대답할까?")).toBeTruthy()

    // The consequence: the chosen line as Seo-yeon's, then the chill.
    choose("응, 마실래.")
    expect(slots()).toEqual(["drama-chosen", "drama-cover", "drama-line"])
    expect(screen.getByText("갑분싸")).toBeTruthy()
    next()
    next()
    choose("죄송합니다, 회장님.")
    // The repair settles into warmth, and the leaf ends on its panel.
    expect(screen.getByText("훈훈한 마무리")).toBeTruthy()
    next()
    expect(slots().at(-1)).toBe("drama-ending")
    expect(screen.getByRole("button", { name: /Play it again/ })).toBeTruthy()
  })

  it("never goes back across a choice", () => {
    renderDrama()
    const previous = (): HTMLButtonElement =>
      screen.getByRole("button", { name: "Previous beat" })
    expect(previous().disabled).toBe(true)
    next()
    expect(previous().disabled).toBe(false)
    next()
    choose("네, 감사합니다.")
    expect(previous().disabled).toBe(true)
    fireEvent.click(previous())
    expect(slots()).toEqual(["drama-chosen", "drama-cover", "drama-line"])
  })

  it("replays from the root on restart, keeping the first choices", () => {
    const { points } = renderDrama()
    next()
    next()
    choose("아니요, 안 앉아요.")
    next()
    next()
    fireEvent.click(screen.getByRole("button", { name: /Play it again/ }))
    expect(slots()).toEqual(["drama-cover", "drama-narration"])
    next()
    next()
    choose("네, 감사합니다.")
    expect(points.saved()).toMatchObject({ route: ["a"], first: { c1: "c" } })
  })

  it("climbs a line's ladder on a tap: Hangul, then its gloss", () => {
    renderDrama()
    next()
    fireEvent.click(screen.getByRole("button", { name: "Show English" }))
    expect(screen.getByText("Sit. Will you have some tea?")).toBeTruthy()
    expect(screen.getByText(/without looking up/)).toBeTruthy()
  })

  it("shows the choice's prompt in Korean, its English task one tap away, and no candidate's gloss", () => {
    renderDrama()
    next()
    next()
    expect(screen.queryByText(/Which reply fits/)).toBeNull()
    fireEvent.click(screen.getByText("서연은 뭐라고 대답할까?"))
    expect(screen.getByText(/Which reply fits/)).toBeTruthy()
    expect(screen.queryByText(/Polite -요/)).toBeNull()
  })
})

/** The resume point that opens `route` at its choice, or at its end. */
function pointAt(route: Route): unknown {
  const first: Record<string, string> = {}
  route.forEach((option, depth) => {
    const choice = sceneAt(lesson.root, route.slice(0, depth))?.choice
    if (choice) first[choice.id] = option
  })
  const scene = sceneAt(lesson.root, route)
  return {
    route,
    at: scene?.choice ? { kind: "choice" } : { kind: "end" },
    first,
  }
}

describe("MK6: no feeling anchor sits on a choice or a chosen line", () => {
  it.each(scenesOf(lesson.root).map(({ route, scene }) => [scene.id, route]))(
    "on the route to %s",
    (_, route) => {
      renderDrama(memoryPoints(pointAt(route)))
      const scene = sceneAt(lesson.root, route)!
      const unanchored = document.querySelectorAll(
        "[data-slot='drama-choice'], [data-slot='drama-chosen'], [role='group'][aria-label='Choose']"
      )
      expect(unanchored.length).toBe(
        (route.length > 0 ? 1 : 0) + (scene.choice ? 2 : 0)
      )
      for (const node of unanchored) {
        expect(node.closest(".feeling, .feeling-frame")).toBeNull()
        expect(node.querySelector(".feeling, .feeling-frame")).toBeNull()
        expect(node.querySelector("[data-slot='feeling-symbol']")).toBeNull()
      }
      // Everything else of the scene wears its feeling.
      const anchored = document.querySelectorAll(
        "[data-slot='drama-cover'], [data-slot='drama-line'], [data-slot='drama-narration'], [data-slot='drama-ending']"
      )
      expect(anchored.length).toBe(
        1 + scene.beats.length + (scene.choice ? 0 : 1)
      )
      for (const node of anchored) {
        expect(
          node.closest(".feeling-frame")?.getAttribute("data-feeling")
        ).toBe(scene.feeling)
      }
    }
  )
})
