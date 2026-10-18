/**
 * The face control (QD13, #1805): "Hold to show the original thumbnail", in
 * a plated watch page's description. Held for {@link FACE_HOLD_MS} without
 * a break, by the pointer or by Space or Enter, it reports the hold; any
 * release, a lost pointer or focus leaving cancels it. The one control the
 * extension adds to a page it admits, and the one input from the owner that
 * reaches Core (`face`).
 *
 * Grey, dashed, and plain on purpose (`absent-plated-heard.md` §4): no
 * progress colour, no reward, no memory of having been held. `content.css`
 * draws the fill, and drops its animation under `prefers-reduced-motion`.
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

  function start(): void {
    if (timer !== null) return
    el.dataset["holding"] = ""
    timer = setTimeout(() => {
      timer = null
      delete el.dataset["holding"]
      onHeld()
    }, FACE_HOLD_MS)
  }

  function cancel(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
    delete el.dataset["holding"]
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
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    el.addEventListener(type, cancel)
  }
  el.addEventListener("keydown", (event) => {
    if (!held(event)) return
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) start()
  })
  el.addEventListener("keyup", (event) => {
    if (held(event)) cancel()
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
      el.remove()
    },
  }
}
