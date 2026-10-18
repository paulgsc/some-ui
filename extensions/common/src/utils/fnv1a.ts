/**
 * FNV-1a over a string's UTF-16 code units, as an unsigned 32-bit value.
 * A stable, non-cryptographic label: never a secret.
 */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
