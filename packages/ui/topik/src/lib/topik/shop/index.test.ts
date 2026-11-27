import { addFailureSink } from "@some-ui/intent-kit"
import { PHRASES } from "@topik/lib/topik/phrases/shelf"
import {
  initialShop,
  step,
  type ShopEvent,
  type ShopState,
} from "@topik/lib/topik/shop"
import { createShopRuntime, type ShopPort } from "@topik/lib/topik/shop/runtime"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const run = (
  events: ReadonlyArray<ShopEvent>,
  from: ShopState = initialShop
): ShopState => events.reduce((state, event) => step(state, event).state, from)

const typed = (text: string): ShopEvent => ({
  kind: "hunch",
  hunch: { kind: "typed", text },
})

describe("the shop", () => {
  it("looks up a typed hunch, and shows what home found", () => {
    const sent = step(initialShop, typed(" where's my phone "))
    expect(sent.effects).toEqual([
      { kind: "look-up", seq: 1, hunch: 1, words: "where's my phone" },
    ])
    const found = run(
      [
        {
          kind: "answered",
          seq: 1,
          lookup: { kind: "hit", phrases: ["ph.where-is-my-phone"] },
        },
      ],
      sent.state
    )
    expect(found.at).toEqual({
      kind: "found",
      words: "where's my phone",
      phrases: ["ph.where-is-my-phone"],
    })
    expect(PHRASES["ph.where-is-my-phone"].intents).toContain(
      "where's my phone"
    )
  })

  it("hears a spoken hunch first, then looks up its words", () => {
    const heard = step(initialShop, {
      kind: "hunch",
      hunch: { kind: "spoken" },
    })
    expect(heard.effects).toEqual([{ kind: "hear", seq: 1, hunch: 1 }])
    expect(
      step(heard.state, { kind: "heard", seq: 1, hunch: 1, words: "it's okay" })
        .effects
    ).toEqual([{ kind: "look-up", seq: 1, hunch: 1, words: "it's okay" }])
  })

  it("says a miss was kept on home", () => {
    expect(
      run([
        typed("I need a plumber"),
        { kind: "answered", seq: 1, lookup: { kind: "kept" } },
      ]).at
    ).toEqual({
      kind: "kept",
      words: "I need a plumber",
    })
  })

  it("changes nothing on an answer to an earlier hunch", () => {
    const state = run([
      typed("it's okay"),
      typed("did you eat"),
      {
        kind: "answered",
        seq: 1,
        lookup: { kind: "hit", phrases: ["ph.its-okay"] },
      },
    ])
    expect(state.at).toEqual({
      kind: "looking",
      words: "did you eat",
      number: 2,
    })
  })

  it("leaves out phrases this build doesn't hold", () => {
    const hit = (phrases: Array<string>): ShopEvent => ({
      kind: "answered",
      seq: 1,
      lookup: { kind: "hit", phrases },
    })
    expect(
      run([typed("x"), hit(["ph.not-here", "ph.its-okay", "ph.its-okay"])]).at
    ).toEqual({
      kind: "found",
      words: "x",
      phrases: ["ph.its-okay"],
    })
    expect(run([typed("x"), hit(["ph.not-here"])]).at).toEqual({
      kind: "unknown",
      words: "x",
    })
  })

  it("sends an unreached hunch again as the same hunch, under a new request", () => {
    const unreached = run([typed("it's okay"), { kind: "unreached", seq: 1 }])
    expect(unreached.at).toEqual({
      kind: "unreached",
      hunch: { kind: "typed", text: "it's okay" },
      number: 1,
    })
    expect(step(unreached, { kind: "retry" }).effects).toEqual([
      { kind: "look-up", seq: 2, hunch: 1, words: "it's okay" },
    ])
  })

  it("after a take is heard and its lookup fails, sends its words, not the take", () => {
    const unreached = run([
      { kind: "hunch", hunch: { kind: "spoken" } },
      { kind: "heard", seq: 1, hunch: 1, words: "it's okay" },
      { kind: "unreached", seq: 1 },
    ])
    expect(step(unreached, { kind: "retry" }).effects).toEqual([
      { kind: "look-up", seq: 2, hunch: 1, words: "it's okay" },
    ])
  })

  it("changes nothing on a late answer once the owner moved on", () => {
    const hit = { kind: "hit", phrases: ["ph.its-okay"] } as const
    const asking = run([typed("it's okay"), { kind: "again" }])
    expect(step(asking, { kind: "answered", seq: 1, lookup: hit }).state).toBe(
      asking
    )
    const found = run([
      typed("it's okay"),
      { kind: "answered", seq: 1, lookup: hit },
    ])
    expect(step(found, { kind: "unreached", seq: 1 }).state).toBe(found)
  })

  it("still looks up a hunch heard after the owner moved on, changing nothing", () => {
    const hit = { kind: "hit", phrases: ["ph.its-okay"] } as const
    const spoken = { kind: "hunch", hunch: { kind: "spoken" } } as const
    for (const moved of [
      run([spoken, spoken]),
      run([spoken, typed("did you eat")]),
      run([spoken, { kind: "again" }]),
    ]) {
      const late = step(moved, {
        kind: "heard",
        seq: 1,
        hunch: 1,
        words: "I need a plumber",
      })
      expect(late.state).toBe(moved)
      expect(late.effects).toEqual([
        { kind: "look-up", seq: 1, hunch: 1, words: "I need a plumber" },
      ])
      expect(step(moved, { kind: "answered", seq: 1, lookup: hit }).state).toBe(
        moved
      )
      expect(step(moved, { kind: "unreached", seq: 1 }).state).toBe(moved)
    }
    const quiet = run([spoken, spoken])
    expect(
      step(quiet, { kind: "heard", seq: 1, hunch: 1, words: " " }).effects
    ).toEqual([])
  })

  it("keeps the same state when a tap changes nothing", () => {
    expect(step(initialShop, { kind: "again" }).state).toBe(initialShop)
    expect(
      step(initialShop, { kind: "put-back", phrase: "ph.its-okay" }).state
    ).toBe(initialShop)
  })

  it("asks again when nothing was heard", () => {
    expect(
      run([
        { kind: "hunch", hunch: { kind: "spoken" } },
        { kind: "heard", seq: 1, hunch: 1, words: "  " },
      ]).at
    ).toEqual({
      kind: "asking",
    })
  })

  it("fills a basket with what was found, once each", () => {
    const found = run([
      typed("x"),
      {
        kind: "answered",
        seq: 1,
        lookup: { kind: "hit", phrases: ["ph.its-okay", "ph.did-you-eat"] },
      },
    ])
    const picked = run(
      [
        { kind: "pick", phrase: "ph.its-okay" },
        { kind: "pick", phrase: "ph.its-okay" },
        { kind: "pick", phrase: "ph.where-is-my-phone" },
        { kind: "again" },
      ],
      found
    )
    expect(picked.basket).toEqual(["ph.its-okay"])
    expect(picked.at).toEqual({ kind: "asking" })
    expect(
      run([{ kind: "put-back", phrase: "ph.its-okay" }], picked).basket
    ).toEqual([])
  })
})

describe("the shop's runtime", () => {
  // A failed request is reported (reportFailure), which writes to the console.
  beforeEach(() => {
    vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const settle = (): Promise<unknown> =>
    new Promise((resolve) => setTimeout(resolve, 0))

  it("hears a take, looks up its words, and shows the phrases", async () => {
    const port: ShopPort = {
      hear: () => Promise.resolve("where's my phone"),
      lookUp: (words) =>
        Promise.resolve(
          words === "where's my phone"
            ? { kind: "hit", phrases: ["ph.where-is-my-phone"] }
            : { kind: "kept" }
        ),
    }
    const seen: Array<string> = []
    const shop = createShopRuntime(port, (state) => seen.push(state.at.kind))
    shop.speak(new Blob(["take"]))
    await settle()
    expect(shop.snapshot().at).toEqual({
      kind: "found",
      words: "where's my phone",
      phrases: ["ph.where-is-my-phone"],
    })
    expect(seen).toEqual(["hearing", "looking", "found"])
  })

  it("says a hunch may not be kept when home can't be reached, and sends the take again", async () => {
    const heard: Array<Blob> = []
    const port: ShopPort = {
      hear: (take) => {
        heard.push(take)
        return heard.length === 1
          ? Promise.reject(new Error("offline"))
          : Promise.resolve("it's okay")
      },
      lookUp: () => Promise.resolve({ kind: "hit", phrases: ["ph.its-okay"] }),
    }
    const shop = createShopRuntime(port, () => undefined)
    const take = new Blob(["take"])
    shop.speak(take)
    await settle()
    expect(shop.snapshot().at).toEqual({
      kind: "unreached",
      hunch: { kind: "spoken" },
      number: 1,
    })
    shop.tap({ kind: "retry" })
    await settle()
    expect(shop.snapshot().at).toMatchObject({
      kind: "found",
      phrases: ["ph.its-okay"],
    })
    expect(heard).toEqual([take, take])
  })

  it("names a hunch to home the same way each time it is sent", async () => {
    const named: Array<string> = []
    let fail = true
    const port: ShopPort = {
      hear: () => Promise.resolve(""),
      lookUp: (_, hunch) => {
        named.push(hunch)
        if (fail) {
          fail = false
          return Promise.reject(new Error("reply lost"))
        }
        return Promise.resolve({ kind: "kept" })
      },
    }
    const shop = createShopRuntime(port, () => undefined, "r")
    shop.type("I need a plumber")
    await settle()
    shop.tap({ kind: "retry" })
    await settle()
    shop.type("another hunch")
    await settle()
    expect(named).toEqual(["r-1", "r-1", "r-2"])
    expect(shop.snapshot().at).toEqual({ kind: "kept", words: "another hunch" })
  })

  it("reports a port that throws before its promise, and says unreached", async () => {
    const ports: Array<string> = []
    const stop = addFailureSink((failure) => ports.push(failure.port))
    const port: ShopPort = {
      hear: () => Promise.resolve(""),
      lookUp: () => {
        throw new Error("no adapter")
      },
    }
    const shop = createShopRuntime(port, () => undefined)
    shop.type("it's okay")
    await settle()
    stop()
    expect(shop.snapshot().at).toMatchObject({ kind: "unreached", number: 1 })
    expect(ports).toEqual(["topik shop (look-up)"])
  })

  it("changes nothing once disposed", async () => {
    const seen: Array<string> = []
    const port: ShopPort = {
      hear: () => Promise.resolve("it's okay"),
      lookUp: () => Promise.resolve({ kind: "kept" }),
    }
    const shop = createShopRuntime(port, (state) => seen.push(state.at.kind))
    shop.type("it's okay")
    shop.dispose()
    shop.speak(new Blob(["late take"]))
    await settle()
    expect(seen).toEqual(["looking"])
    expect(shop.snapshot().at.kind).toBe("looking")
  })
})
