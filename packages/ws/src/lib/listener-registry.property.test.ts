import fc from "fast-check"
import { describe, expect, it, vi } from "vitest"

import { ListenerRegistry } from "./listener-registry"

type Op =
  | { kind: "add"; id: number }
  | { kind: "remove"; id: number }
  | { kind: "clear" }

const opArbitrary: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant("add" as const),
    id: fc.integer({ min: 0, max: 9 }),
  }),
  fc.record({
    kind: fc.constant("remove" as const),
    id: fc.integer({ min: 0, max: 9 }),
  }),
  fc.record({ kind: fc.constant("clear" as const) })
)

describe("ListenerRegistry - size/isEmpty track the live listener set under any op sequence", () => {
  it("agrees with an independent model set across random add/remove/clear sequences", () => {
    fc.assert(
      fc.property(
        fc.array(opArbitrary, { minLength: 0, maxLength: 50 }),
        (ops) => {
          const registry = new ListenerRegistry<void>()
          // 10 distinct listener references, indexed by id - Set dedup is by
          // reference, so re-adding the same id must be a no-op on size.
          const listeners = Array.from({ length: 10 }, () => vi.fn())
          const model = new Set<number>()

          for (const op of ops) {
            if (op.kind === "add") {
              registry.add(listeners[op.id]!)
              model.add(op.id)
            } else if (op.kind === "remove") {
              registry.remove(listeners[op.id]!)
              model.delete(op.id)
            } else {
              registry.clear()
              model.clear()
            }

            expect(registry.size).toBe(model.size)
            expect(registry.isEmpty()).toBe(model.size === 0)
          }
        }
      )
    )
  })
})

describe("ListenerRegistry - notify calls every currently-registered listener exactly once", () => {
  it("invokes each live listener with the given payload, and none of the removed ones", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 19 }), { maxLength: 10 }),
        fc.uniqueArray(fc.integer({ min: 0, max: 19 }), { maxLength: 10 }),
        fc.string(),
        (addedIds, removedIds, payload) => {
          const registry = new ListenerRegistry<string>()
          const listeners = new Map<
            number,
            ReturnType<typeof vi.fn<(data: string) => void>>
          >()

          for (const id of addedIds) {
            const fn = vi.fn<(data: string) => void>()
            listeners.set(id, fn)
            registry.add(fn)
          }
          for (const id of removedIds) {
            const fn = listeners.get(id)
            if (fn) registry.remove(fn)
          }

          registry.notify(payload)

          const stillRegistered = new Set(
            addedIds.filter((id) => !removedIds.includes(id))
          )
          for (const [id, fn] of listeners) {
            if (stillRegistered.has(id)) {
              expect(fn).toHaveBeenCalledExactlyOnceWith(payload)
            } else {
              expect(fn).not.toHaveBeenCalled()
            }
          }
        }
      )
    )
  })
})

describe("ListenerRegistry - regression: a throwing listener does not block the others", () => {
  it("still notifies every other listener when one listener throws", () => {
    const registry = new ListenerRegistry<number>()
    const before = vi.fn()
    const throwing = vi.fn(() => {
      throw new Error("boom")
    })
    const after = vi.fn()

    registry.add(before)
    registry.add(throwing)
    registry.add(after)

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => registry.notify(42)).not.toThrow()
    consoleSpy.mockRestore()

    expect(before).toHaveBeenCalledExactlyOnceWith(42)
    expect(throwing).toHaveBeenCalledExactlyOnceWith(42)
    expect(after).toHaveBeenCalledExactlyOnceWith(42)
  })
})

describe("ListenerRegistry - regression: re-adding the same reference is a no-op on size", () => {
  it("does not double-count or double-notify a listener added twice", () => {
    const registry = new ListenerRegistry<void>()
    const fn = vi.fn()

    registry.add(fn)
    registry.add(fn)
    expect(registry.size).toBe(1)

    registry.notify()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
