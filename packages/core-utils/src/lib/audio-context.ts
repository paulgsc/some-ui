export type AudioContextConstructor = new () => AudioContext

/**
 * The page's `AudioContext` constructor, or `undefined` where there is none
 * (jsdom, Node). Its type claims it is always present, hence the `typeof`.
 */
export function audioContextConstructor(): AudioContextConstructor | undefined {
  if (typeof window === "undefined") return undefined
  return typeof window.AudioContext === "function"
    ? window.AudioContext
    : undefined
}
