/**
 * What home holds of the soundbites, read back, as the home link last said
 * (HF5, #2180): each one whose audio and record both reached home. The page
 * hands `soundbitesHeldByHome` to www's home link
 * (`apps/www/src/lib/soundbite-keeping`), which calls it whenever that
 * changes. Only those may leave the phone to make room for a new soundbite
 * (`./policy`'s `nextReplaced`): the cap is an offline set, and nothing
 * leaves before home holds it. Until the link says so, home holds none.
 */

let held: (id: string) => boolean = () => false
let revision = 0
const listeners = new Set<() => void>()

/** The home link says what home holds now. */
export function soundbitesHeldByHome(next: (id: string) => boolean): void {
  held = next
  revision += 1
  for (const listener of listeners) listener()
}

/** Whether home holds this soundbite, as last said. */
export const heldByHome = (id: string): boolean => held(id)

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
