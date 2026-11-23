/**
 * Asking home to run a render again (RETRY), as Run it again reaches it: one
 * request per tap through the link (`lib/home-link/renders`, LA8), its answer
 * read by `./model`. A busy link is asked again (`askWhileBusy`) until it
 * frees, so a tap is never dropped for a drain under way. Every call
 * resolves. Phone-only (`build.paths.ts`).
 */
import { assertNever } from "@some-ui/core-utils"

import { askRunAgain } from "@/lib/home-link/renders"
import { askWhileBusy } from "@/lib/home-link/while-busy"
import { reconcileHome } from "@/lib/take-reconcile"

import type { Attention } from "./model"
import { attentionOf, readAgain } from "./model"
import type { Said, Target } from "./runtime"

export async function runAgainHome({ feed, key }: Target): Promise<Said> {
  const asked = await askWhileBusy(() => askRunAgain(feed, key))
  switch (asked.kind) {
    case "answered": {
      return { kind: "answer", answer: readAgain(asked.answer) }
    }
    case "unreachable": {
      return { kind: "away" }
    }
    case "busy":
    case "unpaired": {
      return { kind: asked.kind }
    }
    default: {
      return assertNever(asked)
    }
  }
}

/**
 * Reads the takes needing attention once, as Run it again weighs them: the
 * same read Needs your attention makes (`lib/take-reconcile`). Never rejects.
 */
export async function readAttentionIds(): Promise<Attention> {
  return attentionOf(await reconcileHome.takes(() => true))
}
