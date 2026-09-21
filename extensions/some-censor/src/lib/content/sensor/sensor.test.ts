/**
 * The Sensor (BC2, #1435), driven through a real jsdom MutationObserver
 * against the checked-in layout table. Nothing downstream: tokens land in
 * an array, facts in another, and the assertions are about what the Sensor
 * *said*, never about the DOM the Actuator would write.
 */

import type { CoreFact } from "@censor/lib/content/core/actions"
import type { Token } from "@censor/lib/content/core/events"
import { cardKey } from "@censor/lib/content/core/keys"
import { YOUTUBE_LAYOUT } from "@censor/lib/content/layout/generated/youtube-layout"
import type { LayoutTable } from "@censor/lib/content/layout/schema"
import { asVideoId } from "@censor/types/ids"
import type { SessionId } from "@some-extension/common"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { classifyNode } from "./classify"
import { createIdentity } from "./identity"
import { RESOLVE_BUDGET_MS, RETRY_INTERVAL_MS } from "./queue"
import type { Sensor } from "./sensor"
import { createSensor, NAV_DEBOUNCE_MS } from "./sensor"

const TABLE: LayoutTable = YOUTUBE_LAYOUT

let tokens: Array<Token>
let facts: Array<CoreFact>
let sensor: Sensor
let now: number
let sessions: number

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const session = (n: number): SessionId => n as unknown as SessionId

const K = (id: string): ReturnType<typeof cardKey> => cardKey(asVideoId(id))

function cell(videoId: string, channel = "Chan"): HTMLElement {
  const el = document.createElement("ytd-rich-item-renderer")
  el.innerHTML = `<a id="video-title" href="/watch?v=${videoId}">Title ${videoId}</a><a href="/@${channel}"></a>
    <div id="metadata-line"><span>1 view</span><span>2 days ago</span></div>`
  return el
}

function lockup(videoId: string, channel: string | null = "Chan"): HTMLElement {
  const el = document.createElement("yt-lockup-view-model")
  el.innerHTML = `
    <a class="yt-lockup-view-model__content-image" href="/watch?v=${videoId}"></a>
    <h3><a class="yt-lockup-metadata-view-model__title" href="/watch?v=${videoId}"><span>Lock ${videoId}</span></a></h3>
    ${channel === null ? "" : `<a class="yt-content-metadata-view-model__metadata-text" href="/@${channel}">${channel}</a>`}`
  return el
}

function shorts(videoId: string): HTMLElement {
  const el = document.createElement("ytm-shorts-lockup-view-model-v2")
  el.innerHTML = `<a href="/shorts/${videoId}"></a>`
  return el
}

/** Let the observer's microtask fire and one retry tick pass. */
async function tick(n = 1): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    now += RETRY_INTERVAL_MS
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS)
  }
}

function observedKeys(): Array<string> {
  return tokens.filter((t) => t.kind === "observed").map((t) => t.key)
}

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = ""
  tokens = []
  facts = []
  now = 10_000
  sessions = 0
  sensor = createSensor({
    doc: document,
    win: window,
    table: TABLE,
    surface: () => "home",
    clock: () => now,
    mintSession: () => session(++sessions),
    emit: (t) => tokens.push(t),
    onFact: (f) => facts.push(f),
  })
  sensor.start()
})

afterEach(() => {
  sensor.stop()
  vi.useRealTimers()
})

describe("classifyNode", () => {
  it("answers card / shell / not-card from the catalogue, and known / unknown from the table", () => {
    const known = cell("a")
    document.body.appendChild(known)
    expect(classifyNode(known, "home", TABLE)).toEqual({
      kind: "card",
      shape: "known",
    })

    const shell = document.createElement("yt-lockup-view-model")
    expect(classifyNode(shell, "home", TABLE)).toEqual({ kind: "shell" })

    const wrapper = document.createElement("ytd-rich-item-renderer")
    wrapper.appendChild(lockup("b"))
    document.body.appendChild(wrapper)
    expect(classifyNode(wrapper, "home", TABLE)).toEqual({ kind: "not-card" })
    expect(classifyNode(document.createElement("div"), "home", TABLE)).toEqual({
      kind: "not-card",
    })

    // A lockup nested where the table never saw one nested.
    const compact = document.createElement("ytd-compact-video-renderer")
    const inner = lockup("c")
    compact.appendChild(inner)
    document.body.appendChild(compact)
    expect(classifyNode(inner, "home", TABLE)).toEqual({
      kind: "card",
      shape: "unknown",
      reason: "unexpected-outer",
    })
    // A tag the fixture crawl never saw on this surface.
    const playlistRow = document.createElement("ytd-playlist-video-renderer")
    document.body.appendChild(playlistRow)
    expect(classifyNode(playlistRow, "home", TABLE)).toEqual({
      kind: "card",
      shape: "unknown",
      reason: "tag-unseen",
    })
  })
})

describe("observing cards", () => {
  it("emits observed for every card a scan finds, with the extracted evidence", () => {
    document.body.append(cell("a"), lockup("b"), shorts("c"))
    sensor.scan()
    expect(observedKeys()).toEqual([K("a"), K("b"), K("c")])
    const a = tokens.find((t) => t.kind === "observed" && t.key === K("a"))
    expect(a?.kind === "observed" && a.observation).toMatchObject({
      videoId: "a",
      channelId: "@Chan",
      title: "Title a",
      uploadDate: "2 days ago",
      surface: "home",
      renderer: "ytd-rich-item-renderer",
      shape: "known",
    })
    const c = tokens.find((t) => t.kind === "observed" && t.key === K("c"))
    expect(
      c?.kind === "observed" && c.observation.channelId,
      "a short has no channel"
    ).toBeNull()
  })

  it("sees an inserted card through the observer, and a card nested in an inserted cell", async () => {
    document.body.appendChild(cell("a"))
    const wrapper = document.createElement("ytd-rich-item-renderer")
    wrapper.appendChild(lockup("inner"))
    document.body.appendChild(wrapper)
    await tick()
    expect(observedKeys()).toEqual([K("a"), K("inner")])
    expect(sensor.custodyOf(K("inner")).map((t) => t.role)).toEqual(["anchor"])
    expect(
      sensor.custodyOf(K("a"))[0]?.el.tagName,
      "the cell is the anchor when it is the card"
    ).toBe("YTD-RICH-ITEM-RENDERER")
  })

  it("keeps a card the table cannot place, and counts the miss (S2)", () => {
    const compact = document.createElement("ytd-compact-video-renderer")
    const inner = lockup("odd")
    compact.appendChild(inner)
    document.body.appendChild(compact)
    // The compact renderer is a container now (it contains a card); the
    // lockup is the card, in a context the home crawl never recorded.
    sensor.scan()
    const odd = tokens.find((t) => t.kind === "observed" && t.key === K("odd"))
    expect(odd?.kind === "observed" && odd.observation.shape).toBe("unknown")
    expect(facts).toContainEqual({
      kind: "shape.unknown",
      tag: "yt-lockup-view-model",
      surface: "home",
      reason: "unexpected-outer",
      shape: "unknown",
    })
  })
})

describe("the retry queue (S4)", () => {
  it("queues a shell, adopts it when it hydrates, and stops the loop", async () => {
    const shell = document.createElement("yt-lockup-view-model")
    document.body.appendChild(shell)
    await tick()
    expect(sensor.census().unresolved).toHaveLength(1)
    expect(observedKeys()).toEqual([])

    shell.innerHTML = lockup("late").innerHTML
    await tick(2)
    expect(observedKeys()).toEqual([K("late")])
    expect(sensor.census().unresolved).toHaveLength(0)
    expect(
      vi.getTimerCount(),
      "no retry interval survives an empty queue"
    ).toBe(0)
  })

  it("rejects a shell at budget, stickily, and revives it on extraction", async () => {
    const channelTile = document.createElement("yt-lockup-view-model")
    channelTile.innerHTML = '<a href="/@c">c</a>'
    document.body.appendChild(channelTile)
    await tick(RESOLVE_BUDGET_MS / RETRY_INTERVAL_MS + 2)
    expect(sensor.census().unresolved).toHaveLength(0)
    expect(facts).toContainEqual({
      kind: "mount.rejected",
      tag: "yt-lockup-view-model",
    })
    expect(vi.getTimerCount(), "the loop terminates").toBe(0)

    sensor.scan()
    expect(
      sensor.census().unresolved,
      "a re-scan does not re-queue it"
    ).toHaveLength(0)

    channelTile.innerHTML = lockup("revived").innerHTML
    await tick()
    expect(observedKeys()).toEqual([K("revived")])
  })

  it("re-observes a channel-less card until its channel arrives, then stops", async () => {
    const el = lockup("nochan", null)
    document.body.appendChild(el)
    await tick()
    expect(observedKeys()).toEqual([K("nochan")])
    expect(sensor.census().channelPending).toBe(1)

    el.insertAdjacentHTML(
      "beforeend",
      '<a class="yt-content-metadata-view-model__metadata-text" href="/@Late">Late</a>'
    )
    await tick(2)
    const last = tokens
      .filter((t) => t.kind === "observed" && t.key === K("nochan"))
      .at(-1)
    expect(last?.kind === "observed" && last.observation.channelId).toBe(
      "@Late"
    )
    expect(sensor.census().channelPending).toBe(0)
  })

  it("gives up on a channel that never arrives, keeping the card", async () => {
    document.body.appendChild(shorts("s"))
    await tick(RESOLVE_BUDGET_MS / RETRY_INTERVAL_MS + 2)
    expect(sensor.census().channelPending).toBe(0)
    expect(facts).toContainEqual({ kind: "channel.abandoned", videoId: "s" })
    expect(tokens.filter((t) => t.kind === "gone")).toEqual([])
  })
})

describe("identity (S3)", () => {
  it("treats a preview anchor ahead of the card's own as churn, not a recycle", async () => {
    const el = lockup("real")
    document.body.appendChild(el)
    await tick()
    el.prepend(
      Object.assign(document.createElement("a"), { href: "/watch?v=preview" })
    )
    await tick()
    expect(tokens.filter((t) => t.kind === "gone")).toEqual([])
    expect(observedKeys().every((k) => k === K("real"))).toBe(true)
    expect(facts).toContainEqual({ kind: "churn.ignored", videoId: "real" })
  })

  it("emits gone for the old key and observed for the new on a recycle", async () => {
    const el = cell("old")
    document.body.appendChild(el)
    await tick()
    el.setAttribute("data-video-id", "new")
    await tick()
    expect(tokens.filter((t) => t.kind === "gone").map((t) => t.key)).toEqual([
      K("old"),
    ])
    expect(observedKeys().at(-1)).toBe(K("new"))
    expect(sensor.custodyOf(K("old"))).toEqual([])
    expect(sensor.custodyOf(K("new")).map((t) => t.el)).toEqual([el])
  })

  it("does not emit gone while another element still carries the key", async () => {
    const a = cell("dup")
    const b = lockup("dup")
    document.body.append(a, b)
    await tick()
    expect(sensor.custodyOf(K("dup")).map((t) => t.el)).toEqual([a, b])
    a.setAttribute("data-video-id", "other")
    await tick()
    expect(tokens.filter((t) => t.kind === "gone")).toEqual([])
    expect(sensor.custodyOf(K("dup")).map((t) => t.el)).toEqual([b])
  })

  it("releases a card that left the document, and re-keys one recycled into a wrapper", async () => {
    const a = cell("leaves")
    const b = cell("wraps")
    document.body.append(a, b)
    await tick()
    tokens = []
    a.remove()
    b.replaceChildren(lockup("wraps"))
    await tick()
    const gone = tokens.filter((t) => t.kind === "gone").map((t) => t.key)
    expect(gone).toContain(K("leaves"))
    // The cell released the key (it is a wrapper now) *before* the lockup
    // inside it asked for the same video — enclosing cards go first — so the
    // card is torn down and adopted again on the lockup, fail-closed.
    expect(gone).toContain(K("wraps"))
    expect(observedKeys()).toEqual([K("wraps")])
    expect(sensor.custodyOf(K("wraps")).map((t) => t.el.tagName)).toEqual([
      "YT-LOCKUP-VIEW-MODEL",
    ])
  })

  it("does not re-announce a card whose evidence has not changed", async () => {
    document.body.appendChild(cell("quiet"))
    // Something queued keeps the retry loop, and its scan, alive.
    document.body.appendChild(document.createElement("yt-lockup-view-model"))
    await tick(5)
    expect(observedKeys().filter((k) => k === K("quiet"))).toHaveLength(1)
  })

  it("re-observes a card on refresh, reading the evidence now", async () => {
    const el = cell("fresh")
    document.body.appendChild(el)
    await tick()
    el.querySelector("#video-title")!.textContent = "Renamed"
    sensor.refresh(K("fresh"))
    const last = tokens.filter((t) => t.kind === "observed").at(-1)
    expect(last?.kind === "observed" && last.observation.title).toBe("Renamed")
  })
})

describe("navigation (B5)", () => {
  it("emits one nav token with a fresh session per debounced burst, then re-scans", async () => {
    document.body.appendChild(cell("before"))
    await tick()
    tokens = []
    window.dispatchEvent(new Event("yt-navigate-finish"))
    window.dispatchEvent(new Event("yt-navigate-finish"))
    await vi.advanceTimersByTimeAsync(NAV_DEBOUNCE_MS)
    expect(tokens[0]).toEqual({ kind: "nav", session: session(1), t: now })
    expect(tokens.filter((t) => t.kind === "nav")).toHaveLength(1)
    // The element was reused in place; the re-scan observes it afresh.
    expect(observedKeys()).toEqual([K("before")])
    expect(sensor.custodyOf(K("before"))).toHaveLength(1)
  })
})

describe("census", () => {
  it("reports what the occluder hides and which of it nothing holds", async () => {
    document.body.appendChild(cell("held"))
    await tick()
    const stray = cell("stray")
    document.body.appendChild(stray)
    // Observed by the mutation batch, so it is tracked; a card nothing ever
    // handed over has to be simulated by stopping first.
    await tick()
    expect(sensor.census().occludedUntracked).toBe(0)
    sensor.stop()
    expect(sensor.running).toBe(false)
  })
})

describe("identity in isolation", () => {
  it("forgets everything on clear, including the per-element map", () => {
    const id = createIdentity()
    const el = document.createElement("ytd-rich-item-renderer")
    expect(id.reconcile(el, asVideoId("x")).kind).toBe("new")
    id.clear()
    expect(id.keyOf(el)).toBeNull()
    expect(
      id.reconcile(el, asVideoId("x")).kind,
      "a new session sees a new card"
    ).toBe("new")
    expect(id.custodyOf(K("x"))).toHaveLength(1)
  })
})
