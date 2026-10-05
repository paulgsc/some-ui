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

import type { Action, CoreEvent, CoreState, Observation } from "./index"
import {
  cardKey,
  initialState,
  reduce,
  snapshot,
  WHITELIST_REVEAL_DELAY_MS,
} from "./index"

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

type ChannelId = ReturnType<typeof asChannelId>

const K = cardKey(asVideoId("vid_a"))
const K2 = cardKey(asVideoId("vid_b"))
const CHAN = asChannelId("@chan")
const CANONICAL = asChannelId("@canonical")

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

const click = (t: number, key = K): CoreEvent => ({
  kind: "gesture",
  key,
  gesture: "click",
  t,
})
const dblclick = (t: number, key = K): CoreEvent => ({
  kind: "gesture",
  key,
  gesture: "dblclick",
  t,
})
const nav = (n: number, t: number): CoreEvent => ({
  kind: "nav",
  session: session(n),
  t,
})
const gone = (t: number): CoreEvent => ({ kind: "gone", key: K, t })
const timer = (
  version: number,
  t: number,
  generation = 0,
  key = K
): CoreEvent => ({ kind: "timer", key, generation, version, t })
const unknownShape = (t: number): CoreEvent => ({
  kind: "unknown-shape",
  tag: "yt-lockup-view-model",
  surface: "search",
  reason: "tag-unseen",
  t,
})

function answer(
  whitelisted: boolean,
  {
    t = 2,
    query = 1,
    generation = 0,
    channelId = CHAN,
    key = K,
  }: {
    t?: number
    query?: number
    generation?: number
    channelId?: ChannelId
    key?: typeof K
  } = {}
): CoreEvent {
  return {
    kind: "whitelist-answer",
    key,
    generation,
    query,
    channelId,
    whitelisted,
    t,
  }
}

function transformed(
  version: number,
  text: string,
  t: number,
  { translated = true, generation = 0 } = {}
): CoreEvent {
  return {
    kind: "title-transformed",
    key: K,
    generation,
    version,
    text,
    translated,
    t,
  }
}

/** Masked → meta → title on clicks at t = 2 and 3. */
const toTitle: ReadonlyArray<CoreEvent> = [started, seenA, click(2), click(3)]

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
    seen(2, { channelId: null, channelName: null }, "vid_b"),
    answer(false, { t: 3 }),
    click(4),
    click(5),
    transformed(2, "Translated", 6),
    seen(7, {}, "vid_b"),
    answer(true, { key: K2, generation: 1, t: 8 }),
    timer(1, 9, 1, K2),
    unknownShape(10),
    { kind: "command", command: "advance-all-to-title", t: 11 },
    nav(2, 12),
    seenA,
    dblclick(14),
    gone(15),
    { kind: "stop", t: 16 },
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
    const { state, actions } = fold([seenA, click(1)])
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
  it("masks a card on first sight and asks about its channel", () => {
    const { state, actions } = fold([started, seenA])
    expect(viewOf(state)).toBe("masked")
    expect(kinds(actions).slice(1)).toEqual([
      "render",
      "record:mount.resolved",
      "record:entry.state",
      "record:date.observed",
      "query-whitelist",
    ])
    const [render] = actions.filter((a) => a.kind === "render")
    expect(render?.kind === "render" && render.model.dataBoyo).toBe("0")
  })

  it("mounts a channel-less card provisionally and asks nothing yet", () => {
    const { state, actions } = fold([started, seen(1, { channelId: null })])
    expect(state.cards.get(K)?.channel).toEqual({ kind: "unknown" })
    expect(kinds(actions)).toContain("record:mount.provisional")
    expect(kinds(actions)).not.toContain("query-whitelist")
  })

  it("backfills the channel on a later observation, once", () => {
    const { state, actions } = fold([
      started,
      seen(1, { channelId: null }),
      seenA,
      seenA,
    ])
    expect(state.cards.get(K)?.channel).toMatchObject({ kind: "pending" })
    expect(actions.filter((a) => a.kind === "query-whitelist")).toHaveLength(1)
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
    expect(viewOf(state), "still masked, like every card").toBe("masked")
    expect(state.unknownShapes).toMatchObject({ degraded: 1, "tag-unseen": 2 })
    expect(
      kinds(actions).filter((k) => k === "record:shape.unknown")
    ).toHaveLength(3)
    const navigated = reduce(state, nav(2, 4))
    expect(navigated.state.unknownShapes.degraded, "per session").toBe(0)
  })

  it("forgets a card that is gone", () => {
    const { state, actions } = fold([started, seenA, gone(2)])
    expect(state.cards.size).toBe(0)
    expect(actions.at(-1)).toEqual({ kind: "unmount", key: K })
    expect(reduce(state, gone(3)).actions, "idempotent").toEqual([])
  })
})

describe("the disclosure ladder", () => {
  it("climbs masked → meta → title on single clicks, with the observed evidence", () => {
    const one = fold([started, seenA, click(2)])
    expect(viewOf(one.state)).toBe("meta")
    const two = fold(toTitle)
    const card = two.state.cards.get(K)
    expect(card?.view.kind).toBe("title")
    if (card?.view.kind !== "title") throw new Error("unreachable")
    expect(card.view.title.text).toBe("Title of vid_a")
    expect(card.view.meta.channelName).toBe("Chan")
    const transform = two.actions.find((a) => a.kind === "transform-title")
    expect(transform).toMatchObject({
      key: K,
      version: 2,
      text: "Title of vid_a",
    })
    const three = reduce(two.state, click(4))
    expect(three.actions, "a click at title is nothing").toEqual([])
  })

  it("reveals on a double click from any state (parity; #1385 narrows this)", () => {
    for (const prior of [0, 1, 2]) {
      const clicks = Array.from({ length: prior }, (_, i) => click(2 + i))
      const { state, actions } = fold([started, seenA, ...clicks, dblclick(9)])
      expect(viewOf(state), `after ${prior} click(s)`).toBe("revealed")
      const last = actions.filter((a) => a.kind === "render").at(-1)
      expect(last?.kind === "render" && last.model.removeVeil).toBe(true)
    }
  })

  it("applies a title transform only to the version that asked for it (R4)", () => {
    const base = fold(toTitle)
    const right = reduce(base.state, transformed(2, "Übersetzt", 4))
    const card = right.state.cards.get(K)
    expect(card?.view.kind === "title" && card.view.title).toEqual({
      text: "Übersetzt",
      translated: true,
    })

    const stale = reduce(base.state, transformed(1, "old", 4))
    expect(stale.state).toBe(base.state)
    expect(kinds(stale.actions)).toEqual(["record:stale.discarded"])

    const moved = fold([...toTitle, dblclick(4)])
    const late = reduce(moved.state, transformed(2, "late", 5))
    expect(
      viewOf(late.state),
      "a revealed card is not dragged back to title"
    ).toBe("revealed")
  })

  it("keeps the title untranslated when the hook handed the original back", () => {
    const base = fold(toTitle)
    const fallback = reduce(
      base.state,
      transformed(2, "Title of vid_a", 4, { translated: false })
    )
    const card = fallback.state.cards.get(K)
    expect(card?.view.kind === "title" && card.view.title).toEqual({
      text: "Title of vid_a",
      translated: false,
    })
    // Rendered once, as an ordinary title — not styled or labelled as a
    // translation.
    expect(kinds(fallback.actions)).toEqual(["render"])
    const render = fallback.actions[0]
    const content = render?.kind === "render" ? render.model.veilContent : null
    expect(content?.kind === "title" && content.title.translated).toBe(false)
  })
})

describe("a channel that changes on re-observation", () => {
  const seenCanonical = seen(2, { channelId: CANONICAL })

  it("asks again under the new id, and lets the old id's answer go stale", () => {
    const { state, actions } = fold([started, seenA, seenCanonical])
    expect(state.cards.get(K)?.channel).toEqual({
      kind: "pending",
      channelId: "@canonical",
      since: 2,
      query: 2,
    })
    expect(
      actions.flatMap((a) =>
        a.kind === "query-whitelist" ? [a.channelId] : []
      )
    ).toEqual(["@chan", "@canonical"])

    // The lookup for the display-name id settles now, whitelisted — it must
    // not reveal a card whose channel is no longer that.
    const old = reduce(state, answer(true, { t: 3 }))
    expect(kinds(old.actions)).toEqual(["record:stale.discarded"])
    expect(viewOf(old.state)).toBe("masked")

    const fresh = reduce(
      old.state,
      answer(true, { query: 2, channelId: CANONICAL, t: 4 })
    )
    expect(fresh.state.cards.get(K)?.channel).toMatchObject({
      kind: "known",
      channelId: "@canonical",
      whitelisted: true,
    })
    expect(viewOf(fresh.state)).toBe("whitelisted")
  })

  it("re-opens the question for a card already answered under the old id, without touching its view", () => {
    const { state, actions } = fold([
      started,
      seenA,
      answer(false),
      click(3),
      seen(4, { channelId: CANONICAL }),
    ])
    expect(state.cards.get(K)?.channel).toMatchObject({
      kind: "pending",
      channelId: "@canonical",
    })
    expect(viewOf(state), "Entry-4: the view is not reset").toBe("meta")
    expect(actions.filter((a) => a.kind === "query-whitelist")).toHaveLength(2)
  })

  it("does not ask again for the same channel, nor for a channel a later observation lost", () => {
    const { actions } = fold([
      started,
      seenA,
      seenA,
      seen(3, { channelId: null }),
    ])
    expect(actions.filter((a) => a.kind === "query-whitelist")).toHaveLength(1)
  })
})

describe("a channel change takes back only what the old channel's verdict exposed", () => {
  it("remasks a card whose whitelisted view was earned by the channel it no longer has, and retires that reveal timer", () => {
    const { state, actions } = fold([
      started,
      seenA,
      answer(true),
      seen(3, { channelId: CANONICAL }),
    ])
    expect(viewOf(state)).toBe("masked")
    expect(state.cards.get(K)).toMatchObject({
      version: 2,
      channel: { kind: "pending", channelId: "@canonical", query: 2 },
    })
    // The timer scheduled under version 1 no longer matches.
    const fired = reduce(state, timer(1, 4))
    expect(fired.actions).toEqual([])
    expect(viewOf(fired.state)).toBe("masked")
    // The last render is the masked one.
    const renders = actions.filter((a) => a.kind === "render")
    const last = renders.at(-1)
    expect(last?.kind === "render" && last.model.dataBoyo).toBe("0")

    // B's verdict is false: the card stays masked.
    const denied = reduce(
      state,
      answer(false, { query: 2, channelId: CANONICAL, t: 5 })
    )
    expect(viewOf(denied.state)).toBe("masked")
  })

  it("leaves a view the user climbed to alone when the channel changes (Entry-4)", () => {
    const { state } = fold([
      started,
      seenA,
      click(2),
      seen(3, { channelId: CANONICAL }),
    ])
    expect(viewOf(state)).toBe("meta")
  })

  it("tells two lookups for the same channel apart — A, then B, then A again", () => {
    const { state, actions } = fold([
      started,
      seenA,
      seen(2, { channelId: CANONICAL }),
      seen(3, { channelId: CHAN }),
    ])
    expect(state.cards.get(K)?.channel).toMatchObject({
      kind: "pending",
      channelId: "@chan",
      query: 3,
    })
    expect(
      actions.flatMap((a) => (a.kind === "query-whitelist" ? [a.query] : []))
    ).toEqual([1, 2, 3])

    // The first lookup for A settles now, whitelisted — it answers an
    // earlier question, not the open one.
    const first = reduce(state, answer(true, { t: 4 }))
    expect(kinds(first.actions)).toEqual(["record:stale.discarded"])
    expect(viewOf(first.state)).toBe("masked")

    const current = reduce(first.state, answer(false, { query: 3, t: 5 }))
    expect(current.state.cards.get(K)?.channel).toEqual({
      kind: "known",
      channelId: "@chan",
      whitelisted: false,
    })
  })

  it("remasks a card the whitelist's timer had already revealed, when the channel changes", () => {
    const { state } = fold([started, seenA, answer(true), timer(1, 3)])
    expect(state.cards.get(K)).toMatchObject({
      view: { kind: "revealed" },
      autoRevealed: true,
    })

    const changed = reduce(state, seen(4, { channelId: CANONICAL }))
    expect(viewOf(changed.state)).toBe("masked")
    expect(changed.state.cards.get(K)?.autoRevealed).toBe(false)

    const denied = reduce(
      changed.state,
      answer(false, { query: 2, channelId: CANONICAL, t: 5 })
    )
    expect(viewOf(denied.state)).toBe("masked")
  })

  it("never takes back a reveal the user made (Entry-4)", () => {
    const { state } = fold([
      started,
      seenA,
      dblclick(2),
      seen(3, { channelId: CANONICAL }),
    ])
    expect(viewOf(state)).toBe("revealed")
    expect(state.cards.get(K)?.autoRevealed).toBe(false)
  })

  it("a gesture after an automatic reveal makes the exposure the user's", () => {
    const { state } = fold([
      started,
      seenA,
      answer(true),
      timer(1, 3),
      dblclick(4),
      seen(5, { channelId: CANONICAL }),
    ])
    // The double click is the user's own reveal of a card the whitelist had
    // exposed: from then on the exposure is theirs, and a channel change
    // does not take it back (Entry-4).
    expect(state.cards.get(K)?.autoRevealed).toBe(false)
    expect(viewOf(state)).toBe("revealed")
  })

  it("records a late date even when the same observation remasks the card", () => {
    const { actions } = fold([
      started,
      seen(1, { uploadDate: null }),
      answer(true),
      seen(3, { channelId: CANONICAL, uploadDate: "2 weeks ago" }),
    ])
    expect(dateFacts(actions)).toEqual([null, "2 weeks ago"])
    const last = actions.at(-1)
    expect(last?.kind === "record" && last.fact.kind).toBe("entry.state")
    expect(kinds(actions).slice(-3)).toEqual([
      "record:date.observed",
      "render",
      "record:entry.state",
    ])
  })
})

describe("a title transform in flight when the channel changes", () => {
  it("retires the transform asked under the old channel and asks again under the new one", () => {
    const base = fold(toTitle)
    expect(base.state.cards.get(K)).toMatchObject({
      version: 2,
      view: { kind: "title" },
    })

    const changed = reduce(base.state, seen(4, { channelId: CANONICAL }))
    expect(changed.state.cards.get(K)).toMatchObject({
      version: 3,
      view: {
        kind: "title",
        title: { text: "Title of vid_a", translated: false },
      },
      autoRevealed: false,
    })
    const asked = changed.actions.filter((a) => a.kind === "transform-title")
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({
      version: 3,
      channelId: "@canonical",
      text: "Title of vid_a",
    })

    // The answer computed under the old channel arrives now.
    const stale = reduce(
      changed.state,
      transformed(2, "translated for @chan", 5)
    )
    expect(kinds(stale.actions)).toEqual(["record:stale.discarded"])

    const fresh = reduce(
      stale.state,
      transformed(3, "translated for @canonical", 6)
    )
    const card = fresh.state.cards.get(K)
    expect(card?.view.kind === "title" && card.view.title.text).toBe(
      "translated for @canonical"
    )
  })

  it("re-issues the title step even when the old channel's hook answered with an empty string", () => {
    const base = fold([...toTitle, transformed(2, "", 4)])
    const shown = base.state.cards.get(K)
    expect(shown?.view.kind === "title" && shown.view.title.text).toBe("")

    const changed = reduce(base.state, seen(5, { channelId: CANONICAL }))
    expect(changed.state.cards.get(K)).toMatchObject({
      version: 3,
      view: {
        kind: "title",
        title: { text: "Title of vid_a", translated: false },
      },
    })
    expect(
      changed.actions.filter((a) => a.kind === "transform-title")
    ).toHaveLength(1)
  })
})

describe("whitelisting", () => {
  it("tints a masked card whose channel turns out whitelisted, then reveals it on the timer", () => {
    const { state, actions } = fold([started, seenA, answer(true)])
    expect(viewOf(state)).toBe("whitelisted")
    expect(state.cards.get(K)?.channel).toEqual({
      kind: "known",
      channelId: "@chan",
      whitelisted: true,
    })
    const schedule = actions.find((a) => a.kind === "schedule")
    expect(schedule).toMatchObject({
      key: K,
      generation: 0,
      version: 1,
      delayMs: WHITELIST_REVEAL_DELAY_MS,
    })

    const fired = reduce(state, timer(1, 3))
    expect(viewOf(fired.state)).toBe("revealed")
  })

  it("leaves a not-whitelisted card masked, and records the verdict", () => {
    const { state, actions } = fold([started, seenA, answer(false)])
    expect(viewOf(state)).toBe("masked")
    expect(state.cards.get(K)?.channel).toEqual({
      kind: "known",
      channelId: "@chan",
      whitelisted: false,
    })
    expect(kinds(actions).at(-1), "re-rendered so custody is re-derived").toBe(
      "render"
    )
  })

  it("does not yank a card the user has already progressed (Entry-4)", () => {
    const { state } = fold([started, seenA, click(2), answer(true)])
    expect(viewOf(state)).toBe("meta")
    expect(state.cards.get(K)?.channel).toMatchObject({ whitelisted: true })
  })

  it("discards an answer for a question no longer open (R4)", () => {
    const base = fold([started, seenA, answer(false)])
    const again = reduce(base.state, answer(true))
    expect(viewOf(again.state), "already answered").toBe("masked")
    expect(kinds(again.actions)).toEqual(["record:stale.discarded"])

    const other = reduce(
      fold([started, seenA]).state,
      answer(true, { channelId: asChannelId("@someone-else") })
    )
    expect(viewOf(other.state), "a different channel's answer").toBe("masked")
  })

  it("ignores a timer whose version has moved on", () => {
    const base = fold([started, seenA, answer(true)])
    const clicked = reduce(base.state, dblclick(3))
    const fired = reduce(clicked.state, timer(1, 4))
    expect(fired.actions).toEqual([])
    expect(viewOf(fired.state)).toBe("revealed")
  })

  it("persists a request and fans it out to every card of that channel", () => {
    const { state, actions } = fold([
      started,
      seenA,
      seen(2, {}, "vid_b"),
      { kind: "whitelist-request", key: K, t: 3 },
    ])
    expect(actions.find((a) => a.kind === "persist-whitelist")).toEqual({
      kind: "persist-whitelist",
      channelId: "@chan",
      channelName: "Chan",
    })
    expect(viewOf(state, K)).toBe("whitelisted")
    expect(viewOf(state, K2)).toBe("whitelisted")
  })

  it("does nothing for a request on a card with no channel", () => {
    const { state, actions } = fold([
      started,
      seen(1, { channelId: null }),
      { kind: "whitelist-request", key: K, t: 2 },
    ])
    expect(viewOf(state)).toBe("masked")
    expect(actions.find((a) => a.kind === "persist-whitelist")).toBeUndefined()
  })

  it("applies a broadcast from another tab the same way", () => {
    const { state } = fold([
      started,
      seenA,
      { kind: "whitelist-broadcast", channelId: CHAN, t: 2 },
    ])
    expect(viewOf(state)).toBe("whitelisted")
  })
})

describe("advance-all-to-title", () => {
  it("is pointwise the single legal transition, restricted to cards below title", () => {
    const K3 = cardKey(asVideoId("vid_c"))
    const setup: Array<CoreEvent> = [
      started,
      seenA,
      seen(2, {}, "vid_b"),
      click(3, K2),
      seen(4, {}, "vid_c"),
      dblclick(5, K3),
    ]
    const before = fold(setup)
    const bulk = reduce(before.state, {
      kind: "command",
      command: "advance-all-to-title",
      t: 6,
    })

    // The same cards, each advanced on its own by the singular path.
    const singly = fold([...setup, click(7), click(8), click(9, K2)])
    for (const key of before.state.cards.keys()) {
      expect(bulk.state.cards.get(key)?.view, key).toEqual(
        singly.state.cards.get(key)?.view
      )
    }
    expect(
      bulk.actions.find(
        (a) => a.kind === "record" && a.fact.kind === "bulk.advance"
      )
    ).toMatchObject({
      fact: { advanced: 2, alreadyPast: 1, channelPending: 3 },
    })
  })
})

describe("async correlation across incarnations (R4)", () => {
  it("gives every adoption of a key its own generation, never reset by gone or nav", () => {
    const { state, actions } = fold([
      started,
      seenA,
      gone(2),
      seen(3),
      nav(2, 4),
      seen(5),
    ])
    expect(state.cards.get(K)?.generation).toBe(2)
    expect(state.nextGeneration).toBe(3)
    expect(
      actions.flatMap((a) =>
        a.kind === "query-whitelist" ? [a.generation] : []
      )
    ).toEqual([0, 1, 2])
  })

  it("discards a whitelist answer from the incarnation that asked before this one, and takes the current one's", () => {
    // Card seen, gone, and seen again before the first lookup settled: both
    // lookups name the same key and channel. Only the generation tells them
    // apart — and the old answer may be wrong (a failed request, a changed
    // membership) for the card now on the page.
    const base = fold([started, seenA, gone(2), seen(3)])
    expect(base.state.cards.get(K)?.channel).toMatchObject({ kind: "pending" })

    const oldAnswer = reduce(base.state, answer(true, { t: 4 }))
    expect(kinds(oldAnswer.actions)).toEqual(["record:stale.discarded"])
    expect(oldAnswer.state.cards.get(K)?.channel, "still open").toMatchObject({
      kind: "pending",
    })
    expect(viewOf(oldAnswer.state)).toBe("masked")

    const newAnswer = reduce(
      oldAnswer.state,
      answer(false, { generation: 1, t: 5 })
    )
    expect(newAnswer.state.cards.get(K)?.channel).toEqual({
      kind: "known",
      channelId: "@chan",
      whitelisted: false,
    })
    expect(viewOf(newAnswer.state)).toBe("masked")
  })

  it("discards a title transform from a previous incarnation even when the version matches", () => {
    // Version 2 reached twice: once before the navigation, once after.
    const { state } = fold([
      started,
      seenA,
      click(2),
      click(3),
      nav(2, 4),
      seen(5),
      click(6),
      click(7),
    ])
    expect(state.cards.get(K)).toMatchObject({ generation: 1, version: 2 })

    const stale = reduce(state, transformed(2, "from before the navigation", 8))
    expect(stale.state).toBe(state)
    expect(kinds(stale.actions)).toEqual(["record:stale.discarded"])

    const current = reduce(
      state,
      transformed(2, "for this card", 8, { generation: 1 })
    )
    const card = current.state.cards.get(K)
    expect(card?.view.kind === "title" && card.view.title.text).toBe(
      "for this card"
    )
  })

  it("ignores a reveal timer from a previous incarnation even when the version matches", () => {
    // Whitelisted (version 1) twice: before and after the navigation.
    const { state } = fold([
      started,
      seenA,
      answer(true),
      nav(2, 3),
      seen(4),
      answer(true, { generation: 1, t: 5 }),
    ])
    expect(state.cards.get(K)).toMatchObject({
      generation: 1,
      version: 1,
      view: { kind: "whitelisted" },
    })

    const old = reduce(state, timer(1, 6))
    expect(old.actions).toEqual([])
    expect(viewOf(old.state)).toBe("whitelisted")

    const current = reduce(state, timer(1, 6, 1))
    expect(viewOf(current.state)).toBe("revealed")
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
