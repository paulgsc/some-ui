/**
 * What uses each take, on this phone (INUSE, C1360): one runtime per page
 * load over the stores each use is kept in. The spoken cards and the weeks
 * sent are this device's storage; Studio's ideas and videos are handed in
 * by a route that may load Studio's package (`keepUseStores`,
 * `build.paths.ts`), and until one has, they read as unread, never as
 * using nothing (TU1). Phone-only.
 */
import type { ReactNode } from "react"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import { WEEK_SENT_KEY, weeksSent } from "@some-ui/rust-rounds"
import type { LibraryUses } from "@some-ui/soundbites"

import { handedIn } from "@/lib/handed-in"
import { interviewSent, SENT_KEY } from "@/lib/interview-week/store"
import { SCRIPTS_KEY, spokenStore } from "@/lib/studio-spoken/store"
import { browserLocalStorage } from "@/lib/tenant/storage"

import { usesOfTake } from "./model"
import type { TakeUse, UseSource } from "./model"
import type { StudioUseStores, TakeUsesRuntime } from "./runtime"
import { createTakeUses } from "./runtime"

export type { TakeUse, TakeUses, UseSource } from "./model"
export { NO_USES, usesAmong, usesOfTake } from "./model"
export type { TakeUsesRuntime } from "./runtime"
export { USE_WORDS, whatLoses } from "./words"

/**
 * `read()`, or null when this phone set a record kept under `key` aside as
 * unreadable (core-utils' `openKept`, `<key>:unreadable:1` on): what that
 * record picks is unknown, never none (TU1).
 */
export function wholeOrNull<T>(key: string, read: () => T | null): T | null {
  return browserLocalStorage.getItem(`${key}:unreadable:1`) === null
    ? read()
    : null
}

const studio = handedIn<StudioUseStores>()

/** A route that may load Studio's package hands its stores in, once. */
export const keepUseStores = studio.keep

let runtime: TakeUsesRuntime | null = null

/** Made on first use, so importing this module reads nothing. */
export function phoneTakeUses(): TakeUsesRuntime {
  runtime ??= createTakeUses({
    spoken: () =>
      wholeOrNull(SCRIPTS_KEY, () => spokenStore(browserLocalStorage).known()),
    interview: () =>
      wholeOrNull(SENT_KEY, () => interviewSent(browserLocalStorage).list()),
    rust: () =>
      wholeOrNull(WEEK_SENT_KEY, () => weeksSent(browserLocalStorage).list()),
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

/**
 * What Takes' cards draw of what uses each take (`TakeLibrary`'s `uses`):
 * `draw` is the route's mark (`components/take-uses`' `UseMark`), handed
 * each take's uses and the stores unread; nothing before the first read.
 */
export function libraryUses(
  draw: (
    uses: ReadonlyArray<TakeUse>,
    unread: ReadonlyArray<UseSource>
  ) => ReactNode
): LibraryUses {
  const uses = phoneTakeUses()
  return {
    subscribe: uses.subscribe,
    getSnapshot: uses.getSnapshot,
    mark: (id): ReactNode => {
      const now = uses.getSnapshot()
      return now === null ? null : draw(usesOfTake(now, id), now.unread)
    },
  }
}
