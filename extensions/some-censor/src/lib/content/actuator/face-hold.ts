/**
 * The face control (QD13, #1805): "Hold to show the original thumbnail", in
 * a plated watch page's description. Held for {@link FACE_HOLD_MS} without
 * a break, by the pointer or by Space or Enter, it reports the hold when it
 * is let go; a release before then, Escape, a lost pointer or focus leaving
 * cancels it. The one control the extension adds to a page it admits, and the one
 * input from the owner that reaches Core (`face`).
 *
 * It reports on the release, a task after it, because the report takes the
 * control away: the release and its click still land on the control, so
 * neither reaches YouTube (Space is its play key, and a click on the
 * description expands it).
 *
 * Grey, dashed, and plain on purpose (`absent-plated-heard.md` §4): no
 * progress colour, no reward, no memory of having been held. Nothing on it
 * changes while it is held (#1966).
 */

import { FACE_CONTROL_ATTRIBUTE } from "@censor/lib/content/selectors"

const FACE_HOLD_MS = 3_000

const FACE_LABEL = "Hold to show the original thumbnail"

export type FaceControl = {
  readonly el: HTMLElement
  dispose(): void
}

export function createFaceControl(
  doc: Document,
  onHeld: () => void
): FaceControl {
  const el = doc.createElement("button")
  el.type = "button"
  el.setAttribute(FACE_CONTROL_ATTRIBUTE, "")
  const label = doc.createElement("span")
  label.textContent = FACE_LABEL
  el.append(label)

  let timer: ReturnType<typeof setTimeout> | null = null
  /** Held for the whole time: the next release reports it. */
  let full = false
  let report: ReturnType<typeof setTimeout> | null = null

  function start(): void {
    if (timer !== null || full) return
    timer = setTimeout(() => {
      timer = null
      full = true
    }, FACE_HOLD_MS)
  }

  function cancel(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
    full = false
  }

  function release(): void {
    const reported = full
    cancel()
    if (reported && report === null) {
      report = setTimeout(() => {
        report = null
        onHeld()
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
    dispose(): void {
      cancel()
      if (report !== null) clearTimeout(report)
      report = null
      el.remove()
    },
  }
}
