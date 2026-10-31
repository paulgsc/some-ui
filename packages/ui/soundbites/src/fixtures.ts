/**
 * Fakes to mount Studio on, for this workspace's tests and for pages outside
 * it (www's ui-fit phone page, whose `FIT_PHONE_PAGE` in build.profiles.ts
 * says why it has its own build). Not the phone's code: nothing here reaches
 * IndexedDB, the microphone or the page's storage.
 */
import type { Primer } from "./lib/journal/primer"
import { readPrimer } from "./lib/journal/primer"
import type { ProjectEvent, ProjectState } from "./lib/project/model"
import { step } from "./lib/project/model"

export { fakeMic } from "./lib/fake-mic"
export { memoryProjectStore } from "./lib/project/memory-store"
export { cutListOf, projectFromPrimer } from "./lib/project/script"

/** The primer `text` reads as; throws if it does not read. */
export function primerOf(text: string): Primer {
  const reading = readPrimer(text)
  if (!reading.ok)
    throw new Error(`the primer does not read: ${reading.problem}`)
  return reading.primer
}

/** `events` in order from `state`, each one accepted; throws on a refusal. */
export function run(
  state: ProjectState,
  ...events: ReadonlyArray<ProjectEvent>
): ProjectState {
  return events.reduce((at, event) => {
    const next = step(at, event)
    if (next.refused !== null) {
      throw new Error(`the project refuses ${event.type}: ${next.refused}`)
    }
    return next.state
  }, state)
}
