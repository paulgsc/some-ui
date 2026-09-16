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

import { memoryPersistence } from "@some-extension/common/observability"
import type { JsonValue } from "@some-extension/common/observability"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { attachEvents } from "./events"
import {
  OCCLUSION_GRACE_MS,
  PROMOTION_STALL_MS,
  startObservability,
  stopObservability,
  type BoyoObservability,
} from "./observability"
import { occludedElements } from "./selectors"
import { VideoManager } from "./video-manager"

/**
 * The numeric fields of an event detail, as a plain record.
 *
 * `detail` is a `JsonValue`, so it may be a primitive or an array; this
 * narrows it without an assertion. Dropping non-numeric values is deliberate
 * rather than incidental — a bulk-advance detail carries counts and nothing
 * else (#1382), so a key that survives a round trip through here is a key
 * whose value really was a number.
 */
function numericDetail(detail: JsonValue | undefined): Record<string, number> {
  if (detail === null || typeof detail !== "object" || Array.isArray(detail)) {
    return {}
  }
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(detail)) {
    if (typeof value === "number") out[key] = value
  }
  return out
}

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

/**
 * Make the next `IS_WHITELISTED` round trip never settle, pinning an element
 * inside `_promote()`'s guard for the rest of the test. Module-scoped because
 * two describes need it: the promotion-guard invariant, and #1429's coverage
 * attribution for a card that is mid-mount rather than orphaned.
 */
function hangTheWhitelistCheck(): void {
  vi.mocked(browser.runtime.sendMessage).mockReturnValueOnce(
    new Promise(() => {
      // deliberately never settles
    })
  )
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
    //
    // Exactly one timer survives by design — the occlusion cadence, which runs
    // for as long as a session does (see _armOcclusionWatch). Asserting the
    // count rather than zero is the tighter statement, not the looser one: it
    // fails at 2 if the retry interval leaks, and at 0 if the cadence this
    // count now allows for has quietly stopped existing.
    document.body.appendChild(channelLockup())
    document.body.appendChild(shortsLockup("short_1"))
    mgr.scan()

    expect(vi.getTimerCount(), "a retry loop is running").toBeGreaterThan(1)

    await passes(BUDGET_PASSES + 4)

    expect(mgr.unresolvedSize).toBe(0)
    expect(
      vi.getTimerCount(),
      "no retry interval survives the drained queue"
    ).toBe(1)
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
  async function reveal(el: HTMLElement): Promise<void> {
    mgr.handleClick(el)
    await vi.advanceTimersByTimeAsync(400)
    mgr.handleClick(el)
    await vi.advanceTimersByTimeAsync(400)
    mgr.handleDblClick(el)
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

    await reveal(el)
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

    mgr.handleClick(el)
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

    await reveal(el)
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

    await reveal(el)
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

    await reveal(el)
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

  it("does not take the shortcut on an entry that belongs to a different renderer", async () => {
    // Bot-found (#1427 review, round 3, P1), and the reason #1426 fixed it by
    // re-keying the registry by element rather than by video: "there is a
    // live entry for this id" said nothing about which renderer owns it, so
    // the fall-through recycle path could tear down a *different* renderer's
    // entry it never touched. `_registry.get(el)` can now only ever answer
    // about `el` itself — there is no id-based ambiguity left to resolve.
    const owner = fullCard("vid_shared", "ChanA")
    document.body.appendChild(owner)
    mgr.upsert(owner)
    await passes(2)
    expect(mgr.size).toBe(1)

    // A second, unrelated renderer that also claims vid_shared — and whose
    // own link now sorts after a newer one, so extraction answers with the
    // newer id.
    const other = document.createElement("yt-lockup-view-model")
    other.innerHTML = `<a href="/watch?v=vid_other"></a><a id="video-title" href="/watch?v=vid_shared"></a><a href="/@ChanA"></a>`
    other.dataset["boyoVid"] = "vid_shared"
    document.body.appendChild(other)

    mgr.upsert(other)
    await passes(2)

    expect(
      other.getAttribute("data-boyo"),
      "the second renderer must be adopted, not stranded under the occluder"
    ).not.toBeNull()

    // Now positively asserted (#1426): owner is a completely different
    // element from other, so adopting other must never reach into owner's
    // own slot — a videoId-keyed lookup could not tell the two apart, an
    // element-keyed one structurally cannot confuse them.
    expect(
      owner.getAttribute("data-boyo"),
      "owner must keep its own custody — it was never touched by other's upsert"
    ).toBe("0")
    expect(
      mgr.size,
      "two distinct renderers, two distinct entries, not a collision"
    ).toBe(2)
  })

  it("does not flap when the same element churns repeatedly", async () => {
    const el = fullCard("vid_stable", "ChanA")
    document.body.appendChild(el)
    mgr.upsert(el)
    await passes(2)

    await reveal(el)

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

describe("a nested card is one entry, not two (#1426)", () => {
  // YouTube nests a yt-lockup-view-model inside a ytd-rich-item-renderer on
  // several shelves; both match SEL independently, so a flat scan() sees
  // them as two elements even though they are structurally one card. The
  // outer's own subtree already contains the inner's anchors, so extracting
  // from the outer alone is sufficient — see extract/video-id.ts.
  function nestedCard(
    videoId: string,
    channel: string
  ): { outer: HTMLElement; inner: HTMLElement } {
    const outer = document.createElement("ytd-rich-item-renderer")
    const inner = document.createElement("yt-lockup-view-model")
    inner.innerHTML = `<a id="video-title" href="/watch?v=${videoId}"></a><a href="/@${channel}"></a>`
    outer.appendChild(inner)
    document.body.appendChild(outer)
    return { outer, inner }
  }

  it("produces exactly one VideoEntry, outer adopted first", async () => {
    const { outer, inner } = nestedCard("nest_a", "ChanA")
    mgr.upsert(outer)
    await passes(2)
    mgr.upsert(inner)
    await passes(2)

    expect(mgr.size, "one card, one entry").toBe(1)
  })

  it("produces exactly one VideoEntry, inner adopted first", async () => {
    const { outer, inner } = nestedCard("nest_b", "ChanA")
    mgr.upsert(inner)
    await passes(2)
    mgr.upsert(outer)
    await passes(2)

    expect(mgr.size, "one card, one entry, regardless of order").toBe(1)
  })

  it("produces exactly one VideoEntry when both are upserted before either settles", async () => {
    const { outer, inner } = nestedCard("nest_c", "ChanA")
    // Both calls land before either's whitelist round trip resolves — the
    // exact race the issue's "concurrent" reproduction describes. In the old
    // videoId-keyed registry this produced two veils and an orphaned handle;
    // here inner's upsert redirects to outer before ever reaching _promote(),
    // so there is only ever one in-flight promotion to race against.
    mgr.upsert(outer)
    mgr.upsert(inner)
    await passes(2)

    expect(mgr.size, "no collision, no orphaned second entry").toBe(1)
    expect(outer.getAttribute("data-boyo")).not.toBeNull()
    expect(inner.getAttribute("data-boyo")).not.toBeNull()
  })

  it("stamps data-boyo on every element the static occluder is hiding, not just the outer", async () => {
    const { outer, inner } = nestedCard("nest_d", "ChanA")

    expect(
      occludedElements(document.body).length,
      "precondition: the static occluder is hiding both, unadopted"
    ).toBe(2)

    mgr.upsert(outer)
    await passes(2)

    // Asserted against the occluder's own condition — element.matches() the
    // PREMASK_SELECTORS entry via occludedElements() — per #1426's
    // acceptance criteria, not by reading data-boyo off the source.
    expect(
      occludedElements(document.body),
      "the static occluder must be released from every matching element in the card"
    ).toHaveLength(0)
    expect(outer.getAttribute("data-boyo")).not.toBeNull()
    expect(inner.getAttribute("data-boyo")).not.toBeNull()
  })

  it("mounts exactly one veil, on the outer element", async () => {
    const { outer, inner } = nestedCard("nest_e", "ChanA")
    mgr.upsert(outer)
    await passes(2)

    expect(outer.querySelector(".boyo-veil")).not.toBeNull()
    expect(inner.querySelector(".boyo-veil")).toBeNull()
  })

  it("a click drives the shared entry, and both elements' data-boyo stay in sync", async () => {
    const { outer, inner } = nestedCard("nest_f", "ChanA")
    mgr.upsert(outer)
    await passes(2)
    expect(outer.getAttribute("data-boyo")).toBe("0")
    expect(inner.getAttribute("data-boyo")).toBe("0")

    mgr.handleClick(outer)
    await vi.advanceTimersByTimeAsync(400)

    expect(outer.getAttribute("data-boyo"), "outer advanced to meta").toBe("1")
    expect(
      inner.getAttribute("data-boyo"),
      "custody stamping keeps the nested element's value in sync"
    ).toBe("1")
  })

  it("a real click on the outer's veil resolves through events.ts to the shared entry", async () => {
    // End-to-end through the actual DOM-delegation layer, not the manager
    // shortcut the other tests in this file use — the acceptance criterion
    // this proves is "a click drives that card's own entry", and events.ts's
    // own closest(SEL) walk is part of what answers that.
    attachEvents(mgr)
    const { outer, inner } = nestedCard("nest_g", "ChanA")
    mgr.upsert(outer)
    await passes(2)

    const veil = outer.querySelector(".boyo-veil")
    if (!veil) throw new Error("precondition: veil must exist")
    veil.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    )
    await vi.advanceTimersByTimeAsync(400)

    expect(
      outer.getAttribute("data-boyo"),
      "resolved to the card's own entry"
    ).toBe("1")
    expect(inner.getAttribute("data-boyo")).toBe("1")
  })

  it("destroying the card clears data-boyo from the nested element too", async () => {
    const { outer, inner } = nestedCard("nest_h", "ChanA")
    mgr.upsert(outer)
    await passes(2)
    expect(inner.getAttribute("data-boyo")).not.toBeNull()

    mgr.reset()

    expect(outer.hasAttribute("data-boyo")).toBe(false)
    expect(
      inner.hasAttribute("data-boyo"),
      "nested custody is torn down too"
    ).toBe(false)
  })

  it("fires mount.resolved at most once per adoption, however the elements are upserted", async () => {
    const obs = startObservability(memoryPersistence())
    try {
      const { outer, inner } = nestedCard("nest_i", "ChanA")
      mgr.upsert(outer)
      mgr.upsert(inner)
      await passes(2)
      // Idempotent re-upserts, both orders — M2 holds per card.
      mgr.upsert(inner)
      mgr.upsert(outer)
      await passes(2)

      const resolved = obs.recorder
        .events()
        .filter((e) => e.kind === "mount.resolved" && e.subject === "nest_i")
      expect(resolved).toHaveLength(1)
    } finally {
      stopObservability()
    }
  })

  it("adopting an unrelated sibling never touches the nested card's own entry", async () => {
    // The other half of M7: a nested pair collapses into one entry, but two
    // elements that are NOT nested must stay fully independent even if they
    // are for the same video (the coincidental-duplicate case, not #1426's
    // own reproduction, but the same registry that must not confuse them).
    const { outer, inner } = nestedCard("nest_j", "ChanA")
    mgr.upsert(outer)
    await passes(2)
    expect(mgr.size).toBe(1)

    const sibling = fullCard("nest_j", "ChanA")
    document.body.appendChild(sibling)
    mgr.upsert(sibling)
    await passes(2)

    expect(
      outer.getAttribute("data-boyo"),
      "the nested card is untouched"
    ).toBe("0")
    expect(inner.getAttribute("data-boyo")).toBe("0")
    expect(mgr.size, "two distinct cards for the same video").toBe(2)
  })
})

describe("two cards sharing a video keep independent channel-backfill tracking (#1432 review)", () => {
  // Both findings below are the same shape as #1426 from the channel side:
  // _channelPending and whitelistChannel() used to be keyed by videoId, which
  // could only ever track one of two distinct cards that happen to show the
  // same video. Bot-found on this PR's own review.

  it("whitelists the channel of the card actually right-clicked, not a same-video card that mounted first", async () => {
    // b: provisional (video-only, no channel resolved yet), mounted FIRST —
    // a videoId-keyed lookup's iteration order would have found it before a.
    const b = document.createElement("yt-lockup-view-model")
    b.innerHTML = `<a href="/watch?v=shared_vid"></a>`
    document.body.appendChild(b)
    mgr.upsert(b)
    await passes(1)
    expect(mgr.size, "precondition: b is provisional").toBe(1)

    // a: a distinct element, fully resolved (has a real channel), for the
    // SAME video.
    const a = fullCard("shared_vid", "ChanA")
    document.body.appendChild(a)
    mgr.upsert(a)
    await passes(2)
    expect(mgr.size).toBe(2)

    vi.mocked(browser.runtime.sendMessage).mockClear()
    await mgr.whitelistChannel(a)

    expect(
      vi.mocked(browser.runtime.sendMessage).mock.calls[0]?.[0],
      "must whitelist a's own channel, not b's provisional empty one"
    ).toMatchObject({ type: "ADD_WHITELIST", channelId: "@ChanA" })
  })

  it("pruning one disconnected card does not drop another connected card's own pending-channel tracking", async () => {
    const obs = startObservability(memoryPersistence())
    try {
      // a: video-only (provisional), stays connected throughout.
      const a = document.createElement("yt-lockup-view-model")
      a.innerHTML = `<a href="/watch?v=shared_vid"></a>`
      document.body.appendChild(a)
      mgr.upsert(a)
      await passes(1)

      // b: also video-only, same video, then evicted — the
      // scroll-virtualizer path prune() exists for.
      const b = document.createElement("yt-lockup-view-model")
      b.innerHTML = `<a href="/watch?v=shared_vid"></a>`
      document.body.appendChild(b)
      mgr.upsert(b)
      await passes(1)
      expect(
        mgr.size,
        "precondition: two independent provisional entries"
      ).toBe(2)

      b.remove()
      mgr.prune()

      // a is still connected and still owed a channel backfill. Give it one
      // and confirm it actually lands, rather than a's tracking having been
      // silently dropped by b's unrelated pruning.
      //
      // retryUnresolved() is called directly here rather than via passes()
      // (which also fires the interval's own scan() in the same tick): that
      // combination double-triggers _backfill() for any element that
      // transitions from video-only to full extraction inside one tick —
      // a pre-existing race independent of this fix, and not what this test
      // is about.
      fillFullCard(a, "shared_vid", "ChanA")
      mgr.retryUnresolved()
      await vi.advanceTimersByTimeAsync(0)

      const backfilled = obs.recorder
        .events()
        .filter(
          (e) => e.kind === "channel.backfilled" && e.subject === "shared_vid"
        )
      expect(
        backfilled,
        "a's own pending-channel tracking must survive b's unrelated pruning"
      ).toHaveLength(1)
    } finally {
      stopObservability()
    }
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

describe("OccluderReleases sees what the queues cannot (#1425)", () => {
  let obs: BoyoObservability

  function violations(): Array<string | number | undefined> {
    return obs.recorder
      .events()
      .filter((e) => e.kind === "invariant.violated")
      .map((e) => e.subject)
  }

  function recoveries(): Array<string | number | undefined> {
    return obs.recorder
      .events()
      .filter((e) => e.kind === "invariant.recovered")
      .map((e) => e.subject)
  }

  beforeEach(() => {
    obs = startObservability(memoryPersistence())
  })

  afterEach(() => {
    stopObservability()
  })

  it("reports a card left under the occluder that no queue is tracking", async () => {
    // The #1422 shape, which is also the shape of every ORP defect: a
    // ytd-rich-item-renderer with no video link anywhere. The occluder matches
    // it on the bare tag, `isVideoCard()` says true unconditionally, so the
    // rejection path never fires and it is never released — while the manager
    // reports a perfectly consistent empty queue.
    const el = document.createElement("ytd-rich-item-renderer")
    el.innerHTML = `<ytd-ad-slot-renderer><div>sponsored</div></ytd-ad-slot-renderer>`
    document.body.appendChild(el)

    mgr.upsert(el)
    await passes(BUDGET_PASSES * 4)

    expect(
      el.getAttribute("data-boyo"),
      "precondition: it really is stranded under the occluder"
    ).toBeNull()
    expect(violations(), "and the invariant says so").toContain(
      "OccluderReleases"
    )
  })

  it("stays quiet on a page whose cards all get adopted", async () => {
    // The direction that decides whether this is usable or just noise: a
    // healthy feed must not report a violation merely because cards spend
    // their first moments occluded.
    for (const id of ["vid_a", "vid_b", "vid_c"]) {
      document.body.appendChild(fullCard(id, "Chan"))
    }
    mgr.scan()
    await passes(BUDGET_PASSES * 4)

    expect(mgr.size, "precondition: they were all adopted").toBe(3)
    expect(violations()).not.toContain("OccluderReleases")
  })

  it("keeps looking at a stranded card on a page with nothing left in any queue", async () => {
    // Bot-found (this PR's own review). The test above reaches its verdict via
    // the retry loop, which that card keeps alive by sitting in _unresolved —
    // so it proves the invariant can fire, not that it fires for the
    // population it was written for. An element this manager never adopted is
    // in no queue and no guard, and therefore keeps nothing running: one
    // sample stamps its sinceAt, `now - sinceAt` is zero, and without a
    // cadence of its own the report stays healthy forever.
    // A card that resolves outright, so nothing ever queues and the retry
    // interval is never started.
    document.body.appendChild(fullCard("vid_a", "Chan"))
    mgr.scan()
    await passes(1)

    // Appears *after* the scan and is never upserted — the orphan shape, and
    // the only way to get one: anything scan() sees, it queues. In the
    // extension this is a card whose data-boyo was dropped by a teardown the
    // observer did not turn into a signal (#1423), not a literal late append.
    const stranded = document.createElement("ytd-rich-item-renderer")
    stranded.innerHTML = `<ytd-ad-slot-renderer><div>sponsored</div></ytd-ad-slot-renderer>`
    document.body.appendChild(stranded)

    expect(
      mgr.unresolvedSize,
      "precondition: nothing is queued, so no retry loop is running"
    ).toBe(0)
    expect(
      violations(),
      "precondition: far too early to call anything stranded"
    ).not.toContain("OccluderReleases")

    // One tick to see it and stamp its sinceAt, the next to find it has aged
    // past the grace window. Nothing else on this page is running.
    await vi.advanceTimersByTimeAsync(OCCLUSION_GRACE_MS * 3)

    expect(
      stranded.getAttribute("data-boyo"),
      "precondition: it really is still under the occluder"
    ).toBeNull()
    expect(violations(), "and the cadence kept looking").toContain(
      "OccluderReleases"
    )
  })

  it("does not sample a page that has nothing occluded, however long it runs", async () => {
    // What keeps the standing cadence honest about Charter §8. The tick itself
    // is read-only queries; the expensive half of a health sample is evaluating
    // every invariant and flushing a snapshot to storage.local. So a clean page
    // must tick without sampling — otherwise leaving a tab open writes to disk
    // every 15 s forever, which is exactly the background cost the budget
    // machinery in this file exists to avoid.
    const el = fullCard("vid_a", "Chan")
    document.body.appendChild(el)
    mgr.scan()
    await passes(1)
    expect(
      el.getAttribute("data-boyo"),
      "precondition: adopted, so the occluder no longer matches it"
    ).not.toBeNull()

    const before = obs.recorder.metrics.counter("health_samples")
    await vi.advanceTimersByTimeAsync(OCCLUSION_GRACE_MS * 8)

    expect(
      obs.recorder.metrics.counter("health_samples"),
      "eight ticks with nothing occluded, and not one sample taken"
    ).toBe(before)
    expect(violations()).not.toContain("OccluderReleases")
  })

  it("does sample a page that does have something occluded", async () => {
    // The other half, so the test above cannot pass by the cadence being dead.
    const stranded = document.createElement("ytd-rich-item-renderer")
    stranded.innerHTML = `<ytd-ad-slot-renderer><div>sponsored</div></ytd-ad-slot-renderer>`
    document.body.appendChild(stranded)

    const before = obs.recorder.metrics.counter("health_samples")
    await vi.advanceTimersByTimeAsync(OCCLUSION_GRACE_MS * 8)

    expect(
      obs.recorder.metrics.counter("health_samples"),
      "a page with something under the occluder is a page with something to say"
    ).toBeGreaterThan(before)
  })

  it("reports the recovery when the last stranded card goes away", async () => {
    // Bot-found (this PR's own review, round 3). Skipping the sample on a
    // clean page keeps an idle tab from writing every tick — but the tick
    // where the page *became* clean is the one that emits
    // `invariant.recovered` and replaces the violated snapshot. Skip that one
    // and a healed violation sits on the diagnostics page forever: this
    // invariant's own stuck-report failure, with the sign flipped.
    const stranded = document.createElement("ytd-rich-item-renderer")
    stranded.innerHTML = `<ytd-ad-slot-renderer><div>sponsored</div></ytd-ad-slot-renderer>`
    document.body.appendChild(stranded)

    await vi.advanceTimersByTimeAsync(OCCLUSION_GRACE_MS * 3)
    expect(violations(), "precondition: it was reported stranded").toContain(
      "OccluderReleases"
    )

    stranded.remove()
    await vi.advanceTimersByTimeAsync(OCCLUSION_GRACE_MS * 3)

    expect(recoveries()).toContain("OccluderReleases")
  })

  it("takes the session's reading synchronously, not on a tick 15s away", () => {
    // Bot-found (this PR's own review, round 4). An earlier version seeded a
    // flag so the *first tick* would report regardless of what it found — but
    // a flag is not a reading. Navigation is debounced at 150 ms, so a second
    // one inside OCCLUSION_GRACE_MS runs `_teardownRuntime()` -> `reset()`,
    // which cancels the very tick that was going to honour the flag, and the
    // previous page's verdict stays the latest persisted one.
    mgr.reset()
    const before = obs.recorder.metrics.counter("health_samples")

    mgr.startSession()

    expect(
      obs.recorder.metrics.counter("health_samples"),
      "taken before any timer exists to be cancelled"
    ).toBe(before + 1)
  })

  it("still reports the new session even when the page it lands on is clean", () => {
    // The case the force flag is for. A clean page takes no reading on an
    // ordinary tick, by design — but the reading that says *this* page is
    // clean is what retires a verdict describing the page before it.
    document.body.innerHTML = ""
    mgr.reset()
    const before = obs.recorder.metrics.counter("health_samples")

    mgr.startSession()

    expect(obs.recorder.metrics.counter("health_samples")).toBe(before + 1)
  })

  it("drops the watch on reset, so a teardown leaves no timer behind", async () => {
    // Same rule _disarmStallWatch() follows, and for the same reason: reset()
    // is what a navigation and a disabled extension both run through, and a
    // cadence that outlives the session it was watching would keep re-arming
    // itself against a page no session is watching.
    //
    // Two mechanisms hold this, deliberately: the tick's phase guard and the
    // disarm in reset(). Each is individually sufficient, so mutating either
    // one alone leaves this test green — it fails only when both are gone.
    // That is defence in depth rather than a redundancy to clean up: the guard
    // is what makes an already-scheduled tick correct, the disarm is what
    // releases the handle promptly instead of up to OCCLUSION_GRACE_MS later.
    document.body.appendChild(fullCard("vid_a", "Chan"))
    mgr.retryUnresolved()
    expect(
      vi.getTimerCount(),
      "precondition: the watch is armed"
    ).toBeGreaterThan(0)

    mgr.reset()
    await vi.advanceTimersByTimeAsync(OCCLUSION_GRACE_MS * 2)

    expect(vi.getTimerCount()).toBe(0)
  })

  it("stays quiet about a channel lockup, which the occluder deliberately does not match", async () => {
    // The `:has()` guard means a non-video lockup is never occluded, so it is
    // correctly invisible here — reporting it would punish the very guard that
    // exists to stop permanent blurring (#973).
    const el = channelLockup()
    document.body.appendChild(el)

    mgr.upsert(el)
    await passes(BUDGET_PASSES * 4)

    expect(violations()).not.toContain("OccluderReleases")
  })
})

describe("PromotionGuardClears can actually fire (#1397's own review)", () => {
  let obs: BoyoObservability

  /** A promotion that never settles: the MV3 hazard the invariant is about. */
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
    // The one survivor is the occlusion cadence, not this watch — see the
    // retry-loop test above for why the count is asserted rather than zero.
    expect(vi.getTimerCount()).toBe(1)
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

describe("advance-all reports what it did not advance (#1424)", () => {
  let obs: BoyoObservability

  /** The detail of the most recent bulk-advance event, or undefined. */
  function coverage(): Record<string, number> | undefined {
    const events = obs.recorder
      .events()
      .filter((e) => e.kind === "command.advance_all")
    const last = events[events.length - 1]
    return last === undefined ? undefined : numericDetail(last.detail)
  }

  /**
   * An element the occluder matches on its bare tag and that the manager is
   * not tracking at all — the orphan shape every ORP story produces, and the
   * one no queue can represent.
   */
  function orphan(): HTMLElement {
    const el = document.createElement("ytd-rich-item-renderer")
    el.innerHTML = `<ytd-ad-slot-renderer><div>sponsored</div></ytd-ad-slot-renderer>`
    document.body.appendChild(el)
    return el
  }

  beforeEach(() => {
    obs = startObservability(memoryPersistence())
  })

  afterEach(() => {
    stopObservability()
  })

  it("counts the cards it advanced and the ones it never reached", async () => {
    document.body.appendChild(fullCard("vid_a", "Chan"))
    document.body.appendChild(fullCard("vid_b", "Chan"))
    mgr.scan()
    await passes(1)
    expect(mgr.size, "precondition: two cards are in the registry").toBe(2)

    // Never upserted, so it is in no queue and has no registry slot — but the
    // stylesheet is occluding it, which is the whole point of the bucket.
    orphan()

    mgr.advanceAllToTitle()

    expect(coverage()).toMatchObject({
      advanced: 2,
      alreadyPast: 0,
      detached: 0,
      unresolved: 0,
      occludedUntracked: 1,
      skipped: 1,
    })
  })

  it("does not count a queued card twice, as both unresolved and occluded", () => {
    // The card is video-shaped but not yet extractable, so it sits in
    // _unresolved — and it is occluded too, because the occluder is exactly
    // what hides a card until adoption. Reporting it in both buckets would
    // make the skipped total say two cards where there is one.
    const el = document.createElement("ytd-rich-item-renderer")
    document.body.appendChild(el)
    mgr.upsert(el)

    expect(mgr.unresolvedSize, "precondition: it really is queued").toBe(1)

    mgr.advanceAllToTitle()

    expect(coverage()).toMatchObject({
      advanced: 0,
      unresolved: 1,
      occludedUntracked: 0,
      skipped: 1,
    })
  })

  it("does not count a channel lockup the occluder never hid", async () => {
    // Bot-found (this PR's own review, P1). `upsert()` enqueues every element
    // failing `isVideoCard()` — a channel lockup, a playlist, an unhydrated
    // shell — so extraction need not rescan their subtrees each pass. The
    // premask `:has()` guard deliberately leaves those visible, so they were
    // never cards and were never missed. Counting `_unresolved.size` reported
    // them as skipped, worst on search pages where polymorphic lockups are
    // most of the grid.
    document.body.appendChild(fullCard("vid_a", "Chan"))
    for (let i = 0; i < 4; i++) document.body.appendChild(channelLockup())
    mgr.scan()
    await passes(1)

    expect(
      mgr.unresolvedSize,
      "precondition: the lockups really are sitting in the queue"
    ).toBe(4)

    mgr.advanceAllToTitle()

    expect(coverage()).toMatchObject({
      advanced: 1,
      unresolved: 0,
      promoting: 0,
      occludedUntracked: 0,
      skipped: 0,
    })
  })

  it("attributes an in-flight promotion to the mount, not to the orphans", async () => {
    // Bot-found (this PR's own review, P2). `_promote()` dequeues before
    // awaiting the IS_WHITELISTED round trip, so for the length of that trip a
    // perfectly healthy card is occluded, out of `_unresolved`, and not yet in
    // the registry. "Occluded minus the queue" put it in the orphan bucket —
    // the one figure whose whole value is that it should trend to zero as
    // #1421 lands.
    hangTheWhitelistCheck()
    const el = fullCard("vid_slow", "Chan")
    document.body.appendChild(el)
    mgr.upsert(el)
    await passes(1)

    expect(
      el.getAttribute("data-boyo"),
      "precondition: still occluded, the mount has not completed"
    ).toBeNull()
    expect(
      mgr.unresolvedSize,
      "precondition: and it has already left the queue"
    ).toBe(0)

    mgr.advanceAllToTitle()

    expect(coverage()).toMatchObject({
      advanced: 0,
      unresolved: 0,
      promoting: 1,
      occludedUntracked: 0,
      skipped: 1,
    })
  })

  it("reports a registry entry whose element left the DOM", async () => {
    const el = fullCard("vid_gone", "Chan")
    document.body.appendChild(el)
    mgr.scan()
    await passes(1)
    expect(mgr.size, "precondition: it was adopted").toBe(1)

    // Detached without telling the manager — the eviction path has not run, so
    // the registry still holds the slot. advanceToTitle() has always skipped
    // this case; before #1424 it did so without saying anything.
    el.remove()

    mgr.advanceAllToTitle()

    expect(coverage()).toMatchObject({
      advanced: 0,
      detached: 1,
      skipped: 1,
    })
  })

  it("counts a second press as covered, not as newly advanced", async () => {
    document.body.appendChild(fullCard("vid_a", "Chan"))
    mgr.scan()
    await passes(1)

    mgr.advanceAllToTitle()
    mgr.advanceAllToTitle()

    // The command stays idempotent: the second press moves nothing, and says so
    // rather than reporting a card it did not act on as skipped.
    expect(coverage()).toMatchObject({
      advanced: 0,
      alreadyPast: 1,
      skipped: 0,
    })
    expect(obs.recorder.metrics.counter("bulk_advances")).toBe(2)
    expect(obs.recorder.metrics.counter("bulk_advance_advanced")).toBe(1)
    expect(obs.recorder.metrics.counter("bulk_advance_skipped")).toBe(0)
  })

  it("shows a channel-pending card as covered, which is the opposite of what #1424 assumed", async () => {
    // A shorts lockup exposes a videoId and no channel, so it mounts
    // provisionally and is queued for backfill. #1424's evidence lists
    // _channelPending among the populations the command misses; it is not one,
    // because _promoteProvisional() puts the entry in _byVideo as well.
    document.body.appendChild(shortsLockup("vid_short"))
    mgr.scan()
    await passes(1)

    mgr.advanceAllToTitle()

    expect(coverage()).toMatchObject({
      advanced: 1,
      channelPending: 1,
      skipped: 0,
    })
  })

  it("records nothing at all when the command is phase-gated out", () => {
    document.body.appendChild(fullCard("vid_a", "Chan"))
    mgr.scan()
    mgr.reset()

    mgr.advanceAllToTitle()

    expect(
      coverage(),
      "an idle manager did not run the command"
    ).toBeUndefined()
  })
})
