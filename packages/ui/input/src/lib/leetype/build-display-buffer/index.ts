import { buildDisplayMap } from "@input/lib/leetype/leetype-wasm-loader"

export type DisplayChar = {
  char: string // the rendered character
  unitIndex: number // canonical unit index (always defined)
  displayIndex: number // 0..N-1
}

export function buildDisplayBuffer(code: string): Array<DisplayChar> {
  // buildDisplayMap returns an array of unitIndex (one per character)
  const map: Array<number> = Array.from(buildDisplayMap(code))

  const chars = Array.from(code) // preserves multi-codepoint characters
  // defensive: ensure map length == chars.length
  if (map.length !== chars.length) {
    // fallback: if wasm returned shorter map, expand with last index
    const last = map.at(-1) ?? 0
    while (map.length < chars.length) map.push(last)
  }

  return chars.map((char, i) => ({
    char,
    unitIndex: map[i] ?? -1,
    displayIndex: i,
  }))
}
