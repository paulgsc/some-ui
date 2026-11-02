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
 * drain alone), keeping the newest ask's stamp and time, and nothing more
 * of it, so the screen can say home has it. A new ask never takes the
 * stamp of one kept. Phone-only (`build.paths.ts`).
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import {
  localStorageOrNull,
  openKept,
  salvageList,
  writeKept,
} from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { SceneAsk, SceneAskSnapshot } from "@some-ui/topik"

/** An ask home does not hold yet, whole, to go home. */
export type PendingAsk = {
  /** `drama-` and the moment it was asked for (topik's `sceneStamp`). */
  readonly stamp: string
  /** When it was asked for, as ISO 8601. */
  readonly at: string
  /** The prompt's markdown, as topik wrote it (`nextSceneFile`). */
  readonly text: string
  /** The phone's ids for the scene notes it names, in the order said. */
  readonly notes: ReadonlyArray<string>
  readonly held?: undefined
}

/**
 * The newest ask once home answered with it as it was sent: only what the
 * screen says of it, since home keeps the rest.
 */
type HeldAsk = {
  readonly stamp: string
  readonly at: string
  readonly held: true
}

/** One ask as this phone keeps it, oldest first in the list. */
export type AskedPrompt = PendingAsk | HeldAsk

export function isAsked(value: unknown): value is AskedPrompt {
  if (typeof value !== "object" || value === null) return false
  if (
    typeof Reflect.get(value, "stamp") !== "string" ||
    typeof Reflect.get(value, "at") !== "string"
  ) {
    return false
  }
  const held: unknown = Reflect.get(value, "held")
  if (held === true) return true
  const notes: unknown = Reflect.get(value, "notes")
  return (
    held === undefined &&
    typeof Reflect.get(value, "text") === "string" &&
    Array.isArray(notes) &&
    notes.every((id) => typeof id === "string")
  )
}

/**
 * `kept` with `asked` added: the asks home holds go, now that it is not the
 * newest. Null when `asked`'s stamp is one kept already: a kept ask is never
 * replaced, and home keeps one ask per stamp.
 */
export function afterAsk(
  kept: ReadonlyArray<AskedPrompt>,
  asked: PendingAsk
): Array<AskedPrompt> | null {
  if (kept.some((prompt) => prompt.stamp === asked.stamp)) return null
  return [...kept.filter((prompt) => prompt.held !== true), asked]
}

/**
 * `kept` once home holds the asks `stamps` names: each marked held, and
 * every held one but the newest ask let go, the newest keeping only its
 * stamp and time. One home does not hold stays.
 */
export function afterHeld(
  kept: ReadonlyArray<AskedPrompt>,
  stamps: ReadonlySet<string>
): Array<AskedPrompt> {
  const newest = kept.at(-1)?.stamp
  return kept
    .map(
      (prompt): AskedPrompt =>
        prompt.held === true || stamps.has(prompt.stamp)
          ? { stamp: prompt.stamp, at: prompt.at, held: true }
          : prompt
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
  none: "Your ask waits on this phone until a paired home has it. Home's morning routine writes the scene for your list.",
  waiting: (at: string, more: number): string =>
    more > 0
      ? `Asked ${when(at)}, with ${String(more)} more before it. They wait on this phone until a paired home has them.`
      : `Asked ${when(at)}. It waits on this phone until a paired home has it.`,
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
const PORT = "scene asks"

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
    if (stored) {
      publish()
    } else {
      reportFailure({
        port: PORT,
        error: {
          ...toIntentError(null),
          summary: "This phone couldn't store its asks for the next scene.",
        },
      })
    }
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
    ask({ stamp, at, text, notes }): boolean {
      const next = afterAsk(read(), { stamp, at, text, notes: [...notes] })
      if (next !== null) return write(next)
      reportFailure({
        port: PORT,
        error: {
          ...toIntentError(null),
          summary: "An ask for the next scene came with the stamp of one kept.",
        },
      })
      return false
    },
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
