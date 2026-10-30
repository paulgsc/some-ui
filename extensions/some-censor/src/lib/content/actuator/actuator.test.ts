/**
 * The Actuator (BC4), fed synthetic `BoundAction[]`: no Core, no
 * Sensor. What it must do is write exactly what it was told, idempotently.
 */

import { cardKey } from "@censor/lib/content/core/keys"
import type { RenderModel } from "@censor/lib/content/fsm"
import { project } from "@censor/lib/content/fsm"
import { asVideoId } from "@censor/types/ids"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Actuator } from "./actuator"
import { createActuator } from "./actuator"
import type { BoundAction, CustodyTarget } from "./bound"
import { NEUTRAL_TITLE } from "./watch-hold"

const K = cardKey(asVideoId("vid_a"))
const K2 = cardKey(asVideoId("vid_b"))

const INPUTS = {
  videoId: asVideoId("vid_a"),
  channelId: null,
  channelName: "Chan",
}
const PLATED: RenderModel = project(
  { kind: "plated", session: sessionOf(1) },
  INPUTS
)
const ABSENT: RenderModel = project(
  { kind: "absent", session: sessionOf(1) },
  INPUTS
)

function sessionOf(n: number): Parameters<typeof project>[0]["session"] {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return n as unknown as Parameters<typeof project>[0]["session"]
}

let actuator: Actuator
let faced: Array<string>

function card(tag = "ytd-rich-item-renderer"): HTMLElement {
  const el = document.createElement(tag)
  el.innerHTML = '<a id="video-title" href="/watch?v=vid_a">t</a>'
  document.body.appendChild(el)
  return el
}

function render(
  key: typeof K,
  model: RenderModel,
  targets: ReadonlyArray<CustodyTarget>
): BoundAction {
  return { action: { kind: "render", key, model }, targets }
}

function unmount(
  key: typeof K,
  targets: ReadonlyArray<CustodyTarget> = []
): BoundAction {
  return { action: { kind: "unmount", key }, targets }
}

function fillOf(el: HTMLElement): string {
  return el.style.getPropertyValue("--boyo-plate")
}

beforeEach(() => {
  document.body.innerHTML = ""
  faced = []
  actuator = createActuator(document, {
    onFace: (videoId, shown) => faced.push(shown ? videoId : `-${videoId}`),
  })
})

afterEach(() => {
  actuator.dispose()
})

describe("render", () => {
  it("stamps the anchor and writes the plate's values on it", () => {
    const el = card()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])

    expect(el.dataset["boyo"]).toBe("plated")
    expect(el.dataset["boyoVid"]).toBe("vid_a")
    expect(fillOf(el)).toBe(PLATED.plate?.fill)
    expect(el.style.getPropertyValue("--boyo-disc")).toBe(PLATED.plate?.disc)
    expect(el.style.getPropertyValue("--boyo-initial")).toBe('"C"')
  })

  it("is idempotent: the same render twice is the same DOM (A3)", () => {
    const el = card()
    const bound = [render(K, PLATED, [{ el, role: "anchor" }])]
    actuator.realize(bound)
    const before = el.outerHTML
    actuator.realize(bound)
    expect(el.outerHTML).toBe(before)
  })

  it("clears the plate on a card that turns absent", () => {
    const el = card()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    actuator.realize([render(K, ABSENT, [{ el, role: "anchor" }])])
    expect(el.dataset["boyo"]).toBe("absent")
    expect(el.hasAttribute("style"), "removed at once").toBe(false)
  })

  it("leaves the vendor's own inline style alone, an empty one included", () => {
    const el = card()
    el.style.position = "absolute"
    const empty = card()
    empty.setAttribute("style", "")
    actuator.realize([
      render(K, PLATED, [{ el, role: "anchor" }]),
      render(K2, PLATED, [{ el: empty, role: "anchor" }]),
    ])
    actuator.realize([unmount(K), unmount(K2)])
    expect(el.getAttribute("style")).toBe("position: absolute;")
    expect(empty.getAttribute("style")).toBe("")
  })

  it("stamps nested custody without plate values (D6)", () => {
    const anchor = card("yt-lockup-view-model")
    const nested = document.createElement("ytd-rich-item-renderer")
    document.body.appendChild(nested)
    actuator.realize([
      render(K, PLATED, [
        { el: anchor, role: "anchor" },
        { el: nested, role: "nested" },
      ]),
    ])
    expect(nested.dataset["boyo"]).toBe("plated")
    expect(nested.dataset["boyoVid"]).toBeUndefined()
    expect(nested.hasAttribute("style")).toBe(false)
    expect(fillOf(anchor)).not.toBe("")
    expect(actuator.custodyOf(K)).toEqual([anchor, nested])
  })
})

describe("custody accounting (A5)", () => {
  it("strips an element that left the key's custody", () => {
    const anchor = card()
    const nested = document.createElement("yt-lockup-view-model")
    document.body.appendChild(nested)
    actuator.realize([
      render(K, PLATED, [
        { el: anchor, role: "anchor" },
        { el: nested, role: "nested" },
      ]),
    ])
    actuator.realize([render(K, PLATED, [{ el: anchor, role: "anchor" }])])
    expect(nested.hasAttribute("data-boyo"), "left custody, stamp gone").toBe(
      false
    )
    expect(anchor.dataset["boyo"]).toBe("plated")
  })

  it("never strips a stamp another key now owns, whichever render runs first", () => {
    const x = card()
    actuator.realize([render(K, ABSENT, [{ el: x, role: "anchor" }])])
    // x moves to K2. K2 renders first, then K learns x is gone.
    actuator.realize([render(K2, PLATED, [{ el: x, role: "anchor" }])])
    actuator.realize([render(K, ABSENT, [])])
    expect(x.dataset["boyoVid"], "K2's stamp survives K's diff").toBe("vid_b")
    expect(x.dataset["boyo"]).toBe("plated")
    expect(fillOf(x), "K2's plate survives too").not.toBe("")

    // The other order: K learns first, then K2 takes over.
    const y = card()
    actuator.realize([render(K, PLATED, [{ el: y, role: "anchor" }])])
    actuator.realize([render(K, PLATED, [])])
    expect(y.hasAttribute("data-boyo")).toBe(false)
    actuator.realize([render(K2, PLATED, [{ el: y, role: "anchor" }])])
    expect(y.dataset["boyoVid"]).toBe("vid_b")
  })

  it("takes over another key's anchor as nested custody with nothing of the anchor left (D6)", () => {
    const x = card()
    actuator.realize([render(K, PLATED, [{ el: x, role: "anchor" }])])
    expect(x.dataset["boyoVid"]).toBe("vid_a")
    actuator.realize([render(K2, ABSENT, [{ el: x, role: "nested" }])])
    expect(x.dataset["boyoVid"], "the old self-tag is gone").toBeUndefined()
    expect(x.dataset["boyo"]).toBe("absent")
    expect(x.hasAttribute("style"), "and the plate").toBe(false)
    expect(actuator.custodyOf(K2)).toEqual([x])
  })
})

describe("demotion", () => {
  it("demotes an anchor to nested custody, plate values and self-tag gone", () => {
    const el = card()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    actuator.realize([render(K, PLATED, [{ el, role: "nested" }])])
    expect(el.dataset["boyo"]).toBe("plated")
    expect(el.dataset["boyoVid"]).toBeUndefined()
    expect(el.hasAttribute("style")).toBe(false)
  })
})

describe("unmount (A4)", () => {
  it("leaves every stamped element as it was", () => {
    const anchor = card()
    const nested = document.createElement("yt-lockup-view-model")
    document.body.appendChild(nested)
    actuator.realize([
      render(K, PLATED, [
        { el: anchor, role: "anchor" },
        { el: nested, role: "nested" },
      ]),
    ])
    actuator.realize([unmount(K)])
    expect(anchor.hasAttribute("data-boyo")).toBe(false)
    expect(anchor.hasAttribute("data-boyo-vid")).toBe(false)
    expect(anchor.hasAttribute("style"), "no trace of the plate").toBe(false)
    expect(nested.hasAttribute("data-boyo")).toBe(false)
    expect(actuator.custodyOf(K)).toEqual([])
  })

  it("is a no-op for a key it never realized", () => {
    const el = card()
    actuator.realize([render(K2, PLATED, [{ el, role: "anchor" }])])
    actuator.realize([unmount(K, [{ el, role: "anchor" }])])
    expect(el.dataset["boyoVid"], "another key's stamp is not touched").toBe(
      "vid_b"
    )
  })
})

describe("dispose", () => {
  it("strips everything, and is inert afterwards", () => {
    const el = card()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    actuator.dispose()
    expect(el.hasAttribute("data-boyo")).toBe(false)
    expect(el.hasAttribute("style")).toBe(false)
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    expect(el.hasAttribute("data-boyo"), "realize after dispose is inert").toBe(
      false
    )
  })
})

describe("skip (#1966)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function playing(): { clicks: Array<string>; card: HTMLElement } {
    const card = document.createElement("ytd-compact-video-renderer")
    card.innerHTML = `<a id="thumbnail" href="/watch?v=next"></a>`
    document.body.append(card)
    const clicks: Array<string> = []
    card.addEventListener("click", (event) => {
      event.preventDefault()
      if (event.target instanceof HTMLElement) clicks.push(event.target.id)
    })
    return { clicks, card }
  }
  const play = (el: HTMLElement): BoundAction => ({
    action: { kind: "play", key: cardKey(asVideoId("next")) },
    targets: [{ el, role: "anchor" }],
  })

  it("clicks the card's watch link, a task after it is asked", () => {
    const { clicks, card } = playing()
    actuator.realize([play(card)])
    expect(clicks).toEqual([])
    vi.advanceTimersByTime(0)
    expect(clicks).toEqual(["thumbnail"])
  })

  it("clicks nothing with no card, or a card with no watch link", () => {
    const { clicks, card } = playing()
    card.innerHTML = `<a id="channel" href="/@chan"></a>`
    actuator.realize([play(card), { ...play(card), targets: [] }])
    vi.advanceTimersByTime(0)
    expect(clicks).toEqual([])
  })

  it("clicks nothing once disposed", () => {
    const { clicks, card } = playing()
    actuator.realize([play(card)])
    actuator.dispose()
    vi.advanceTimersByTime(0)
    expect(clicks).toEqual([])
  })
})

describe("the watch page's hold (#1805, WH1, WH2)", () => {
  const VIDEO = asVideoId("vid_w")
  const watch = (
    view: "pending" | "absent" | "plated" | null,
    videoId: typeof VIDEO | null = VIDEO,
    miniplayer = false,
    extra: { face?: boolean; description?: HTMLElement } = {}
  ): BoundAction => ({
    action: {
      kind: "watch",
      view,
      videoId,
      miniplayer,
      poster: view === "plated" ? "hsl(1 2% 3%)" : null,
      face: extra.face ?? false,
      offer: "release",
    },
    targets:
      extra.description === undefined
        ? []
        : [{ el: extra.description, role: "anchor" }],
  })

  /** A playing video; jsdom implements no playback, so its two calls are stubs. */
  function playing(): HTMLVideoElement & { plays: number } {
    const video = Object.assign(document.createElement("video"), { plays: 0 })
    let paused = false
    Object.defineProperty(video, "paused", { get: () => paused })
    video.pause = (): void => {
      paused = true
    }
    video.play = (): Promise<void> => {
      paused = false
      video.plays += 1
      video.dispatchEvent(new Event("play"))
      return Promise.resolve()
    }
    document.body.appendChild(video)
    return video
  }
  const surface = (): HTMLElement | null =>
    document.querySelector("[data-boyo-not-here]")
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

  beforeEach(() => {
    document.title = "Me at the zoo - YouTube"
  })

  it("holds the page until it is decided: no media, no title, no surface yet", async () => {
    const video = playing()
    actuator.realize([watch("pending")])
    expect(document.documentElement.dataset["boyoWatch"]).toBe("pending")
    expect(video.paused).toBe(true)
    expect(document.title).toBe(NEUTRAL_TITLE)
    expect(surface()).toBeNull()

    void video.play()
    expect(video.paused, "a play while held is paused").toBe(true)
    document.title = "Me at the zoo - YouTube"
    await flush()
    expect(document.title, "a title YouTube writes is replaced").toBe(
      NEUTRAL_TITLE
    )
  })

  it('says "Not here." with a Back button on absent, and is idempotent', () => {
    actuator.realize([watch("absent")])
    actuator.realize([watch("absent")])
    const shown = document.querySelectorAll("[data-boyo-not-here]")
    expect(shown).toHaveLength(1)
    expect(shown[0]?.textContent).toBe("Not here.Back")

    history.pushState(null, "", "#watch")
    const back = vi.spyOn(history, "back").mockImplementation(() => undefined)
    shown[0]?.querySelector("button")?.click()
    expect(back).toHaveBeenCalledTimes(1)
    back.mockRestore()
  })

  it('holds the miniplayer\'s video without saying "Not here." over another page', () => {
    const video = playing()
    actuator.realize([watch("absent", VIDEO, true)])
    expect(document.documentElement.dataset["boyoWatch"]).toBe("absent")
    expect(surface()).toBeNull()
    expect(video.paused).toBe(true)
    actuator.realize([watch("absent")])
    expect(surface()).not.toBeNull()
  })

  it("gives back what it held on plated, and nothing else", async () => {
    const video = playing()
    actuator.realize([watch("pending")])
    document.title = "Me at the zoo - YouTube"
    await flush()
    actuator.realize([watch("plated")])
    expect(document.documentElement.dataset["boyoWatch"]).toBe("plated")
    expect(document.title).toBe("Me at the zoo - YouTube")
    expect(video.plays).toBe(1)
    expect(video.paused).toBe(false)
    expect(surface()).toBeNull()
  })

  it("never gives one video's title to another, or to a page no longer shown", () => {
    actuator.realize([watch("absent")])
    actuator.realize([watch("pending", asVideoId("vid_next"))])
    actuator.realize([watch("plated", asVideoId("vid_next"))])
    expect(document.title).toBe(NEUTRAL_TITLE)

    actuator.realize([watch("absent")])
    actuator.realize([watch(null, null)])
    expect(document.title).toBe(NEUTRAL_TITLE)
    expect(document.documentElement.hasAttribute("data-boyo-watch")).toBe(false)
    expect(surface()).toBeNull()
  })

  it("lifts everything on dispose, and the shown page's title comes back", async () => {
    const video = playing()
    actuator.realize([watch("absent")])
    actuator.dispose()
    expect(document.documentElement.hasAttribute("data-boyo-watch")).toBe(false)
    expect(surface()).toBeNull()
    expect(document.title).toBe("Me at the zoo - YouTube")
    void video.play()
    expect(video.paused, "no listener is left").toBe(false)
    document.title = "Next - YouTube"
    await flush()
    expect(document.title, "no observer is left").toBe("Next - YouTube")
  })
})

describe("the poster and the face control (#1805, QD13)", () => {
  const VIDEO = asVideoId("vid_w")
  function description(): HTMLElement {
    const el = document.createElement("div")
    el.id = "description-inner"
    document.body.append(el)
    return el
  }
  const plated = (
    el: HTMLElement | undefined,
    face = false,
    videoId = VIDEO,
    offer: "none" | "release" | "held" = "release"
  ): BoundAction => ({
    action: {
      kind: "watch",
      view: "plated",
      videoId,
      miniplayer: false,
      poster: "hsl(1 2% 3%)",
      face,
      offer,
    },
    targets: el === undefined ? [] : [{ el, role: "anchor" }],
  })
  const control = (): HTMLElement | null =>
    document.querySelector("[data-boyo-face-hold]")
  const key = (type: "keydown" | "keyup", repeat = false, name = " "): void => {
    control()?.dispatchEvent(
      new KeyboardEvent(type, { key: name, repeat, bubbles: true })
    )
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("plates the poster and offers the control in the description it is given", () => {
    const desc = description()
    actuator.realize([plated(desc)])
    const root = document.documentElement
    expect(root.style.getPropertyValue("--boyo-poster")).toBe("hsl(1 2% 3%)")
    expect(control()?.parentElement).toBe(desc)
    expect(control()?.textContent).toBe("Hold to show the original thumbnail")
    const writes: Array<MutationRecord> = []
    const watcher = new MutationObserver((records) => writes.push(...records))
    watcher.observe(desc, {
      subtree: true,
      childList: true,
      characterData: true,
    })
    actuator.realize([plated(desc)])
    writes.push(...watcher.takeRecords())
    watcher.disconnect()
    expect(writes, "WH1: the same view again writes nothing").toEqual([])
    expect(document.querySelectorAll("[data-boyo-face-hold]")).toHaveLength(1)
  })

  it("rebuilds the control when the mode changes when it reports (#1966)", () => {
    const desc = description()
    actuator.realize([plated(desc)])
    const standard = control()
    actuator.realize([plated(desc, false, VIDEO, "held")])
    expect(control()).not.toBe(standard)
    key("keydown")
    vi.advanceTimersByTime(3_000)
    expect(faced, "Music mix's reports still held").toEqual(["vid_w"])
  })

  it("offers no control under a mode without one, and takes one back (#1966)", () => {
    const desc = description()
    actuator.realize([plated(desc, false, VIDEO, "none")])
    const root = document.documentElement
    expect(root.style.getPropertyValue("--boyo-poster")).toBe("hsl(1 2% 3%)")
    expect(control()).toBeNull()
    actuator.realize([plated(desc)])
    expect(control()?.parentElement).toBe(desc)
    actuator.realize([plated(desc, false, VIDEO, "none")])
    expect(control()).toBeNull()
  })

  it("reports a hold of the full three seconds, and nothing shorter", () => {
    actuator.realize([plated(description())])
    key("keydown")
    vi.advanceTimersByTime(2_999)
    key("keyup")
    vi.advanceTimersByTime(5_000)
    expect(faced, "an early release cancels").toEqual([])

    key("keydown")
    key("keydown", true)
    vi.advanceTimersByTime(1_000)
    control()?.dispatchEvent(new FocusEvent("blur"))
    vi.advanceTimersByTime(5_000)
    expect(faced, "leaving the control cancels").toEqual([])

    key("keydown")
    vi.advanceTimersByTime(3_000)
    key("keydown", false, "Escape")
    key("keyup")
    vi.advanceTimersByTime(0)
    expect(faced, "Escape cancels, even after the full time").toEqual([])

    key("keydown")
    vi.advanceTimersByTime(3_000)
    expect(faced, "it reports on the release").toEqual([])
    key("keyup")
    vi.advanceTimersByTime(0)
    expect(faced).toEqual(["vid_w"])
  })

  it("under Music mix, shows at three seconds held, then offers to hide (#1966)", () => {
    const desc = description()
    actuator.realize([plated(desc, false, VIDEO, "held")])
    const held = control()
    key("keydown")
    vi.advanceTimersByTime(2_999)
    expect(faced).toEqual([])
    vi.advanceTimersByTime(1)
    expect(faced, "reported still held").toEqual(["vid_w"])

    // Core answers: the face is shown, and the same control stays.
    actuator.realize([plated(desc, true, VIDEO, "held")])
    expect(control()).toBe(held)
    expect(control()?.textContent).toBe("Hide original")
    key("keyup")
    vi.advanceTimersByTime(0)
    expect(faced, "the press that showed it hides nothing").toEqual(["vid_w"])

    key("keydown")
    key("keyup")
    expect(faced, "the hide reports at once").toEqual(["vid_w", "-vid_w"])
    actuator.realize([plated(desc, false, VIDEO, "held")])
    expect(control()?.textContent).toBe("Hold to show the original thumbnail")
  })

  it("keeps Space and Enter from YouTube's own keys, held or let go", () => {
    actuator.realize([plated(description())])
    const reached: Array<string> = []
    const page = new AbortController()
    for (const type of ["keydown", "keyup"]) {
      document.addEventListener(type, () => reached.push(type), {
        signal: page.signal,
      })
    }
    for (const name of [" ", "Enter"]) {
      key("keydown", false, name)
      vi.advanceTimersByTime(1_000)
      key("keyup", false, name)
    }
    page.abort()
    expect(reached).toEqual([])
  })

  it("keeps the description's own click from the control", () => {
    const desc = description()
    let expanded = 0
    desc.addEventListener("click", () => (expanded += 1))
    actuator.realize([plated(desc)])
    control()?.click()
    expect(expanded).toBe(0)
  })

  it("lifts the poster's plate once held, and takes everything back after", () => {
    const desc = description()
    actuator.realize([plated(desc)])
    actuator.realize([plated(desc, true)])
    const root = document.documentElement
    expect(root.hasAttribute("data-boyo-face")).toBe(true)
    expect(control(), "the control goes once used").toBeNull()

    actuator.realize([
      {
        action: {
          kind: "watch",
          view: null,
          videoId: null,
          miniplayer: false,
          poster: null,
          face: false,
          offer: "release",
        },
        targets: [],
      },
    ])
    expect(root.hasAttribute("data-boyo-face")).toBe(false)
    expect(root.style.getPropertyValue("--boyo-poster")).toBe("")
    expect(root.hasAttribute("style")).toBe(false)
  })
})

describe("the course (A7, R12)", () => {
  const row = (): HTMLElement => card("ytd-playlist-panel-video-renderer")

  it("stamps where each row stands, and the stop", () => {
    const [a, b, c] = [row(), row(), row()]
    actuator.course([
      { el: a, mark: { place: "played", stop: false } },
      { el: b, mark: { place: "now", stop: true } },
      { el: c, mark: null },
    ])
    expect(a.dataset["boyoCourse"]).toBe("played")
    expect(a.hasAttribute("data-boyo-stop")).toBe(false)
    expect(b.dataset["boyoCourse"]).toBe("now")
    expect(b.hasAttribute("data-boyo-stop")).toBe(true)
    expect(c.hasAttribute("data-boyo-course")).toBe(false)
  })

  it("takes the marks off a row it is no longer handed, and every row on dispose", () => {
    const [a, b] = [row(), row()]
    actuator.course([
      { el: a, mark: { place: "now", stop: true } },
      { el: b, mark: { place: "next", stop: false } },
    ])
    actuator.course([{ el: b, mark: { place: "now", stop: false } }])
    expect(a.hasAttribute("data-boyo-course")).toBe(false)
    expect(a.hasAttribute("data-boyo-stop")).toBe(false)
    expect(b.dataset["boyoCourse"]).toBe("now")

    actuator.dispose()
    expect(b.hasAttribute("data-boyo-course")).toBe(false)
  })

  it("never touches a card's own stamps, nor they its", () => {
    const el = row()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    actuator.course([{ el, mark: { place: "now", stop: false } }])
    actuator.realize([unmount(K)])
    expect(el.hasAttribute("data-boyo")).toBe(false)
    expect(el.dataset["boyoCourse"]).toBe("now")
    actuator.course([])
    expect(el.getAttribute("data-boyo")).toBeNull()
    expect(el.hasAttribute("data-boyo-course")).toBe(false)
  })
})
