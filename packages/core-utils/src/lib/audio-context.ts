export type AudioContextConstructor = new () => AudioContext

/**
 * The page's `AudioContext` constructor, or `undefined` where there is none.
 * Read off `window` by name rather than through `window.AudioContext`, whose
 * type claims it is always present. It isn't: Safari only exposes the
 * `webkit`-prefixed one, and jsdom and Node expose neither.
 */
export function audioContextConstructor(): AudioContextConstructor | undefined {
  if (typeof window === "undefined") return undefined
  for (const key of ["AudioContext", "webkitAudioContext"]) {
    const candidate: unknown = Reflect.get(window, key)
    if (typeof candidate === "function") {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a `typeof x === "function"` check is as far as the type system goes here; the value came off `window` under a name only an AudioContext constructor is published as
      return candidate as AudioContextConstructor
    }
  }
  return undefined
}
