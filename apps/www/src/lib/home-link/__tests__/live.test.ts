/**
 * The game day's live feed over a fake socket and a hand-turned clock
 * (LA16): it opens only paired, in front and watched; pulls on opening;
 * drops the offer the moment home is gone; ignores a stale answer; tries
 * again away and stops on `update` and `unpaired`.
 */
import type {
  Feed,
  FeedChoice,
  FeedPort,
  HomeMessage,
} from "@some-ui/game-week"
import { describe, expect, it } from "vitest"

import type { LivePorts, LiveWire } from "@/lib/home-link/live"
import { liveFeed, PING_MS, QUIET_MS } from "@/lib/home-link/live"
import type { LiveSocketEvents } from "@/lib/home-link/live-socket"

/**
 * The messages as plain JSON of what each one reads as: the recorder's own
 * reader is `@some-ui/game-week`'s, tested there against home's examples,
 * and stubbed out of this build profile.
 */
const SAID = new Map<string, HomeMessage>()

/** What home sends, as a frame the fake wire reads back as `message`. */
function fromHome(message: HomeMessage): string {
  const text = JSON.stringify(message)
  SAID.set(text, message)
  return text
}

const WIRE: LiveWire = {
  read: (text) => SAID.get(text) ?? { kind: "unreadable" },
  hello: (choice, lastSeq, utcOffsetMinutes) =>
    JSON.stringify({ type: "hello", ...choice, lastSeq, utcOffsetMinutes }),
  ping: (phoneAt) => JSON.stringify({ type: "ping", phoneAt }),
}

const GAMES = [
  {
    id: "401873010",
    label: "NE at CHI",
    want: "",
    kickoff: "2026-10-23T00:15:00Z",
  },
  {
    id: "401873023",
    label: "SEA at SF",
    want: "SF win",
    kickoff: "2026-10-26T20:25:00Z",
  },
]

type Socket = {
  url: string
  token: string
  on: LiveSocketEvents
  sent: Array<unknown>
  closed: boolean
}

const CHOICE: FeedChoice = {
  mode: "standard",
  gameId: "401873010",
  watching: { "401873010": true },
}

function offerText(seq: number, following = true): string {
  const message: HomeMessage = {
    kind: "offer",
    seq,
    following,
    games: GAMES,
    offer: {
      seq,
      gameId: "401873010",
      strip: "8:42 left in the 3rd",
      cards: [],
      justHappened: [],
    },
  }
  return fromHome(message)
}

type Harness = {
  ports: LivePorts
  sockets: Array<Socket>
  state: { paired: boolean; pairingId: string | null }
  advance: (ms: number) => Promise<void>
  hide: (hidden: boolean) => void
  relink: () => void
  setNow: (to: number) => void
}

type Watched = {
  feed: FeedPort
  unwatch: () => void
  last: () => Feed
}

function harness(paired = true): Harness {
  let now = 1_000_000
  const timers: Array<{ at: number; run: () => void; live: boolean }> = []
  const sockets: Array<Socket> = []
  const linkListeners = new Set<() => void>()
  let visibility: ((hidden: boolean) => void) | null = null
  const store = new Map<string, string>()
  const state: Harness["state"] = { paired, pairingId: paired ? "p1" : null }
  const ports: LivePorts = {
    wire: WIRE,
    pairing: () =>
      Promise.resolve(
        state.paired
          ? { base: "https://home.example/api/v1", token: "tok" }
          : null
      ),
    onLink: (listener) => {
      linkListeners.add(listener)
      return () => linkListeners.delete(listener)
    },
    pairingId: () => state.pairingId,
    open: (url, token, on) => {
      const socket: Socket = { url, token, on, sent: [], closed: false }
      sockets.push(socket)
      return {
        send: (text): void => {
          const message: unknown = JSON.parse(text)
          socket.sent.push(message)
        },
        close: (): void => {
          socket.closed = true
        },
      }
    },
    now: () => now,
    utcOffsetMinutes: () => -420,
    after: (ms, run) => {
      const timer = { at: now + ms, run, live: true }
      timers.push(timer)
      return () => {
        timer.live = false
      }
    },
    onVisibility: (listener) => {
      visibility = listener
      listener(false)
      return () => {
        visibility = null
      }
    },
    storage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    },
  }
  const advance = async (ms: number): Promise<void> => {
    const until = now + ms
    for (;;) {
      const next = timers
        .filter((t) => t.live && t.at <= until)
        .sort((a, b) => a.at - b.at)
        .shift()
      if (next === undefined) break
      now = next.at
      next.live = false
      next.run()
      await Promise.resolve()
    }
    now = until
    await Promise.resolve()
  }
  return {
    ports,
    sockets,
    state,
    advance,
    hide: (hidden): void => visibility?.(hidden),
    relink: (): void => {
      for (const listener of linkListeners) listener()
    },
    setNow: (to): void => {
      now = to
    },
  }
}

async function watched(h: Harness): Promise<Watched> {
  const feed = liveFeed(h.ports)
  const seen: Array<Feed> = []
  const unwatch = feed.watch((each) => seen.push(each))
  feed.choose(CHOICE)
  await Promise.resolve()
  await Promise.resolve()
  return { feed, unwatch, last: () => seen[seen.length - 1] }
}

describe("liveFeed", () => {
  it("opens over wss with the token offered, pulls at once and checks the clocks", async () => {
    const h = harness()
    const { last } = await watched(h)
    expect(last().link).toBe("asking")
    const socket = h.sockets[0]
    expect([socket.url, socket.token]).toEqual([
      "wss://home.example/ws/game-week",
      "tok",
    ])
    socket.on.opened()
    expect(socket.sent).toEqual([
      {
        type: "hello",
        lastSeq: null,
        mode: "standard",
        gameId: "401873010",
        watching: { "401873010": true },
        utcOffsetMinutes: -420,
      },
      { type: "ping", phoneAt: 1_000_000 },
    ])
    socket.on.message(offerText(42))
    expect(last()).toMatchObject({ link: "live", offer: { seq: 42 } })
    expect(last().games.map((game) => game.label)).toEqual([
      "NE at CHI",
      "SEA at SF",
    ])
    h.setNow(1_000_200)
    socket.on.message(
      fromHome({ kind: "pong", phoneAt: 1_000_000, homeAt: 1_005_100 })
    )
    expect(last().offsetMs).toBe(5_000)
    await h.advance(PING_MS)
    expect(socket.sent.at(-1)).toMatchObject({ type: "ping" })
  })

  it("ignores an answer no newer than the last, and says a new choice again", async () => {
    const h = harness()
    const { feed, last } = await watched(h)
    const socket = h.sockets[0]
    socket.on.opened()
    socket.on.message(offerText(42))
    socket.on.message(offerText(41))
    expect(last().offer?.seq).toBe(42)
    feed.choose({ ...CHOICE, mode: "full" })
    expect(socket.sent.at(-1)).toMatchObject({
      type: "hello",
      lastSeq: 42,
      mode: "full",
    })
  })

  it("drops the offer the moment home is gone, keeps the week, and tries again", async () => {
    const h = harness()
    const { last } = await watched(h)
    h.sockets[0].on.opened()
    h.sockets[0].on.message(offerText(42))
    h.sockets[0].on.closed(1006)
    expect(last()).toMatchObject({ link: "away", offer: null })
    expect(last().games).toHaveLength(2)
    expect(h.sockets).toHaveLength(1)
    await h.advance(1_000)
    expect(h.sockets).toHaveLength(2)
    h.sockets[1].on.opened()
    expect(h.sockets[1].sent[0]).toMatchObject({ type: "hello", lastSeq: 42 })
  })

  it("treats a quiet home as gone", async () => {
    const h = harness()
    const { last } = await watched(h)
    h.sockets[0].on.opened()
    h.sockets[0].on.message(offerText(42))
    await h.advance(QUIET_MS)
    expect(last()).toMatchObject({ link: "away", offer: null })
  })

  it("stops trying when this build can't read home, or the phone isn't paired", async () => {
    const h = harness()
    const { last } = await watched(h)
    h.sockets[0].on.closed(4426)
    await h.advance(60_000)
    expect([last().link, h.sockets.length]).toEqual(["update", 1])

    const u = harness(false)
    const unpaired = await watched(u)
    expect([unpaired.last().link, u.sockets.length]).toEqual(["unpaired", 0])
    u.state.paired = true
    u.state.pairingId = "p2"
    u.relink()
    await Promise.resolve()
    await Promise.resolve()
    expect(u.sockets).toHaveLength(1)
  })

  it("says so, and stops, when home speaks a version this build can't read", async () => {
    const h = harness()
    const { last } = await watched(h)
    h.sockets[0].on.opened()
    h.sockets[0].on.message(fromHome({ kind: "version" }))
    await h.advance(60_000)
    expect([last().link, h.sockets.length, h.sockets[0].closed]).toEqual([
      "update",
      1,
      true,
    ])
  })

  it("follows a home that follows no games", async () => {
    const h = harness()
    const { last } = await watched(h)
    h.sockets[0].on.opened()
    h.sockets[0].on.message(offerText(42, false))
    expect(last()).toMatchObject({ link: "not-following", offer: null })
  })

  it("closes in the background and when nobody watches, and keeps the week for next time", async () => {
    const h = harness()
    const { unwatch } = await watched(h)
    h.sockets[0].on.opened()
    h.sockets[0].on.message(offerText(42))
    h.hide(true)
    expect(h.sockets[0].closed).toBe(true)
    h.hide(false)
    await Promise.resolve()
    await Promise.resolve()
    expect(h.sockets).toHaveLength(2)
    unwatch()
    expect(h.sockets[1].closed).toBe(true)
    const again = liveFeed(h.ports)
    let first: Feed | null = null
    again.watch((feed) => {
      first ??= feed
    })
    expect(first!.games).toHaveLength(2)
    expect(first!.offer).toBeNull()
  })
})
