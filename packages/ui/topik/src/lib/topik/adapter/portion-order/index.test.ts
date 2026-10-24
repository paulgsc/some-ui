import { createPortionOrderStore } from "@topik/lib/topik/adapter/portion-order"
import { describe, expect, it } from "vitest"

const memory = (): Pick<Storage, "getItem" | "setItem"> => {
  const kept = new Map<string, string>()
  return {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
  }
}

describe("the last order", () => {
  it("is none until one is asked for, then the latest", () => {
    const store = createPortionOrderStore(memory())
    expect(store.last()).toBeNull()
    store.save({ portion: "snack", freshness: "seen" })
    store.save({ portion: "meal", freshness: "new" })
    expect(store.last()).toEqual({ portion: "meal", freshness: "new" })
  })

  it("is none when what is kept is not an order this build knows", () => {
    const storage = memory()
    storage.setItem(
      "topik:portion-order",
      JSON.stringify({ version: 1, portion: "feast", freshness: "new" })
    )
    expect(createPortionOrderStore(storage).last()).toBeNull()
    expect(createPortionOrderStore(null).last()).toBeNull()
  })
})
