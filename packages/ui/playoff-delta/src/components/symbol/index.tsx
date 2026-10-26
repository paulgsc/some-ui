import type { JSX } from "react"
import { delay as revealDelay } from "@playoff-delta/components/slides/shared"
import type { Motion, Primitive, SymbolDef } from "@playoff-delta/lib/symbols"
import { cn } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/intent-kit"

/** Complete class strings, so a content scan sees every one. */
const MOTION: Readonly<Record<Motion, string>> = {
  "to-winner": "pd-m-to-winner",
  pulse: "pd-m-pulse",
  lose: "pd-m-lose",
  export: "pd-m-export",
  bounce: "pd-m-bounce",
}

const HUE: Readonly<Record<SymbolDef["hue"], string>> = {
  1: "pd-hue-1",
  2: "pd-hue-2",
  3: "pd-hue-3",
  4: "pd-hue-4",
  5: "pd-hue-5",
  neutral: "",
}

const DOT: Readonly<Record<"you" | "team", string>> = {
  you: "pd-p-you",
  team: "pd-p-team",
}

const partKey = (p: Primitive): string => `${p.kind}-${p.x}-${p.y}`

const Part = ({ p }: { p: Primitive }): JSX.Element => {
  switch (p.kind) {
    case "you":
    case "team": {
      return (
        <circle
          className={cn(DOT[p.kind], p.motion && MOTION[p.motion])}
          cx={p.x}
          cy={p.y}
          r={6}
        />
      )
    }
    case "win": {
      return (
        <circle
          className={cn("pd-p-win", p.motion && MOTION[p.motion])}
          cx={p.x}
          cy={p.y}
          r={3.2}
        />
      )
    }
    case "conference": {
      return (
        <rect
          className="pd-p-conference"
          x={p.x}
          y={p.y}
          width={p.w}
          height={p.h}
          rx={10}
        />
      )
    }
    default: {
      return assertNever(p)
    }
  }
}

/**
 * One symbol, drawn from its primitives. `loop` keeps its motion running (where
 * a symbol is introduced); otherwise it plays once after `delay` seconds.
 */
export const SymbolGlyph = ({
  parts,
  hue,
  loop = false,
  delay = 0,
  className = "",
}: {
  parts: ReadonlyArray<Primitive>
  hue: SymbolDef["hue"]
  loop?: boolean
  delay?: number
  className?: string
}): JSX.Element => {
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pd-sym",
        HUE[hue],
        loop && "pd-sym--loop",
        "pd-tile",
        className
      )}
      style={revealDelay(delay)}
      viewBox="0 0 64 64"
    >
      {parts.map((p) => (
        <Part key={partKey(p)} p={p} />
      ))}
    </svg>
  )
}
