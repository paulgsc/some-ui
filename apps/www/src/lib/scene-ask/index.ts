/**
 * "Ask for the next scene" on the phone (LA18, docs/learner-data-authority.md;
 * docs/makjang/README.md, "Asking home for the next scene"): topik's
 * `SceneAsk` port. An ask keeps the next scene's prompt on this phone, in
 * `localStorage`, and the Practice lane's drain sends it home
 * (`lib/home-link/prompts`), which keeps it for good and hands it to the
 * morning routine through the Jobs mailbox. Nothing here sends.
 *
 * The phone keeps every ask home does not hold, with no limit, and lets one
 * go only once home has answered with it as it was sent (`held`, from the
 * drain alone), keeping the newest ask so the screen can say home has it.
 * The scene notes an ask named go once home holds them and the ask: the
 * drain marks them `prompted` (`lib/scene-voice`) as it marks the ask held.
 * Phone-only (`build.paths.ts`).
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import {
  localStorageOrNull,
  openKept,
  salvageList,
  writeKept,
} from "@some-ui/core-utils"
import type { SceneAsk, SceneAskSnapshot } from "@some-ui/topik"

/** One ask as this phone keeps it, oldest first in the list. */
export type AskedPrompt = {
  /** `drama-` and the moment it was asked for (topik's `sceneStamp`). */
  readonly stamp: string
  /** When it was asked for, as ISO 8601. */
  readonly at: string
  /** The prompt's markdown, as topik wrote it (`nextSceneFile`). */
  readonly text: string
  /** The phone's ids for the scene notes it names, in the order said. */
  readonly notes: ReadonlyArray<string>
  /** Home answered with it as it was sent. */
  readonly held?: true
}

export function isAsked(value: unknown): value is AskedPrompt {
  if (typeof value !== "object" || value === null) return false
  const notes: unknown = Reflect.get(value, "notes")
  const held: unknown = Reflect.get(value, "held")
  return (
    typeof Reflect.get(value, "stamp") === "string" &&
    typeof Reflect.get(value, "at") === "string" &&
    typeof Reflect.get(value, "text") === "string" &&
    Array.isArray(notes) &&
    notes.every((id) => typeof id === "string") &&
    (held === true || held === undefined)
  )
}

/** `kept` with `asked` added: the asks home holds go, now that it is not the newest. */
export function afterAsk(
  kept: ReadonlyArray<AskedPrompt>,
  asked: AskedPrompt
): Array<AskedPrompt> {
  return [
    ...kept.filter(
      (prompt) => prompt.held !== true && prompt.stamp !== asked.stamp
    ),
    asked,
  ]
}

/**
 * `kept` once home holds the asks `stamps` names: each marked held, and
 * every held one but the newest ask let go. One home does not hold stays.
 */
export function afterHeld(
  kept: ReadonlyArray<AskedPrompt>,
  stamps: ReadonlySet<string>
): Array<AskedPrompt> {
  const newest = kept.at(-1)?.stamp
  return kept
    .map((prompt) =>
      stamps.has(prompt.stamp) ? { ...prompt, held: true as const } : prompt
    )
    .filter((prompt) => prompt.held !== true || prompt.stamp === newest)
}

/** `at` as the person reads it: the day and the time. */
const when = (at: string): string =>
  new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })

/**
 * What the screen says of the asks, in the person's terms (what is kept
 * where, and since when; never the machinery: `index.test.ts`).
 */
export const ASK_WORDS = {
  none: "Your ask goes to home, and home's morning routine writes the scene. It comes back to your list from home.",
  waiting: (at: string, more: number): string =>
    more > 0
      ? `Asked ${when(at)}, with ${String(more)} more before it. They wait on this phone until home has them.`
      : `Asked ${when(at)}. It waits on this phone until home has it.`,
  held: (at: string): string =>
    `Home has your ask from ${when(at)}. Home's morning routine writes the scene, and it comes back to your list.`,
} as const

/** The screen's snapshot of `kept`. */
export function snapshotOf(kept: ReadonlyArray<AskedPrompt>): SceneAskSnapshot {
  const newest = kept.at(-1)
  if (newest === undefined) return { said: ASK_WORDS.none, held: false }
  if (newest.held === true) {
    return { said: ASK_WORDS.held(newest.at), held: true }
  }
  return { said: ASK_WORDS.waiting(newest.at, kept.length - 1), held: false }
}

export type SceneAsksPorts = {
  storage: () => KeyedStorage | null
}

/** The port, and what the drain reads and tells it. */
export type PhoneSceneAsks = SceneAsk & {
  /** Every ask kept on this phone, oldest first. */
  kept: () => Array<AskedPrompt>
  /** Home holds these asks as they were sent (LA18: the drain alone). */
  held: (stamps: ReadonlySet<string>) => void
}

const KEY = "some-ui:scene-asks"
const items = salvageList(isAsked)

export function createSceneAsks(ports: SceneAsksPorts): PhoneSceneAsks {
  const listeners = new Set<() => void>()
  const read = (): Array<AskedPrompt> =>
    openKept(ports.storage(), KEY, items, []).value
  let snapshot: SceneAskSnapshot | null = null
  const publish = (): void => {
    snapshot = snapshotOf(read())
    for (const listener of listeners) listener()
  }
  const write = (next: Array<AskedPrompt>): boolean => {
    const stored = writeKept(ports.storage(), KEY, next, items)
    if (stored) publish()
    return stored
  }
  return {
    getSnapshot: () => (snapshot ??= snapshotOf(read())),
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    ask: ({ stamp, at, text, notes }) =>
      write(afterAsk(read(), { stamp, at, text, notes: [...notes] })),
    kept: read,
    held(stamps): void {
      if (stamps.size > 0) write(afterHeld(read(), stamps))
    },
  }
}

/** The phone's asks, over `localStorage` (the viewer's in-memory copy, too). */
export const sceneAsks: PhoneSceneAsks = createSceneAsks({
  storage: localStorageOrNull,
})
