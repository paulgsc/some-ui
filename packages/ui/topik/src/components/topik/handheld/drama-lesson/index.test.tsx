import type { Route } from "@some-ui/makjang"
import { sceneAt, scenesOf } from "@some-ui/makjang"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createPastedLessonStore } from "@topik/lib/topik/adapter/pasted-lesson"
import type { DramaPointStore } from "@topik/lib/topik/core/drama-runtime"
import { workedLesson } from "@topik/lib/topik/generation/tree-intake/worked-example"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DramaLesson } from "."
import { EXERCISE_FRAMING } from "./exercise-framing"

afterEach(cleanup)

const lesson = workedLesson()

/** The slot holding the lesson, opened at `point` when one is given. */
function slot(point?: unknown): DramaPointStore {
  const store = createPastedLessonStore(memoryStorage())
  store.setTree(lesson)
  if (point !== undefined) store.points.set(lesson.id, point)
  return store.points
}

const renderDrama = (points = slot()): void => {
  render(
    <DramaLesson
      lesson={lesson}
      voice={null}
      sound={null}
      points={points}
      short={false}
      onLeave={vi.fn()}
    />
  )
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
    // Then the author's notes, quoting each chosen line.
    expect(slots().slice(-2)).toEqual(["drama-ending", "drama-notes"])
    const notes = document.querySelector("[data-slot='drama-notes']")!
    expect(notes.textContent).toMatch(/작가의 말/)
    expect(notes.textContent).toMatch(/응, 마실래\./)
    expect(notes.textContent).toMatch(/죄송합니다, 회장님\./)
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
  })

  it("plays it again from the root, keeping the first choice in the slot", () => {
    const store = createPastedLessonStore(memoryStorage())
    store.setTree(lesson)
    renderDrama(store.points)
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
    expect(store.points.get(lesson.id)).toMatchObject({
      route: ["a"],
      first: { c1: "c" },
    })
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

/**
 * The resume point that opens `route` at `at`: by default its choice, or its
 * end.
 */
function pointAt(route: Route, at?: { kind: "beat"; id: string }): unknown {
  const first: Record<string, string> = {}
  route.forEach((option, depth) => {
    const choice = sceneAt(lesson.root, route.slice(0, depth))?.choice
    if (choice) first[choice.id] = option
  })
  const scene = sceneAt(lesson.root, route)
  return {
    route,
    at: at ?? (scene?.choice ? { kind: "choice" } : { kind: "end" }),
    first,
  }
}

describe("MK6: no feeling anchor sits on a choice or a chosen line", () => {
  it.each(scenesOf(lesson.root).map(({ route, scene }) => [scene.id, route]))(
    "on the route to %s",
    (_, route) => {
      renderDrama(slot(pointAt(route)))
      const scene = sceneAt(lesson.root, route)!
      const unanchored = document.querySelectorAll(
        "[data-slot='drama-choice'], [data-slot='drama-chosen'], [data-slot='drama-notes'], [role='group'][aria-label='Choose']"
      )
      expect(unanchored.length).toBe(
        (route.length > 0 ? 1 : 0) +
          (scene.choice ? 2 : 0) +
          (route.length > 0 && !scene.choice ? 1 : 0)
      )
      for (const node of unanchored) {
        expect(node.closest(".feeling, .feeling-panel")).toBeNull()
        expect(node.querySelector(".feeling, .feeling-panel")).toBeNull()
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
        expect(node.closest(".feeling")?.getAttribute("data-feeling")).toBe(
          scene.feeling
        )
      }
    }
  )
})

describe("no screen is framed as an exercise", () => {
  it.each(scenesOf(lesson.root).map(({ route, scene }) => [scene.id, route]))(
    "on the route to %s, at its first beat and at its choice or end",
    (_, route) => {
      const scene = sceneAt(lesson.root, route)!
      const opening = pointAt(route, {
        kind: "beat",
        id: scene.beats[0]?.id ?? "",
      })
      const landed = [
        route.length > 0 ? "drama-chosen" : "drama-cover",
        scene.choice ? "drama-choice" : "drama-notes",
      ]
      for (const [index, point] of [opening, pointAt(route)].entries()) {
        renderDrama(slot(point))
        // Opened where the point says, not at the root by fallback.
        expect(index === 0 ? slots()[0] : slots().at(-1)).toBe(landed[index])
        const labels = Array.from(
          document.querySelectorAll("[aria-label]"),
          (node) => node.getAttribute("aria-label") ?? ""
        )
        for (const text of [document.body.textContent, ...labels]) {
          expect(text).not.toMatch(EXERCISE_FRAMING)
        }
        cleanup()
      }
    }
  )
})
