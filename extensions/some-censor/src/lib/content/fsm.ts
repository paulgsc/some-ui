import type { FsmEvent, MetaData, ViewState } from "@censor/types/states"

import { extractMeta } from "./extract/meta"
import { extractTitle } from "./extract/title"

/**
 * Pure state transition function.
 *
 * Rules:
 *   WHITELIST → whitelisted             (from any state)
 *   DBLCLICK  → revealed                (fast-reveal from any state)
 *   CLICK on masked   → meta            (snapshot meta at transition time)
 *   CLICK on meta     → title           (title text is a placeholder — async transform
 *                                        runs in VideoRecord after this returns)
 *   CLICK on title    → no-op           (dblclick required to reveal)
 *   CLICK on revealed → no-op
 *
 * el is passed for snapshot extraction (meta, title) — not mutated.
 */
export function transition(
  state: ViewState,
  event: FsmEvent,
  el: HTMLElement
): ViewState {
  if (event === "WHITELIST") return { kind: "whitelisted" }
  if (event === "DBLCLICK") return { kind: "revealed" }

  if (event === "CLICK") {
    switch (state.kind) {
      case "masked": {
        const meta: MetaData = extractMeta(el)
        return { kind: "meta", meta }
      }

      case "meta": {
        // Title text is a raw snapshot here.
        // VideoRecord._applyView will run the async transform and patch it before render.
        const rawTitle = extractTitle(el) ?? ""
        return {
          kind: "title",
          meta: state.meta,
          title: { text: rawTitle, translated: false },
        }
      }

      // title → click → no-op (must dblclick to reveal)
      default:
        return state
    }
  }

  return state
}
