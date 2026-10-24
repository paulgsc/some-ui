import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { createPortionOrderStore } from "@topik/lib/topik/adapter/portion-order"
import { describe, expect, it } from "vitest"

describe("the last order", () => {
  it("is none until one is asked for, then the latest", () => {
    const store = createPortionOrderStore(memoryStorage())
    expect(store.last()).toBeNull()
    store.save({ portion: "snack", freshness: "seen" })
    store.save({ portion: "meal", freshness: "new" })
    expect(store.last()).toEqual({ portion: "meal", freshness: "new" })
  })
})
