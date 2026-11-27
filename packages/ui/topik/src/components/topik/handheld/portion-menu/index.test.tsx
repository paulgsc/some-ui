import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { PortionMenu } from "@topik/components/topik/handheld/portion-menu"
import type { ShopPort } from "@topik/lib/topik/shop/runtime"
import { SHOP_WORDS } from "@topik/lib/topik/shop/words"
import { afterEach, describe, expect, it } from "vitest"

afterEach(cleanup)

const PORT: ShopPort = {
  hear: () => Promise.resolve({ kind: "held" }),
  lookUp: () => Promise.resolve({ kind: "kept" }),
  keep: () => true,
}

const menu = (shop?: ShopPort): void => {
  render(
    <PortionMenu
      held={{ sets: [], scenes: [], dramas: [] }}
      tally={{}}
      now={new Date("2026-11-27T05:00:00Z")}
      initialOrder={{ portion: "bite", freshness: "either" }}
      onOrdered={() => undefined}
      onStart={() => undefined}
      {...(shop ? { shop } : {})}
    />
  )
}

describe("What are you hungry for?", () => {
  it("offers no hunch where the host gives no shop", () => {
    menu()
    expect(screen.queryByRole("button", { name: SHOP_WORDS.door })).toBeNull()
  })

  it("opens the shop on the hunch's door, and comes back to the menu", () => {
    menu(PORT)
    fireEvent.click(screen.getByRole("button", { name: SHOP_WORDS.door }))
    expect(screen.getByRole("heading", { name: SHOP_WORDS.title })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: SHOP_WORDS.back }))
    expect(screen.getByRole("button", { name: SHOP_WORDS.door })).toBeTruthy()
  })
})
