/**
 * Runs a new idea's bundle (`./bundle`) on the shared bundle runtime
 * (`@some-ui/voice-capture`'s `bundleRuntime`): the take pattern on the
 * phone's desk of idea takes (www's `lib/idea-takes`, with `send:
 * "on-confirm"`), the draft (`./draft`), the ideas kept (`./store`), the
 * lists an idea picks from, and home. Send keeps the idea with the ideas
 * kept, then lets its takes go home, then clears the draft.
 */
import type {
  BundleHome,
  BundleRuntime,
  BundleTakes,
} from "@some-ui/voice-capture"
import { bundleRuntime } from "@some-ui/voice-capture"

import type { IdeaBundleKind } from "./bundle"
import { IDEA_BUNDLE } from "./bundle"
import type { DraftStore, IdeaLists } from "./draft"
import type { IdeaStore } from "./store"

export type BundlePorts = {
  readonly takes: BundleTakes
  readonly drafts: DraftStore
  readonly ideas: IdeaStore
  /** The topics and keywords an idea picks from. */
  readonly lists: () => IdeaLists
  readonly home: BundleHome
  /** Milliseconds since the epoch. */
  readonly now: () => number
  /** A new idea's id: letters, digits and dashes. */
  readonly newId: () => string
  /** As `onPageVisibility`: now, then on each change. */
  readonly onVisibility: (listener: (hidden: boolean) => void) => () => void
}

export function createIdeaBundle(
  ports: BundlePorts
): BundleRuntime<IdeaBundleKind> {
  const { ideas, lists, ...rest } = ports
  return bundleRuntime(IDEA_BUNDLE, { ...rest, records: ideas, context: lists })
}
