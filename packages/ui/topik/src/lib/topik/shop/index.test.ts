import { addFailureSink } from "@some-ui/intent-kit"
import { lensTakes } from "@topik/lib/topik/adapter/lens-takes/__tests__/takes"
import { PHRASES } from "@topik/lib/topik/phrases/shelf"
import { MACHINERY } from "@topik/lib/topik/read-aloud/__tests__/machinery"
import {
  initialShop,
  lookupWords,
  step,
  type ShopEvent,
  type ShopState,
} from "@topik/lib/topik/shop"
import {
  createShopRuntime,
  type Heard,
  type ShopPort,
  type ShopRuntime,
} from "@topik/lib/topik/shop/runtime"
import { saidHow, SHOP_WORDS, shownParts } from "@topik/lib/topik/shop/words"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/** A spoken hunch, its take kept as note n1 under the name s-1. */
const SAID = { kind: "spoken", note: "n1", name: "s-1" } as const

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
      {
        kind: "look-up",
        seq: 1,
        hunch: 1,
        words: "where's my phone",
        name: null,
      },
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
      hunch: SAID,
    })
    expect(heard.effects).toEqual([
      { kind: "hear", seq: 1, hunch: 1, note: "n1", name: "s-1" },
    ])
    expect(
      step(heard.state, {
        kind: "heard",
        seq: 1,
        hunch: 1,
        name: "s-1",
        words: "it's okay",
      }).effects
    ).toEqual([
      { kind: "look-up", seq: 1, hunch: 1, words: "it's okay", name: "s-1" },
    ])
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
      name: null,
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
    const unanswered = {
      kind: "unanswered",
      seq: 1,
      hunch: 1,
      words: "it's okay",
      name: null,
    } as const
    expect(step(run([typed("it's okay")]), unanswered).effects).toEqual([
      { kind: "keep", hunch: 1, words: "it's okay", name: null },
    ])
    const unreached = run([typed("it's okay"), unanswered])
    expect(unreached.at).toEqual({
      kind: "unreached",
      hunch: { kind: "typed", text: "it's okay" },
      number: 1,
      kept: true,
      name: null,
    })
    expect(step(unreached, { kind: "retry" }).effects).toEqual([
      { kind: "look-up", seq: 2, hunch: 1, words: "it's okay", name: null },
    ])
  })

  it("after a take is heard and its lookup fails, sends its words, not the take", () => {
    const unreached = run([
      { kind: "hunch", hunch: SAID },
      { kind: "heard", seq: 1, hunch: 1, name: "s-1", words: "it's okay" },
      { kind: "unanswered", seq: 1, hunch: 1, words: "it's okay", name: "s-1" },
    ])
    expect(step(unreached, { kind: "retry" }).effects).toEqual([
      { kind: "look-up", seq: 2, hunch: 1, words: "it's okay", name: "s-1" },
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

  it("keeps a look-up home didn't answer however late, changing nothing", () => {
    const moved = run([typed("it's okay"), typed("did you eat")])
    const late = step(moved, {
      kind: "unanswered",
      seq: 1,
      hunch: 1,
      words: "it's okay",
      name: null,
    })
    expect(late.state).toBe(moved)
    expect(late.effects).toEqual([
      { kind: "keep", hunch: 1, words: "it's okay", name: null },
    ])
  })

  it("still looks up a hunch heard after the owner moved on, changing nothing", () => {
    const hit = { kind: "hit", phrases: ["ph.its-okay"] } as const
    const spoken = { kind: "hunch", hunch: SAID } as const
    for (const moved of [
      run([spoken, spoken]),
      run([spoken, typed("did you eat")]),
      run([spoken, { kind: "again" }]),
    ]) {
      const late = step(moved, {
        kind: "heard",
        seq: 1,
        hunch: 1,
        name: "s-1",
        words: "I need a plumber",
      })
      expect(late.state).toBe(moved)
      expect(late.effects).toEqual([
        {
          kind: "look-up",
          seq: 1,
          hunch: 1,
          words: "I need a plumber",
          name: "s-1",
        },
      ])
      expect(step(moved, { kind: "answered", seq: 1, lookup: hit }).state).toBe(
        moved
      )
      expect(step(moved, { kind: "unreached", seq: 1 }).state).toBe(moved)
    }
    const quiet = run([spoken, spoken])
    expect(
      step(quiet, { kind: "heard", seq: 1, hunch: 1, name: "s-1", words: " " })
        .effects
    ).toEqual([])
  })

  it("keeps the same state when a tap changes nothing", () => {
    expect(step(initialShop, { kind: "again" }).state).toBe(initialShop)
    expect(
      step(initialShop, { kind: "put-back", phrase: "ph.its-okay" }).state
    ).toBe(initialShop)
  })

  it("looks up a long hearing cut to what home takes, as home cuts it", () => {
    const heard = `  ${"word ".repeat(60)}`
    const sent = step(initialShop, {
      kind: "hunch",
      hunch: { kind: "spoken", note: "n1", name: "r-said-1" },
    }).state
    const next = step(sent, {
      kind: "heard",
      seq: sent.seq,
      hunch: 1,
      name: "r-said-1",
      words: heard,
    })
    const words = "word ".repeat(40).trimEnd()
    expect(words.length).toBe(199)
    expect(next.effects).toEqual([
      { kind: "look-up", seq: sent.seq, hunch: 1, words, name: "r-said-1" },
    ])
    expect(lookupWords("가".repeat(300))).toBe("가".repeat(200))
    expect(lookupWords("😀".repeat(201))).toBe("😀".repeat(200))
    expect(lookupWords("   ")).toBe("")
  })

  it("asks again when nothing was heard", () => {
    expect(
      run([
        { kind: "hunch", hunch: SAID },
        { kind: "heard", seq: 1, hunch: 1, name: "s-1", words: "  " },
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

  it("names a hunch to home the same way each time it is sent, and keeps one unanswered", async () => {
    const named: Array<string> = []
    const kept: Array<readonly [string, string]> = []
    let fail = true
    const port: ShopPort = {
      keep: (words, hunch) => {
        kept.push([words, hunch])
        return true
      },
      hear: () => Promise.resolve({ kind: "held" }),
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
    expect(kept).toEqual([["I need a plumber", "r-1"]])
    expect(shop.snapshot().at).toEqual({ kind: "kept", words: "another hunch" })
  })

  it("reports a port that throws before its promise, and says unreached", async () => {
    const ports: Array<string> = []
    const stop = addFailureSink((failure) => ports.push(failure.port))
    const port: ShopPort = {
      keep: () => true,
      hear: () => Promise.resolve({ kind: "held" }),
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

  it("keeps a look-up that fails after the screen is gone", async () => {
    const kept: Array<string> = []
    let fail: (error: Error) => void = () => undefined
    const port: ShopPort = {
      keep: (words, hunch) => {
        kept.push(`${hunch}:${words}`)
        return true
      },
      hear: () => Promise.resolve({ kind: "held" }),
      lookUp: () =>
        new Promise((_, reject) => {
          fail = reject
        }),
    }
    const shop = createShopRuntime(port, () => undefined, "r")
    shop.type("I need a plumber")
    await settle()
    shop.dispose()
    fail(new Error("offline"))
    await settle()
    expect(kept).toEqual(["r-1:I need a plumber"])
  })

  it("answers again once resumed after dispose, as a screen shown twice is", async () => {
    const port: ShopPort = {
      keep: () => true,
      hear: () => Promise.resolve({ kind: "held" }),
      lookUp: () => Promise.resolve({ kind: "kept" }),
    }
    const shop = createShopRuntime(port, () => undefined)
    shop.dispose()
    shop.resume()
    shop.type("I need a plumber")
    await settle()
    expect(shop.snapshot().at).toEqual({
      kind: "kept",
      words: "I need a plumber",
    })
  })

  it("says a hunch this phone couldn't keep wasn't kept", async () => {
    const port: ShopPort = {
      keep: () => false,
      hear: () => Promise.resolve({ kind: "held" }),
      lookUp: () => Promise.reject(new Error("offline")),
    }
    const shop = createShopRuntime(port, () => undefined)
    shop.type("I need a plumber")
    await settle()
    expect(shop.snapshot().at).toMatchObject({ kind: "unreached", kept: false })
  })

  it("changes nothing once disposed, and looks up again once resumed", async () => {
    const seen: Array<string> = []
    const asked: Array<string> = []
    const port: ShopPort = {
      keep: () => true,
      hear: () => Promise.resolve({ kind: "held" }),
      lookUp: (words, hunch) => {
        asked.push(`${hunch}:${words}`)
        return Promise.resolve({ kind: "kept" })
      },
    }
    const shop = createShopRuntime(
      port,
      (state) => seen.push(state.at.kind),
      "r"
    )
    shop.type("it's okay")
    shop.dispose()
    await settle()
    expect(seen).toEqual(["looking"])
    expect(shop.snapshot().at.kind).toBe("looking")
    shop.resume()
    await settle()
    expect(asked).toEqual(["r-1:it's okay", "r-1:it's okay"])
    expect(shop.snapshot().at).toEqual({ kind: "kept", words: "it's okay" })
  })
})

describe("a spoken hunch", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const pass = async (ms = 0): Promise<void> => {
    await vi.advanceTimersByTimeAsync(ms)
  }

  /** A take said for two seconds, then kept. */
  const say = async (shop: ShopRuntime): Promise<void> => {
    shop.record()
    await pass(2_000)
    shop.record()
    await pass()
  }

  it("records a take under its hunch's name, hears it, and looks its words up under the same name", async () => {
    const takes = lensTakes()
    const asked: Array<string> = []
    const port: ShopPort = {
      takes,
      keep: () => true,
      hear: (note, hunch) => {
        asked.push(`hear ${hunch}`)
        expect(takes.getSnapshot().takes.map((t) => t.id)).toContain(note)
        return Promise.resolve({ kind: "heard", words: "where's my phone" })
      },
      lookUp: (words, hunch) => {
        asked.push(`look ${hunch} ${words}`)
        return Promise.resolve({
          kind: "hit",
          phrases: ["ph.where-is-my-phone"],
        })
      },
    }
    const shop = createShopRuntime(port, () => undefined, "r")
    await say(shop)
    expect(takes.getSnapshot().takes.map((t) => t.answers)).toEqual([
      "r-said-1",
    ])
    expect(asked).toEqual(["hear r-said-1", "look r-said-1 where's my phone"])
    expect(shop.snapshot().at).toMatchObject({ kind: "found" })
    await say(shop)
    expect(takes.getSnapshot().takes.map((t) => t.answers)).toEqual([
      "r-said-1",
      "r-said-2",
    ])
  })

  it("says home has the take but hasn't heard it yet, and asks again on a retry", async () => {
    let heard: Heard = { kind: "held" }
    const port: ShopPort = {
      takes: lensTakes(),
      keep: () => true,
      hear: () => Promise.resolve(heard),
      lookUp: () => Promise.resolve({ kind: "kept" }),
    }
    const shop = createShopRuntime(port, () => undefined, "r")
    await say(shop)
    expect(shop.snapshot().at).toMatchObject({
      kind: "unheard",
      number: 1,
      going: false,
    })
    heard = { kind: "heard", words: "I need a plumber" }
    shop.tap({ kind: "retry" })
    await pass()
    expect(shop.snapshot().at).toEqual({
      kind: "kept",
      words: "I need a plumber",
    })
  })

  it("records the next take under a new name once one under way was kept as the screen went", async () => {
    const takes = lensTakes()
    const port: ShopPort = {
      takes,
      keep: () => true,
      hear: () => new Promise(() => undefined),
      lookUp: () => Promise.resolve({ kind: "kept" }),
    }
    const shop = createShopRuntime(port, () => undefined, "r")
    shop.record()
    await pass(2_000)
    shop.dispose()
    await pass()
    shop.resume()
    await say(shop)
    expect(takes.getSnapshot().takes.map((t) => t.answers)).toEqual([
      "r-said-1",
      "r-said-2",
    ])
  })

  it("records the next take under a new name once one still being kept as the screen went is kept", async () => {
    const takes = lensTakes()
    const port: ShopPort = {
      takes,
      keep: () => true,
      hear: () => new Promise(() => undefined),
      lookUp: () => Promise.resolve({ kind: "kept" }),
    }
    const shop = createShopRuntime(port, () => undefined, "r")
    shop.record()
    await pass(2_000)
    shop.record()
    expect(takes.pattern.getSnapshot().take.kind).toBe("keeping")
    shop.dispose()
    await pass()
    shop.resume()
    await say(shop)
    expect(takes.getSnapshot().takes.map((t) => t.answers)).toEqual([
      "r-said-1",
      "r-said-2",
    ])
  })

  it("asks again for a take's words heard across the screen going and coming back, saying nothing failed", async () => {
    const reported: Array<string> = []
    const stop = addFailureSink((failure) => reported.push(failure.port))
    const hears: Array<AbortSignal> = []
    const port: ShopPort = {
      takes: lensTakes(),
      keep: () => true,
      hear: (_note, _hunch, gone) => {
        hears.push(gone)
        return hears.length === 1
          ? new Promise((_, reject) => {
              gone.addEventListener("abort", () => reject(new Error("gone")))
            })
          : Promise.resolve({ kind: "heard", words: "I need a plumber" })
      },
      lookUp: () => Promise.resolve({ kind: "kept" }),
    }
    const shop = createShopRuntime(port, () => undefined, "r")
    await say(shop)
    shop.dispose()
    shop.resume()
    await pass()
    stop()
    expect(hears).toHaveLength(2)
    expect(reported).toEqual([])
    expect(shop.snapshot().at).toEqual({
      kind: "kept",
      words: "I need a plumber",
    })
  })

  it("drops a hear cut short by the screen going, though it answers after it came back", async () => {
    let first: (heard: Heard) => void = () => undefined
    let hears = 0
    const port: ShopPort = {
      takes: lensTakes(),
      keep: () => true,
      hear: () => {
        hears += 1
        return hears === 1
          ? new Promise((resolve) => {
              first = resolve
            })
          : Promise.resolve({ kind: "heard", words: "I need a plumber" })
      },
      lookUp: () => Promise.resolve({ kind: "kept" }),
    }
    const shop = createShopRuntime(port, () => undefined, "r")
    await say(shop)
    shop.dispose()
    shop.resume()
    await pass()
    first({ kind: "going" })
    await pass()
    expect(shop.snapshot().at).toEqual({
      kind: "kept",
      words: "I need a plumber",
    })
  })

  it("says a take still on its way to home is on its way", async () => {
    const port: ShopPort = {
      takes: lensTakes(),
      keep: () => true,
      hear: () => Promise.resolve({ kind: "going" }),
      lookUp: () => Promise.resolve({ kind: "kept" }),
    }
    const shop = createShopRuntime(port, () => undefined, "r")
    await say(shop)
    expect(shop.snapshot().at).toMatchObject({ kind: "unheard", going: true })
  })

  it("stops hearing once the screen is gone", async () => {
    const seen: { signal: AbortSignal | null } = { signal: null }
    const port: ShopPort = {
      takes: lensTakes(),
      keep: () => true,
      hear: (_note, _hunch, gone) => {
        seen.signal = gone
        return new Promise(() => undefined)
      },
      lookUp: () => Promise.resolve({ kind: "kept" }),
    }
    const shop = createShopRuntime(port, () => undefined, "r")
    await say(shop)
    expect(seen.signal?.aborted).toBe(false)
    shop.dispose()
    expect(seen.signal?.aborted).toBe(true)
  })

  it("keeps a spoken hunch's look-up home didn't answer under its own name", async () => {
    const kept: Array<string> = []
    const port: ShopPort = {
      takes: lensTakes(),
      keep: (words, hunch) => {
        kept.push(`${hunch}:${words}`)
        return true
      },
      hear: () => Promise.resolve({ kind: "heard", words: "I need a plumber" }),
      lookUp: () => Promise.reject(new Error("offline")),
    }
    const shop = createShopRuntime(port, () => undefined, "r")
    await say(shop)
    expect(kept).toEqual(["r-said-1:I need a plumber"])
    expect(shop.snapshot().at).toMatchObject({
      kind: "unreached",
      name: "r-said-1",
    })
  })

  it("says a hunch home couldn't hear for is kept, its take on this phone", async () => {
    const port: ShopPort = {
      takes: lensTakes(),
      keep: () => true,
      hear: () => Promise.reject(new Error("offline")),
      lookUp: () => Promise.resolve({ kind: "kept" }),
    }
    const shop = createShopRuntime(port, () => undefined, "r")
    await say(shop)
    expect(shop.snapshot().at).toEqual({
      kind: "unreached",
      hunch: { kind: "spoken", note: expect.any(String), name: "r-said-1" },
      number: 1,
      kept: true,
      name: "r-said-1",
    })
  })
})

describe("what the shop says", () => {
  const said = (value: unknown): Array<string> =>
    typeof value === "string"
      ? [value]
      : typeof value === "object" && value !== null
        ? Object.values(value).flatMap(said)
        : []

  it("says what is kept where, never the machinery", () => {
    const words = said(SHOP_WORDS).filter((w) => w !== "")
    expect(words.length).toBeGreaterThan(20)
    for (const word of words) expect(word).not.toMatch(MACHINERY)
  })

  it("shows a phrase's parts as written, each with what it is made from", () => {
    const phrase = PHRASES["ph.rained-so-stayed-home"]
    expect(shownParts(phrase)).toEqual([
      { written: "비가", from: "비", gloss: expect.any(String) },
      { written: "와서", from: "오다 + -아서/어서", gloss: expect.any(String) },
      { written: "집에", from: "집", gloss: expect.any(String) },
      {
        written: "있었어요",
        from: "있다 + -아요/어요, in the past",
        gloss: expect.any(String),
      },
    ])
    expect(saidHow(phrase)).toMatch(/^polite, to /)
  })
})
