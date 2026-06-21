import type { ViewState } from "@censor/types/states"

/**
 * Pure DOM projection.
 *
 * renderView is the ONLY function allowed to write to veil.innerHTML.
 * It is deterministic and idempotent: same (viewState, veil) → same DOM output.
 * No async, no side effects beyond the veil subtree.
 *
 * CSS reads data-boyo on the renderer element:
 *   "0"  → masked
 *   "1"  → meta
 *   "2"  → title
 *   "3"  → revealed  (veil is being removed; attribute briefly present)
 *   "wl" → whitelisted
 */

const DATA_BOYO: Record<ViewState["kind"], string> = {
  masked: "0",
  meta: "1",
  title: "2",
  revealed: "3",
  whitelisted: "wl",
}

export function renderView(
  state: ViewState,
  veil: HTMLElement,
  rendererEl: HTMLElement
): void {
  rendererEl.dataset["boyo"] = DATA_BOYO[state.kind]
  veil.innerHTML = ""

  switch (state.kind) {
    case "masked":
      // CSS ::before handles the hint text — no children needed
      break

    case "meta": {
      const { channelName, duration, uploadDate } = state.meta
      if (channelName) {
        const chip = el("div", "boyo-meta")
        chip.appendChild(el("div", "boyo-meta-channel", channelName))
        const sub = [duration, uploadDate].filter(Boolean).join(" · ")
        if (sub) chip.appendChild(el("div", "boyo-meta-sub", sub))
        veil.appendChild(chip)
      }
      break
    }

    case "title": {
      // Compact meta chip at top
      const { channelName, duration, uploadDate } = state.meta
      if (channelName) {
        const chip = el("div", "boyo-meta boyo-meta--compact")
        chip.appendChild(el("div", "boyo-meta-channel", channelName))
        const sub = [duration, uploadDate].filter(Boolean).join(" · ")
        if (sub) chip.appendChild(el("div", "boyo-meta-sub", sub))
        veil.appendChild(chip)
      }

      // Title chip
      if (state.title.text) {
        const chip = el("div", "boyo-title-chip", state.title.text)
        if (state.title.translated) {
          chip.dataset["translated"] = "1"
          chip.dataset["lang"] = "translated"
        }
        veil.appendChild(chip)
      }
      break
    }

    case "revealed":
    case "whitelisted":
      // Caller handles veil removal for revealed.
      // Whitelisted: CSS ::before badge — no children needed.
      break
  }
}

/** Minimal element factory — keeps renderView readable without template strings. */
function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
