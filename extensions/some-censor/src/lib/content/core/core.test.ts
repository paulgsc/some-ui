// @vitest-environment node
/**
 * The Core reducer (BC3, #1436), run under vitest's *node* environment on
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

const K = cardKey(asVideoId("vid_a"))
const K2 = cardKey(asVideoId("vid_b"))

const started: CoreEvent = { kind: "start", session: session(1), t: 0 }
const seenA: CoreEvent = {
  kind: "observed",
  key: K,
  observation: observation("vid_a"),
  t: 1,
}

function kinds(actions: ReadonlyArray<Action>): Array<string> {
  return actions.map((a) =>
    a.kind === "record" ? `record:${a.fact.kind}` : a.kind
  )
}

function viewOf(state: CoreState, key = K): string | undefined {
  return state.cards.get(key)?.view.kind
}

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
    {
      kind: "observed",
      key: K2,
      observation: observation("vid_b", { channelId: null, channelName: null }),
      t: 2,
    },
    {
      kind: "whitelist-answer",
      key: K,
      generation: 0,
      query: 1,
      channelId: asChannelId("@chan"),
      whitelisted: false,
      t: 3,
    },
    { kind: "gesture", key: K, gesture: "click", t: 4 },
    { kind: "gesture", key: K, gesture: "click", t: 5 },
    {
      kind: "title-transformed",
      key: K,
      generation: 0,
      version: 2,
      text: "Translated",
      translated: true,
      t: 6,
    },
    { kind: "observed", key: K2, observation: observation("vid_b"), t: 7 },
    {
      kind: "whitelist-answer",
      key: K2,
      generation: 1,
      query: 1,
      channelId: asChannelId("@chan"),
      whitelisted: true,
      t: 8,
    },
    { kind: "timer", key: K2, generation: 1, version: 1, t: 9 },
    {
      kind: "unknown-shape",
      tag: "yt-lockup-view-model",
      surface: "search",
      reason: "tag-unseen",
      t: 10,
    },
    { kind: "command", command: "advance-all-to-title", t: 11 },
    { kind: "nav", session: session(2), t: 12 },
    seenA,
    { kind: "gesture", key: K, gesture: "dblclick", t: 14 },
    { kind: "gone", key: K, t: 15 },
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
    const { state, actions } = fold([
      seenA,
      { kind: "gesture", key: K, gesture: "click", t: 1 },
    ])
    expect(state.cards.size).toBe(0)
    expect(actions).toEqual([])
  })

  it("adopts the shell's session on start and again on navigation", () => {
    const { state } = fold([started])
    expect(state.phase).toBe("running")
    expect(state.session).toBe(session(1))
    const after = fold([
      started,
      seenA,
      { kind: "nav", session: session(2), t: 5 },
    ])
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
    const { state, actions } = fold([
      started,
      {
        kind: "observed",
        key: K,
        observation: observation("vid_a", { channelId: null }),
        t: 1,
      },
    ])
    expect(state.cards.get(K)?.channel).toEqual({ kind: "unknown" })
    expect(kinds(actions)).toContain("record:mount.provisional")
    expect(kinds(actions)).not.toContain("query-whitelist")
  })

  it("backfills the channel on a later observation, once", () => {
    const { state, actions } = fold([
      started,
      {
        kind: "observed",
        key: K,
        observation: observation("vid_a", { channelId: null }),
        t: 1,
      },
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
      {
        kind: "observed",
        key: K,
        observation: observation("vid_a", { title: null, duration: null }),
        t: 2,
      },
    ])
    expect(state.cards.get(K)?.observation.title).toBe("Title of vid_a")
    expect(state.cards.get(K)?.observation.duration).toBe("1:23")
  })

  it("treats an unknown shape as a card, and counts it (B4)", () => {
    const { state, actions } = fold([
      started,
      {
        kind: "observed",
        key: K,
        observation: observation("vid_a", { shape: "unknown" }),
        t: 1,
      },
      {
        kind: "unknown-shape",
        tag: "yt-lockup-view-model",
        surface: "search",
        reason: "tag-unseen",
        t: 2,
      },
      {
        kind: "unknown-shape",
        tag: "yt-lockup-view-model",
        surface: "search",
        reason: "tag-unseen",
        t: 3,
      },
    ])
    expect(viewOf(state), "still masked, like every card").toBe("masked")
    expect(state.unknownShapes).toMatchObject({ degraded: 1, "tag-unseen": 2 })
    expect(
      kinds(actions).filter((k) => k === "record:shape.unknown")
    ).toHaveLength(3)
    const nav = reduce(state, { kind: "nav", session: session(2), t: 4 })
    expect(nav.state.unknownShapes.degraded, "per session").toBe(0)
  })

  it("forgets a card that is gone", () => {
    const { state, actions } = fold([
      started,
      seenA,
      { kind: "gone", key: K, t: 2 },
    ])
    expect(state.cards.size).toBe(0)
    expect(actions.at(-1)).toEqual({ kind: "unmount", key: K })
    expect(
      reduce(state, { kind: "gone", key: K, t: 3 }).actions,
      "idempotent"
    ).toEqual([])
  })
})

describe("the disclosure ladder", () => {
  it("climbs masked → meta → title on single clicks, with the observed evidence", () => {
    const one = fold([
      started,
      seenA,
      { kind: "gesture", key: K, gesture: "click", t: 2 },
    ])
    expect(viewOf(one.state)).toBe("meta")
    const two = fold([
      started,
      seenA,
      { kind: "gesture", key: K, gesture: "click", t: 2 },
      { kind: "gesture", key: K, gesture: "click", t: 3 },
    ])
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
    const three = reduce(two.state, {
      kind: "gesture",
      key: K,
      gesture: "click",
      t: 4,
    })
    expect(three.actions, "a click at title is nothing").toEqual([])
  })

  it("reveals on a double click from any state (parity; #1385 narrows this)", () => {
    for (const prior of [0, 1, 2]) {
      const clicks: Array<CoreEvent> = Array.from(
        { length: prior },
        (_, i) => ({
          kind: "gesture",
          key: K,
          gesture: "click",
          t: 2 + i,
        })
      )
      const { state, actions } = fold([
        started,
        seenA,
        ...clicks,
        { kind: "gesture", key: K, gesture: "dblclick", t: 9 },
      ])
      expect(viewOf(state), `after ${prior} click(s)`).toBe("revealed")
      const last = actions.filter((a) => a.kind === "render").at(-1)
      expect(last?.kind === "render" && last.model.removeVeil).toBe(true)
    }
  })

  it("applies a title transform only to the version that asked for it (R4)", () => {
    const base = fold([
      started,
      seenA,
      { kind: "gesture", key: K, gesture: "click", t: 2 },
      { kind: "gesture", key: K, gesture: "click", t: 3 },
    ])
    const right = reduce(base.state, {
      kind: "title-transformed",
      key: K,
      generation: 0,
      version: 2,
      text: "Übersetzt",
      translated: true,
      t: 4,
    })
    const card = right.state.cards.get(K)
    expect(card?.view.kind === "title" && card.view.title).toEqual({
      text: "Übersetzt",
      translated: true,
    })

    const stale = reduce(base.state, {
      kind: "title-transformed",
      key: K,
      generation: 0,
      version: 1,
      text: "old",
      translated: true,
      t: 4,
    })
    expect(stale.state).toBe(base.state)
    expect(kinds(stale.actions)).toEqual(["record:stale.discarded"])

    const moved = fold([
      started,
      seenA,
      { kind: "gesture", key: K, gesture: "click", t: 2 },
      { kind: "gesture", key: K, gesture: "click", t: 3 },
      { kind: "gesture", key: K, gesture: "dblclick", t: 4 },
    ])
    const late = reduce(moved.state, {
      kind: "title-transformed",
      key: K,
      generation: 0,
      version: 2,
      text: "late",
      translated: true,
      t: 5,
    })
    expect(
      viewOf(late.state),
      "a revealed card is not dragged back to title"
    ).toBe("revealed")
  })
})

describe("a channel that changes on re-observation (#1506's own review)", () => {
  const canonical = asChannelId("@canonical")
  const seenCanonical: CoreEvent = {
    kind: "observed",
    key: K,
    observation: observation("vid_a", { channelId: canonical }),
    t: 2,
  }

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
    const old = reduce(state, {
      kind: "whitelist-answer",
      key: K,
      generation: 0,
      query: 1,
      channelId: asChannelId("@chan"),
      whitelisted: true,
      t: 3,
    })
    expect(kinds(old.actions)).toEqual(["record:stale.discarded"])
    expect(viewOf(old.state)).toBe("masked")

    const fresh = reduce(old.state, {
      kind: "whitelist-answer",
      key: K,
      generation: 0,
      query: 2,
      channelId: canonical,
      whitelisted: true,
      t: 4,
    })
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
      {
        kind: "whitelist-answer",
        key: K,
        generation: 0,
        query: 1,
        channelId: asChannelId("@chan"),
        whitelisted: false,
        t: 2,
      },
      { kind: "gesture", key: K, gesture: "click", t: 3 },
      { ...seenCanonical, t: 4 },
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
      {
        kind: "observed",
        key: K,
        observation: observation("vid_a", { channelId: null }),
        t: 3,
      },
    ])
    expect(actions.filter((a) => a.kind === "query-whitelist")).toHaveLength(1)
  })
})

describe("re-opening a lookup (#1506's own review, round 4)", () => {
  const canonical = asChannelId("@canonical")
  const seenAs = (
    channelId: ReturnType<typeof asChannelId>,
    t: number
  ): CoreEvent => ({
    kind: "observed",
    key: K,
    observation: observation("vid_a", { channelId }),
    t,
  })
  const answer = (
    channelId: ReturnType<typeof asChannelId>,
    query: number,
    whitelisted: boolean,
    t: number
  ): CoreEvent => ({
    kind: "whitelist-answer",
    key: K,
    generation: 0,
    query,
    channelId,
    whitelisted,
    t,
  })

  it("remasks a card whose whitelisted view was earned by the channel it no longer has, and retires that reveal timer", () => {
    const { state, actions } = fold([
      started,
      seenA,
      answer(asChannelId("@chan"), 1, true, 2),
      seenAs(canonical, 3),
    ])
    expect(viewOf(state)).toBe("masked")
    expect(state.cards.get(K)).toMatchObject({
      version: 2,
      channel: { kind: "pending", channelId: "@canonical", query: 2 },
    })
    // The timer scheduled under version 1 no longer matches.
    const fired = reduce(state, {
      kind: "timer",
      key: K,
      generation: 0,
      version: 1,
      t: 4,
    })
    expect(fired.actions).toEqual([])
    expect(viewOf(fired.state)).toBe("masked")
    // The last render is the masked one.
    const renders = actions.filter((a) => a.kind === "render")
    const last = renders.at(-1)
    expect(last?.kind === "render" && last.model.dataBoyo).toBe("0")

    // B's verdict is false: the card stays masked.
    const denied = reduce(state, answer(canonical, 2, false, 5))
    expect(viewOf(denied.state)).toBe("masked")
  })

  it("leaves a view the user climbed to alone when the channel changes (Entry-4)", () => {
    const { state } = fold([
      started,
      seenA,
      { kind: "gesture", key: K, gesture: "click", t: 2 },
      seenAs(canonical, 3),
    ])
    expect(viewOf(state)).toBe("meta")
  })

  it("tells two lookups for the same channel apart — A, then B, then A again", () => {
    const { state, actions } = fold([
      started,
      seenA,
      seenAs(canonical, 2),
      seenAs(asChannelId("@chan"), 3),
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
    const first = reduce(state, answer(asChannelId("@chan"), 1, true, 4))
    expect(kinds(first.actions)).toEqual(["record:stale.discarded"])
    expect(viewOf(first.state)).toBe("masked")

    const current = reduce(
      first.state,
      answer(asChannelId("@chan"), 3, false, 5)
    )
    expect(current.state.cards.get(K)?.channel).toEqual({
      kind: "known",
      channelId: "@chan",
      whitelisted: false,
    })
  })
})

describe("re-opening a lookup, round 5 (#1506's own review)", () => {
  const canonical = asChannelId("@canonical")
  const seenAs = (
    channelId: ReturnType<typeof asChannelId>,
    t: number,
    uploadDate: string | null = "3 days ago"
  ): CoreEvent => ({
    kind: "observed",
    key: K,
    observation: observation("vid_a", { channelId, uploadDate }),
    t,
  })
  const whitelistedA: CoreEvent = {
    kind: "whitelist-answer",
    key: K,
    generation: 0,
    query: 1,
    channelId: asChannelId("@chan"),
    whitelisted: true,
    t: 2,
  }

  it("remasks a card the whitelist's timer had already revealed, when the channel changes", () => {
    const { state } = fold([
      started,
      seenA,
      whitelistedA,
      { kind: "timer", key: K, generation: 0, version: 1, t: 3 },
    ])
    expect(state.cards.get(K)).toMatchObject({
      view: { kind: "revealed" },
      autoRevealed: true,
    })

    const changed = reduce(state, seenAs(canonical, 4))
    expect(viewOf(changed.state)).toBe("masked")
    expect(changed.state.cards.get(K)?.autoRevealed).toBe(false)

    const denied = reduce(changed.state, {
      kind: "whitelist-answer",
      key: K,
      generation: 0,
      query: 2,
      channelId: canonical,
      whitelisted: false,
      t: 5,
    })
    expect(viewOf(denied.state)).toBe("masked")
  })

  it("never takes back a reveal the user made (Entry-4)", () => {
    const { state } = fold([
      started,
      seenA,
      { kind: "gesture", key: K, gesture: "dblclick", t: 2 },
      seenAs(canonical, 3),
    ])
    expect(viewOf(state)).toBe("revealed")
    expect(state.cards.get(K)?.autoRevealed).toBe(false)
  })

  it("a gesture after an automatic reveal makes the exposure the user's", () => {
    const { state } = fold([
      started,
      seenA,
      whitelistedA,
      { kind: "timer", key: K, generation: 0, version: 1, t: 3 },
      { kind: "gesture", key: K, gesture: "dblclick", t: 4 },
      seenAs(canonical, 5),
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
      { ...seenA, observation: observation("vid_a", { uploadDate: null }) },
      whitelistedA,
      seenAs(canonical, 3, "2 weeks ago"),
    ])
    const dates = actions.flatMap((a) =>
      a.kind === "record" && a.fact.kind === "date.observed" ? [a.fact.raw] : []
    )
    expect(dates).toEqual([null, "2 weeks ago"])
    const last = actions.at(-1)
    expect(last?.kind === "record" && last.fact.kind).toBe("entry.state")
    expect(kinds(actions).slice(-3)).toEqual([
      "record:date.observed",
      "render",
      "record:entry.state",
    ])
  })
})

describe("a title transform in flight when the channel changes (#1506's own review, round 6)", () => {
  const canonical = asChannelId("@canonical")

  it("retires the transform asked under the old channel and asks again under the new one", () => {
    const base = fold([
      started,
      seenA,
      { kind: "gesture", key: K, gesture: "click", t: 2 },
      { kind: "gesture", key: K, gesture: "click", t: 3 },
    ])
    expect(base.state.cards.get(K)).toMatchObject({
      version: 2,
      view: { kind: "title" },
    })

    const changed = reduce(base.state, {
      kind: "observed",
      key: K,
      observation: observation("vid_a", { channelId: canonical }),
      t: 4,
    })
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
    const stale = reduce(changed.state, {
      kind: "title-transformed",
      key: K,
      generation: 0,
      version: 2,
      text: "translated for @chan",
      translated: true,
      t: 5,
    })
    expect(kinds(stale.actions)).toEqual(["record:stale.discarded"])

    const fresh = reduce(stale.state, {
      kind: "title-transformed",
      key: K,
      generation: 0,
      version: 3,
      text: "translated for @canonical",
      translated: true,
      t: 6,
    })
    const card = fresh.state.cards.get(K)
    expect(card?.view.kind === "title" && card.view.title.text).toBe(
      "translated for @canonical"
    )
  })
})

describe("an empty transform result is as stale as any other (#1506's own review, round 7)", () => {
  it("re-issues the title step even when the old channel's hook answered with an empty string", () => {
    const base = fold([
      started,
      seenA,
      { kind: "gesture", key: K, gesture: "click", t: 2 },
      { kind: "gesture", key: K, gesture: "click", t: 3 },
      {
        kind: "title-transformed",
        key: K,
        generation: 0,
        version: 2,
        text: "",
        translated: true,
        t: 4,
      },
    ])
    const shown = base.state.cards.get(K)
    expect(shown?.view.kind === "title" && shown.view.title.text).toBe("")

    const changed = reduce(base.state, {
      kind: "observed",
      key: K,
      observation: observation("vid_a", {
        channelId: asChannelId("@canonical"),
      }),
      t: 5,
    })
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

describe("a title transform's fallback (#1506's own review)", () => {
  it("keeps the title untranslated when the hook handed the original back", () => {
    const base = fold([
      started,
      seenA,
      { kind: "gesture", key: K, gesture: "click", t: 2 },
      { kind: "gesture", key: K, gesture: "click", t: 3 },
    ])
    const fallback = reduce(base.state, {
      kind: "title-transformed",
      key: K,
      generation: 0,
      version: 2,
      text: "Title of vid_a",
      translated: false,
      t: 4,
    })
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

describe("whitelisting", () => {
  const answered = (whitelisted: boolean, generation = 0): CoreEvent => ({
    kind: "whitelist-answer",
    key: K,
    generation,
    query: 1,
    channelId: asChannelId("@chan"),
    whitelisted,
    t: 2,
  })

  it("tints a masked card whose channel turns out whitelisted, then reveals it on the timer", () => {
    const { state, actions } = fold([started, seenA, answered(true)])
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

    const fired = reduce(state, {
      kind: "timer",
      key: K,
      generation: 0,
      version: 1,
      t: 3,
    })
    expect(viewOf(fired.state)).toBe("revealed")
  })

  it("leaves a not-whitelisted card masked, and records the verdict", () => {
    const { state, actions } = fold([started, seenA, answered(false)])
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
    const { state } = fold([
      started,
      seenA,
      { kind: "gesture", key: K, gesture: "click", t: 2 },
      answered(true),
    ])
    expect(viewOf(state)).toBe("meta")
    expect(state.cards.get(K)?.channel).toMatchObject({ whitelisted: true })
  })

  it("discards an answer for a question no longer open (R4)", () => {
    const base = fold([started, seenA, answered(false)])
    const again = reduce(base.state, answered(true))
    expect(viewOf(again.state), "already answered").toBe("masked")
    expect(kinds(again.actions)).toEqual(["record:stale.discarded"])

    const other = reduce(fold([started, seenA]).state, {
      kind: "whitelist-answer",
      key: K,
      generation: 0,
      query: 1,
      channelId: asChannelId("@someone-else"),
      whitelisted: true,
      t: 2,
    })
    expect(viewOf(other.state), "a different channel's answer").toBe("masked")
  })

  it("ignores a timer whose version has moved on", () => {
    const base = fold([started, seenA, answered(true)])
    const clicked = reduce(base.state, {
      kind: "gesture",
      key: K,
      gesture: "dblclick",
      t: 3,
    })
    const fired = reduce(clicked.state, {
      kind: "timer",
      key: K,
      generation: 0,
      version: 1,
      t: 4,
    })
    expect(fired.actions).toEqual([])
    expect(viewOf(fired.state)).toBe("revealed")
  })

  it("persists a request and fans it out to every card of that channel", () => {
    const { state, actions } = fold([
      started,
      seenA,
      { kind: "observed", key: K2, observation: observation("vid_b"), t: 2 },
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
      {
        kind: "observed",
        key: K,
        observation: observation("vid_a", { channelId: null }),
        t: 1,
      },
      { kind: "whitelist-request", key: K, t: 2 },
    ])
    expect(viewOf(state)).toBe("masked")
    expect(actions.find((a) => a.kind === "persist-whitelist")).toBeUndefined()
  })

  it("applies a broadcast from another tab the same way", () => {
    const { state } = fold([
      started,
      seenA,
      { kind: "whitelist-broadcast", channelId: asChannelId("@chan"), t: 2 },
    ])
    expect(viewOf(state)).toBe("whitelisted")
  })
})

describe("advance-all-to-title", () => {
  it("is pointwise the single legal transition, restricted to cards below title", () => {
    const setup: Array<CoreEvent> = [
      started,
      seenA,
      { kind: "observed", key: K2, observation: observation("vid_b"), t: 2 },
      { kind: "gesture", key: K2, gesture: "click", t: 3 },
      {
        kind: "observed",
        key: cardKey(asVideoId("vid_c")),
        observation: observation("vid_c"),
        t: 4,
      },
      {
        kind: "gesture",
        key: cardKey(asVideoId("vid_c")),
        gesture: "dblclick",
        t: 5,
      },
    ]
    const before = fold(setup)
    const bulk = reduce(before.state, {
      kind: "command",
      command: "advance-all-to-title",
      t: 6,
    })

    // The same cards, each advanced on its own by the singular path.
    const singly = fold([
      ...setup,
      { kind: "gesture", key: K, gesture: "click", t: 7 },
      { kind: "gesture", key: K, gesture: "click", t: 8 },
      { kind: "gesture", key: K2, gesture: "click", t: 9 },
    ])
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

describe("async correlation across incarnations (R4, #1506's own review)", () => {
  const goneA: CoreEvent = { kind: "gone", key: K, t: 2 }
  const seenAgain: CoreEvent = { ...seenA, t: 3 }

  it("gives every adoption of a key its own generation, never reset by gone or nav", () => {
    const { state, actions } = fold([
      started,
      seenA,
      goneA,
      seenAgain,
      { kind: "nav", session: session(2), t: 4 },
      { ...seenA, t: 5 },
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
    const base = fold([started, seenA, goneA, seenAgain])
    expect(base.state.cards.get(K)?.channel).toMatchObject({ kind: "pending" })

    const oldAnswer = reduce(base.state, {
      kind: "whitelist-answer",
      key: K,
      generation: 0,
      query: 1,
      channelId: asChannelId("@chan"),
      whitelisted: true,
      t: 4,
    })
    expect(kinds(oldAnswer.actions)).toEqual(["record:stale.discarded"])
    expect(oldAnswer.state.cards.get(K)?.channel, "still open").toMatchObject({
      kind: "pending",
    })
    expect(viewOf(oldAnswer.state)).toBe("masked")

    const newAnswer = reduce(oldAnswer.state, {
      kind: "whitelist-answer",
      key: K,
      generation: 1,
      query: 1,
      channelId: asChannelId("@chan"),
      whitelisted: false,
      t: 5,
    })
    expect(newAnswer.state.cards.get(K)?.channel).toEqual({
      kind: "known",
      channelId: "@chan",
      whitelisted: false,
    })
    expect(viewOf(newAnswer.state)).toBe("masked")
  })

  it("discards a title transform from a previous incarnation even when the version matches", () => {
    const climb = (t: number): Array<CoreEvent> => [
      { kind: "gesture", key: K, gesture: "click", t },
      { kind: "gesture", key: K, gesture: "click", t: t + 1 },
    ]
    // Version 2 reached twice: once before the navigation, once after.
    const { state } = fold([
      started,
      seenA,
      ...climb(2),
      { kind: "nav", session: session(2), t: 4 },
      { ...seenA, t: 5 },
      ...climb(6),
    ])
    expect(state.cards.get(K)).toMatchObject({ generation: 1, version: 2 })

    const stale = reduce(state, {
      kind: "title-transformed",
      key: K,
      generation: 0,
      version: 2,
      text: "from before the navigation",
      translated: true,
      t: 8,
    })
    expect(stale.state).toBe(state)
    expect(kinds(stale.actions)).toEqual(["record:stale.discarded"])

    const current = reduce(state, {
      kind: "title-transformed",
      key: K,
      generation: 1,
      version: 2,
      text: "for this card",
      translated: true,
      t: 8,
    })
    const card = current.state.cards.get(K)
    expect(card?.view.kind === "title" && card.view.title.text).toBe(
      "for this card"
    )
  })

  it("ignores a reveal timer from a previous incarnation even when the version matches", () => {
    const answer = (generation: number, t: number): CoreEvent => ({
      kind: "whitelist-answer",
      key: K,
      generation,
      query: 1,
      channelId: asChannelId("@chan"),
      whitelisted: true,
      t,
    })
    // Whitelisted (version 1) twice: before and after the navigation.
    const { state } = fold([
      started,
      seenA,
      answer(0, 2),
      { kind: "nav", session: session(2), t: 3 },
      { ...seenA, t: 4 },
      answer(1, 5),
    ])
    expect(state.cards.get(K)).toMatchObject({
      generation: 1,
      version: 1,
      view: { kind: "whitelisted" },
    })

    const old = reduce(state, {
      kind: "timer",
      key: K,
      generation: 0,
      version: 1,
      t: 6,
    })
    expect(old.actions).toEqual([])
    expect(viewOf(old.state)).toBe("whitelisted")

    const current = reduce(state, {
      kind: "timer",
      key: K,
      generation: 1,
      version: 1,
      t: 6,
    })
    expect(viewOf(current.state)).toBe("revealed")
  })
})

describe("the date corpus (#1395, #1506's own review)", () => {
  const dateFacts = (actions: ReadonlyArray<Action>): Array<string | null> =>
    actions.flatMap((a) =>
      a.kind === "record" && a.fact.kind === "date.observed" ? [a.fact.raw] : []
    )

  it("records a date that arrives on a later observation — YouTube hydrates it after the card", () => {
    const undated: CoreEvent = {
      kind: "observed",
      key: K,
      observation: observation("vid_a", { uploadDate: null }),
      t: 1,
    }
    const { actions } = fold([
      started,
      undated,
      { ...seenA, t: 2 },
      { ...seenA, t: 3 },
    ])
    // Once at adoption (nothing yet), once when the form appears, and not
    // again for a repeat of the same form.
    expect(dateFacts(actions)).toEqual([null, "3 days ago"])
  })

  it("records a changed date form, but never a repeat", () => {
    const { actions } = fold([
      started,
      seenA,
      { ...seenA, t: 2 },
      {
        kind: "observed",
        key: K,
        observation: observation("vid_a", { uploadDate: "4 days ago" }),
        t: 3,
      },
      // A later observation that lost the field keeps the merged value and
      // records nothing new.
      {
        kind: "observed",
        key: K,
        observation: observation("vid_a", { uploadDate: null }),
        t: 4,
      },
    ])
    expect(dateFacts(actions)).toEqual(["3 days ago", "4 days ago"])
  })
})
