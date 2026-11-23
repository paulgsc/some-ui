/**
 * What uses each take, on this phone (INUSE, C1360): one runtime per page
 * load over the stores each use is kept in. The spoken cards and the weeks
 * sent are this device's storage; Studio's ideas and videos are handed in
 * by a route that may load Studio's package (`keepUseStores`,
 * `build.paths.ts`), and until one has, they read as unread, never as
 * using nothing (TU1). Phone-only.
 */
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import { weeksSent } from "@some-ui/rust-rounds"
import type { LibraryUses } from "@some-ui/soundbites"

import { handedIn } from "@/lib/handed-in"
import { interviewSent } from "@/lib/interview-week/store"
import { spokenStore } from "@/lib/studio-spoken/store"
import { browserLocalStorage } from "@/lib/tenant/storage"

import { usesOfTake } from "./model"
import type { StudioUseStores, TakeUsesRuntime } from "./runtime"
import { createTakeUses } from "./runtime"
import { USE_WORDS } from "./words"

export type { TakeUse, TakeUses } from "./model"
export { NO_USES, usesAmong, usesOfTake } from "./model"
export type { TakeUsesRuntime } from "./runtime"
export { USE_WORDS, whatLoses } from "./words"

const studio = handedIn<StudioUseStores>()

/** A route that may load Studio's package hands its stores in, once. */
export const keepUseStores = studio.keep

let runtime: TakeUsesRuntime | null = null

/** Made on first use, so importing this module reads nothing. */
export function phoneTakeUses(): TakeUsesRuntime {
  runtime ??= createTakeUses({
    spoken: () => spokenStore(browserLocalStorage).known(),
    interview: () => interviewSent(browserLocalStorage).list(),
    rust: () => weeksSent(browserLocalStorage).list(),
    studio: studio.kept,
    onStudio: studio.onKept,
    failed: (source, error) => {
      reportFailure({
        port: `what uses a take: ${source}`,
        error: toIntentError(error),
      })
    },
  })
  return runtime
}

/** What Takes' rows say of what uses each take (`TakeLibrary`'s `uses`). */
export function libraryUses(): LibraryUses {
  const uses = phoneTakeUses()
  return {
    subscribe: uses.subscribe,
    getSnapshot: uses.getSnapshot,
    inUse: (id): ReadonlyArray<string> => {
      const now = uses.getSnapshot()
      return now === null
        ? []
        : usesOfTake(now, id).map((use) => USE_WORDS.badgeLine(use))
    },
  }
}
