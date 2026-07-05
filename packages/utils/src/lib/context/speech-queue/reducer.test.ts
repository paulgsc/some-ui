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

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
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
    const random = mulberry32(7)
    for (let trial = 0; trial < 50; trial++) {
      let state = initialState()
      const count = 1 + Math.floor(random() * 10)
      for (let i = 0; i < count; i++) {
        const priority = Math.floor(random() * 20) - 10
        state = speechReducer(state, speak(`c${i}`, priority))
      }
      expect(isNonIncreasing(state.items.map((i) => i.priority))).toBe(true)
    }
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
