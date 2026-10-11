import type { JSX } from "react"
import { getActivityByRegistryKey } from "@some-ui/activity-catalog"
import type { RegistryEntry } from "@some-ui/types"

function noteFor(registryKey: string): RegistryEntry {
  const name = getActivityByRegistryKey(registryKey)?.name ?? "This activity"
  const WebOnlyNote = (): JSX.Element => (
    <div className="text-muted-foreground flex h-full items-center justify-center p-4 text-center text-sm">
      {name} is played on the desktop web.
    </div>
  )
  return {
    Component: WebOnlyNote,
    preload: () => Promise.resolve({ default: WebOnlyNote }),
  }
}

/**
 * `panels`, with a note bound to each of `keys` it leaves unbound. A stored
 * session can hold a web-surface scene this build cannot play (the Android
 * app, for one composed with Hangul Honeycomb before the phone stopped
 * offering it): it plays as stored, durations and all, and that scene says
 * where it is played instead of going blank.
 */
export function withWebOnlyNotes<P extends object>(
  panels: P,
  keys: ReadonlyArray<string>
): P & Record<string, RegistryEntry> {
  const notes = Object.fromEntries(
    keys
      .filter((key) => !Object.hasOwn(panels, key))
      .map((key) => [key, noteFor(key)])
  )
  return { ...notes, ...panels }
}
