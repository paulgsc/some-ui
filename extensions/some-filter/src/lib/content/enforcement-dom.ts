/**
 * SF-CUT3 (#1489): the live-DOM side of `enforcement-handshake.ts`'s
 * dependencies, shared by the top frame (`content/content.ts`) and every
 * subframe (`frame/frame.ts`). Kept out of the handshake module itself so
 * that module stays testable with plain fakes.
 */

import type {
  EnforcementDeps,
  EnforcementRequest,
} from "./enforcement-handshake"
import { COMMIT_FALLBACK_MS, TRANSITION_FREEZE_CSS } from "./prepaint"

/**
 * Resolves once the current style has painted at least once: two frames, with
 * the same occluded-tab timer fallback the custody's own atomic swap uses
 * (`prepaint.ts`, `COMMIT_FALLBACK_MS`) — rAF never fires in a background tab.
 */
export function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      resolve()
    }
    requestAnimationFrame(() => requestAnimationFrame(finish))
    setTimeout(finish, COMMIT_FALLBACK_MS)
  })
}

/** The same freeze rule `withPrepaintSuppressed` installs, held open until its remover runs. */
function installFreeze(): () => void {
  const freeze = document.createElement("style")
  freeze.setAttribute("data-my-ext", "")
  freeze.textContent = TRANSITION_FREEZE_CSS
  // At document_start (a subframe's first moment) there is no <head> yet.
  const parent = document.querySelector("head") ?? document.documentElement
  parent.appendChild(freeze)
  // Flush, so the freeze is in effect before the sheet can change a value.
  document.documentElement.getBoundingClientRect()
  return () => freeze.remove()
}

export function createDocumentEnforcementDeps(
  send: (request: EnforcementRequest) => Promise<unknown>
): EnforcementDeps {
  return {
    send,
    readCanvas: (): string =>
      getComputedStyle(document.documentElement).backgroundColor,
    freeze: installFreeze,
    afterPaint,
    setTimer: (fn, ms): unknown => setTimeout(fn, ms),
    clearTimer: (handle): void => {
      if (typeof handle === "number") clearTimeout(handle)
    },
  }
}
