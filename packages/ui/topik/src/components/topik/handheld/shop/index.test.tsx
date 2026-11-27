import { StrictMode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShopScreen } from "@topik/components/topik/handheld/shop"
import type { ShopPort } from "@topik/lib/topik/shop/runtime"
import { SHOP_WORDS } from "@topik/lib/topik/shop/words"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const type = (words: string): void => {
  fireEvent.change(screen.getByRole("textbox", { name: SHOP_WORDS.field }), {
    target: { value: words },
  })
  fireEvent.click(screen.getByRole("button", { name: SHOP_WORDS.find }))
}

describe("the shop", () => {
  it("shows the phrases a hunch finds, with their parts, and keeps a basket", async () => {
    const port: ShopPort = {
      hear: () => Promise.reject(new Error("not offered")),
      lookUp: () =>
        Promise.resolve({ kind: "hit", phrases: ["ph.where-is-my-phone"] }),
      keep: () => true,
    }
    render(<ShopScreen port={port} onBack={() => undefined} />)
    type("where's my phone")
    expect(await screen.findByText(SHOP_WORDS.found)).toBeTruthy()
    expect(screen.getByText("내 폰 어디 있지?")).toBeTruthy()
    expect(screen.getByText(SHOP_WORDS.builtFrom)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: SHOP_WORDS.pick }))
    expect(screen.getByText(SHOP_WORDS.basket)).toBeTruthy()
    expect(
      screen.getByRole("button", { name: SHOP_WORDS.putBack })
    ).toBeTruthy()
  })

  it("says a hunch home didn't answer is kept on this phone, and offers to try again", async () => {
    vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined)
    const kept: Array<string> = []
    const port: ShopPort = {
      hear: () => Promise.reject(new Error("not offered")),
      lookUp: () => Promise.reject(new Error("offline")),
      keep: (words) => {
        kept.push(words)
        return true
      },
    }
    render(<ShopScreen port={port} onBack={() => undefined} />)
    type("I need a plumber")
    expect(await screen.findByText(SHOP_WORDS.unreached)).toBeTruthy()
    expect(kept).toEqual(["I need a plumber"])
    expect(screen.getByRole("button", { name: SHOP_WORDS.retry })).toBeTruthy()
  })

  it("answers under StrictMode, which shows the screen twice", async () => {
    const port: ShopPort = {
      hear: () => Promise.reject(new Error("not offered")),
      lookUp: () => Promise.resolve({ kind: "kept" }),
      keep: () => true,
    }
    render(
      <StrictMode>
        <ShopScreen port={port} onBack={() => undefined} />
      </StrictMode>
    )
    type("I need a plumber")
    expect(await screen.findByText(SHOP_WORDS.kept)).toBeTruthy()
  })

  it("says a miss was kept on home", async () => {
    const port: ShopPort = {
      hear: () => Promise.reject(new Error("not offered")),
      lookUp: () => Promise.resolve({ kind: "kept" }),
      keep: () => true,
    }
    render(<ShopScreen port={port} onBack={() => undefined} />)
    type("I need a plumber")
    expect(await screen.findByText(SHOP_WORDS.kept)).toBeTruthy()
  })
})
