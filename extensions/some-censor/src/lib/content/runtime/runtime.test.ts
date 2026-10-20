/**
 * The whole pipeline in one document (BC5, #1438): Sensor → Core →
 * Actuator, through jsdom's real MutationObserver, with a stub background.
 * #1422, #1426, the recycle/churn split, navigation, vendor churn, and the
 * health cadence the flight recorder reports.
 */

import type { CoreFact } from "@censor/lib/content/core/actions"
import type { BoyoObservability } from "@censor/lib/content/observability"
import {
  OCCLUSION_GRACE_MS,
  startObservability,
  stopObservability,
} from "@censor/lib/content/observability"
import { occludedElements } from "@censor/lib/content/selectors"
import {
  RESOLVE_BUDGET_MS,
  RETRY_INTERVAL_MS,
} from "@censor/lib/content/sensor/queue"
import { NAV_DEBOUNCE_MS } from "@censor/lib/content/sensor/sensor"
import type { SessionId } from "@some-extension/common"
import { memoryPersistence } from "@some-extension/common/observability"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Runtime } from "./runtime"
import { createRuntime } from "./runtime"

let runtime: Runtime
let facts: Array<CoreFact>
let now: number
let sessions: number

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const session = (n: number): SessionId => n as unknown as SessionId

/** Old enough to plate under the default boundary. */
const OLD = "6 years ago"

function cell(videoId: string, channel = "Chan", age = OLD): HTMLElement {
  const el = document.createElement("ytd-rich-item-renderer")
  el.innerHTML = `<a id="video-title" href="/watch?v=${videoId}">Title ${videoId}</a>
    <ytd-channel-name><yt-formatted-string>${channel}</yt-formatted-string></ytd-channel-name>
    <a href="/@${channel}"></a>
    <div id="metadata-line"><span>1 view</span><span>${age}</span></div>`
  return el
}

function lockup(videoId: string): HTMLElement {
  const el = document.createElement("yt-lockup-view-model")
  el.innerHTML = `
    <a class="yt-lockup-view-model__content-image" href="/watch?v=${videoId}"></a>
    <h3><a class="yt-lockup-metadata-view-model__title" href="/watch?v=${videoId}"><span>Lock ${videoId}</span></a></h3>
    <a class="yt-content-metadata-view-model__metadata-text" href="/@Chan">Chan</a>
    <span class="yt-content-metadata-view-model__metadata-text">${OLD}</span>`
  return el
}

async function tick(n = 1): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    now += RETRY_INTERVAL_MS
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS)
  }
}

/** Let `ms` pass on both the timers and the runtime's clock, a second at a time. */
async function wait(ms: number): Promise<void> {
  for (let left = ms; left > 0; left -= 1_000) {
    const step = Math.min(1_000, left)
    now += step
    await vi.advanceTimersByTimeAsync(step)
  }
}

function plate(el: HTMLElement): string | null {
  return el.style.getPropertyValue("--boyo-plate") || null
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
  now = 100_000
  sessions = 0
  runtime = createRuntime({
    doc: document,
    win: window,
    clock: () => now,
    mintSession: () => session(++sessions),
    onFact: (f) => facts.push(f),
  })
  runtime.start()
})

afterEach(() => {
  runtime.stop()
  vi.useRealTimers()
})

describe("adoption", () => {
  it("plates every old card a scan finds", async () => {
    document.body.append(cell("a"), cell("b", "Other"), lockup("c"))
    runtime.scan()
    await tick()
    for (const id of ["a", "b", "c"]) {
      expect(entry(id)?.view.kind, id).toBe("plated")
    }
    for (const el of document.querySelectorAll<HTMLElement>("[data-boyo]")) {
      expect(el.dataset["boyo"]).toBe("plated")
      expect(plate(el)).not.toBeNull()
    }
    expect(entry("a")?.observation.channelId).toBe("@Chan")
    expect(facts.filter((f) => f.kind === "mount.resolved")).toHaveLength(3)
  })

  it("adopts a card inserted after the scan through the observer", async () => {
    runtime.scan()
    const late = cell("late")
    document.body.appendChild(late)
    await tick()
    expect(late.dataset["boyo"]).toBe("plated")
    expect(entry("late")?.view.kind).toBe("plated")
  })

  it("holds one card for a nested pair, on the lockup, and releases the cell (#1426)", async () => {
    const outer = document.createElement("ytd-rich-item-renderer")
    const inner = lockup("nested")
    outer.appendChild(inner)
    document.body.appendChild(outer)
    await tick()
    expect(runtime.state.cards.size).toBe(1)
    expect(inner.dataset["boyo"]).toBe("plated")
    expect(plate(inner)).not.toBeNull()
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

describe("evidence decides (#1803)", () => {
  it("takes a card too young to show out of layout, with no plate", async () => {
    const el = cell("fresh", "Chan", "2 days ago")
    document.body.appendChild(el)
    await tick()
    expect(entry("fresh")?.view.kind).toBe("absent")
    expect(el.dataset["boyo"]).toBe("absent")
    expect(plate(el)).toBeNull()
  })

  it("holds a card until its date hydrates in place, then plates it", async () => {
    const el = cell("late-date", "Chan", "")
    const text = document.createTextNode("")
    el.querySelector("#metadata-line span:nth-child(2)")!.appendChild(text)
    document.body.appendChild(el)
    await tick()
    expect(entry("late-date")?.view.kind).toBe("absent")
    // A text node's data changing is no mutation the observer is subscribed
    // to; the date budget's re-reads are what find it.
    text.data = OLD
    await tick(2)
    expect(entry("late-date")?.view.kind).toBe("plated")
    expect(plate(el)).not.toBeNull()
  })
})

describe("identity across vendor churn (#1423, #980)", () => {
  it("re-decides a renderer repointed at a new video, and never leaves it inert", async () => {
    const el = cell("old")
    document.body.appendChild(el)
    await tick()
    expect(entry("old")?.view.kind).toBe("plated")

    el.setAttribute("data-video-id", "new")
    await tick()
    expect(entry("old")).toBeUndefined()
    expect(entry("new")?.view.kind).toBe("plated")
    expect(el.dataset["boyo"]).toBe("plated")
    expect(el.dataset["boyoVid"]).toBe("new")
    expect(plate(el)).not.toBeNull()
  })

  it("keeps a lockup's card when a preview anchor displaces its id", async () => {
    const el = lockup("stable")
    document.body.appendChild(el)
    // Something queued keeps the retry loop's scan alive, as on a real feed.
    document.body.appendChild(document.createElement("yt-lockup-view-model"))
    await tick()
    expect(entry("stable")?.view.kind).toBe("plated")

    const preview = document.createElement("a")
    preview.setAttribute("href", "/watch?v=preview")
    el.prepend(preview)
    await tick(4)
    expect(entry("stable")?.view.kind, "the same card").toBe("plated")
    expect(el.dataset["boyo"]).toBe("plated")
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
    expect(inner.dataset["boyo"]).toBe("plated")
    expect(plate(inner)).not.toBeNull()
    expect(el.hasAttribute("data-boyo")).toBe(false)
    expect(plate(el)).toBeNull()
  })
})

describe("health and coverage, recorded", () => {
  let obs: BoyoObservability

  beforeEach(() => {
    obs = startObservability(memoryPersistence())
  })
  afterEach(() => {
    stopObservability()
  })

  const violations = (): Array<unknown> =>
    obs.recorder
      .events()
      .filter((e) => e.kind === "invariant.violated")
      .map((e) => e.subject)

  /** Video-shaped, so occluded; no parseable id, so never adopted. */
  function unparseableCard(): HTMLElement {
    const el = document.createElement("ytd-rich-item-renderer")
    el.innerHTML = '<a id="video-title" href="/watch?list=PL_only">t</a>'
    return el
  }

  it("reports a card left under the occluder that nothing holds (OccluderReleases)", async () => {
    const el = unparseableCard()
    document.body.appendChild(el)
    await tick(RESOLVE_BUDGET_MS / RETRY_INTERVAL_MS + 2)
    await wait(OCCLUSION_GRACE_MS * 3)
    expect(el.hasAttribute("data-boyo"), "precondition: stranded").toBe(false)
    expect(violations()).toContain("OccluderReleases")
  })

  it("does not sample a page with nothing occluded, and does sample one with something", async () => {
    document.body.appendChild(cell("clean"))
    await tick()
    const before = obs.recorder.metrics.counter("health_samples")
    await wait(OCCLUSION_GRACE_MS * 8)
    expect(obs.recorder.metrics.counter("health_samples")).toBe(before)

    document.body.appendChild(unparseableCard())
    await wait(OCCLUSION_GRACE_MS * 8)
    expect(obs.recorder.metrics.counter("health_samples")).toBeGreaterThan(
      before
    )
  })

  it("does not carry an occlusion's age across a navigation", async () => {
    const el = unparseableCard()
    document.body.appendChild(el)
    await wait(OCCLUSION_GRACE_MS * 1.5)
    window.dispatchEvent(new Event("yt-navigate-finish"))
    await wait(OCCLUSION_GRACE_MS * 0.8)
    expect(el.hasAttribute("data-boyo"), "precondition: still occluded").toBe(
      false
    )
    expect(violations()).not.toContain("OccluderReleases")
  })
})

describe("the watch page (#1805)", () => {
  it("off gives the tab back the title of the page still shown", async () => {
    document.title = "A recent video - YouTube"
    const manager = document.createElement("ytd-page-manager")
    manager.innerHTML = `<ytd-watch-flexy video-id="w1"><ytd-watch-metadata video-id="w1"><ytd-watch-info-text><yt-formatted-string id="info"><span>3 hours ago</span></yt-formatted-string></ytd-watch-info-text></ytd-watch-metadata></ytd-watch-flexy>`
    document.body.appendChild(manager)
    runtime.scan()
    await tick()
    expect(runtime.state.watch?.view).toBe("absent")
    expect(document.title).toBe("YouTube")
    runtime.stop()
    expect(document.title).toBe("A recent video - YouTube")
    expect(document.querySelector("[data-boyo-not-here]")).toBeNull()
  })
})

describe("lifecycle", () => {
  it("resets every card on navigation, even reused elements, and bumps the session", async () => {
    const a = cell("before")
    document.body.appendChild(a)
    await tick()
    expect(entry("before")?.view.kind).toBe("plated")
    const sessionBefore = runtime.state.session

    // A chip navigation reuses the element in place with new content.
    a.innerHTML = cell("after").innerHTML
    window.dispatchEvent(new Event("yt-navigate-finish"))
    await vi.advanceTimersByTimeAsync(NAV_DEBOUNCE_MS)
    await tick()

    expect(runtime.state.session).toBeGreaterThan(sessionBefore)
    expect(entry("before")).toBeUndefined()
    expect(entry("after")?.view.kind).toBe("plated")
    expect(a.dataset["boyo"]).toBe("plated")
    expect(plate(a)).not.toBeNull()
  })

  it("stops totally and starts again idempotently", async () => {
    const el = cell("s")
    document.body.appendChild(el)
    await tick()
    runtime.stop()
    expect(runtime.running).toBe(false)
    expect(el.hasAttribute("data-boyo")).toBe(false)
    expect(plate(el)).toBeNull()
    expect(vi.getTimerCount(), "no timer survives a stop").toBe(0)

    runtime.start()
    runtime.start()
    runtime.scan()
    await tick()
    expect(runtime.running).toBe(true)
    expect(el.dataset["boyo"]).toBe("plated")
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
      viewKind: "plated",
      isConnected: true,
    })
    expect(snap?.sessionOrdinal).toBe(runtime.state.session)
  })
})
