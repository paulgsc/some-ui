/**
 * The whole pipeline in one document (BC5, #1438): Sensor → Core →
 * Actuator, through jsdom's real MutationObserver, with a stub background.
 * These are the scenarios the retired manager's suite proved one class at a
 * time — #1422, #1426, the recycle/churn split, navigation — re-run against
 * the architecture that replaced it, so the cutover is parity plus the
 * structural fix rather than a redefinition of "fixed".
 */

import type { CoreFact } from "@censor/lib/content/core/actions"
import { WHITELIST_REVEAL_DELAY_MS } from "@censor/lib/content/core/actions"
import { occludedElements } from "@censor/lib/content/selectors"
import {
  RESOLVE_BUDGET_MS,
  RETRY_INTERVAL_MS,
} from "@censor/lib/content/sensor/queue"
import { NAV_DEBOUNCE_MS } from "@censor/lib/content/sensor/sensor"
import type { BgRequest } from "@censor/types/messages"
import type { SessionId } from "@some-extension/common"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Runtime } from "./runtime"
import { createRuntime } from "./runtime"

let runtime: Runtime
let facts: Array<CoreFact>
let whitelisted: Set<string>
let sent: Array<BgRequest>
let now: number
let sessions: number

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const session = (n: number): SessionId => n as unknown as SessionId

function cell(videoId: string, channel = "Chan"): HTMLElement {
  const el = document.createElement("ytd-rich-item-renderer")
  el.innerHTML = `<a id="video-title" href="/watch?v=${videoId}">Title ${videoId}</a>
    <ytd-channel-name><yt-formatted-string>${channel}</yt-formatted-string></ytd-channel-name>
    <a href="/@${channel}"></a>
    <div id="metadata-line"><span>1 view</span><span>2 days ago</span></div>`
  return el
}

function lockup(videoId: string): HTMLElement {
  const el = document.createElement("yt-lockup-view-model")
  el.innerHTML = `
    <a class="yt-lockup-view-model__content-image" href="/watch?v=${videoId}"></a>
    <h3><a class="yt-lockup-metadata-view-model__title" href="/watch?v=${videoId}"><span>Lock ${videoId}</span></a></h3>
    <a class="yt-content-metadata-view-model__metadata-text" href="/@Chan">Chan</a>`
  return el
}

async function tick(n = 1): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    now += RETRY_INTERVAL_MS
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS)
  }
}

function veil(el: HTMLElement): HTMLElement | null {
  return el.querySelector(":scope > .boyo-veil")
}

function clickVeil(
  el: HTMLElement,
  type: "click" | "dblclick" = "click"
): void {
  veil(el)?.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true })
  )
}

function entry(videoId: string): ReturnType<Runtime["state"]["cards"]["get"]> {
  for (const card of runtime.state.cards.values()) {
    if (card.observation.videoId === videoId) return card
  }
  return undefined
}

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = "<ytd-app></ytd-app>"
  facts = []
  whitelisted = new Set()
  sent = []
  now = 100_000
  sessions = 0
  runtime = createRuntime({
    doc: document,
    win: window,
    clock: () => now,
    mintSession: () => session(++sessions),
    sendMessage: (msg) => {
      sent.push(msg)
      if (msg.type === "IS_WHITELISTED") {
        return Promise.resolve({
          ok: true,
          whitelisted: whitelisted.has(msg.channelId),
        })
      }
      return Promise.resolve({ ok: true })
    },
    confirmWhitelist: () => true,
    onFact: (f) => facts.push(f),
  })
  runtime.start()
})

afterEach(() => {
  runtime.stop()
  vi.useRealTimers()
})

describe("adoption", () => {
  it("masks every card a scan finds, and asks the background about each channel", async () => {
    document.body.append(cell("a"), cell("b", "Other"), lockup("c"))
    runtime.scan()
    await tick()
    for (const id of ["a", "b", "c"]) {
      expect(entry(id)?.view.kind, id).toBe("masked")
    }
    for (const el of document.querySelectorAll<HTMLElement>("[data-boyo]")) {
      expect(el.dataset["boyo"]).toBe("0")
      expect(veil(el)).not.toBeNull()
    }
    expect(sent.filter((m) => m.type === "IS_WHITELISTED")).toHaveLength(3)
    expect(entry("a")?.channel).toEqual({
      kind: "known",
      channelId: "@Chan",
      whitelisted: false,
    })
    expect(facts.filter((f) => f.kind === "mount.resolved")).toHaveLength(3)
  })

  it("adopts a card inserted after the scan through the observer", async () => {
    runtime.scan()
    const late = cell("late")
    document.body.appendChild(late)
    await tick()
    expect(late.dataset["boyo"]).toBe("0")
    expect(entry("late")?.view.kind).toBe("masked")
  })

  it("holds one card for a nested pair, on the lockup, and releases the cell (#1426)", async () => {
    const outer = document.createElement("ytd-rich-item-renderer")
    const inner = lockup("nested")
    outer.appendChild(inner)
    document.body.appendChild(outer)
    await tick()
    expect(runtime.state.cards.size).toBe(1)
    expect(inner.dataset["boyo"]).toBe("0")
    expect(veil(inner)).not.toBeNull()
    expect(outer.hasAttribute("data-boyo")).toBe(false)
    expect(occludedElements(document)).not.toContain(outer)
    expect(
      facts.filter((f) => f.kind === "mount.resolved"),
      "one mount"
    ).toHaveLength(1)
  })

  it("never adopts a non-video cell, never occludes it, and stops retrying it (#1422)", async () => {
    const ad = document.createElement("ytd-rich-item-renderer")
    ad.innerHTML =
      "<ytd-ad-slot-renderer><div>sponsored</div></ytd-ad-slot-renderer>"
    document.body.appendChild(ad)
    await tick()
    expect(window.__BOYO_DEBUG__?.unresolved, "queued as a shell").toBe(1)
    await tick(RESOLVE_BUDGET_MS / RETRY_INTERVAL_MS + 2)
    expect(window.__BOYO_DEBUG__?.unresolved, "released at budget").toBe(0)
    expect(ad.hasAttribute("data-boyo")).toBe(false)
    expect(occludedElements(document)).not.toContain(ad)
    expect(runtime.state.cards.size).toBe(0)
  })
})

describe("the disclosure ladder, on the evidence the page shows now", () => {
  it("climbs masked → meta → title → revealed through real veil events", async () => {
    const el = cell("ladder")
    document.body.appendChild(el)
    await tick()
    // Evidence changes after adoption; the click must see it.
    el.querySelector("yt-formatted-string")!.textContent = "Renamed"

    clickVeil(el)
    await vi.advanceTimersByTimeAsync(400)
    expect(entry("ladder")?.view.kind).toBe("meta")
    expect(el.dataset["boyo"]).toBe("1")
    expect(veil(el)?.textContent).toContain("Renamed")

    clickVeil(el)
    await vi.advanceTimersByTimeAsync(400)
    expect(entry("ladder")?.view.kind).toBe("title")
    expect(el.dataset["boyo"]).toBe("2")
    expect(veil(el)?.textContent).toContain("Title ladder")

    clickVeil(el, "dblclick")
    await vi.advanceTimersByTimeAsync(700)
    expect(entry("ladder")?.view.kind).toBe("revealed")
    expect(el.dataset["boyo"]).toBe("3")
    expect(veil(el), "the veil left the DOM").toBeNull()
  })

  it("tints a whitelisted channel's card, then reveals it", async () => {
    whitelisted.add("@Chan")
    const el = cell("wl")
    document.body.appendChild(el)
    await tick()
    expect(entry("wl")?.view.kind).toBe("whitelisted")
    expect(el.dataset["boyo"]).toBe("wl")
    await vi.advanceTimersByTimeAsync(WHITELIST_REVEAL_DELAY_MS + 700)
    expect(entry("wl")?.view.kind).toBe("revealed")
    expect(veil(el)).toBeNull()
  })

  it("advances every card below title on the command, and reports coverage", async () => {
    document.body.append(cell("x"), cell("y"))
    await tick()
    clickVeil(document.querySelector("[data-boyo-vid=x]")!, "dblclick")
    await tick()
    runtime.dispatch({
      kind: "command",
      command: "advance-all-to-title",
      t: now,
    })
    expect(entry("x")?.view.kind, "already past").toBe("revealed")
    expect(entry("y")?.view.kind).toBe("title")
    expect(facts.find((f) => f.kind === "bulk.advance")).toMatchObject({
      advanced: 1,
      alreadyPast: 1,
    })
  })
})

describe("identity across vendor churn (#1423, #980)", () => {
  it("re-masks a renderer repointed at a new video, and never leaves it inert", async () => {
    const el = cell("old")
    document.body.appendChild(el)
    await tick()
    clickVeil(el, "dblclick")
    await tick()
    expect(entry("old")?.view.kind).toBe("revealed")

    el.setAttribute("data-video-id", "new")
    await tick()
    expect(entry("old")).toBeUndefined()
    expect(entry("new")?.view.kind).toBe("masked")
    expect(el.dataset["boyo"]).toBe("0")
    expect(el.dataset["boyoVid"]).toBe("new")
    expect(veil(el)).not.toBeNull()
  })

  it("keeps a revealed lockup revealed when a preview anchor displaces its id", async () => {
    const el = lockup("stable")
    document.body.appendChild(el)
    // Something queued keeps the retry loop's scan alive, as on a real feed.
    document.body.appendChild(document.createElement("yt-lockup-view-model"))
    await tick()
    clickVeil(el, "dblclick")
    await tick()
    expect(entry("stable")?.view.kind).toBe("revealed")

    const preview = document.createElement("a")
    preview.setAttribute("href", "/watch?v=preview")
    el.prepend(preview)
    await tick(4)
    expect(entry("stable")?.view.kind, "not revoked").toBe("revealed")
    expect(el.dataset["boyo"]).toBe("3")
    expect(entry("preview")).toBeUndefined()
    expect(facts.some((f) => f.kind === "churn.ignored")).toBe(true)
  })

  it("hands a cell recycled into a lockup for the same video to the lockup", async () => {
    const el = cell("same")
    document.body.appendChild(el)
    await tick()
    const inner = lockup("same")
    el.replaceChildren(inner)
    await tick()
    expect(runtime.state.cards.size).toBe(1)
    expect(inner.dataset["boyo"]).toBe("0")
    expect(veil(inner)).not.toBeNull()
    expect(el.hasAttribute("data-boyo")).toBe(false)
    expect(veil(el)).toBeNull()
  })
})

describe("lifecycle", () => {
  it("resets every card on navigation, even reused elements, and bumps the session", async () => {
    const a = cell("before")
    document.body.appendChild(a)
    await tick()
    clickVeil(a)
    await vi.advanceTimersByTimeAsync(400)
    expect(entry("before")?.view.kind).toBe("meta")
    const sessionBefore = runtime.state.session

    // A chip navigation reuses the element in place with new content.
    a.innerHTML = cell("after").innerHTML
    window.dispatchEvent(new Event("yt-navigate-finish"))
    await vi.advanceTimersByTimeAsync(NAV_DEBOUNCE_MS)
    await tick()

    expect(runtime.state.session).toBeGreaterThan(sessionBefore)
    expect(entry("before")).toBeUndefined()
    expect(entry("after")?.view.kind).toBe("masked")
    expect(a.dataset["boyo"]).toBe("0")
    expect(a.querySelectorAll(".boyo-veil")).toHaveLength(1)
  })

  it("stops totally and starts again idempotently", async () => {
    const el = cell("s")
    document.body.appendChild(el)
    await tick()
    runtime.stop()
    expect(runtime.running).toBe(false)
    expect(el.hasAttribute("data-boyo")).toBe(false)
    expect(document.querySelector(".boyo-veil")).toBeNull()
    expect(vi.getTimerCount(), "no timer survives a stop").toBe(0)

    runtime.start()
    runtime.start()
    runtime.scan()
    await tick()
    expect(runtime.running).toBe(true)
    expect(el.dataset["boyo"]).toBe("0")
    expect(runtime.state.cards.size).toBe(1)
  })

  it("publishes the debug snapshot the e2e suite reads", async () => {
    document.body.append(
      cell("d1"),
      document.createElement("yt-lockup-view-model")
    )
    await tick()
    const snap = window.__BOYO_DEBUG__
    expect(snap?.phase).toBe("running")
    expect(snap?.mounted).toBe(1)
    expect(snap?.unresolved).toBe(1)
    expect(snap?.entries["d1"]).toMatchObject({
      videoId: "d1",
      channelId: "@Chan",
      viewKind: "masked",
      isConnected: true,
    })
    expect(snap?.sessionOrdinal).toBe(runtime.state.session)
  })
})
