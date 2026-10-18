/**
 * The plate (QD12, #1804): what a plated card paints in place of its
 * thumbnail and its channel photo, as values `styles/content.css` reads.
 *
 * Pure. Its only inputs are ids and the channel's display name, never the
 * image: a tone is stable per id, different from its neighbours, and means
 * nothing (`docs/absent-plated-heard.md` §3).
 */

/** FNV-1a over the string's UTF-16 code units, as an unsigned 32-bit value. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** A muted tone: hue `h mod 360`, saturation 10–17%, lightness 17–22%. */
export function tone(id: string): string {
  const h = fnv1a(id)
  const saturation = 10 + ((h >>> 9) % 8)
  const lightness = 17 + ((h >>> 13) % 6)
  return `hsl(${h % 360} ${saturation}% ${lightness}%)`
}

/**
 * The channel disc's letter: the name's first letter or digit, punctuation
 * and symbols skipped (`《Lost Summer》` → `L`). Empty when there is none.
 */
export function initial(name: string | null): string {
  return name?.match(/[\p{L}\p{N}]/u)?.[0].toLocaleUpperCase() ?? ""
}
