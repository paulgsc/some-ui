/**
 * The landing's one script (C1422): it enhances the show, and nothing else.
 * The page reads whole without it, as the flat list a reader who blocks
 * scripts gets. It keeps nothing and asks nothing of any origin.
 *
 * - **The deck** (`deck.ts`): below 900 px, the show's scenes turn one at a
 *   time by a swipe, read by the phone's own pager (`createPager`, GES5),
 *   or by the arrow keys. Three blocks a scene, one index and one progress
 *   for all three, round and round.
 * - **The media**: each face's clip or still crossfades in over its preview
 *   once it can be shown (a still decoded, a clip's first frame), and gives
 *   way to its title card should it fail.
 * - **The clips** stay ambient (no controls, muted, looping, inline), but
 *   play only while their face is in view: on screen, and on the stage only
 *   while the show's clock has their scene up (`data-on`, timeline.ts).
 */
import type { PagerRuntime, PagerState, Turn } from "@some-ui/shared"
import { createPager, offsetOf } from "@some-ui/shared"

import type { DeckEvent, DeckState } from "./deck.ts"
import { DECK_QUERY, restAt, step, viewOf } from "./deck.ts"
import { faceOn } from "./timeline.ts"
import { LANDING_WORDS } from "./words.ts"

const REDUCE = "(prefers-reduced-motion: reduce)"
const prefersMotion = (): boolean => !matchMedia(REDUCE).matches

/** The deck's facts for the pager: it always turns both ways, being round. */
const ROUND = {
  orientation: "horizontal",
  canPrev: true,
  canNext: true,
  held: false,
} as const

/** How recently the deck lost focus to nothing for its teardown to count it as the deck's. */
const JUST_LOST_MS = 200

/**
 * Runs the deck over `flat` while the window is narrow, from scene `from`,
 * telling `kept` each scene it lands on (so a turn of the phone that crosses
 * 900 px and back comes back to it); returns its teardown.
 */
function mountDeck(
  show: HTMLElement,
  flat: HTMLElement,
  from: number,
  kept: (at: number) => void
): () => void {
  const scenes = [...flat.querySelectorAll<HTMLElement>(".scene-flat")]
  const n = scenes.length
  if (n < 2) return () => undefined
  const words = LANDING_WORDS.deck
  let state: DeckState = restAt(Math.min(from, n - 1))
  let frame = 0

  const title = (at: number): string =>
    scenes[at]?.querySelector("h4")?.textContent ?? ""

  // What a screen reader hears once a turn lands, and the dots that say
  // where: each a button to its scene, so a reader with no swipe and no
  // arrow keys (TalkBack, switch access) reaches every scene too.
  const status = document.createElement("p")
  status.className = "deck-status"
  status.setAttribute("aria-live", "polite")
  const dots = document.createElement("div")
  dots.className = "deck-dots"
  dots.setAttribute("role", "group")
  dots.setAttribute("aria-label", words.dots)
  dots.append(
    ...scenes.map((_, i) => {
      const dot = document.createElement("button")
      dot.type = "button"
      dot.setAttribute("aria-label", words.landed(title(i), i + 1, n))
      dot.addEventListener("click", () => {
        run({ type: "goto", at: i })
      })
      return dot
    })
  )
  const hint = document.createElement("p")
  hint.className = "deck-hint"
  hint.id = "deck-hint"
  hint.textContent = words.hint
  flat.after(dots, hint, status)

  flat.setAttribute("role", "region")
  flat.setAttribute("aria-roledescription", "carousel")
  flat.setAttribute("aria-label", words.label)
  flat.setAttribute("aria-describedby", hint.id)
  flat.tabIndex = 0
  show.dataset["deck"] = "on"

  function draw(): void {
    const view = viewOf(state, n, performance.now())
    scenes.forEach((scene, i) => {
      const face =
        i === view.at ? "current" : i === view.incoming ? "incoming" : null
      if (face === null) scene.removeAttribute("data-face")
      else scene.dataset["face"] = face
      // Only the scene at rest is the reader's, by keyboard or reader.
      scene.inert = !(face === "current" && state.kind === "rest")
    })
    flat.style.setProperty("--p", String(view.progress))
    flat.style.setProperty("--side", String(view.side))
    flat.dataset["moving"] = state.kind === "rest" ? "" : "true"
    ;[...dots.children].forEach((dot, i) => {
      if (i === view.at) dot.setAttribute("aria-current", "true")
      else dot.removeAttribute("aria-current")
    })
  }

  function run(event: DeckEvent): void {
    const [next, effects] = step(state, event, n, prefersMotion())
    state = next
    for (const effect of effects) {
      status.textContent = words.landed(title(effect.at), effect.at + 1, n)
      kept(effect.at)
    }
    draw()
    if (state.kind === "settle" && frame === 0)
      frame = requestAnimationFrame(tick)
  }

  function tick(now: number): void {
    frame = 0
    run({ type: "frame", now })
  }

  const turn = (to: Turn): void => {
    run({ type: "turn", to, now: performance.now() })
  }

  const pager: PagerRuntime = createPager({ deck: () => ROUND, page: turn })
  let was: PagerState["kind"] = "idle"
  const unsubscribe = pager.subscribe(() => {
    const now = pager.getState()
    if (now.kind === "tracking" && was !== "tracking") run({ type: "touch" })
    if (now.kind === "dragging") {
      const width = flat.clientWidth || 1
      run({ type: "drag", progress: offsetOf(now, ROUND) / width })
    }
    // Let go short, or the touch turned out to be a scroll: back it goes.
    // A touch that turned the deck waits for the pager's turn instead.
    if (now.kind === "idle" || now.kind === "passed") {
      run({ type: "release", now: performance.now() })
    }
    was = now.kind
  })
  const detach = pager.attach(flat, "horizontal")
  // Vertical scroll and a pinch stay the page's.
  flat.style.touchAction = "pan-y pinch-zoom"

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
    // Alt+Left is the browser's Back, and the rest are someone else's too.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    event.preventDefault()
    turn(event.key === "ArrowRight" ? "next" : "prev")
  }
  flat.addEventListener("keydown", onKey)
  // Hiding the deck as the window widens can blur it before its media
  // query reports the change (a style read in between is enough), so a
  // focus it lost to nothing just before the teardown still counts as its.
  let lostAt = Number.NEGATIVE_INFINITY
  const onOut = (event: FocusEvent): void => {
    if (event.relatedTarget === null) lostAt = performance.now()
  }
  flat.addEventListener("focusout", onOut)
  dots.addEventListener("focusout", onOut)
  draw()

  return () => {
    // Focus in the deck, its dots included, moves to the show as the deck
    // goes, rather than falling to the page's start.
    const active = document.activeElement
    const focused =
      flat.contains(active) ||
      dots.contains(active) ||
      ((active === null || active === document.body) &&
        performance.now() - lostAt < JUST_LOST_MS)
    // A turn in flight lands where it was going.
    run({ type: "touch" })
    flat.removeEventListener("keydown", onKey)
    flat.removeEventListener("focusout", onOut)
    detach()
    unsubscribe()
    cancelAnimationFrame(frame)
    for (const scene of scenes) {
      scene.removeAttribute("data-face")
      scene.inert = false
    }
    for (const name of [
      "role",
      "aria-roledescription",
      "aria-label",
      "aria-describedby",
      "tabindex",
      "data-moving",
    ])
      flat.removeAttribute(name)
    flat.style.removeProperty("--p")
    flat.style.removeProperty("--side")
    delete show.dataset["deck"]
    dots.remove()
    hint.remove()
    status.remove()
    if (focused) {
      show.tabIndex = -1
      show.addEventListener(
        "blur",
        () => {
          show.removeAttribute("tabindex")
        },
        { once: true }
      )
      show.focus({ preventScroll: true })
    }
  }
}

/** The deck, mounted while the window is narrow and torn down when it widens. */
function deck(): void {
  const show = document.querySelector<HTMLElement>(".show")
  const flat = show?.querySelector<HTMLElement>(".flat")
  if (show == null || flat == null) return
  const narrow = matchMedia(DECK_QUERY)
  let teardown: (() => void) | null = null
  let at = 0
  const fit = (): void => {
    if (narrow.matches && teardown === null)
      teardown = mountDeck(show, flat, at, (landed) => {
        at = landed
      })
    if (!narrow.matches && teardown !== null) {
      teardown()
      teardown = null
    }
  }
  narrow.addEventListener("change", fit)
  fit()
}

/** A face's media, shown over its preview once it can be, or its title card. */
function reveal(aperture: HTMLElement): void {
  const media = aperture.querySelector<HTMLElement>(".media")
  if (media === null) return
  const ready = (): void => {
    if (aperture.dataset["state"] === "pending")
      aperture.dataset["state"] = "ready"
  }
  const failed = (): void => {
    aperture.dataset["state"] = "failed"
  }
  aperture.dataset["state"] = "pending"
  media.addEventListener("error", failed, { once: true })
  if (media instanceof HTMLImageElement) {
    const decoded = (): void => {
      media.decode().then(ready, failed)
    }
    // Already painted before the script ran: shown as it is, no flicker.
    if (media.complete)
      if (media.naturalWidth > 0) aperture.dataset["state"] = "ready"
      else failed()
    else media.addEventListener("load", decoded, { once: true })
  } else if (media instanceof HTMLVideoElement) {
    if (media.error !== null) failed()
    else if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) ready()
    else media.addEventListener("loadeddata", ready, { once: true })
  }
}

/** Where the show's clock is, in seconds into its cycle, or null where it isn't running. */
function showClock(): number | null {
  for (const animation of document.getAnimations()) {
    if (
      !(animation instanceof CSSAnimation) ||
      !animation.animationName.startsWith("s-")
    )
      continue
    const timing = animation.effect?.getComputedTiming()
    const duration = Number(timing?.duration)
    if (timing?.progress == null || !Number.isFinite(duration)) return null
    return (timing.progress * duration) / 1000
  }
  return null
}

/** How often a clip on the stage is checked against the show's clock. */
const CLIP_CHECK_MS = 250

/** Plays each clip only while its face is in view, and pauses it otherwise. */
function clips(): void {
  const videos = [...document.querySelectorAll<HTMLVideoElement>("video.media")]
  if (videos.length === 0) return
  const seen = new Set<HTMLVideoElement>()
  // Clips the browser refused to start (autoplay not allowed): not asked
  // again until their face is out of view, on screen or on the show's clock.
  const refused = new Set<HTMLVideoElement>()
  // Each clip is in both layouts; only check() starts one.
  for (const video of videos) {
    video.autoplay = false
    video.pause()
  }
  const cycleOf = (): number => {
    const show = document.querySelector<HTMLElement>(".show")
    if (show === null) return 0
    return Number.parseFloat(getComputedStyle(show).getPropertyValue("--show"))
  }
  const check = (): void => {
    const t = showClock()
    const cycle = cycleOf()
    for (const video of videos) {
      const face = video.closest<HTMLElement>("[data-on]")
      const on =
        seen.has(video) &&
        (face === null ||
          (t !== null && faceOn(face.dataset["on"] ?? "", t, cycle)))
      if (on && video.paused && !refused.has(video))
        video.play().catch((error: unknown) => {
          // Ignored: a clip that doesn't start keeps its preview, which is
          // what the face shows in its place. A refusal, or a source that
          // can't play, is remembered; a play our own pause cut short
          // (AbortError) is asked again.
          if (
            error instanceof DOMException &&
            (error.name === "NotAllowedError" ||
              error.name === "NotSupportedError")
          )
            refused.add(video)
        })
      if (!on) {
        refused.delete(video)
        if (!video.paused) video.pause()
      }
    }
  }
  const watcher = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!(entry.target instanceof HTMLVideoElement)) continue
      if (entry.isIntersecting) seen.add(entry.target)
      else seen.delete(entry.target)
    }
    check()
  })
  for (const video of videos) watcher.observe(video)
  setInterval(() => {
    if (seen.size > 0) check()
  }, CLIP_CHECK_MS)
}

document.documentElement.classList.add("enhanced")
for (const aperture of document.querySelectorAll<HTMLElement>(".aperture"))
  reveal(aperture)
clips()
deck()
