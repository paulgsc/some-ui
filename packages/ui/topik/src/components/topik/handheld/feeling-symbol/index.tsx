import type { JSX } from "react"
import type { FeelingKey } from "@some-ui/styles/theme"

type Glyph = { filled: boolean; paths: ReadonlyArray<string> }

/**
 * The feelings' symbols (docs/makjang/README.md, "The vocabulary"): tension
 * lines, a lightning bolt, cold wind, sweat drops, an anger vein, shock
 * lines, sparkles and rising steam. Topik owns them with the feelings' words;
 * they are drawn in `currentColor`, which a feeling panel sets to its accent.
 */
const GLYPHS: Readonly<Record<FeelingKey, Glyph>> = {
  tension: {
    filled: false,
    paths: ["M13 5v20", "M21 5v30", "M29 5v24", "M37 5v16"],
  },
  rivalry: { filled: true, paths: ["M28 3L12 27h11l-4 18 17-26H25l3-16z"] },
  chill: {
    filled: false,
    paths: ["M5 17h24a6 6 0 1 0-6-6", "M5 27h33a6 6 0 1 1-6 6", "M5 37h16"],
  },
  cringe: {
    filled: true,
    paths: [
      "M17 6c6 9 9 14 9 19a9 9 0 0 1-18 0c0-5 3-10 9-19z",
      "M36 22c3 5 5 8 5 10a5 5 0 0 1-10 0c0-2 2-5 5-10z",
    ],
  },
  fury: {
    filled: false,
    paths: [
      "M20 5Q20 20 5 20",
      "M28 5Q28 20 43 20",
      "M20 43Q20 28 5 28",
      "M28 43Q28 28 43 28",
    ],
  },
  twist: {
    filled: false,
    paths: [
      "M24 3v7",
      "M24 38v7",
      "M3 24h7",
      "M38 24h7",
      "M9 9l5 5",
      "M34 34l5 5",
      "M39 9l-5 5",
      "M9 39l5-5",
      "M24 17v6",
      "M24 29v.5",
    ],
  },
  flutter: {
    filled: true,
    paths: [
      "M19 5c1.2 8 3.5 10.3 11.5 11.5-8 1.2-10.3 3.5-11.5 11.5-1.2-8-3.5-10.3-11.5-11.5 8-1.2 10.3-3.5 11.5-11.5z",
      "M36 28c.7 4.5 2 5.8 6.5 6.5-4.5.7-5.8 2-6.5 6.5-.7-4.5-2-5.8-6.5-6.5 4.5-.7 5.8-2 6.5-6.5z",
    ],
  },
  warmth: {
    filled: false,
    paths: [
      "M14 42c-4-5 4-9 0-14s4-9 0-14",
      "M24 42c-4-5 4-9 0-14s4-9 0-14",
      "M34 42c-4-5 4-9 0-14s4-9 0-14",
    ],
  },
}

export const FeelingSymbol = ({
  feeling,
  className,
}: {
  feeling: FeelingKey
  className?: string
}): JSX.Element => {
  const { filled, paths } = GLYPHS[feeling]
  return (
    <svg
      data-slot="feeling-symbol"
      data-feeling={feeling}
      viewBox="0 0 48 48"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 1.5 : 3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
