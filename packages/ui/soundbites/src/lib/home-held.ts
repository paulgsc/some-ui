/**
 * What home holds of the soundbites, read back, as the home link last said
 * (HF5, #2180): each one whose audio and record both reached home. The page
 * hands `soundbitesHeldByHome` to www's home link
 * (`apps/www/src/lib/soundbite-keeping`), which calls it whenever that
 * changes. Only those may make room for a new soundbite (`./policy`'s
 * `nextReplaced`). Until the link says so, home holds none.
 */

/** Whether home holds a soundbite, as one reading of what home holds. */
export type Held = (id: string) => boolean

let held: () => Held = () => () => false
let revision = 0
const listeners = new Set<() => void>()

/**
 * The home link says how to read what home holds now: `next` is asked once
 * per look at the soundbites (`homeHoldsNow`), for a reading of what home
 * holds then.
 */
export function soundbitesHeldByHome(next: () => Held): void {
  held = next
  revision += 1
  for (const listener of listeners) listener()
}

/** One reading of what home holds, for one look at the soundbites. */
export const homeHoldsNow = (): Held => held()

/** For `useSyncExternalStore`: moves each time the link says again. */
export const homeHeld = {
  getSnapshot: (): number => revision,
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return (): void => {
      listeners.delete(listener)
    }
  },
}
