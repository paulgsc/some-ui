/** A pull's check of a screen that reads home (HERD2, `../refresh`). */
import { checkAgainOf } from "@soundbites/lib/refresh"
import { describe, expect, it } from "vitest"

type Screen = { seq: number; read: { kind: string } }

/** A screen whose `readAgain` starts read `seq + 1`, answered when the test says. */
function screen(): {
  readonly view: Parameters<typeof checkAgainOf>[0]
  readonly answer: (kind: string) => void
  readonly asked: () => number
} {
  let state: Screen = { seq: 0, read: { kind: "read" } }
  let asked = 0
  const listeners = new Set<() => void>()
  const set = (next: Screen): void => {
    state = next
    for (const listener of listeners) listener()
  }
  return {
    view: {
      getSnapshot: () => state,
      subscribe: (listener): (() => void) => {
        listeners.add(listener)
        return (): void => {
          listeners.delete(listener)
        }
      },
      readAgain: (): void => {
        asked += 1
        set({ seq: state.seq + 1, read: { kind: "reading" } })
      },
    },
    answer: (kind) => set({ ...state, read: { kind } }),
    asked: () => asked,
  }
}

describe("a pull's check of a screen (HERD2)", () => {
  it("asks the read again and resolves once it lands", async () => {
    const page = screen()
    const checked = checkAgainOf(page.view)()
    expect(page.asked()).toBe(1)
    page.answer("read")
    await expect(checked).resolves.toBeUndefined()
  })

  it("rejects when the read found home away, or an answer it could not read (home busy among them)", async () => {
    for (const kind of ["away", "unreadable"]) {
      const page = screen()
      const checked = checkAgainOf(page.view)()
      page.answer(kind)
      await expect(checked).rejects.toThrow(kind)
    }
  })

  it("resolves on an answer that is not a failure to check: unpaired, or an older home", async () => {
    for (const kind of ["unpaired", "older"]) {
      const page = screen()
      const checked = checkAgainOf(page.view)()
      page.answer(kind)
      await expect(checked).resolves.toBeUndefined()
    }
  })

  it("resolves once a newer read replaced it: that one answers for itself", async () => {
    const page = screen()
    const checked = checkAgainOf(page.view)()
    page.view.readAgain()
    await expect(checked).resolves.toBeUndefined()
  })
})
