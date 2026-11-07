// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useShelf } from "."

describe("useShelf", () => {
  it("shows the items while mounted, again when they change, and nothing once unmounted", () => {
    const shown: Array<string> = []
    const visit = {
      show: (shelf: string, items: ReadonlyArray<string> | null): void => {
        shown.push(`${shelf} ${items === null ? "-" : items.join(",")}`)
      },
    }
    const { rerender, unmount } = renderHook(
      ({ items }: { items: ReadonlyArray<string> | null }) => {
        useShelf(visit, "list", items)
      },
      { initialProps: { items: ["a"] } }
    )
    rerender({ items: ["a", "b"] })
    unmount()
    expect(shown).toEqual(["list a", "list -", "list a,b", "list -"])
  })
})
