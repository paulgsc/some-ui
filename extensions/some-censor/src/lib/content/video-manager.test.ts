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

import { asVideoId } from "@censor/types/ids"
import { memoryPersistence } from "@some-extension/common/observability"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  PROMOTION_STALL_MS,
  startObservability,
  stopObservability,
  type BoyoObservability,
} from "./observability"
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

/** Fill `el` with fully-extractable markup (videoId + channelId) for a video. */
function fillFullCard(el: HTMLElement, videoId: string, channel: string): void {
  el.innerHTML = `<a id="video-title" href="/watch?v=${videoId}"></a><a href="/@${channel}"></a>`
}

/** A fully-extractable card (videoId + channelId) for a given video. */
function fullCard(videoId: string, channel: string): HTMLElement {
  const el = document.createElement("ytd-rich-item-renderer")
  fillFullCard(el, videoId, channel)
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

describe("vendor churn is not a recycle (#1423)", () => {
  // The recycle signal is "the extracted id differs from the one stamped on
  // the element", and two different things produce it. A hover preview
  // injecting its own anchor into a card — which is what happens the instant a
  // card is revealed, because the cursor is still on it — looks identical to
  // the virtualizer handing the node to a different feed item, unless the
  // element is asked whether it still advertises what we mounted.

  /** Add a second, earlier-in-document-order link, as a preview overlay does. */
  function addPreviewAnchor(el: HTMLElement, videoId: string): void {
    const preview = document.createElement("a")
    preview.setAttribute("href", `/watch?v=${videoId}`)
    el.prepend(preview)
  }

  /** Walk masked -> meta -> title -> revealed on a mounted card. */
  async function reveal(vid: string): Promise<void> {
    mgr.handleClick(asVideoId(vid))
    await vi.advanceTimersByTimeAsync(400)
    mgr.handleClick(asVideoId(vid))
    await vi.advanceTimersByTimeAsync(400)
    mgr.handleDblClick(asVideoId(vid))
    await vi.advanceTimersByTimeAsync(50)
  }

  it("keeps a revealed card revealed when a preview anchor displaces its id", async () => {
    // The reported bug, exactly: veil -> title -> double-click -> the card
    // dropped back under the static occluder, which takes no pointer events,
    // so it went inert rather than merely re-masked.
    const el = fullCard("mix_first", "ChanA")
    document.body.appendChild(el)
    mgr.upsert(el)
    await passes(2)

    await reveal("mix_first")
    expect(el.getAttribute("data-boyo"), "revealed").toBe("3")

    addPreviewAnchor(el, "mix_second")
    mgr.upsert(el)
    await passes(1)

    expect(
      el.getAttribute("data-boyo"),
      "must never fall back under the static occluder"
    ).toBe("3")
    expect(mgr.size, "and must not gain a second entry for one card").toBe(1)
  })

  it("keeps a part-progressed card at the step the user reached", async () => {
    const el = fullCard("vid_meta", "ChanA")
    document.body.appendChild(el)
    mgr.upsert(el)
    await passes(2)

    mgr.handleClick(asVideoId("vid_meta"))
    await vi.advanceTimersByTimeAsync(400)
    expect(el.getAttribute("data-boyo"), "meta").toBe("1")

    addPreviewAnchor(el, "vid_other")
    mgr.upsert(el)
    await passes(1)

    expect(
      el.getAttribute("data-boyo"),
      "churn must not silently revoke a disclosure the user performed"
    ).toBe("1")
  })

  it("still re-masks when the element really is handed to a different video", async () => {
    // The other side of the guard: if the artifact we mounted is gone from the
    // subtree, this is a genuine recycle and re-masking is mandatory — the node
    // is showing something the user never disclosed.
    const el = fullCard("vid_old", "ChanA")
    document.body.appendChild(el)
    mgr.upsert(el)
    await passes(2)

    await reveal("vid_old")
    expect(el.getAttribute("data-boyo")).toBe("3")

    fillFullCard(el, "vid_new", "ChanB") // replaces the subtree outright
    mgr.upsert(el)
    await passes(2)

    expect(el.dataset["boyoVid"], "the new video is mounted").toBe("vid_new")
    expect(el.getAttribute("data-boyo"), "and it is masked, not revealed").toBe(
      "0"
    )
    expect(mgr.size, "the old entry is replaced, not duplicated").toBe(1)
  })

  it("never leaves a recycled element under the bare occluder while it re-resolves", async () => {
    // A recycle strips data-boyo synchronously, and _promote() would not put it
    // back until a background round trip answers — seconds on a cold MV3
    // worker. For that whole window the card is blurred AND pointer-events:
    // none, which is the inert state, not a mask.
    const el = fullCard("vid_before", "ChanA")
    document.body.appendChild(el)
    mgr.upsert(el)
    await passes(2)

    // A round trip that does not answer within this test's observation window.
    vi.mocked(browser.runtime.sendMessage).mockReturnValueOnce(
      new Promise(() => {
        // deliberately never settles
      })
    )

    fillFullCard(el, "vid_after", "ChanB")
    mgr.upsert(el)

    expect(
      el.getAttribute("data-boyo"),
      "masked synchronously, without waiting for the whitelist check"
    ).toBe("0")
  })

  it("re-masks when the renderer's own data-video-id moves on, even if a stale link to the old video is still in the subtree", async () => {
    // Bot-found (#1427 review, round 1, P1). `data-video-id` is authoritative
    // and YouTube sets it only after hydration, so a renderer advertising a
    // new id IS a new artifact however much of the old one is still lying
    // around in its subtree. Treating the leftover link as evidence of
    // sameness would keep the old entry — revealed included — while the card
    // displays something the user never disclosed. A QD1 leak, not a flicker.
    const el = fullCard("vid_old_auth", "ChanA")
    el.setAttribute("data-video-id", "vid_old_auth")
    document.body.appendChild(el)
    mgr.upsert(el)
    await passes(2)

    await reveal("vid_old_auth")
    expect(el.getAttribute("data-boyo"), "revealed").toBe("3")

    // The renderer is repointed at a different video, but the old anchor has
    // not been cleaned up yet — the exact interleaving the finding names.
    el.setAttribute("data-video-id", "vid_new_auth")
    mgr.upsert(el)
    await passes(2)

    expect(
      el.dataset["boyoVid"],
      "the new artifact must be the one mounted"
    ).toBe("vid_new_auth")
    expect(
      el.getAttribute("data-boyo"),
      "and it must be masked — never inheriting the old card's disclosure"
    ).toBe("0")
  })

  it("still uses anchor membership for a lockup, which has no authoritative id", async () => {
    // The other side of the same rule: the Lit-era lockups never set
    // data-video-id (observer.ts), so anchor membership is the only evidence
    // there is for them — and it is the case the churn split exists for.
    const el = document.createElement("yt-lockup-view-model")
    el.innerHTML = `<a id="video-title" href="/watch?v=lock_keep"></a><a href="/@Chan"></a>`
    document.body.appendChild(el)
    mgr.upsert(el)
    await passes(2)

    await reveal("lock_keep")
    expect(el.getAttribute("data-boyo"), "revealed").toBe("3")

    addPreviewAnchor(el, "lock_preview")
    mgr.upsert(el)
    await passes(1)

    expect(
      el.getAttribute("data-boyo"),
      "a lockup has no authoritative id to contradict the anchor still present"
    ).toBe("3")
  })

  it("mounts a reused lockup after an SPA navigation, even though _elToVid still holds the old session's id", async () => {
    // Bot-found (#1427 review, round 2, P1). reset() cannot clear _elToVid —
    // it is a WeakMap — but destroy() does remove data-boyo-vid. So a reused
    // lockup arrives in the NEW session with no stamp (upsert's own churn
    // branch is skipped) but a stale _elToVid claim that _promote() still
    // sees. With the old link still in the subtree and no authoritative
    // data-video-id to contradict it, the churn shortcut would "preserve" an
    // entry reset() had already destroyed — repair() on undefined is a silent
    // no-op — and return without mounting anything. Never queued, so nothing
    // retries it: permanently occluded and inert.
    const el = document.createElement("yt-lockup-view-model")
    el.innerHTML = `<a id="video-title" href="/watch?v=lock_orig"></a><a href="/@Chan"></a>`
    document.body.appendChild(el)
    mgr.upsert(el)
    await passes(2)
    expect(mgr.size).toBe(1)

    // A preview link lands earlier in document order, so the next extraction
    // answers with it rather than the card's own.
    addPreviewAnchor(el, "lock_preview")

    // Controller C2: navigation tears down and restarts. The element stays
    // connected — chip swaps reuse lockups in place.
    mgr.reset()
    mgr.startSession()
    expect(
      el.dataset["boyoVid"],
      "destroy() cleared the stamp, so upsert's own churn branch cannot fire"
    ).toBeUndefined()

    mgr.upsert(el)
    await passes(2)

    expect(
      el.getAttribute("data-boyo"),
      "the card must be adopted by the new session, not stranded under the occluder"
    ).not.toBeNull()
    expect(mgr.size, "and it must actually be in the registry").toBe(1)
  })

  it("does not flap when the same element churns repeatedly", async () => {
    const el = fullCard("vid_stable", "ChanA")
    document.body.appendChild(el)
    mgr.upsert(el)
    await passes(2)

    await reveal("vid_stable")

    for (let i = 0; i < 10; i++) {
      addPreviewAnchor(el, `preview_${String(i)}`)
      mgr.upsert(el)
      expect(
        el.getAttribute("data-boyo"),
        `data-boyo must survive churn #${String(i)}`
      ).toBe("3")
    }

    await passes(2)
    expect(mgr.size, "one card, one entry, throughout").toBe(1)
    expect(el.dataset["boyoVid"]).toBe("vid_stable")
  })
})

describe("per-element staleness across rapid recycling (#980)", () => {
  // _promote()'s only guard against concurrent calls for the same element is
  // _promoting, a WeakSet keyed on the element alone — not on which videoId
  // the call is for. So while one videoId's whitelist round-trip is in
  // flight, every _promote() call for *any other* videoId the element gets
  // recycled to in the meantime no-ops immediately (re-entrancy), and the
  // first call's own stale resolution is the only thing left to mount —
  // unless it re-validates against the element's *current* claim first.

  it("mounts the last recycled video, not an earlier one still awaiting its whitelist check", async () => {
    const el = fullCard("vidA", "ChanA")
    document.body.appendChild(el)

    let releaseA!: () => void
    const gateA = new Promise<{ ok: boolean; whitelisted: boolean }>(
      (resolve): void => {
        releaseA = (): void => resolve({ ok: true, whitelisted: false })
      }
    )
    vi.mocked(browser.runtime.sendMessage).mockReturnValueOnce(gateA)

    mgr.upsert(el) // starts _promote(el, "vidA", …), awaiting IS_WHITELISTED

    // Recycled twice more before that round-trip resolves. Each upsert's own
    // _promote() call no-ops immediately — _promoting still holds el for
    // vidA — so nothing mounts for vidB or vidC yet either.
    fillFullCard(el, "vidB", "ChanB")
    mgr.upsert(el)
    fillFullCard(el, "vidC", "ChanC")
    mgr.upsert(el)

    expect(mgr.size, "vidA's round-trip hasn't resolved yet").toBe(0)

    releaseA()
    // One pass discards vidA's now-stale resolution and re-derives el's
    // current state (vidC) via the stale-bail retry in _promote()'s finally
    // block; a second lets vidC's own whitelist round-trip resolve.
    await passes(2)

    expect(mgr.size, "exactly one entry survives the recycle storm").toBe(1)
    expect(
      el.dataset["boyoVid"],
      "must reflect the last recycle (vidC), not the stale first one (vidA)"
    ).toBe("vidC")
    // vidB was never seen long enough to matter — recycled through entirely
    // inside vidA's in-flight window, dropped silently, and never mounted.
    expect(el.getAttribute("data-boyo"), "masked throughout").toBe("0")
  })

  it("does not disturb an element recycled only once", async () => {
    // Guard against a fix that over-invalidates: a single, ordinary recycle
    // (the case _elToVid's existing reuse check already handles) must still
    // resolve normally, with no spurious extra retry.
    const el = fullCard("vidX", "ChanX")
    document.body.appendChild(el)
    mgr.upsert(el)
    await passes(2)

    expect(mgr.size).toBe(1)
    expect(el.dataset["boyoVid"]).toBe("vidX")

    fillFullCard(el, "vidY", "ChanY")
    mgr.upsert(el)
    await passes(2)

    expect(mgr.size, "the old entry is replaced, not duplicated").toBe(1)
    expect(el.dataset["boyoVid"]).toBe("vidY")
  })
})

describe("PromotionGuardClears can actually fire (#1397's own review)", () => {
  let obs: BoyoObservability

  /** A promotion that never settles: the MV3 hazard the invariant is about. */
  function hangTheWhitelistCheck(): void {
    vi.mocked(browser.runtime.sendMessage).mockReturnValueOnce(
      new Promise(() => {
        // deliberately never settles
      })
    )
  }

  function violations(): Array<string | number | undefined> {
    return obs.recorder
      .events()
      .filter((e) => e.kind === "invariant.violated")
      .map((e) => e.subject)
  }

  beforeEach(() => {
    obs = startObservability(memoryPersistence())
  })

  afterEach(() => {
    stopObservability()
  })

  it("reports a hung promotion on a page with nothing queued — the retry loop never runs there, so nothing else would ever evaluate it", async () => {
    hangTheWhitelistCheck()
    const el = fullCard("vid-hangs", "Chan")
    document.body.appendChild(el)

    // A fully-extracted card neither queues nor tracks a channel, so
    // _maybeStopRetryLoop() leaves no periodic callback behind.
    mgr.upsert(el)
    await vi.advanceTimersByTimeAsync(PASS_MS)
    expect(violations()).toEqual([])

    await vi.advanceTimersByTimeAsync(PROMOTION_STALL_MS)
    expect(violations()).toContain("PromotionGuardClears")
  })

  it("reports nothing for a promotion that settles normally, and stops watching", async () => {
    const el = fullCard("vid-fine", "Chan")
    document.body.appendChild(el)
    mgr.upsert(el)
    await vi.advanceTimersByTimeAsync(PROMOTION_STALL_MS * 3)

    expect(violations()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it("still reports a promotion that outlived an SPA navigation — reset() cannot clear the real _promoting WeakSet, so it must not clear the mirror either", async () => {
    hangTheWhitelistCheck()
    const el = fullCard("vid-survives", "Chan")
    document.body.appendChild(el)
    mgr.upsert(el)
    await vi.advanceTimersByTimeAsync(PASS_MS)

    // Controller C2: a yt-navigate-finish tears the runtime down and restarts
    // it. The element stays connected (chip swaps reuse cards in place).
    mgr.reset()
    mgr.startSession()

    // The real guard still holds el, so this upsert is swallowed and the card
    // can never mount — which is exactly what must stay reportable.
    mgr.upsert(el)
    expect(mgr.size).toBe(0)

    await vi.advanceTimersByTimeAsync(PROMOTION_STALL_MS)
    expect(violations()).toContain("PromotionGuardClears")
  })

  it("mounts a card whose whitelist round-trip settles normally just after the SPA navigation that raced it — the ordinary case the hung-promise test above does not cover", async () => {
    // Unlike hangTheWhitelistCheck(), this round-trip *does* settle — just
    // after reset()+startSession() already ran. That is the realistic case
    // (a whitelist check answers in milliseconds), not the pathological one:
    // a promotion that settles normally must never be the thing that leaves a
    // card permanently unmounted, because nothing will ever flag it — it
    // clears _promoting before PROMOTION_STALL_MS has any chance to fire.
    let release!: () => void
    const gate = new Promise<{ ok: boolean; whitelisted: boolean }>(
      (resolve): void => {
        release = (): void => resolve({ ok: true, whitelisted: false })
      }
    )
    vi.mocked(browser.runtime.sendMessage).mockReturnValueOnce(gate)

    const el = fullCard("vid-races-nav", "Chan")
    document.body.appendChild(el)
    mgr.upsert(el) // starts _promote(), awaiting IS_WHITELISTED

    // Controller C2: a chip click tears the runtime down and restarts it
    // while the round-trip above is still in flight. The element stays
    // connected (chip swaps reuse cards in place).
    mgr.reset()
    mgr.startSession()

    // The still-live _promoting guard from the pre-navigation call swallows
    // this upsert, exactly as in the hung-promise test.
    mgr.upsert(el)
    expect(mgr.size).toBe(0)

    // Now the original round-trip answers normally (M5's session-mismatch
    // bail fires, not the hang this invariant test above exercises).
    release()
    await passes(1)

    expect(
      mgr.size,
      "the card must not be orphaned just because its whitelist check outlived a navigation"
    ).toBe(1)
    expect(el.getAttribute("data-boyo"), "and it must actually be masked").toBe(
      "0"
    )
    expect(
      violations(),
      "recovered on its own — nothing was ever stuck"
    ).toEqual([])
  })
})
