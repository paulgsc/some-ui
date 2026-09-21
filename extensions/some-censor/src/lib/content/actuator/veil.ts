/**
 * The veil's subtree (BC4, #1437) — the former DOM handle's render and its chip
 * builders, as functions over a veil element the Actuator owns.
 *
 * Invariants carried over from the former DOM handle:
 *
 *   D5 — No class names here. Every class string comes from veil-styles.ts,
 *        which is the only file UnoCSS scans; a literal written here would
 *        not be generated and so would silently do nothing. This module
 *        decides *what* nodes exist, never what they look like.
 *
 * The whole subtree is rebuilt on every call. That is cheap (at most four
 * nodes) and it is what makes rendering idempotent by construction: there is
 * no partial-update path that could leave a chip from a previous state
 * behind. Child order is the reading order — hint, then meta, then title —
 * so the flex column lays them out without absolute positioning (#973).
 */

import type { RenderModel, VeilContent } from "@censor/lib/content/fsm"
import {
  hintClass,
  META,
  META_CHANNEL,
  META_SUB,
  railClass,
  TITLE,
  TITLE_LANG,
  VEIL,
} from "@censor/lib/content/veil-styles"
import { assertNever } from "@some-extension/common"

/** Create an occluding veil element, not yet attached. */
export function createVeil(doc: Document): HTMLElement {
  const v = doc.createElement("div")
  v.className = VEIL.occluding
  return v
}

/** Project `model` onto `veil`'s subtree. */
export function renderVeil(veil: HTMLElement, model: RenderModel): void {
  const doc = veil.ownerDocument
  veil.className = VEIL[model.veilTone]
  veil.replaceChildren()

  const { hint } = model
  if (hint) veil.appendChild(node(doc, "div", hintClass(hint.tone), hint.label))

  appendContent(doc, veil, model.veilContent)

  veil.appendChild(node(doc, "div", railClass(model.rail)))
}

/** Switch a veil to its exit animation; the caller removes it afterwards. */
export function beginVeilExit(veil: HTMLElement): void {
  veil.className = VEIL.revealed
}

function appendContent(
  doc: Document,
  veil: HTMLElement,
  content: VeilContent
): void {
  const { kind } = content
  switch (kind) {
    case "empty": {
      break
    }
    case "meta": {
      appendMetaChip(doc, veil, content.meta, META.roomy)
      break
    }
    case "title": {
      appendMetaChip(doc, veil, content.meta, META.compact)
      appendTitleChip(doc, veil, content.title)
      break
    }
    default: {
      kind satisfies never
      assertNever(kind)
    }
  }
}

/**
 * The channel chip, with the duration · date sub-line beneath it.
 *
 * The sub-line is always built; `META_SUB` hides it below a 220px card rather
 * than this code deciding. Keeping the decision in CSS means it responds to
 * the card's real width without this module measuring anything.
 */
function appendMetaChip(
  doc: Document,
  veil: HTMLElement,
  meta: {
    channelName: string | null
    duration: string | null
    uploadDate: string | null
  },
  chipClass: string
): void {
  const { channelName, duration, uploadDate } = meta
  if (!channelName) return

  const chip = node(doc, "div", chipClass)
  chip.appendChild(node(doc, "div", META_CHANNEL, channelName))

  const sub = [duration, uploadDate].filter(Boolean).join(" · ")
  if (sub) chip.appendChild(node(doc, "div", META_SUB, sub))

  veil.appendChild(chip)
}

function appendTitleChip(
  doc: Document,
  veil: HTMLElement,
  title: { text: string; translated: boolean }
): void {
  if (!title.text) return

  const { translated } = title
  const chip = node(
    doc,
    "div",
    translated ? TITLE.translated : TITLE.plain,
    title.text
  )
  if (translated) {
    chip.dataset["translated"] = "1"
    chip.appendChild(node(doc, "span", TITLE_LANG, "translated"))
  }
  veil.appendChild(chip)
}

function node(
  doc: Document,
  tag: string,
  className: string,
  text?: string
): HTMLElement {
  const n = doc.createElement(tag)
  n.className = className
  if (text !== undefined) n.textContent = text
  return n
}
