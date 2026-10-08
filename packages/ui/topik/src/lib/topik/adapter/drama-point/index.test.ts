import { memoryStorage as memory } from "@some-ui/vite-config/vitest/memory-storage"
import {
  createDramaPointStore,
  DRAMA_POINT_KEY,
} from "@topik/lib/topik/adapter/drama-point"
import { describe, expect, it } from "vitest"

describe("createDramaPointStore", () => {
  it("keeps one lesson's place, and gives it back only for that lesson", () => {
    const store = createDramaPointStore(memory())
    store.set("first-tea", { route: ["b"] })
    expect(store.get("first-tea")).toEqual({ route: ["b"] })
    expect(store.get("another")).toBeUndefined()
    store.clear()
    expect(store.get("first-tea")).toBeUndefined()
  })

  it("is silent about storage that is unreadable, refuses or is absent", () => {
    const garbled = memory()
    garbled.setItem(DRAMA_POINT_KEY, "{not json")
    expect(createDramaPointStore(garbled).get("first-tea")).toBeUndefined()

    const refusing = {
      getItem: (): string | null => null,
      setItem: (): void => {
        throw new Error("quota")
      },
    }
    expect(() =>
      createDramaPointStore(refusing).set("first-tea", {})
    ).not.toThrow()
    expect(createDramaPointStore(null).get("first-tea")).toBeUndefined()
  })
})
