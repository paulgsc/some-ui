export const SOLUTIONS: Record<
  number,
  { direction: "across" | "down"; answer: string }
> = {
  1: { direction: "down", answer: "TALL" },
  2: { direction: "across", answer: "SAD" },
  3: { direction: "across", answer: "COLD" },
  4: { direction: "down", answer: "DOWN" },
  5: { direction: "across", answer: "SLOW" },
  6: { direction: "down", answer: "LEFT" },
  7: { direction: "down", answer: "SMALL" },
  8: { direction: "down", answer: "LIKE" },
  9: { direction: "across", answer: "UNDER" },
  10: { direction: "across", answer: "END" },
  11: { direction: "down", answer: "SOFT" },
  12: { direction: "down", answer: "DRY" },
  13: { direction: "across", answer: "STRONG" },
  14: { direction: "across", answer: "CLOSED" },
  15: { direction: "across", answer: "LOW" },
  16: { direction: "down", answer: "OLD" },
  17: { direction: "across", answer: "COLD" },
  18: { direction: "across", answer: "LOUD" },
}

export const CLUES = {
    across: [
        { num: 2, clue: "Opposite of happy" },
        { num: 3, clue: "Opposite of hot" },
        { num: 5, clue: "Opposite of fast" },
        { num: 9, clue: "Opposite of over" },
        { num: 10, clue: "Opposite of start" },
        { num: 13, clue: "Opposite of weak" },
        { num: 14, clue: "Opposite of open" },
        { num: 15, clue: "Opposite of high" },
        { num: 17, clue: "Opposite of hot" },
        { num: 18, clue: "Opposite of quiet" },
    ],
    down: [
        { num: 1, clue: "Opposite of short" },
        { num: 4, clue: "Opposite of up" },
        { num: 6, clue: "Opposite of right" },
        { num: 7, clue: "Opposite of big" },
        { num: 8, clue: "Opposite of dislike" },
        { num: 11, clue: "Opposite of hard" },
        { num: 12, clue: "Opposite of wet" },
        { num: 16, clue: "Opposite of young" },
    ],
}

