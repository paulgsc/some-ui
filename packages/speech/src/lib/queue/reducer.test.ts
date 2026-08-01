import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { SpeechAction } from "./actions"
import { speechReducer } from "./reducer"
import type { SpeechQueueState } from "./types"

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

function initialState(
  overrides: Partial<SpeechQueueState> = {}
): SpeechQueueState {
  return {
    items: [],
    currentItem: null,
    status: "idle",
    error: null,
    totalProcessed: 0,
    totalFailed: 0,
    ...overrides,
  }
}

function speak(componentId: string, priority: number): SpeechAction {
  return {
    type: "SPEAK",
    payload: { componentId, text: `text-${componentId}` },
    priority,
  }
}

function isNonIncreasing(priorities: Array<number>): boolean {
  return priorities.every((p, i) => i === 0 || priorities[i - 1]! >= p)
}

// ═══════════════════════════════════════════════════════════════════════════
// SPEAK - priority-ordered insertion
// ═══════════════════════════════════════════════════════════════════════════

describe("speechReducer - SPEAK priority ordering", () => {
  it("inserts an out-of-order priority sequence into descending order", () => {
    const priorities = [1, 5, 3, 2, 4]
    let state = initialState()
    priorities.forEach((p, i) => {
      state = speechReducer(state, speak(`c${i}`, p))
    })
    expect(state.items.map((i) => i.priority)).toEqual([5, 4, 3, 2, 1])
  })

  it("keeps equal-priority items in insertion order (stable ties)", () => {
    let state = initialState()
    state = speechReducer(state, speak("first", 3))
    state = speechReducer(state, speak("second", 3))
    expect(state.items.map((i) => i.componentId)).toEqual(["first", "second"])
  })

  it("property: SPEAK always yields a non-increasing priority order, for any insertion sequence", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -10, max: 10 }), {
          minLength: 1,
          maxLength: 20,
        }),
        (priorities) => {
          let state = initialState()
          priorities.forEach((priority, i) => {
            state = speechReducer(state, speak(`c${i}`, priority))
          })
          expect(isNonIncreasing(state.items.map((i) => i.priority))).toBe(true)
        }
      ),
      { numRuns: 200 }
    )
  })

  it("property: SPEAK loses nothing - every utterance queued is still queued", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -10, max: 10 }), {
          minLength: 1,
          maxLength: 20,
        }),
        (priorities) => {
          let state = initialState()
          priorities.forEach((priority, i) => {
            state = speechReducer(state, speak(`c${i}`, priority))
          })

          expect(state.items).toHaveLength(priorities.length)
          expect(new Set(state.items.map((item) => item.id)).size).toBe(
            priorities.length
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it("property: equal priorities keep their arrival order, whatever else is queued", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -5, max: 5 }), {
          minLength: 2,
          maxLength: 20,
        }),
        (priorities) => {
          let state = initialState()
          priorities.forEach((priority, i) => {
            state = speechReducer(state, speak(`c${i}`, priority))
          })

          // Within any one priority band, arrival order is the tie-break -
          // a queue that reorders equals speaks sentences out of sequence.
          for (const band of new Set(priorities)) {
            const arrivals = state.items
              .filter((item) => item.priority === band)
              .map((item) => Number(item.componentId.slice(1)))
            expect(arrivals).toEqual([...arrivals].sort((a, b) => a - b))
          }
        }
      ),
      { numRuns: 200 }
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// CANCEL - abort-on-cancel
// ═══════════════════════════════════════════════════════════════════════════

describe("speechReducer - CANCEL aborts controllers", () => {
  it("aborts and removes every queued item matching componentId", () => {
    let state = initialState()
    state = speechReducer(state, speak("a", 1))
    state = speechReducer(state, speak("b", 1))
    const itemA = state.items.find((i) => i.componentId === "a")!

    state = speechReducer(state, {
      type: "CANCEL",
      payload: { componentId: "a" },
    })

    expect(itemA.controller.signal.aborted).toBe(true)
    expect(state.items.map((i) => i.componentId)).toEqual(["b"])
  })

  it("aborts only the specific itemId when one is given", () => {
    let state = initialState()
    state = speechReducer(state, speak("a", 1))
    state = speechReducer(state, speak("a", 2))
    const [first, second] = state.items

    state = speechReducer(state, {
      type: "CANCEL",
      payload: { itemId: second!.id },
    })

    expect(second!.controller.signal.aborted).toBe(true)
    expect(first!.controller.signal.aborted).toBe(false)
    expect(state.items).toEqual([first])
  })

  it("aborts the in-flight current item when it matches, without clearing it", () => {
    let state = initialState()
    state = speechReducer(state, speak("a", 1))
    const item = state.items[0]!
    state = speechReducer(state, { type: "ITEM_STARTED", payload: { item } })

    state = speechReducer(state, {
      type: "CANCEL",
      payload: { componentId: "a" },
    })

    expect(item.controller.signal.aborted).toBe(true)
    // CANCEL only aborts the controller; ITEM_CANCELLED (dispatched
    // separately once the aborted speak() promise rejects) is what clears it.
    expect(state.currentItem).toBe(item)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PAUSE / RESUME - status transitions
// ═══════════════════════════════════════════════════════════════════════════

describe("speechReducer - pause/resume status transitions", () => {
  it("PAUSE aborts the current item and sets status to 'paused'", () => {
    let state = initialState()
    state = speechReducer(state, speak("a", 1))
    const item = state.items[0]!
    state = speechReducer(state, { type: "ITEM_STARTED", payload: { item } })

    state = speechReducer(state, { type: "PAUSE" })

    expect(item.controller.signal.aborted).toBe(true)
    expect(state.status).toBe("paused")
  })

  it("RESUME goes to 'speaking' when items remain queued", () => {
    let state = initialState()
    state = speechReducer(state, speak("a", 1))
    state = speechReducer(state, { type: "PAUSE" })

    state = speechReducer(state, { type: "RESUME" })

    expect(state.status).toBe("speaking")
    expect(state.error).toBeNull()
  })

  it("RESUME goes to 'idle' when the queue is empty and nothing is in flight", () => {
    let state = initialState()
    state = speechReducer(state, { type: "PAUSE" })

    state = speechReducer(state, { type: "RESUME" })

    expect(state.status).toBe("idle")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// CLEAR
// ═══════════════════════════════════════════════════════════════════════════

describe("speechReducer - CLEAR", () => {
  it("aborts every queued item and the current item, then resets to idle", () => {
    let state = initialState()
    state = speechReducer(state, speak("a", 1))
    state = speechReducer(state, speak("b", 1))
    const startedItem = state.items[0]!
    state = speechReducer(state, {
      type: "ITEM_STARTED",
      payload: { item: startedItem },
    })
    const queuedItem = state.items[0]!

    state = speechReducer(state, { type: "CLEAR" })

    expect(startedItem.controller.signal.aborted).toBe(true)
    expect(queuedItem.controller.signal.aborted).toBe(true)
    expect(state.items).toEqual([])
    expect(state.currentItem).toBeNull()
    expect(state.status).toBe("idle")
    expect(state.error).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ITEM_FAILED - retry logic
// ═══════════════════════════════════════════════════════════════════════════

describe("speechReducer - ITEM_FAILED retry logic", () => {
  it("re-queues at the front with an incremented retryCount and a fresh controller, when under maxRetries", () => {
    let state = initialState()
    state = speechReducer(state, speak("a", 1))
    const item = state.items[0]!
    state = speechReducer(state, { type: "ITEM_STARTED", payload: { item } })

    state = speechReducer(state, {
      type: "ITEM_FAILED",
      payload: { itemId: item.id, error: "boom", shouldRetry: true },
    })

    expect(state.currentItem).toBeNull()
    expect(state.items).toHaveLength(1)
    expect(state.items[0]!.retryCount).toBe(item.retryCount + 1)
    expect(state.items[0]!.controller).not.toBe(item.controller)
    expect(state.status).toBe("speaking")
  })

  it("gives up and records the failure once shouldRetry is false", () => {
    let state = initialState()
    state = speechReducer(state, speak("a", 1))
    const item = state.items[0]!
    state = speechReducer(state, { type: "ITEM_STARTED", payload: { item } })

    state = speechReducer(state, {
      type: "ITEM_FAILED",
      payload: { itemId: item.id, error: "boom", shouldRetry: false },
    })

    expect(state.currentItem).toBeNull()
    expect(state.totalFailed).toBe(1)
    expect(state.error).toBe("boom")
    expect(state.status).toBe("idle")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PAUSE - the status a settling item may not overwrite
// ═══════════════════════════════════════════════════════════════════════════

describe("speechReducer - paused survives whatever settles next", () => {
  const settlements: Array<[string, (itemId: string) => SpeechAction]> = [
    [
      "ITEM_COMPLETED",
      (itemId): SpeechAction => ({
        type: "ITEM_COMPLETED",
        payload: { itemId },
      }),
    ],
    [
      "ITEM_CANCELLED",
      (itemId): SpeechAction => ({
        type: "ITEM_CANCELLED",
        payload: { itemId },
      }),
    ],
    [
      "ITEM_FAILED (given up)",
      (itemId): SpeechAction => ({
        type: "ITEM_FAILED",
        payload: { itemId, error: "boom", shouldRetry: false },
      }),
    ],
    [
      "ITEM_FAILED (retrying)",
      (itemId): SpeechAction => ({
        type: "ITEM_FAILED",
        payload: { itemId, error: "boom", shouldRetry: true },
      }),
    ],
  ]

  const pausedWithQueue = (
    queueDepth: number
  ): { state: SpeechQueueState; itemId: string } => {
    let state = initialState()
    state = speechReducer(state, speak("a", 1))
    const item = state.items[0]!
    state = speechReducer(state, { type: "ITEM_STARTED", payload: { item } })
    for (let i = 0; i < queueDepth; i++) {
      state = speechReducer(state, speak(`queued-${i}`, 0))
    }
    return { state: speechReducer(state, { type: "PAUSE" }), itemId: item.id }
  }

  it.each(settlements)(
    "keeps status 'paused' when the in-flight item ends via %s",
    (_label, settle) => {
      for (const queueDepth of [0, 1, 3]) {
        const { state, itemId } = pausedWithQueue(queueDepth)

        // Only RESUME may lift a pause. Before this, PAUSE aborted the
        // current item and the resulting ITEM_CANCELLED promoted the queue
        // straight back to "speaking" - so a paused queue kept talking.
        expect(speechReducer(state, settle(itemId)).status).toBe("paused")
      }
    }
  )

  it("RESUME is the only way back out", () => {
    let state = initialState()
    state = speechReducer(state, speak("a", 1))
    state = speechReducer(state, { type: "PAUSE" })
    expect(state.status).toBe("paused")

    state = speechReducer(state, { type: "RESUME" })
    expect(state.status).toBe("speaking")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// CONSERVATION - nothing is silently lost or duplicated
// ═══════════════════════════════════════════════════════════════════════════

describe("speechReducer - conservation properties", () => {
  it("property: CANCEL by componentId removes and aborts exactly that component's items", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("a", "b", "c"), {
          minLength: 1,
          maxLength: 15,
        }),
        fc.constantFrom("a", "b", "c"),
        (componentIds, target) => {
          let state = initialState()
          componentIds.forEach((componentId) => {
            state = speechReducer(state, speak(componentId, 0))
          })
          const before = state.items

          state = speechReducer(state, {
            type: "CANCEL",
            payload: { componentId: target },
          })

          const removed = before.filter((item) => item.componentId === target)
          const kept = before.filter((item) => item.componentId !== target)

          expect(state.items).toEqual(kept)
          expect(removed.every((i) => i.controller.signal.aborted)).toBe(true)
          expect(kept.every((i) => !i.controller.signal.aborted)).toBe(true)
        }
      ),
      { numRuns: 150 }
    )
  })

  it("property: CLEAR always empties the queue and aborts everything it held", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -5, max: 5 }), { maxLength: 15 }),
        fc.boolean(),
        (priorities, withCurrent) => {
          let state = initialState()
          priorities.forEach((priority, i) => {
            state = speechReducer(state, speak(`c${i}`, priority))
          })

          let current = null
          if (withCurrent && state.items[0]) {
            current = state.items[0]
            state = speechReducer(state, {
              type: "ITEM_STARTED",
              payload: { item: current },
            })
          }
          const held = [...state.items, ...(current ? [current] : [])]

          state = speechReducer(state, { type: "CLEAR" })

          expect(state.items).toEqual([])
          expect(state.currentItem).toBeNull()
          expect(state.status).toBe("idle")
          expect(held.every((i) => i.controller.signal.aborted)).toBe(true)
        }
      ),
      { numRuns: 150 }
    )
  })

  it("property: ITEM_STARTED moves an item, it never copies it", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -5, max: 5 }), {
          minLength: 1,
          maxLength: 15,
        }),
        (priorities) => {
          let state = initialState()
          priorities.forEach((priority, i) => {
            state = speechReducer(state, speak(`c${i}`, priority))
          })

          const item = state.items[0]!
          state = speechReducer(state, {
            type: "ITEM_STARTED",
            payload: { item },
          })

          expect(state.currentItem).toBe(item)
          expect(state.items.some((i) => i.id === item.id)).toBe(false)
          expect(state.items).toHaveLength(priorities.length - 1)
        }
      ),
      { numRuns: 150 }
    )
  })
})
