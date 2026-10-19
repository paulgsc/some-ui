// @vitest-environment node
/**
 * The Core reducer (BC3), run under vitest's *node* environment on
 * purpose: there is no `document`, no `window`, no `browser` here, so a Core
 * file that reached for any of them would fail to import — the kernel-
 * independence bar `@some-extension/transport` holds itself to (its README's
 * Theorem D.2 line), made a test rather than a claim.
 */

import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { DEFAULT_BOUNDARY_DAYS } from "@censor/lib/content/maturity/maturity"
import { MODE_RULES } from "@censor/lib/settings/modes"
import { asChannelId, asVideoId } from "@censor/types/ids"
import type { SessionId } from "@some-extension/common"
import { describe, expect, it } from "vitest"

import type { Input } from "./events"
import type {
  Action,
  CoreEvent,
  CoreState,
  Observation,
  WatchObservation,
} from "./index"
import { admits, cardKey, initialState, reduce, snapshot } from "./index"
import { STANDARD_RULES } from "./state"

// SessionId is a branded number minted by the shell; the reducer only ever
// carries one, so a literal is enough here.
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const session = (n: number): SessionId => n as unknown as SessionId

function observation(
  videoId: string,
  overrides: Partial<Observation> = {}
): Observation {
  return {
    videoId: asVideoId(videoId),
    channelId: asChannelId("@chan"),
    channelName: "Chan",
    title: `Title of ${videoId}`,
    duration: "1:23",
    uploadDate: "3 days ago",
    short: false,
    artist: false,
    surface: "home",
    renderer: "ytd-rich-item-renderer",
    shape: "known",
    ...overrides,
  }
}

/** Fold a log from the initial state, collecting every action. */
function fold(
  events: ReadonlyArray<CoreEvent>,
  from: CoreState = initialState(session(0))
): { state: CoreState; actions: Array<Action> } {
  let state = from
  const actions: Array<Action> = []
  for (const event of events) {
    const step = reduce(state, event)
    state = step.state
    actions.push(...step.actions)
  }
  return { state, actions }
}

const K = cardKey(asVideoId("vid_a"))
const OLD = "6 years ago"

const B = DEFAULT_BOUNDARY_DAYS

const started: CoreEvent = {
  kind: "start",
  session: session(1),
  boundaryDays: B,
  rules: STANDARD_RULES,
  autoplay: "stop",
  t: 0,
}

const STRICT = MODE_RULES.strict.core

/** `videoId`'s card observed at `t`, with `overrides` on the default observation. */
function seen(
  t: number,
  overrides: Partial<Observation> = {},
  videoId = "vid_a"
): CoreEvent {
  return {
    kind: "observed",
    key: cardKey(asVideoId(videoId)),
    observation: observation(videoId, overrides),
    t,
  }
}

const seenA = seen(1)

const nav = (n: number, t: number): CoreEvent => ({
  kind: "nav",
  session: session(n),
  t,
})
const gone = (t: number): CoreEvent => ({ kind: "gone", key: K, t })
const unknownShape = (t: number): CoreEvent => ({
  kind: "unknown-shape",
  tag: "yt-lockup-view-model",
  surface: "search",
  reason: "tag-unseen",
  t,
})

function kinds(actions: ReadonlyArray<Action>): Array<string> {
  return actions.map((a) =>
    a.kind === "record" ? `record:${a.fact.kind}` : a.kind
  )
}

function viewOf(state: CoreState, key = K): string | undefined {
  return state.cards.get(key)?.view.kind
}

const dateFacts = (actions: ReadonlyArray<Action>): Array<string | null> =>
  actions.flatMap((a) =>
    a.kind === "record" && a.fact.kind === "date.observed" ? [a.fact.raw] : []
  )

describe("kernel independence", () => {
  it("runs with no DOM and no browser in scope", () => {
    expect("document" in globalThis).toBe(false)
    expect("window" in globalThis).toBe(false)
    // The import at the top already proved the module graph loads here; this
    // is the reducer doing real work in the same environment.
    const { state } = fold([started, seenA])
    expect(state.cards.size).toBe(1)
  })

  it("names no clock, randomness, session counter or effect in its source", () => {
    // Belt to the node-environment braces above and to the eslint rule:
    // the banned identifiers, as text, across every Core file.
    const dir = resolve(process.cwd(), "src/lib/content/core")
    const banned =
      /\b(document|window|browser|chrome|Date\.now|Math\.random|mkSession|setTimeout|setInterval|requestAnimationFrame)\b/
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue
      const source = readFileSync(resolve(dir, file), "utf8")
        // Comments may mention them by name; code may not.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "")
      expect(source, file).not.toMatch(banned)
    }
  })
})

describe("replay determinism (B8)", () => {
  const log: ReadonlyArray<CoreEvent> = [
    started,
    seenA,
    seen(2, { channelId: null, channelName: null, uploadDate: OLD }, "vid_b"),
    seen(3, { uploadDate: OLD }),
    seen(4, {}, "vid_b"),
    { kind: "boundary", days: 2 * B, t: 5 },
    unknownShape(5),
    nav(2, 6),
    seenA,
    gone(8),
    { kind: "stop", t: 9 },
  ]

  it("folds the same log to the same state and the same actions, twice", () => {
    const a = fold(log)
    const b = fold(log)
    expect(JSON.stringify(snapshot(a.state))).toBe(
      JSON.stringify(snapshot(b.state))
    )
    expect(JSON.stringify(a.actions)).toBe(JSON.stringify(b.actions))
  })

  it("never mutates the state it is given", () => {
    const before = initialState(session(0))
    const frozen = JSON.stringify(snapshot(before))
    fold(log, before)
    expect(JSON.stringify(snapshot(before))).toBe(frozen)
  })
})

describe("lifecycle (R1, R3)", () => {
  it("does nothing while idle, except start", () => {
    const { state, actions } = fold([seenA, nav(2, 1)])
    expect(state.cards.size).toBe(0)
    expect(actions).toEqual([])
  })

  it("adopts the shell's session on start and again on navigation", () => {
    const { state } = fold([started])
    expect(state.phase).toBe("running")
    expect(state.session).toBe(session(1))
    const after = fold([started, seenA, nav(2, 5)])
    expect(after.state.session).toBe(session(2))
    expect(after.state.cards.size, "nothing survives a navigation").toBe(0)
    expect(kinds(after.actions)).toContain("unmount")
  })

  it("stop unmounts everything and goes idle", () => {
    const { state, actions } = fold([started, seenA, { kind: "stop", t: 3 }])
    expect(state.phase).toBe("idle")
    expect(state.cards.size).toBe(0)
    expect(
      actions.filter((a) => a.kind === "unmount").map((a) => a.key)
    ).toEqual([K])
  })

  it("start while running is a no-op (C1/C3)", () => {
    const first = fold([started, seenA])
    const again = reduce(first.state, {
      kind: "start",
      session: session(9),
      boundaryDays: B,
      rules: STANDARD_RULES,
      autoplay: "stop",
      t: 9,
    })
    expect(again.actions).toEqual([])
    expect(again.state).toBe(first.state)
  })
})

describe("adoption (R2, R6)", () => {
  it("renders a card on first sight, decided by its evidence", () => {
    const { state, actions } = fold([started, seenA])
    expect(viewOf(state)).toBe("absent")
    expect(kinds(actions).slice(1)).toEqual([
      "render",
      "record:mount.resolved",
      "record:entry.state",
      "record:date.observed",
    ])
    const [render] = actions.filter((a) => a.kind === "render")
    expect(render?.kind === "render" && render.model.dataBoyo).toBe("absent")
  })

  it("mounts a channel-less card provisionally", () => {
    const { state, actions } = fold([started, seen(1, { channelId: null })])
    expect(state.cards.get(K)?.observation.channelId).toBeNull()
    expect(kinds(actions)).toContain("record:mount.provisional")
  })

  it("records a channel that arrives on a later observation, once", () => {
    const { state, actions } = fold([
      started,
      seen(1, { channelId: null }),
      seenA,
      seenA,
    ])
    expect(state.cards.get(K)?.observation.channelId).toBe(asChannelId("@chan"))
    expect(
      kinds(actions).filter((k) => k === "record:channel.backfilled")
    ).toHaveLength(1)
  })

  it("holds one card per artifact however often it is observed", () => {
    const { state, actions } = fold([started, seenA, seenA, seenA])
    expect(state.cards.size).toBe(1)
    expect(
      kinds(actions).filter((k) => k === "record:mount.resolved")
    ).toHaveLength(1)
    expect(
      actions.filter((a) => a.kind === "render"),
      "re-rendered each time (R5)"
    ).toHaveLength(3)
  })

  it("keeps evidence an earlier observation had and a later one lost", () => {
    const { state } = fold([
      started,
      seenA,
      seen(2, { title: null, duration: null }),
    ])
    expect(state.cards.get(K)?.observation.title).toBe("Title of vid_a")
    expect(state.cards.get(K)?.observation.duration).toBe("1:23")
  })

  it("treats an unknown shape as a card, and counts it (B4)", () => {
    const { state, actions } = fold([
      started,
      seen(1, { shape: "unknown" }),
      unknownShape(2),
      unknownShape(3),
    ])
    expect(viewOf(state), "decided like every card").toBe("absent")
    expect(state.unknownShapes).toMatchObject({ "tag-unseen": 2 })
    expect(
      kinds(actions).filter((k) => k === "record:shape.unknown")
    ).toHaveLength(2)
    const navigated = reduce(state, nav(2, 4))
    expect(navigated.state.unknownShapes["tag-unseen"], "per session").toBe(0)
  })

  it("forgets a card that is gone", () => {
    const { state, actions } = fold([started, seenA, gone(2)])
    expect(state.cards.size).toBe(0)
    expect(actions.at(-1)).toEqual({ kind: "unmount", key: K })
    expect(reduce(state, gone(3)).actions, "idempotent").toEqual([])
  })
})

describe("evidence alone decides (R7)", () => {
  it("holds a card with no date, and plates it when an old date hydrates", () => {
    const { state, actions } = fold([
      started,
      seen(1, { uploadDate: null }),
      seen(2, { uploadDate: OLD }),
      seen(3, { uploadDate: OLD }),
    ])
    expect(viewOf(state)).toBe("plated")
    const renders = actions.flatMap((a) =>
      a.kind === "render" ? [a.model.dataBoyo] : []
    )
    expect(renders).toEqual(["absent", "plated", "plated"])
    expect(
      kinds(actions).filter((k) => k === "record:entry.state"),
      "one fact per view, not per observation"
    ).toHaveLength(2)
  })

  it("holds a Short however old, and a card once seen as a Short stays held", () => {
    const { state } = fold([
      started,
      seen(1, { uploadDate: OLD, short: true }),
      seen(2, { uploadDate: OLD, short: false }),
    ])
    expect(viewOf(state)).toBe("absent")
  })

  it("estimates against the time of the observation, not of adoption", () => {
    // A calendar date ages with the clock: under the default one-year
    // boundary, a date eleven months back is held, and the same card seen a
    // month later is plated.
    const day = 86_400_000
    const t0 = Date.UTC(2026, 9, 16)
    const date = "Nov 1, 2025"
    const { state } = fold([started, seen(t0, { uploadDate: date })])
    expect(viewOf(state)).toBe("absent")
    const later = reduce(state, seen(t0 + 30 * day, { uploadDate: date }))
    expect(viewOf(later.state)).toBe("plated")
  })

  it("lets no input but the boundary and the mode change a card's view", () => {
    // Every Input kind, by name: a new one fails to compile here until it
    // says what it does to a held card. These two cards are on the same side
    // of every boundary the popup offers, and carry no music sign.
    const inputs: { [K in Input["kind"]]: Extract<Input, { kind: K }> } = {
      start: {
        kind: "start",
        session: session(5),
        boundaryDays: B,
        rules: STANDARD_RULES,
        autoplay: "stop",
        t: 3,
      },
      stop: { kind: "stop", t: 3 },
      boundary: { kind: "boundary", days: 2 * B, t: 3 },
      rules: { kind: "rules", rules: STRICT, t: 3 },
      autoplay: { kind: "autoplay", autoplay: "skip", t: 3 },
      face: { kind: "face", videoId: asVideoId("vid_a"), shown: true, t: 3 },
    }
    for (const uploadDate of [OLD, "3 days ago"]) {
      const { state } = fold([started, seen(1, { uploadDate })])
      for (const input of Object.values(inputs)) {
        const view = viewOf(reduce(state, input).state)
        expect(
          view === undefined || view === viewOf(state),
          `${input.kind} kept or forgot the ${uploadDate} card, never moved it`
        ).toBe(true)
      }
    }
  })
})

describe("the boundary (R7, #1807)", () => {
  const TWO_YEARS = "2 years ago"
  const boundary = (days: number, t = 5): CoreEvent => ({
    kind: "boundary",
    days,
    t,
  })

  it("re-decides a card in place, straight from one stamp to the other", () => {
    const { state } = fold([started, seen(1, { uploadDate: TWO_YEARS })])
    expect(viewOf(state)).toBe("plated")
    const raised = reduce(state, boundary(2 * B))
    expect(viewOf(raised.state)).toBe("absent")
    expect(kinds(raised.actions)).toEqual(["render", "record:entry.state"])
    const lowered = reduce(raised.state, boundary(B))
    expect(viewOf(lowered.state)).toBe("plated")
    expect(kinds(lowered.actions)).toEqual(["render", "record:entry.state"])
  })

  it("touches no card whose view stays", () => {
    const { state } = fold([started, seenA, seen(1, { uploadDate: OLD }, "b")])
    expect(reduce(state, boundary(2 * B)).actions).toEqual([])
  })

  it("decides later observations, and the next start, under the new value", () => {
    const { state } = fold([
      started,
      boundary(2 * B),
      seen(6, { uploadDate: TWO_YEARS }),
    ])
    expect(viewOf(state)).toBe("absent")
    const restarted = fold([
      {
        kind: "start",
        session: session(2),
        boundaryDays: 2 * B,
        rules: STANDARD_RULES,
        autoplay: "stop",
        t: 0,
      },
      seen(1, { uploadDate: TWO_YEARS }),
    ])
    expect(viewOf(restarted.state)).toBe("absent")
  })
})

describe("the watch page (R8, #1805)", () => {
  const OLD_PAGE: WatchObservation = {
    videoId: asVideoId("vid_w"),
    short: false,
    hydrated: true,
    dates: ["444M views", "21y ago"],
    miniplayer: false,
    title: "Me at the zoo",
    channelName: "jawed",
    artist: false,
  }
  const watched = (
    t: number,
    watch: WatchObservation | null = OLD_PAGE
  ): CoreEvent => ({ kind: "watched", watch, t })
  const watchActions = (actions: ReadonlyArray<Action>): Array<unknown> =>
    actions.flatMap((a) =>
      a.kind === "watch"
        ? [{ view: a.view, videoId: a.videoId, miniplayer: a.miniplayer }]
        : []
    )
  const shown = (
    view: string | null,
    videoId: string | null = "vid_w"
  ): Record<string, unknown> => ({
    view,
    videoId,
    miniplayer: false,
  })

  it("does nothing while idle", () => {
    expect(reduce(initialState(session(0)), watched(1)).actions).toEqual([])
  })

  it("decides the page's video by its evidence, and announces it once", () => {
    const { state, actions } = fold([started, watched(1), watched(2)])
    expect(state.watch?.view).toBe("plated")
    expect(watchActions(actions)).toEqual([shown("plated")])
  })

  it("is pending until a date shows, absent with none it can place", () => {
    const { actions } = fold([
      started,
      watched(1, { ...OLD_PAGE, hydrated: false, dates: [] }),
      watched(2, { ...OLD_PAGE, dates: ["444M views"] }),
      watched(3, {
        ...OLD_PAGE,
        dates: ["3 hours ago"],
        videoId: asVideoId("y"),
      }),
      watched(4, { ...OLD_PAGE, videoId: null, short: true, dates: [] }),
    ])
    expect(watchActions(actions)).toEqual([
      shown("pending"),
      shown("absent"),
      shown("absent", "y"),
      shown("absent", null),
    ])
  })

  it("reads another video's dates, still on screen, as none, until they change", () => {
    const next = asVideoId("vid_next")
    const { state, actions } = fold([
      started,
      watched(1),
      // YouTube names the next video before it rewrites the date.
      watched(2, { ...OLD_PAGE, videoId: next }),
      watched(3, { ...OLD_PAGE, videoId: next, dates: ["3 hours ago"] }),
    ])
    expect(watchActions(actions)).toEqual([
      shown("plated"),
      shown("pending", "vid_next"),
      shown("absent", "vid_next"),
    ])
    // The page keeps them while it is hidden, and so does Core.
    const back = fold(
      [watched(4, null), watched(5, { ...OLD_PAGE, dates: ["3 hours ago"] })],
      state
    )
    expect(back.state.watch?.view).toBe("pending")
  })

  it("reads any part of another video's runs as none, in any form it showed", () => {
    const next = asVideoId("vid_next")
    const expanded = ["444,875,933 views", "Apr 23, 2005"]
    const { state } = fold([
      started,
      watched(1),
      // The description expanded: the same date in its long form.
      watched(2, { ...OLD_PAGE, dates: expanded }),
    ])
    for (const dates of [["21y ago"], ["Apr 23, 2005"], OLD_PAGE.dates]) {
      const step = reduce(
        state,
        watched(3, { ...OLD_PAGE, videoId: next, dates })
      )
      expect(step.state.watch?.view, dates.join()).toBe("pending")
    }
  })

  it("keeps a video's evidence a later reading lost", () => {
    const lost = { ...OLD_PAGE, hydrated: false, dates: [] }
    const { state } = fold([started, watched(1), watched(2, lost)])
    expect(state.watch?.view).toBe("plated")
  })

  it("holds the miniplayer's video, and says where it plays", () => {
    const { actions } = fold([
      started,
      watched(1, { ...OLD_PAGE, dates: ["3 hours ago"] }),
      watched(2, { ...OLD_PAGE, dates: ["3 hours ago"], miniplayer: true }),
    ])
    expect(watchActions(actions)).toEqual([
      shown("absent"),
      { view: "absent", videoId: "vid_w", miniplayer: true },
    ])
  })

  it("strips the hold when no page is shown, keeps it across nav, and forgets it on stop", () => {
    const on = fold([started, watched(1)]).state
    const left = reduce(on, watched(2, null))
    expect(left.state.watch).toBeNull()
    expect(watchActions(left.actions)).toEqual([shown(null, null)])

    const navigated = reduce(on, nav(2, 2))
    expect(navigated.state.watch?.view).toBe("plated")
    expect(watchActions(navigated.actions)).toEqual([])

    // The Actuator's dispose lifts the hold, giving the shown page its title.
    const stopped = reduce(on, { kind: "stop", t: 2 })
    expect(stopped.state.watch).toBeNull()
    expect(watchActions(stopped.actions)).toEqual([])
  })

  it("shows the face for the plated page's video, this view only (R9)", () => {
    const face = (t: number, videoId = "vid_w"): CoreEvent => ({
      kind: "face",
      videoId: asVideoId(videoId),
      shown: true,
      t,
    })
    const faces = (actions: ReadonlyArray<Action>): Array<unknown> =>
      actions.flatMap((a) => (a.kind === "watch" ? [a.face] : []))
    const plated = fold([started, watched(1)]).state

    const held = reduce(plated, face(2))
    expect(held.state.watch?.face).toBe(true)
    expect(faces(held.actions)).toEqual([true])
    expect(reduce(held.state, face(3)).actions, "once").toEqual([])
    const reread = reduce(
      held.state,
      watched(3, { ...OLD_PAGE, dates: ["444,875,933 views", "20y ago"] })
    )
    expect(reread.state.watch?.face, "kept for the same plated video").toBe(
      true
    )

    // Another video's hold, a held page and the miniplayer show nothing.
    expect(reduce(plated, face(2, "vid_other")).actions).toEqual([])
    const recent = fold([
      started,
      watched(1, { ...OLD_PAGE, dates: ["3 hours ago"] }),
    ]).state
    expect(reduce(recent, face(2)).actions).toEqual([])
    const mini = fold([started, watched(1, { ...OLD_PAGE, miniplayer: true })])
    expect(reduce(mini.state, face(2)).actions).toEqual([])

    // It goes with a navigation, another video, and the plate.
    expect(faces(reduce(held.state, nav(2, 4)).actions)).toEqual([false])
    const next = reduce(
      held.state,
      watched(4, { ...OLD_PAGE, videoId: asVideoId("vid_next") })
    )
    expect(next.state.watch?.face).toBe(false)
    const raised = reduce(held.state, { kind: "boundary", days: 30 * B, t: 4 })
    expect(raised.state.watch?.face).toBe(false)
  })

  it("renders the watch view again when the description is drawn again", () => {
    const described: CoreEvent = { kind: "described", t: 2 }
    expect(reduce(fold([started]).state, described).actions).toEqual([])
    const { state } = fold([started, watched(1)])
    expect(watchActions(reduce(state, described).actions)).toEqual([
      shown("plated"),
    ])
  })

  it("puts the plate's tone on a plated page's poster, and no other", () => {
    const posters = (actions: ReadonlyArray<Action>): Array<unknown> =>
      actions.flatMap((a) => (a.kind === "watch" ? [a.poster] : []))
    const { actions } = fold([
      started,
      watched(1),
      watched(2, {
        ...OLD_PAGE,
        dates: ["3 hours ago"],
        videoId: asVideoId("y"),
      }),
    ])
    const [plated, absent] = posters(actions)
    expect(plated).toMatch(/^hsl\(/)
    expect(absent).toBeNull()
  })

  it("is re-decided by the boundary", () => {
    const { state } = fold([
      started,
      watched(1, { ...OLD_PAGE, dates: ["2 years ago"] }),
    ])
    const raised = reduce(state, { kind: "boundary", days: 3 * B, t: 5 })
    expect(watchActions(raised.actions)).toEqual([shown("absent")])
    expect(reduce(state, { kind: "boundary", days: B, t: 5 }).actions).toEqual(
      []
    )
  })
})

describe("the listening lane (QD15, #1806)", () => {
  it("follows the latest reading of the artist badge, never a stale one", () => {
    const { state } = fold([
      started,
      seen(1, { uploadDate: "2 hours ago", title: "News", artist: true }),
    ])
    expect(viewOf(state)).toBe("whole")
    const lost = reduce(
      state,
      seen(2, { uploadDate: "2 hours ago", title: "News", artist: false })
    )
    expect(viewOf(lost.state)).toBe("absent")
  })

  it("reads nothing of the lane off another video's metadata still on screen", () => {
    const page = (
      videoId: string,
      overrides: Partial<WatchObservation>
    ): CoreEvent => ({
      kind: "watched",
      watch: {
        videoId: asVideoId(videoId),
        short: false,
        hydrated: true,
        dates: ["444M views", "21y ago"],
        miniplayer: false,
        title: null,
        channelName: null,
        artist: false,
        ...overrides,
      },
      t: 2,
    })
    const { state } = fold([
      started,
      page("song", { title: "Stay With Me MV", artist: true }),
    ])
    expect(state.watch?.view).toBe("whole")
    // The next video, named before its page is rewritten: first with no
    // date at all, then with the previous one's.
    const undated = reduce(
      state,
      page("news", { dates: [], title: "Stay With Me MV", artist: true })
    )
    const next = reduce(
      undated.state,
      page("news", { title: "Stay With Me MV", artist: true })
    )
    expect(next.state.watch?.view).toBe("pending")
    // Its own date arrives before its title does: nothing of the previous
    // video's title or badge is kept to admit it.
    const dated = reduce(
      next.state,
      page("news", { dates: ["3 hours ago"], title: null })
    )
    expect(dated.state.watch?.view).toBe("absent")
  })
})

describe("what autoplay may go on into (#1805)", () => {
  it("admits a plated card's video, and nothing held or unseen", () => {
    const { state } = fold([
      started,
      seen(1, { uploadDate: OLD }, "old"),
      seen(1, { uploadDate: "3 hours ago" }, "recent"),
    ])
    expect(admits(state, asVideoId("old"))).toBe(true)
    expect(admits(state, asVideoId("recent"))).toBe(false)
    expect(admits(state, asVideoId("unseen"))).toBe(false)
    const lane = fold([
      started,
      seen(1, { uploadDate: "3 hours ago", title: "Stay With Me MV" }, "song"),
    ])
    expect(admits(lane.state, asVideoId("song")), "whole, in the lane").toBe(
      true
    )
  })

  it("skips under Skip to the first admitted video in Up next (R10, #1966)", () => {
    const page: CoreEvent = {
      kind: "watched",
      watch: {
        videoId: asVideoId("here"),
        short: false,
        hydrated: true,
        dates: ["21y ago"],
        miniplayer: false,
        title: "Me at the zoo",
        channelName: "jawed",
        artist: false,
      },
      t: 1,
    }
    const cards = [
      seen(1, { uploadDate: "3 hours ago" }, "recent"),
      seen(1, { uploadDate: OLD }, "old"),
      seen(1, { uploadDate: OLD }, "older"),
    ]
    const held = (upNext: ReadonlyArray<string>): CoreEvent => ({
      kind: "held",
      upNext: upNext.map(asVideoId),
      t: 2,
    })
    const plays = (actions: ReadonlyArray<Action>): Array<string> =>
      actions.flatMap((a) => (a.kind === "play" ? [String(a.key)] : []))

    const stopping = fold([started, page, ...cards])
    expect(
      plays(reduce(stopping.state, held(["recent", "old"])).actions),
      "Stop plays nothing"
    ).toEqual([])

    const { state } = fold([
      started,
      { kind: "autoplay", autoplay: "skip", t: 1 },
      page,
      ...cards,
    ])
    expect(
      plays(
        reduce(state, held(["here", "recent", "unseen", "old", "older"]))
          .actions
      )
    ).toEqual([String(cardKey(asVideoId("old")))])
    expect(
      plays(reduce(state, held(["recent", "unseen"])).actions),
      "nothing admitted: it stops"
    ).toEqual([])
  })
})
describe("the mode (R7, R9, #1966)", () => {
  const strict = (t = 5): CoreEvent => ({ kind: "rules", rules: STRICT, t })
  const standard = (t = 6): CoreEvent => ({
    kind: "rules",
    rules: STANDARD_RULES,
    t,
  })
  const OST = { uploadDate: "3 hours ago", title: "Stay With Me OST" }

  it("re-decides a card on the title token alone, and back", () => {
    const { state } = fold([started, seen(1, OST)])
    expect(viewOf(state)).toBe("whole")
    const narrowed = reduce(state, strict())
    expect(viewOf(narrowed.state)).toBe("absent")
    expect(kinds(narrowed.actions)).toEqual(["render", "record:entry.state"])
    const widened = reduce(narrowed.state, standard())
    expect(viewOf(widened.state)).toBe("whole")
  })

  it("decides later observations, and the next start, under the mode", () => {
    const { state } = fold([started, strict(), seen(6, OST)])
    expect(viewOf(state)).toBe("absent")
    const restarted = fold([
      {
        kind: "start",
        session: session(2),
        boundaryDays: B,
        rules: STRICT,
        autoplay: "stop",
        t: 0,
      },
      seen(1, OST),
    ])
    expect(viewOf(restarted.state)).toBe("absent")
  })

  it("offers the face control only under a mode that has one", () => {
    const page: CoreEvent = {
      kind: "watched",
      watch: {
        videoId: asVideoId("vid_w"),
        short: false,
        hydrated: true,
        dates: ["21y ago"],
        miniplayer: false,
        title: "Me at the zoo",
        channelName: "jawed",
        artist: false,
      },
      t: 1,
    }
    const offers = (actions: ReadonlyArray<Action>): Array<string> =>
      actions.flatMap((a) => (a.kind === "watch" ? [a.offer] : []))
    const faced = fold([
      started,
      page,
      { kind: "face", videoId: asVideoId("vid_w"), shown: true, t: 2 },
    ])
    expect(faced.state.watch?.face).toBe(true)
    expect(offers(faced.actions)).toEqual(["release", "release"])

    const narrowed = reduce(faced.state, strict())
    expect(narrowed.state.watch?.face, "Strict takes the face away").toBe(false)
    expect(offers(narrowed.actions)).toEqual(["none"])
    const held = reduce(narrowed.state, {
      kind: "face",
      videoId: asVideoId("vid_w"),
      shown: true,
      t: 6,
    })
    expect(held.actions, "no face under Strict").toEqual([])
    expect(offers(reduce(narrowed.state, standard()).actions)).toEqual([
      "release",
    ])

    // Only Open lets the thumbnail be hidden again.
    const hide: CoreEvent = {
      kind: "face",
      videoId: asVideoId("vid_w"),
      shown: false,
      t: 7,
    }
    expect(reduce(faced.state, hide).actions, "not under Standard").toEqual([])
    const open = reduce(faced.state, {
      kind: "rules",
      rules: MODE_RULES.open.core,
      t: 7,
    })
    expect(open.state.watch?.face, "Open keeps a shown face").toBe(true)
    expect(offers(open.actions)).toEqual(["held"])
    const hidden = reduce(open.state, hide)
    expect(hidden.state.watch?.face).toBe(false)
    expect(offers(hidden.actions)).toEqual(["held"])

    // Back to Standard with the face shown: it stays, offered no control.
    const back = reduce(open.state, standard())
    expect(back.state.watch?.face).toBe(true)
    expect(offers(back.actions)).toEqual(["release"])
  })

  it("keeps autoplay from a whole video in the lane under Strict", () => {
    const watching = (overrides: Partial<WatchObservation>): CoreEvent => ({
      kind: "watched",
      watch: {
        videoId: asVideoId("song"),
        short: false,
        hydrated: true,
        dates: ["3 hours ago"],
        miniplayer: false,
        title: "Untitled",
        channelName: "Ailee - Topic",
        artist: false,
        ...overrides,
      },
      t: 1,
    })
    const song = watching({})
    const cards = [
      seen(1, { uploadDate: OLD }, "old"),
      seen(1, { uploadDate: "3 hours ago", artist: true }, "next-song"),
    ]
    const shown = fold([started, song, ...cards])
    expect(shown.state.watch?.view).toBe("whole")
    expect(admits(shown.state, asVideoId("old"))).toBe(true)
    const lane = fold([started, strict(), song, ...cards])
    expect(lane.state.watch?.view).toBe("whole")
    expect(admits(lane.state, asVideoId("old")), "plated, not music").toBe(
      false
    )
    expect(admits(lane.state, asVideoId("next-song"))).toBe(true)
    // From a plated page, Strict admits what Standard does.
    const plated = fold([
      started,
      strict(),
      watching({ dates: ["21y ago"], channelName: "jawed" }),
      ...cards,
    ])
    expect(plated.state.watch?.view).toBe("plated")
    expect(admits(plated.state, asVideoId("old"))).toBe(true)
  })
})

describe("the date corpus", () => {
  it("records a date that arrives on a later observation — YouTube hydrates it after the card", () => {
    const { actions } = fold([
      started,
      seen(1, { uploadDate: null }),
      seen(2),
      seen(3),
    ])
    // Once at adoption (nothing yet), once when the form appears, and not
    // again for a repeat of the same form.
    expect(dateFacts(actions)).toEqual([null, "3 days ago"])
  })

  it("records a changed date form, but never a repeat", () => {
    const { actions } = fold([
      started,
      seenA,
      seen(2),
      seen(3, { uploadDate: "4 days ago" }),
      // A later observation that lost the field keeps the merged value and
      // records nothing new.
      seen(4, { uploadDate: null }),
    ])
    expect(dateFacts(actions)).toEqual(["3 days ago", "4 days ago"])
  })
})
