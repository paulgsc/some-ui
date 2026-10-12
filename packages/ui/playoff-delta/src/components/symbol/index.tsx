import type { JSX } from "react"
import { delay as revealDelay } from "@playoff-delta/components/slides/shared"
import type { Motion, Primitive, SymbolDef } from "@playoff-delta/lib/symbols"
import { cn } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/intent-kit"

/** Complete class strings, so a content scan sees every one. */
const MOTION: Readonly<Record<Motion, string>> = {
  "to-you": "pd-m-to-you",
  pulse: "pd-m-pulse",
  lose: "pd-m-lose",
  drop: "pd-m-drop",
  "fly-out": "pd-m-fly-out",
  fall: "pd-m-fall",
  export: "pd-m-export",
  waste: "pd-m-waste",
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

const DOT: Readonly<Record<"you" | "team" | "out", string>> = {
  you: "pd-p-you",
  team: "pd-p-team",
  out: "pd-p-out",
}

const partKey = (p: Primitive): string =>
  p.kind === "line" ? `line-${p.y}` : `${p.kind}-${p.x}-${p.y}`

const Part = ({ p }: { p: Primitive }): JSX.Element => {
  switch (p.kind) {
    case "you":
    case "team":
    case "out": {
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
    case "rival": {
      return (
        <g className={p.motion ? MOTION[p.motion] : undefined}>
          <circle className="pd-p-team" cx={p.x} cy={p.y} r={6} />
          <circle className="pd-p-ring" cx={p.x} cy={p.y} r={10} />
        </g>
      )
    }
    case "division": {
      return (
        <rect
          className="pd-p-division"
          x={p.x}
          y={p.y}
          width={p.w}
          height={p.h}
          rx={7}
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
    case "line": {
      return <line className="pd-p-line" x1={6} x2={58} y1={p.y} y2={p.y} />
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
  tile = true,
  delay = 0,
  viewBox = "0 0 64 64",
  className = "",
}: {
  parts: ReadonlyArray<Primitive>
  hue: SymbolDef["hue"]
  loop?: boolean
  tile?: boolean
  delay?: number
  viewBox?: string
  className?: string
}): JSX.Element => {
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pd-sym",
        HUE[hue],
        loop && "pd-sym--loop",
        tile && "pd-tile",
        className
      )}
      style={revealDelay(delay)}
      viewBox={viewBox}
    >
      {parts.map((p) => (
        <Part key={partKey(p)} p={p} />
      ))}
    </svg>
  )
}
