import type { HeardWord } from "@interview-week/lib/faults"

/**
 * Words spoken one after another: each `durMs` long, `gapMs` apart, starting
 * at `atMs`, with the given `p`.
 */
export function said(
  text: string,
  {
    atMs = 0,
    durMs = 300,
    gapMs = 100,
    p,
  }: { atMs?: number; durMs?: number; gapMs?: number; p?: number } = {}
): Array<HeardWord> {
  return text
    .split(/\s+/)
    .filter((word) => word !== "")
    .map((word, k) => {
      const startMs = atMs + k * (durMs + gapMs)
      return {
        text: word,
        startMs,
        endMs: startMs + durMs,
        ...(p === undefined ? {} : { p }),
      }
    })
}

/** The words of `parts` in turn, each part starting where its `atMs` says. */
export function joined(...parts: Array<Array<HeardWord>>): Array<HeardWord> {
  return parts.flat()
}
