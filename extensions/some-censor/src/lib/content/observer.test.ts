/**
 * The observer's shape signals (#1504's own review, round 3).
 *
 * jsdom delivers MutationObserver callbacks as microtasks, so each scenario
 * mutates and then lets the queue drain before looking. The manager is the
 * real one; the fake background answers every whitelist check "no".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { startObserver } from "./observer"
import { VideoManager } from "./video-manager"

let mgr: VideoManager
let observer: MutationObserver

/** Let the observer's microtask callback and the manager's promotions run. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(PASS_MS)
}
const PASS_MS = 500

function lockup(videoId: string): HTMLElement {
  const el = document.createElement("yt-lockup-view-model")
  el.innerHTML = `
    <a class="yt-lockup-view-model__content-image" href="/watch?v=${videoId}"></a>
    <a class="yt-content-metadata-view-model__metadata-text" href="/@Chan">Chan</a>`
  return el
}

function videoCell(videoId: string): HTMLElement {
  const el = document.createElement("ytd-rich-item-renderer")
  el.innerHTML = `<a id="video-title" href="/watch?v=${videoId}"></a><a href="/@Chan"></a>`
  return el
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(browser.runtime.sendMessage).mockResolvedValue({
    ok: true,
    whitelisted: false,
  })
  document.body.innerHTML = ""
  mgr = new VideoManager()
  mgr.startSession()
  observer = startObserver(mgr)
})

afterEach(() => {
  observer.disconnect()
  mgr.reset()
  vi.useRealTimers()
})

describe("an atomically inserted cell", () => {
  it("hands the card nested inside it to the manager", async () => {
    // The added node is the cell; it is a container and is not adopted. The
    // lockup inside is the card, and it arrived in the same insertion.
    const cell = document.createElement("ytd-rich-item-renderer")
    const inner = lockup("atomic_1")
    cell.appendChild(inner)
    document.body.appendChild(cell)
    await settle()

    expect(mgr.size, "the lockup is adopted").toBe(1)
    expect(inner.getAttribute("data-boyo")).toBe("0")
    expect(cell.hasAttribute("data-boyo"), "the cell is not").toBe(false)
    expect(mgr.unresolvedSize, "and nothing is queued").toBe(0)
  })
})

describe("a card whose subtree is replaced", () => {
  it("is retired when it becomes an ad cell", async () => {
    const cell = videoCell("was_video")
    document.body.appendChild(cell)
    await settle()
    expect(cell.getAttribute("data-boyo"), "precondition: adopted").toBe("0")

    // The virtualizer hands the same cell to an ad. The cell itself is not an
    // added node — its children are — so only the enclosing-card walk can
    // bring it back to upsert().
    cell.innerHTML = `<ytd-ad-slot-renderer><div>sponsored</div></ytd-ad-slot-renderer>`
    await settle()

    expect(cell.hasAttribute("data-boyo"), "stamp retired").toBe(false)
    expect(cell.querySelector(".boyo-veil"), "veil gone").toBeNull()
    expect(mgr.size).toBe(0)
  })

  it("is retired when it becomes a wrapper, and the card inside is adopted", async () => {
    const cell = videoCell("was_video_2")
    document.body.appendChild(cell)
    await settle()
    expect(cell.getAttribute("data-boyo")).toBe("0")

    const inner = lockup("now_inside")
    cell.replaceChildren(inner)
    await settle()

    expect(cell.hasAttribute("data-boyo"), "the wrapper's stamp is gone").toBe(
      false
    )
    expect(cell.querySelector(":scope > .boyo-veil")).toBeNull()
    expect(inner.getAttribute("data-boyo"), "the lockup is the card").toBe("0")
    expect(mgr.size).toBe(1)
  })

  it("adopts a lockup that replaces its cell for the same video", async () => {
    // Round 4 of #1504's own review: the recycled cell and the lockup that
    // replaced it carry the same video. The lockup must not find the cell's
    // entry and repair it; the cell is retired first, then the lockup mounts.
    const cell = videoCell("same_vid")
    document.body.appendChild(cell)
    await settle()
    expect(cell.getAttribute("data-boyo")).toBe("0")

    const inner = lockup("same_vid")
    cell.replaceChildren(inner)
    await settle()

    expect(inner.getAttribute("data-boyo"), "the lockup is the card").toBe("0")
    expect(inner.querySelectorAll(":scope > .boyo-veil")).toHaveLength(1)
    expect(cell.hasAttribute("data-boyo"), "the cell is retired").toBe(false)
    expect(cell.querySelectorAll(":scope > .boyo-veil")).toHaveLength(0)
    expect(mgr.size).toBe(1)
  })

  it("does not disturb a card whose subtree merely churned", async () => {
    // The bounded walk re-upserts the card; upsert() must then find the same
    // artifact and leave the entry alone (M2, #1423).
    const cell = videoCell("stable")
    document.body.appendChild(cell)
    await settle()
    expect(cell.getAttribute("data-boyo")).toBe("0")

    cell.appendChild(document.createElement("div"))
    await settle()

    expect(cell.getAttribute("data-boyo")).toBe("0")
    expect(mgr.size).toBe(1)
    expect(
      cell.querySelectorAll(".boyo-veil"),
      "exactly one veil"
    ).toHaveLength(1)
  })
})
