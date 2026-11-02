/**
 * What a page hands the home link once (`lib/studio-keeping`,
 * `lib/soundbite-keeping`): a package only the phone's `_apk` routes may load
 * hands its pieces in from its own route, and the lanes read them. Kept from
 * the first hand-in on, a later one ignored, and each listener told once it
 * is. It calls nothing and sends nothing.
 */
export type HandedIn<T> = {
  /** Keeps `handed`, unless something was handed in already. */
  readonly keep: (handed: T) => void
  /** What was handed in; null until then. */
  readonly kept: () => T | null
  /** Calls `listener` once something is handed in. */
  readonly onKept: (listener: () => void) => () => void
}

export function handedIn<T>(): HandedIn<T> {
  let kept: T | null = null
  const listeners = new Set<() => void>()
  return {
    keep: (handed): void => {
      if (kept !== null) return
      kept = handed
      for (const listener of listeners) listener()
    },
    kept: () => kept,
    onKept: (listener): (() => void) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
  }
}
