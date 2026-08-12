/**
 * The retry budget, which is what keeps #973's new tags from costing a
 * permanently-spinning timer.
 *
 * Adding `yt-lockup-view-model` to the catalogue means adopting a *polymorphic*
 * tag: the same element renders channels and playlists, which can never produce
 * a videoId. Before the budget, every one of those sat in the unresolved queue
 * forever, and the queue being non-empty is what keeps a 500ms interval alive —
 * an interval whose body re-scans the whole document. On a feed page that is a
 * permanent background cost for tiles the extension has no interest in
 * (Charter §8).
 *
 * These run against a real jsdom document with the timers faked, so the budget
 * is exercised by advancing the clock rather than by waiting.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { VideoManager } from "./video-manager"

/** The retry loop ticks at 500ms; the budget is 10s of wall clock. */
const PASS_MS = 500
const BUDGET_MS = 10_000
const BUDGET_PASSES = BUDGET_MS / PASS_MS

function channelLockup(): HTMLElement {
  const el = document.createElement("yt-lockup-view-model")
  el.innerHTML = '<a href="/@SomeChannel">Some Channel</a>'
  return el
}

function shortsLockup(videoId: string): HTMLElement {
  const el = document.createElement("ytm-shorts-lockup-view-model-v2")
  el.innerHTML = `<a href="/shorts/${videoId}"></a>`
  return el
}

/** Advance n retry passes, letting the awaited whitelist round-trips settle. */
async function passes(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await vi.advanceTimersByTimeAsync(PASS_MS)
  }
}

let mgr: VideoManager

beforeEach(() => {
  vi.useFakeTimers()
  // The fully-resolved path asks the background whether the channel is
  // whitelisted; the global stub is a bare vi.fn(), which returns undefined and
  // would reject on `.then`.
  vi.mocked(browser.runtime.sendMessage).mockResolvedValue({
    ok: true,
    whitelisted: false,
  })
  document.body.innerHTML = ""
  mgr = new VideoManager()
  mgr.startSession()
})

afterEach(() => {
  mgr.reset()
  vi.useRealTimers()
})

describe("a lockup that is not a video", () => {
  it("is never adopted", async () => {
    const el = channelLockup()
    document.body.appendChild(el)

    mgr.upsert(el)
    await passes(2)

    expect(el.hasAttribute("data-boyo"), "must not be masked").toBe(false)
    expect(mgr.size, "must not enter the registry").toBe(0)
  })

  it("is dropped from the retry queue once its budget is spent", async () => {
    const el = channelLockup()
    document.body.appendChild(el)

    mgr.upsert(el)
    expect(mgr.unresolvedSize, "queued while it might still hydrate").toBe(1)

    await passes(BUDGET_PASSES + 1)

    expect(mgr.unresolvedSize, "and dropped once it clearly will not").toBe(0)
  })

  it("stays dropped when the manager re-scans the document", async () => {
    // The regression this test exists for. scan() runs inside the retry loop
    // and re-upserts every matching element, so without a sticky rejection the
    // queue drains and immediately refills — the interval never stops, and the
    // budget accomplishes nothing.
    const el = channelLockup()
    document.body.appendChild(el)

    mgr.upsert(el)
    await passes(BUDGET_PASSES + 1)
    expect(mgr.unresolvedSize).toBe(0)

    mgr.scan()
    expect(mgr.unresolvedSize, "a re-scan must not re-queue it").toBe(0)

    await passes(5)
    expect(mgr.unresolvedSize, "…nor may the loop's own re-scan").toBe(0)
  })

  it("is adopted after all if it later becomes a video lockup", async () => {
    // Giving up must not be a life sentence for an element YouTube was simply
    // slow to fill in: the moment it has a watch link it takes the resolved
    // path, which never consults the rejection set.
    const el = channelLockup()
    document.body.appendChild(el)

    mgr.upsert(el)
    await passes(BUDGET_PASSES + 1)
    expect(mgr.unresolvedSize).toBe(0)

    el.innerHTML = `
      <a class="yt-lockup-view-model__content-image" href="/watch?v=late_1"></a>
      <a class="yt-content-metadata-view-model__metadata-text" href="/@Chan">Chan</a>`
    mgr.upsert(el)
    await passes(2)

    expect(mgr.size, "the hydrated card is masked").toBe(1)
    expect(el.getAttribute("data-boyo")).toBe("0")
  })
})

describe("a card with no channel", () => {
  it("masks on its videoId alone", async () => {
    const el = shortsLockup("short_1")
    document.body.appendChild(el)

    mgr.upsert(el)
    await passes(1)

    expect(el.getAttribute("data-boyo"), "masked immediately").toBe("0")
    expect(mgr.size).toBe(1)
  })

  it("stops looking for the channel once its budget is spent", async () => {
    const el = shortsLockup("short_1")
    document.body.appendChild(el)

    mgr.upsert(el)
    await passes(BUDGET_PASSES + 2)

    // Still masked — masking never needed the channel — but no longer queued.
    expect(el.getAttribute("data-boyo")).toBe("0")
    expect(mgr.size).toBe(1)

    mgr.scan()
    await passes(5)
    expect(el.getAttribute("data-boyo"), "and it stays masked").toBe("0")
  })
})

describe("the budget is wall clock, not page activity", () => {
  it("is not exhausted by a burst of mutation-driven retries", async () => {
    // retryUnresolved() is called by the observer on every mutation batch as
    // well as by the interval, so counting *passes* really counts how busy the
    // page is. A mount burst on a real feed spends dozens of passes in the
    // first second, which would reject a shell YouTube had barely started
    // filling in — the opposite of what the budget is for.
    const el = channelLockup()
    document.body.appendChild(el)
    mgr.upsert(el)

    for (let i = 0; i < 200; i++) mgr.retryUnresolved()

    expect(
      mgr.unresolvedSize,
      "200 passes inside one tick must not spend a 10s budget"
    ).toBe(1)

    await passes(BUDGET_PASSES + 1)
    expect(mgr.unresolvedSize, "…but the clock still runs out").toBe(0)
  })

  it("gives a slow card the full budget however quiet the page is", async () => {
    const shell = document.createElement("yt-lockup-view-model")
    document.body.appendChild(shell)
    mgr.upsert(shell)

    await passes(BUDGET_PASSES - 2)
    expect(mgr.unresolvedSize, "still inside the budget").toBe(1)

    // Hydrates just before the deadline — the case the burst bug stole.
    shell.innerHTML = `
      <a class="yt-lockup-view-model__content-image" href="/watch?v=slow_1"></a>
      <a class="yt-content-metadata-view-model__metadata-text" href="/@Chan">Chan</a>`
    await passes(3)

    expect(mgr.size, "adopted, not rejected").toBe(1)
  })
})

describe("giving up is revocable", () => {
  it("revives a rejected shell that later becomes a video lockup", async () => {
    // The interaction that makes rejection dangerous: the static pre-mask rule
    // occludes a lockup as soon as it holds a video link, and only the content
    // script lifts that. A shell rejected while link-less, which then hydrates,
    // would otherwise stay blurred with nothing coming for it.
    const el = channelLockup()
    document.body.appendChild(el)

    mgr.upsert(el)
    await passes(BUDGET_PASSES + 1)
    expect(mgr.unresolvedSize, "rejected").toBe(0)

    el.innerHTML = `
      <a class="yt-lockup-view-model__content-image" href="/watch?v=revived_1"></a>
      <a class="yt-content-metadata-view-model__metadata-text" href="/@Chan">Chan</a>`

    // What the observer calls on the mutation batch that added the link.
    mgr.recheckRejected()
    await passes(2)

    expect(mgr.size, "adopted after all").toBe(1)
    expect(el.getAttribute("data-boyo"), "and masked").toBe("0")
  })

  it("leaves a still-unwanted element rejected", async () => {
    const el = channelLockup()
    document.body.appendChild(el)

    mgr.upsert(el)
    await passes(BUDGET_PASSES + 1)

    for (let i = 0; i < 50; i++) mgr.recheckRejected()

    expect(mgr.unresolvedSize, "no re-queue, no churn").toBe(0)
    expect(el.hasAttribute("data-boyo")).toBe(false)
  })

  it("forgets rejected elements once they leave the DOM", async () => {
    const el = channelLockup()
    document.body.appendChild(el)
    mgr.upsert(el)
    await passes(BUDGET_PASSES + 1)

    el.remove()
    mgr.recheckRejected()

    // Nothing observable to assert but the absence of a retained reference, so
    // assert the next-best thing: a fresh element at the same position is
    // treated on its own merits rather than inheriting the old one's rejection.
    const fresh = channelLockup()
    fresh.innerHTML = '<a href="/watch?v=fresh_1"></a>'
    document.body.appendChild(fresh)
    mgr.upsert(fresh)
    await passes(2)

    expect(mgr.size).toBe(1)
  })
})

describe("the retry loop", () => {
  it("stops once nothing is left to retry", async () => {
    // The property that actually matters: no live interval afterwards. Asserted
    // through vitest's timer count so it cannot pass by coincidence.
    document.body.appendChild(channelLockup())
    document.body.appendChild(shortsLockup("short_1"))
    mgr.scan()

    expect(vi.getTimerCount(), "a retry loop is running").toBeGreaterThan(0)

    await passes(BUDGET_PASSES + 4)

    expect(mgr.unresolvedSize).toBe(0)
    expect(vi.getTimerCount(), "no timer survives the drained queue").toBe(0)
  })

  it("keeps running while a real card is still unresolved", async () => {
    // A card with neither a videoId nor a video link yet: the shell case the
    // budget must not cut short too eagerly.
    const shell = document.createElement("ytd-rich-item-renderer")
    document.body.appendChild(shell)
    mgr.upsert(shell)

    await passes(3)
    expect(mgr.unresolvedSize, "still waiting on hydration").toBe(1)

    shell.innerHTML = '<a id="video-title" href="/watch?v=hydrated_1">t</a>'
    await passes(2)

    expect(mgr.size, "adopted once it hydrates").toBe(1)
  })
})
