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
let admitted: Set<string>
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
    ${channel === null ? "" : `<a class="yt-content-metadata-view-model__metadata-text" href="/@${channel}">${channel}</a>`}
    <span class="yt-content-metadata-view-model__metadata-text">2 days ago</span>`
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

function startSensor(): Sensor {
  const s = createSensor({
    doc: document,
    win: window,
    table: TABLE,
    surface: () => "home",
    clock: () => now,
    mintSession: () => session(++sessions),
    emit: (t) => tokens.push(t),
    onFact: (f) => facts.push(f),
    admits: (videoId) => admitted.has(videoId),
  })
  s.start()
  return s
}

/** Restart the Sensor on an engine that cannot parse `:has()` (D6). */
function restartWithoutHas(): () => void {
  sensor.stop()
  const native = document.querySelector.bind(document)
  Object.defineProperty(document, "querySelector", {
    configurable: true,
    value: (sel: string): Element | null => {
      if (sel === ":has(a)") throw new SyntaxError("unsupported")
      return native(sel)
    },
  })
  sensor = startSensor()
  return () => {
    Reflect.deleteProperty(document, "querySelector")
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = ""
  tokens = []
  facts = []
  admitted = new Set()
  now = 10_000
  sessions = 0
  sensor = startSensor()
})

afterEach(() => {
  sensor.stop()
  vi.useRealTimers()
})

describe("classifyNode", () => {
  it("confirms the table's context against the DOM: an outer card it never recorded is unknown", () => {
    const compact = document.createElement("ytd-compact-video-renderer")
    const inner = lockup("c")
    compact.appendChild(inner)
    document.body.appendChild(compact)
    expect(classifyNode(inner, "home", TABLE)).toEqual({
      kind: "card",
      shape: "unknown",
      reason: "unexpected-outer",
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
      short: false,
      surface: "home",
      renderer: "ytd-rich-item-renderer",
      shape: "known",
    })
    const c = tokens.find((t) => t.kind === "observed" && t.key === K("c"))
    expect(
      c?.kind === "observed" && c.observation.channelId,
      "a short has no channel"
    ).toBeNull()
    expect(c?.kind === "observed" && c.observation.short).toBe(true)
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

  it("keeps a card the table cannot place, announced once per element", async () => {
    // A plain-tag compact renderer is a card in its own right, so both it and
    // the lockup inside carry the key; the lockup's context is one the home
    // crawl never recorded.
    const compact = document.createElement("ytd-compact-video-renderer")
    compact.appendChild(lockup("odd"))
    document.body.appendChild(compact)
    // Something queued keeps the retry loop, and its scan, alive.
    document.body.appendChild(document.createElement("yt-lockup-view-model"))
    await tick(4)
    const odd = tokens.filter(
      (t) => t.kind === "observed" && t.key === K("odd")
    )
    expect(
      odd.map((t) => t.kind === "observed" && t.observation.renderer)
    ).toEqual(["ytd-compact-video-renderer", "yt-lockup-view-model"])
    expect(odd[1]?.kind === "observed" && odd[1].observation.shape).toBe(
      "unknown"
    )
  })

  it("reports each unplaceable element once, including a second carrier of a held video", async () => {
    document.body.appendChild(cell("held"))
    await tick()
    const compact = document.createElement("ytd-compact-video-renderer")
    compact.appendChild(lockup("held"))
    document.body.appendChild(compact)
    document.body.appendChild(document.createElement("yt-lockup-view-model"))
    await tick(3)
    const tags = tokens.flatMap((t) =>
      t.kind === "unknown-shape" ? [t.tag] : []
    )
    expect(
      tags.filter((tag) => tag === "yt-lockup-view-model"),
      "the nested lockup, once across every tick"
    ).toHaveLength(1)
  })

  it("reports an unplaceable card with no id as unknown-shape once, and queues it", async () => {
    const row = document.createElement("ytd-playlist-video-renderer")
    document.body.appendChild(row)
    await tick(3)
    expect(tokens.filter((t) => t.kind === "unknown-shape")).toEqual([
      {
        kind: "unknown-shape",
        tag: "ytd-playlist-video-renderer",
        surface: "home",
        reason: "tag-unseen",
        t: expect.any(Number),
      },
    ])
    expect(facts).toContainEqual({
      kind: "mount.queued",
      tag: "ytd-playlist-video-renderer",
    })
    expect(sensor.census().unresolved).toHaveLength(1)
  })
})

describe("the retry queue", () => {
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

  it("keeps the retry loop alive for a card with no date, then lets it stop", async () => {
    const el = cell("undated")
    el.querySelector("#metadata-line span:nth-child(2)")!.textContent = ""
    document.body.appendChild(el)
    await tick()
    expect(vi.getTimerCount(), "kept alive for the date").toBe(1)
    await tick(RESOLVE_BUDGET_MS / RETRY_INTERVAL_MS + 2)
    expect(vi.getTimerCount(), "budget spent, loop stopped").toBe(0)
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
    expect(sensor.census().channelPending).toHaveLength(1)

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
    expect(sensor.census().channelPending).toHaveLength(0)
  })

  it("re-reads a card whose channel name hydrates after its link", async () => {
    const el = lockup("unnamed", "Named")
    const link = el.querySelector<HTMLElement>('a[href="/@Named"]')!
    link.textContent = ""
    const text = link.appendChild(document.createTextNode(""))
    document.body.appendChild(el)
    await tick()
    expect(sensor.census().channelPending, "its channel is known").toHaveLength(
      0
    )

    // A text node's data changing is no mutation the observer sees.
    text.data = "Named"
    await tick(2)
    const last = tokens
      .filter((t) => t.kind === "observed" && t.key === K("unnamed"))
      .at(-1)
    expect(last?.kind === "observed" && last.observation.channelName).toBe(
      "Named"
    )
  })

  it("re-reads a card whose title hydrates after it, as the lane needs (QD15)", async () => {
    const el = cell("untitled")
    const anchor = el.querySelector<HTMLElement>("#video-title")!
    anchor.textContent = ""
    const text = anchor.appendChild(document.createTextNode(""))
    document.body.appendChild(el)
    await tick()

    // A text node's data changing is no mutation the observer sees.
    text.data = "Stay With Me MV"
    await tick(2)
    const last = tokens
      .filter((t) => t.kind === "observed" && t.key === K("untitled"))
      .at(-1)
    expect(last?.kind === "observed" && last.observation.title).toBe(
      "Stay With Me MV"
    )
  })

  it("gives up on a name that never arrives quietly, and stops", async () => {
    const el = lockup("nameless", "Nameless")
    el.querySelector('a[href="/@Nameless"]')!.textContent = ""
    document.body.appendChild(el)
    await tick()
    expect(vi.getTimerCount(), "the name is waited for").toBeGreaterThan(0)
    await tick(RESOLVE_BUDGET_MS / RETRY_INTERVAL_MS + 2)
    expect(facts.some((f) => f.kind === "channel.abandoned")).toBe(false)
    expect(vi.getTimerCount(), "the loop terminates").toBe(0)
  })

  it("runs out a channel budget even while the card churns", async () => {
    const el = lockup("churning", null)
    document.body.appendChild(el)
    await tick()
    const preview = document.createElement("a")
    preview.setAttribute("href", "/watch?v=preview")
    el.prepend(preview)
    el.insertAdjacentHTML(
      "beforeend",
      '<a class="yt-content-metadata-view-model__metadata-text" href="/@Late">Late</a>'
    )
    await tick(RESOLVE_BUDGET_MS / RETRY_INTERVAL_MS + 2)
    expect(facts).toContainEqual({ kind: "churn.ignored", videoId: "churning" })
    expect(facts).toContainEqual({
      kind: "channel.abandoned",
      videoId: "churning",
    })
    expect(sensor.census().channelPending).toHaveLength(0)
    expect(vi.getTimerCount(), "the loop terminates").toBe(0)
  })

  it("gives up on a channel that never arrives, keeping the card", async () => {
    document.body.appendChild(lockup("a", null))
    await tick(RESOLVE_BUDGET_MS / RETRY_INTERVAL_MS + 2)
    expect(sensor.census().channelPending).toHaveLength(0)
    expect(facts).toContainEqual({ kind: "channel.abandoned", videoId: "a" })
    expect(tokens.filter((t) => t.kind === "gone")).toEqual([])
  })

  it("starts a fresh channel budget for the video a pending card is recycled to", async () => {
    const el = lockup("a", null)
    document.body.appendChild(el)
    await tick(RESOLVE_BUDGET_MS / RETRY_INTERVAL_MS + 2)
    expect(sensor.census().channelPending).toHaveLength(0)

    el.replaceChildren(...lockup("b", null).childNodes)
    await tick()
    expect(sensor.census().channelPending).toHaveLength(1)
  })

  it("never waits on a channel for a Short or a Mix, which carry none (#1848)", async () => {
    const mix = lockup("m", null)
    mix.insertAdjacentHTML(
      "afterbegin",
      "<yt-collection-thumbnail-view-model></yt-collection-thumbnail-view-model>"
    )
    document.body.append(shorts("s"), mix)
    await tick()
    expect(observedKeys()).toEqual([K("s"), K("m")])
    expect(sensor.census().channelPending).toHaveLength(0)
  })
})

describe("surface", () => {
  function pages(): { browse: HTMLElement; watch: HTMLElement } {
    const manager = document.createElement("ytd-page-manager")
    const browse = document.createElement("ytd-browse")
    browse.setAttribute("page-subtype", "home")
    const watch = document.createElement("ytd-watch-flexy")
    manager.append(watch, browse)
    document.body.appendChild(manager)
    return { browse, watch }
  }

  function surfaceOf(key: string): string | undefined {
    const token = tokens.find((t) => t.kind === "observed" && t.key === key)
    return token?.kind === "observed" ? token.observation.surface : undefined
  }

  it("puts a card in the page an SPA navigation left hidden on that page's surface (#1848)", async () => {
    const { browse, watch } = pages()
    watch.setAttribute("hidden", "")
    browse.appendChild(lockup("shown"))
    watch.appendChild(lockup("left"))
    await tick()
    expect(surfaceOf(K("shown"))).toBe("home")
    expect(surfaceOf(K("left"))).toBe("watch")
  })

  it("places a card in the hidden page against that page's layout, not the shown one's", async () => {
    // The home table has never seen a playlist-panel row; the watch table has.
    const { watch } = pages()
    watch.setAttribute("hidden", "")
    const row = document.createElement("ytd-playlist-panel-video-renderer")
    row.innerHTML = '<a id="wc-endpoint" href="/watch?v=row"></a>'
    watch.appendChild(row)
    await tick()
    expect(observedKeys()).toEqual([K("row")])
    expect(tokens.filter((t) => t.kind === "unknown-shape")).toEqual([])
  })

  it("names a hidden page it cannot place other, never the page shown", async () => {
    const { browse } = pages()
    browse.setAttribute("hidden", "")
    browse.setAttribute("page-subtype", "channels")
    browse.appendChild(lockup("left"))
    await tick()
    expect(surfaceOf(K("left"))).toBe("other")
  })
})

describe("identity", () => {
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
    // Something queued keeps the retry loop, and its scan, alive.
    document.body.appendChild(document.createElement("yt-lockup-view-model"))
    await tick(4)
    expect(sensor.custodyOf(K("dup")).map((t) => t.el)).toEqual([a, b])
    expect(
      observedKeys().filter((k) => k === K("dup")),
      "two elements on one key each announce once, not on every tick"
    ).toHaveLength(2)
    a.setAttribute("data-video-id", "other")
    await tick()
    expect(tokens.filter((t) => t.kind === "gone")).toEqual([])
    expect(sensor.custodyOf(K("dup")).map((t) => t.el)).toEqual([b])
  })

  it("re-announces a key when one of its carriers stops being a card", async () => {
    const a = cell("dup")
    const b = lockup("dup")
    document.body.append(a, b)
    await tick()
    tokens = []
    // The cell now wraps another card: a container, no longer this card.
    a.replaceChildren(lockup("x"))
    await tick()
    expect(tokens.filter((t) => t.kind === "gone")).toEqual([])
    const dup = tokens.filter(
      (t) => t.kind === "observed" && t.key === K("dup")
    )
    expect(
      dup.map((t) => t.kind === "observed" && t.observation.renderer)
    ).toEqual(["yt-lockup-view-model"])
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

describe("the watch page (#1805)", () => {
  function watchPage(videoId: string, date: string | null): HTMLElement {
    const manager = document.createElement("ytd-page-manager")
    manager.innerHTML = `<ytd-watch-flexy video-id="${videoId}"><ytd-watch-metadata video-id="${videoId}"><ytd-watch-info-text><yt-formatted-string id="info">${date === null ? "" : `<span>${date}</span>`}</yt-formatted-string></ytd-watch-info-text></ytd-watch-metadata></ytd-watch-flexy>`
    document.body.appendChild(manager)
    return manager
  }
  const watched = (): Array<unknown> =>
    tokens.flatMap((t) => (t.kind === "watched" ? [t.watch] : []))
  const reading = (
    videoId: string,
    dates: Array<string>
  ): Record<string, unknown> => ({
    videoId,
    short: false,
    hydrated: true,
    dates,
    miniplayer: false,
    title: null,
    channelName: null,
    artist: false,
  })

  it("announces the page's video when what is read of it changes, and only then", async () => {
    const manager = watchPage("w1", "21y ago")
    await tick()
    sensor.scan()
    expect(watched()).toEqual([reading("w1", ["21y ago"])])
    // An SPA navigation: the page's video changes before anything else does.
    const flexy = manager.querySelector("ytd-watch-flexy")
    flexy?.setAttribute("video-id", "w2")
    await vi.advanceTimersByTimeAsync(0)
    expect(watched().at(-1)).toMatchObject({ videoId: "w2", hydrated: false })
    flexy?.setAttribute("hidden", "")
    manager.append(document.createElement("ytd-browse"))
    await vi.advanceTimersByTimeAsync(0)
    expect(watched().at(-1)).toBeNull()
  })

  it("re-reads the page under the budget, since its date can arrive unobserved", async () => {
    const manager = watchPage("w1", null)
    const run = document.createElement("span")
    const text = run.appendChild(document.createTextNode(""))
    manager.querySelector("#info")?.appendChild(run)
    await tick()
    tokens = []
    // A date arriving as a text node's data: no mutation this observes.
    text.data = "3 hours ago"
    await tick()
    expect(watched()).toEqual([reading("w1", ["3 hours ago"])])
    now += RESOLVE_BUDGET_MS
    await tick(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("reads the page again when the miniplayer opens, though no node moves", async () => {
    const app = document.createElement("ytd-app")
    document.body.append(app)
    const manager = watchPage("w1", "21y ago")
    manager.querySelector("ytd-watch-flexy")?.setAttribute("hidden", "")
    const mini = document.createElement("ytd-miniplayer")
    mini.innerHTML = '<h1 class="ytdMiniplayerInfoBarTitle">Title</h1>'
    manager
      .querySelector("ytd-watch-metadata")
      ?.insertAdjacentHTML("afterbegin", '<div id="title"><h1>Title</h1></div>')
    app.append(manager, mini)
    await tick()
    tokens = []
    app.setAttribute("miniplayer-is-active", "")
    await vi.advanceTimersByTimeAsync(0)
    expect(watched()).toEqual([
      { ...reading("w1", ["21y ago"]), miniplayer: true, title: "Title" },
    ])
  })

  it("announces the description when it is drawn again or loses the face control", async () => {
    const manager = watchPage("w1", "21y ago")
    const metadata = manager.querySelector("ytd-watch-metadata")
    await tick()
    const described = (): number =>
      tokens.filter((t) => t.kind === "described").length
    tokens = []
    // Drawn late.
    metadata?.insertAdjacentHTML(
      "beforeend",
      '<div id="description"><div id="description-inner"></div></div>'
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(described()).toBe(1)
    // The control goes in, and is dropped by a redraw of the description.
    const inner = manager.querySelector("#description-inner")
    inner?.insertAdjacentHTML(
      "beforeend",
      "<button data-boyo-face-hold></button>"
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(described()).toBe(2)
    // The same description loses the control, then is drawn anew.
    inner?.querySelector("button")?.remove()
    await vi.advanceTimersByTimeAsync(0)
    expect(described()).toBe(3)
    inner?.replaceWith(document.createElement("div"))
    await vi.advanceTimersByTimeAsync(0)
    expect(described()).toBe(4)
    expect(watched(), "the reading itself did not change").toEqual([])
  })

  it("keeps the page across a navigation, which Core does too", async () => {
    watchPage("w1", "21y ago")
    await tick()
    tokens = []
    window.dispatchEvent(new Event("yt-navigate-finish"))
    await vi.advanceTimersByTimeAsync(NAV_DEBOUNCE_MS)
    expect(tokens.map((t) => t.kind)).toEqual(["nav"])
  })
})

describe("autoplay (#1805)", () => {
  /** What the app's own listener would see of a navigation. */
  function navigate(detail: unknown): boolean {
    let reached = false
    const app = new AbortController()
    window.addEventListener(
      "yt-navigate",
      () => {
        reached = true
      },
      { signal: app.signal }
    )
    const root = document.createElement("ytd-watch-flexy")
    document.body.append(root)
    root.dispatchEvent(
      // eslint-disable-next-line extension-charter/no-unprefixed-namespace -- YouTube's own event, as the page dispatches it
      new CustomEvent("yt-navigate", { detail, bubbles: true, composed: true })
    )
    app.abort()
    return reached
  }
  const autoplay = (videoId: string): unknown => ({
    endpoint: { watchEndpoint: { videoId } },
    tempData: { autonav: "1" },
  })

  it("holds an autoplay into a video Core does not admit", () => {
    expect(navigate(autoplay("held"))).toBe(false)
    admitted.add("old")
    expect(navigate(autoplay("old"))).toBe(true)
  })

  it("never holds a navigation the owner asked for", () => {
    expect(navigate({ endpoint: { watchEndpoint: { videoId: "held" } } })).toBe(
      true
    )
    expect(navigate(null)).toBe(true)
  })

  it("holds nothing once stopped", () => {
    sensor.stop()
    expect(navigate(autoplay("held"))).toBe(true)
  })

  it("tells Core what Up next holds, in page order, when it holds (#1966)", async () => {
    // YouTube's two-column watch page: an engagement panel ahead of Up next
    // in the same column, and Up next's list inside `#related`.
    const manager = document.createElement("ytd-page-manager")
    manager.innerHTML = `<ytd-watch-flexy><div id="secondary">
      <div id="panels"></div>
      <div id="related"><ytd-watch-next-secondary-results-renderer></ytd-watch-next-secondary-results-renderer></div>
    </div></ytd-watch-flexy>`
    manager.querySelector("#panels")?.append(cell("in-a-panel"))
    manager
      .querySelector("ytd-watch-next-secondary-results-renderer")
      ?.append(lockup("first"), lockup("second"))
    document.body.append(cell("elsewhere"), manager)
    await tick()
    tokens = []
    navigate(autoplay("held"))
    expect(tokens).toEqual([
      { kind: "held", upNext: ["first", "second"], t: now },
    ])
    // A skip opens the Up next card itself, never a copy elsewhere.
    const list = manager.querySelector(
      "ytd-watch-next-secondary-results-renderer"
    )
    expect(sensor.upNextCard(cardKey(asVideoId("first")))).toBe(
      list?.firstElementChild
    )
    for (const id of ["in-a-panel", "elsewhere"]) {
      expect(sensor.upNextCard(cardKey(asVideoId(id))), id).toBeNull()
    }
  })
})

describe("census", () => {
  it("counts an occluded element the Sensor gave up on as untracked", async () => {
    document.body.appendChild(cell("held"))
    // A plain tag is occluded unconditionally; with no id it is rejected at
    // budget and left under the occluder, which is what OccluderReleases
    // must be able to see.
    const stranded = document.createElement("ytd-compact-video-renderer")
    document.body.appendChild(stranded)
    await tick(RESOLVE_BUDGET_MS / RETRY_INTERVAL_MS + 2)
    const census = sensor.census()
    expect(census.occluded).toContain(stranded)
    expect(census.occludedUntracked).toBe(1)
  })
})

describe("the fallback engine (D6)", () => {
  it("emits gone for a key whose last carrier was a wrapper handed to another card", async () => {
    const restore = restartWithoutHas()
    try {
      const wrapper = document.createElement("ytd-rich-item-renderer")
      const inner = lockup("A")
      wrapper.appendChild(inner)
      document.body.appendChild(wrapper)
      await tick()
      expect(sensor.custodyOf(K("A")).map((t) => t.role)).toEqual([
        "anchor",
        "nested",
      ])

      inner.replaceChildren(...lockup("B").childNodes)
      await tick()
      expect(tokens.filter((t) => t.kind === "gone").map((t) => t.key)).toEqual(
        [K("A")]
      )
      expect(sensor.custodyOf(K("B")).map((t) => t.role)).toEqual([
        "anchor",
        "nested",
      ])
    } finally {
      restore()
    }
  })

  it("makes a nested wrapper the anchor once it is the card itself", async () => {
    const restore = restartWithoutHas()
    try {
      const wrapper = document.createElement("ytd-rich-item-renderer")
      wrapper.appendChild(lockup("A"))
      document.body.appendChild(wrapper)
      await tick()

      wrapper.replaceChildren(...cell("A").childNodes)
      await tick()
      expect(sensor.custodyOf(K("A"))).toEqual([
        { el: wrapper, role: "anchor" },
      ])
    } finally {
      restore()
    }
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
