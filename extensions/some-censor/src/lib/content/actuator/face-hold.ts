/**
 * The face control (QD13, #1805): "Hold to show the original thumbnail", in
 * a plated watch page's description. Held for {@link FACE_HOLD_MS} without
 * a break, by the pointer or by Space or Enter, it reports the hold; a
 * release before then, Escape, a lost pointer or focus leaving cancels it.
 * The one control the extension adds to a page it admits, and the one
 * input from the owner that reaches Core (`face`).
 *
 * When the hold reports is the mode's (#1966):
 *
 * - `release`: when it is let go, a task after, because the report takes
 *   the control away: the release and its click still land on the control,
 *   so neither reaches YouTube (Space is its play key, and a click on the
 *   description expands it).
 * - `held`: at three seconds, still held. The control stays, and once told
 *   the thumbnail is {@link FaceControl.shown}, it reads "Hide original":
 *   the press that showed it ends on the control as before, and the next
 *   press and release reports the face hidden.
 *
 * Grey, dashed, and plain on purpose (`absent-plated-heard.md` §4): no
 * progress colour, no reward, no memory of having been held.
 */

import type { FaceWhen } from "@censor/lib/content/core/state"
import { FACE_CONTROL_ATTRIBUTE } from "@censor/lib/content/selectors"

const FACE_HOLD_MS = 3_000

const FACE_LABEL = "Hold to show the original thumbnail"
const HIDE_LABEL = "Hide original"

export type FaceControl = {
  readonly el: HTMLElement
  /** The thumbnail is shown, and the control offers to hide it (`held`). */
  shown(on: boolean): void
  dispose(): void
}

export function createFaceControl(
  doc: Document,
  when: FaceWhen,
  onFace: (shown: boolean) => void
): FaceControl {
  const el = doc.createElement("button")
  el.type = "button"
  el.setAttribute(FACE_CONTROL_ATTRIBUTE, "")
  const label = doc.createElement("span")
  label.textContent = FACE_LABEL
  el.append(label)

  let showing = false
  /** What the press under way does: hold for the face, or hide it. */
  let press: "none" | "hold" | "hide" = "none"
  let timer: ReturnType<typeof setTimeout> | null = null
  /** Held for the whole time: under `release`, the next release reports it. */
  let full = false
  let report: ReturnType<typeof setTimeout> | null = null

  function start(): void {
    if (press !== "none") return
    if (showing) {
      press = "hide"
      return
    }
    press = "hold"
    timer = setTimeout(() => {
      timer = null
      if (when === "held") onFace(true)
      else full = true
    }, FACE_HOLD_MS)
  }

  function cancel(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
    full = false
    press = "none"
  }

  function release(): void {
    const was = press
    const reported = full
    cancel()
    // The control stays when it hides, so the report can come at once.
    if (was === "hide") onFace(false)
    else if (reported && report === null) {
      report = setTimeout(() => {
        report = null
        onFace(true)
      }, 0)
    }
  }

  const held = (event: KeyboardEvent): boolean =>
    event.key === " " || event.key === "Enter"

  // The control's own listeners: they go with the control. The description
  // around it expands on a click, so nothing here reaches it.
  el.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    el.setPointerCapture(event.pointerId)
    start()
  })
  el.addEventListener("pointerup", release)
  for (const type of ["pointercancel", "lostpointercapture"]) {
    el.addEventListener(type, cancel)
  }
  el.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cancel()
    if (!held(event)) return
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) start()
  })
  el.addEventListener("keyup", (event) => {
    if (!held(event)) return
    event.preventDefault()
    event.stopPropagation()
    release()
  })
  el.addEventListener("blur", cancel)
  el.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
  })

  return {
    el,
    shown(on: boolean): void {
      if (on === showing) return
      showing = on
      label.textContent = on ? HIDE_LABEL : FACE_LABEL
    },
    dispose(): void {
      cancel()
      if (report !== null) clearTimeout(report)
      report = null
      el.remove()
    },
  }
}
