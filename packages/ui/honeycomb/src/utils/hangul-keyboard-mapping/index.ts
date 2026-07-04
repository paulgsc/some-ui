// hangul-keyboard-mapping.ts
// Dubeolsik (두벌식) Korean keyboard layout mapping
// Maps QWERTY keys to their corresponding Hangul characters

export type HangulMapping = {
  qwerty: string
  hangul: string
  romanization: string
}

// Consonants (자음)
export const CONSONANTS: Array<HangulMapping> = [
  { qwerty: "r", hangul: "ㄱ", romanization: "g/k" },
  { qwerty: "R", hangul: "ㄲ", romanization: "kk" },
  { qwerty: "s", hangul: "ㄴ", romanization: "n" },
  { qwerty: "e", hangul: "ㄷ", romanization: "d/t" },
  { qwerty: "E", hangul: "ㄸ", romanization: "tt" },
  { qwerty: "f", hangul: "ㄹ", romanization: "r/l" },
  { qwerty: "a", hangul: "ㅁ", romanization: "m" },
  { qwerty: "q", hangul: "ㅂ", romanization: "b/p" },
  { qwerty: "Q", hangul: "ㅃ", romanization: "pp" },
  { qwerty: "t", hangul: "ㅅ", romanization: "s" },
  { qwerty: "T", hangul: "ㅆ", romanization: "ss" },
  { qwerty: "d", hangul: "ㅇ", romanization: "ng" },
  { qwerty: "w", hangul: "ㅈ", romanization: "j" },
  { qwerty: "W", hangul: "ㅉ", romanization: "jj" },
  { qwerty: "c", hangul: "ㅊ", romanization: "ch" },
  { qwerty: "z", hangul: "ㅋ", romanization: "k" },
  { qwerty: "x", hangul: "ㅌ", romanization: "t" },
  { qwerty: "v", hangul: "ㅍ", romanization: "p" },
  { qwerty: "g", hangul: "ㅎ", romanization: "h" },
]

// Vowels (모음)
export const VOWELS: Array<HangulMapping> = [
  { qwerty: "k", hangul: "ㅏ", romanization: "a" },
  { qwerty: "o", hangul: "ㅐ", romanization: "ae" },
  { qwerty: "i", hangul: "ㅑ", romanization: "ya" },
  { qwerty: "O", hangul: "ㅒ", romanization: "yae" },
  { qwerty: "j", hangul: "ㅓ", romanization: "eo" },
  { qwerty: "p", hangul: "ㅔ", romanization: "e" },
  { qwerty: "u", hangul: "ㅕ", romanization: "yeo" },
  { qwerty: "P", hangul: "ㅖ", romanization: "ye" },
  { qwerty: "h", hangul: "ㅗ", romanization: "o" },
  { qwerty: "hk", hangul: "ㅘ", romanization: "wa" },
  { qwerty: "ho", hangul: "ㅙ", romanization: "wae" },
  { qwerty: "hl", hangul: "ㅚ", romanization: "oe" },
  { qwerty: "y", hangul: "ㅛ", romanization: "yo" },
  { qwerty: "n", hangul: "ㅜ", romanization: "u" },
  { qwerty: "nj", hangul: "ㅝ", romanization: "wo" },
  { qwerty: "np", hangul: "ㅞ", romanization: "we" },
  { qwerty: "nl", hangul: "ㅟ", romanization: "wi" },
  { qwerty: "b", hangul: "ㅠ", romanization: "yu" },
  { qwerty: "m", hangul: "ㅡ", romanization: "eu" },
  { qwerty: "ml", hangul: "ㅢ", romanization: "ui" },
  { qwerty: "l", hangul: "ㅣ", romanization: "i" },
]

// Combined mapping for easy lookup
export const ALL_MAPPINGS: Array<HangulMapping> = [...CONSONANTS, ...VOWELS]

// Create reverse lookup map (hangul -> qwerty)
export const HANGUL_TO_QWERTY: Map<string, string> = new Map(
  ALL_MAPPINGS.map((m) => [m.hangul, m.qwerty])
)

// Create forward lookup map (qwerty -> hangul)
export const QWERTY_TO_HANGUL: Map<string, string> = new Map(
  ALL_MAPPINGS.map((m) => [m.qwerty, m.hangul])
)

// Helper functions
export function getRandomHangul(): HangulMapping {
  const index = Math.floor(Math.random() * ALL_MAPPINGS.length)
  // Using the non-null assertion (!) because we know at compile time the array is not empty
  return ALL_MAPPINGS[index]!
}

export function isCorrectKey(hangul: string, pressedKey: string): boolean {
  const correctKey = HANGUL_TO_QWERTY.get(hangul)
  return correctKey === pressedKey
}

export function getHangulColor(hangul: string): string {
  // Consonants get cool colors, vowels get warm colors
  if (CONSONANTS.some((c) => c.hangul === hangul)) {
    const colors = ["#3b82f6", "#8b5cf6", "#06b6d4", "#14b8a6", "#6366f1"]
    return colors[Math.floor(Math.random() * colors.length)] ?? "#3b82f6"
  }
  const colors = ["#f59e0b", "#ef4444", "#ec4899", "#f97316", "#eab308"]
  return colors[Math.floor(Math.random() * colors.length)] ?? "#ef4444"
}
