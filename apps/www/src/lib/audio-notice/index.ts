/**
 * Which activities' first-use audio notice a person has answered on this
 * device (`components/audio/audio-activity-notice`): one key per activity,
 * holding `true`. One the device would not keep stays answered for this
 * page load.
 */
import {
  jsonOf,
  localStorageOrNull,
  openKept,
  readWhole,
  writeKept,
} from "@some-ui/core-utils"

const PREFIX = "some-ui.audio.activity-notice.v1"

const keyOf = (activityId: string): string => `${PREFIX}.${activityId}`

const readAnswered = readWhole((raw): boolean | null => {
  const value = jsonOf(raw)
  return typeof value === "boolean" ? value : null
})

/** Answered this page load, kept or not. */
const answeredHere = new Set<string>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

function onStorage(event: StorageEvent): void {
  if (event.key === null || event.key.startsWith(PREFIX)) notify()
}

export const audioNotice = {
  subscribe(listener: () => void): () => void {
    if (listeners.size === 0) window.addEventListener("storage", onStorage)
    listeners.add(listener)
    return (): void => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        window.removeEventListener("storage", onStorage)
      }
    }
  },

  answered(activityId: string): boolean {
    return (
      answeredHere.has(activityId) ||
      openKept(localStorageOrNull(), keyOf(activityId), readAnswered, false)
        .value
    )
  },

  answer(activityId: string): void {
    answeredHere.add(activityId)
    writeKept(localStorageOrNull(), keyOf(activityId), true, readAnswered)
    notify()
  },
}
