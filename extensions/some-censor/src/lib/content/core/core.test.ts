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
import { asChannelId, asVideoId } from "@censor/types/ids"
import type { SessionId } from "@some-extension/common"
import { describe, expect, it } from "vitest"

import type { Input } from "./events"
import type { Action, CoreEvent, CoreState, Observation } from "./index"
import { cardKey, initialState, reduce, snapshot } from "./index"

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

const started: CoreEvent = { kind: "start", session: session(1), t: 0 }

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

  it("lets no input change a card's view", () => {
    // Every Input kind, by name: a new one fails to compile here until it
    // says what it does to a held card.
    const inputs: { [K in Input["kind"]]: Extract<Input, { kind: K }> } = {
      start: { kind: "start", session: session(5), t: 3 },
      stop: { kind: "stop", t: 3 },
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
