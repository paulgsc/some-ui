import { useEffect, useId, useRef, useState } from "react"
import type { CSSProperties, JSX, KeyboardEvent, ReactNode } from "react"
import { HexGrid } from "@honeycomb/components/hex-grid"
import type { HexPoint } from "@honeycomb/types/hex-grid"
import { assertNever } from "@honeycomb/utils/error"
import type { LucideIcon } from "lucide-react"
import {
  ArrowLeft,
  Boxes,
  CodeXml,
  Contrast,
  EyeOff,
  HardDrive,
  HeartPulse,
  Music,
  UserX,
  WifiOff,
} from "lucide-react"
import { cn } from "some-ui-utils"

import type {
  Emblem,
  ExtensionDefinition,
  Mechanism,
  Stage,
} from "./extensions.data"
import {
  EXTENSIONS,
  LABEL,
  PAGE_TITLE,
  PRIVACY_ATOMS,
  PRIVACY_LINE,
  STAGE_LABEL,
  STAGE_LINE,
  STAGE_ORDER,
} from "./extensions.data"

import "./index.css"

/**
 * The /extensions comb: six browser extensions, told visually.
 *
 * ## The design law
 *
 * > The page communicates visually. Every word is a function of a purposeful
 * > user interaction.
 *
 * At rest the page paints the comb and the three-word rest cue, and nothing
 * else. Words are disclosed progressively and never rendered preemptively:
 * names and micro-labels ride in the cells, and the one sentence a level has
 * to say appears in the caption directly under the comb (beside it on a short
 * landscape screen). Nothing ever covers the comb — no dialog, no drawer, no
 * popover — so disclosure happens by *re-roling the cells that are already
 * there*.
 *
 * The sentence used to live inside the centroid, scaled with the comb. That
 * made its type size a function of the viewport, and on a phone it landed at
 * 7–8px — the payload of the whole level, unreadable exactly where most
 * visitors arrive. The caption is page type, so it is the same readable size
 * on every screen, and the comb keeps only what it can say at any scale.
 *
 * ## The register model
 *
 * Seven registers — six ring, one centroid — whose meaning is reassigned by
 * depth. The geometry is invariant at every level; only what the registers
 * hold changes, which is what makes the model recursive: an L3 would be the
 * same move again.
 *
 *   L0 · index    ring = the six extensions      core = brand mark + rest cue
 *   L1 · subject  ring = facets of one extension core = its emblem + name
 *   L2 · facet    ring = that facet's atoms      core = the facet's name
 *
 * ## Painted by `HexGrid`
 *
 * The comb is honeycomb's own `HexGrid`, so its geometry comes from the same
 * WASM crate (`@some-ui/some-hexagon`) that lays out every other hex surface
 * in this package: one hex renderer, not two. `HexGrid` paints each of the
 * seven cells as a *wax* path — the lattice — and hands this file the cell's
 * path and centre through `renderCell`, where the cell proper is drawn inset
 * within its wax, so the walls between cells are the wax showing through.
 *
 * All paint comes from the `.comb` component skin in `@some-ui/styles`
 * (`themes/comb.css`): fixed honey, and wax derived from the session theme.
 * Nothing in this file or `index.css` names a colour literal.
 */

// ------------------------------------------------------------------ geometry

/**
 * Natural hex circumradius, in viewBox units. `HexGrid` never draws larger
 * than this (it letterbox-scales *down* to its box), so it is also the comb's
 * size cap on a large desktop: a radius-1 pointy-top comb is 5.2 × 5 of these.
 * Every size below is in the same units, so type and glyphs scale with the
 * cells and the ratio of ink to cell is the same on every screen.
 */
const HEX = 140

/**
 * How much of its wax socket a cell fills. The remaining band is the wall
 * between neighbours: without it seven tessellated hexes read as one blob.
 */
const INSET = 0.9

/**
 * The seven cells of a radius-1 grid, by cube coordinate — the id format the
 * WASM grid emits. `HexGrid` only paints cells it has content for, so all
 * seven are listed; what each one *holds* is decided by position in
 * `renderCell`, not by id.
 */
const COMB_CUBES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [1, -1, 0],
  [1, 0, -1],
  [0, 1, -1],
  [-1, 1, 0],
  [-1, 0, 1],
  [0, -1, 1],
]

const WAX_CONTENT = COMB_CUBES.map(([q, r, s]) => ({
  id: `hex_${q}_${r}_${s}`,
  content: { data: null, theme: { className: "xcomb-wax" } },
}))

/**
 * Ring slot of a cell from its centre, clockwise from the upper right. The
 * grid is pointy-top, so the six neighbours sit on the 0/60/…/300 degree
 * spokes: upper-right is slot 0 and upper-left — the corner a reader's eye
 * returns to — is slot 5, which is always the way up.
 */
function slotAt(x: number, y: number, width: number): number | "core" {
  if (Math.hypot(x, y) < width / 2) return "core"
  const degrees = (Math.atan2(y, x) * 180) / Math.PI
  return ((Math.round((degrees + 60) / 60) % 6) + 6) % 6
}

function localPath(
  points: Array<HexPoint>,
  cx: number,
  cy: number
): { d: string; radius: number } {
  const local = points.map((p) => ({
    x: (p.x - cx) * INSET,
    y: (p.y - cy) * INSET,
  }))
  const [first, ...rest] = local
  if (!first) return { d: "", radius: 0 }
  const d = `M${first.x},${first.y} ${rest.map((p) => `L${p.x},${p.y}`).join(" ")} Z`
  return { d, radius: Math.hypot(first.x, first.y) }
}

// --------------------------------------------------------------------- cells

/**
 * Which ink a register's art is drawn in. A cell partly full of honey draws
 * its art twice, clipped at the waterline: honey-ink below it and cell-ink
 * above, so a glyph the waterline crosses stays legible on both sides instead
 * of vanishing into whichever half matches its colour.
 */
type Tone = "cell" | "honey"

type CellSpec = {
  /** Re-mounts the cell when its meaning changes, which replays its entrance. */
  key: string
  /** Honey fill, 0..1. Authored; see `ExtensionDefinition.level`. */
  honey?: number
  /** A slot with no register at this depth. Drawn, never dropped. */
  ghost?: boolean
  /** The one finished tool, which breathes at rest. */
  beacon?: boolean
  /** Present on an actionable register, which makes it a button. */
  label?: string
  onActivate?: () => void
  onPeek?: (on: boolean) => void
  /** A display register's meaning, for a reader who cannot see its glyph. */
  describe?: string
  art?: (tone: Tone) => ReactNode
}

const onKeyActivate =
  (activate: () => void) =>
  (event: KeyboardEvent<SVGGElement>): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      activate()
    }
  }

/**
 * One register, drawn in the cell's own coordinates (origin at its centre).
 *
 * An actionable register is a focusable `role="button"` group carrying an
 * `aria-label`, reachable by Tab and activated by Enter or Space. Its focus
 * and hover state is a stroke on the hexagon itself, so the ring follows all
 * six edges — the old CSS clip-path cells could only ever ring their flat top
 * and bottom, and ate `outline` entirely.
 */
const CombCell = ({
  spec,
  d,
  radius,
  index,
  focus = false,
}: {
  spec: CellSpec
  d: string
  radius: number
  index: number
  /** Take focus on mount; see `focusKey` in `ExtensionsComb`. */
  focus?: boolean
}): JSX.Element => {
  const ref = useRef<SVGGElement>(null)
  useEffect(() => {
    if (focus) ref.current?.focus()
  }, [focus])

  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const hexClip = `${id}-hex`
  const aboveClip = `${id}-above`
  const belowClip = `${id}-below`
  const gradient = `${id}-honey`

  const level = Math.min(1, Math.max(0, spec.honey ?? 0))
  const waterline = radius - 2 * radius * level
  const actionable = spec.onActivate !== undefined

  const style: CSSProperties & { "--xcomb-i": number } = {
    "--xcomb-i": index,
  }

  const a11y = actionable
    ? {
        role: "button",
        tabIndex: 0,
        "aria-label": spec.label,
        onClick: spec.onActivate,
        onKeyDown: spec.onActivate ? onKeyActivate(spec.onActivate) : undefined,
        onPointerEnter: (): void => spec.onPeek?.(true),
        onPointerLeave: (): void => spec.onPeek?.(false),
        onFocus: (): void => spec.onPeek?.(true),
        onBlur: (): void => spec.onPeek?.(false),
      }
    : spec.describe
      ? { role: "img", "aria-label": spec.describe }
      : {}

  return (
    <g
      className={cn(
        "xcomb-cell",
        actionable && "xcomb-cell-action",
        spec.ghost && "xcomb-cell-ghost",
        spec.beacon && "xcomb-cell-beacon"
      )}
      style={style}
      ref={ref}
      {...a11y}
    >
      <defs>
        <clipPath id={hexClip}>
          <path d={d} />
        </clipPath>
        <clipPath id={aboveClip}>
          <rect
            x={-radius}
            y={-radius}
            width={2 * radius}
            height={waterline + radius}
          />
        </clipPath>
        <clipPath id={belowClip}>
          <rect
            x={-radius}
            y={waterline}
            width={2 * radius}
            height={radius - waterline}
          />
        </clipPath>
        <linearGradient id={gradient} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" className="xcomb-stop-deep" />
          <stop offset="0.6" className="xcomb-stop-mid" />
          <stop offset="1" className="xcomb-stop-surface" />
        </linearGradient>
      </defs>

      <g className="xcomb-lift">
        <path d={d} className="xcomb-body" />

        {level > 0 && (
          <g clipPath={`url(#${hexClip})`}>
            <rect
              x={-radius}
              y={waterline}
              width={2 * radius}
              height={radius - waterline}
              fill={`url(#${gradient})`}
            />
            {level < 1 && (
              <line
                x1={-radius}
                x2={radius}
                y1={waterline}
                y2={waterline}
                className="xcomb-meniscus"
              />
            )}
          </g>
        )}

        {spec.art && (
          <g aria-hidden={actionable ? true : undefined}>
            {level < 1 && (
              <g clipPath={`url(#${aboveClip})`} className="xcomb-tone-cell">
                {spec.art("cell")}
              </g>
            )}
            {level > 0 && (
              <g
                clipPath={`url(#${belowClip})`}
                className="xcomb-tone-honey"
                aria-hidden
              >
                {spec.art("honey")}
              </g>
            )}
          </g>
        )}

        <path d={d} className="xcomb-ring" />
      </g>
    </g>
  )
}

// ---------------------------------------------------------------------- art

const EMBLEM_ICON = {
  memory: HardDrive,
  contrast: Contrast,
  covered: EyeOff,
  belt: Boxes,
  music: Music,
  beat: HeartPulse,
} as const satisfies Record<Emblem, LucideIcon>

const PRIVACY_ICON = [WifiOff, UserX, CodeXml] as const

const Glyph = ({
  icon: Icon,
  size,
  y = 0,
  className,
}: {
  icon: LucideIcon
  size: number
  y?: number
  className?: string
}): JSX.Element => (
  <g className={className}>
    <Icon
      x={-size / 2}
      y={y - size / 2}
      width={size}
      height={size}
      strokeWidth={1.7}
    />
  </g>
)

/** Past this many characters a line is wider than a cell at label size. */
const LINE_MAX = 12

/**
 * One line, or two broken at the space nearest the middle. A two-word name
 * set on one line is wider than a cell at every size, and breaking it keeps
 * the type large instead of shrinking it to fit — but breaking at *every*
 * space stacks "pick / a / cell" into a column, so it breaks once, evenly.
 */
function lineBreak(text: string): Array<string> {
  if (text.length <= LINE_MAX || !text.includes(" ")) return [text]
  const middle = text.length / 2
  let at = -1
  for (let i = 0; i < text.length; i++) {
    if (
      text[i] === " " &&
      (at < 0 || Math.abs(i - middle) < Math.abs(at - middle))
    )
      at = i
  }
  return [text.slice(0, at), text.slice(at + 1)]
}

const Words = ({
  text,
  y,
  className,
  size,
}: {
  text: string
  y: number
  className: string
  size: number
}): JSX.Element => {
  const lines = lineBreak(text)
  const lead = size * 1.15
  const top = y - ((lines.length - 1) * lead) / 2
  return (
    <text className={className} textAnchor="middle" fill="currentColor">
      {lines.map((line, k) => (
        <tspan key={line} x={0} y={top + k * lead}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

const Label = ({
  text,
  y,
  className,
}: {
  text: string
  y: number
  className?: string
}): JSX.Element => (
  <Words text={text} y={y} size={19} className={cn("xcomb-label", className)} />
)

/** The mark's own ring offsets, as in `hex-comb-mark.tsx`. */
const MARK_RING: ReadonlyArray<readonly [number, number]> = [
  [0, -20],
  [17.321, -10],
  [17.321, 10],
  [0, 20],
  [-17.321, 10],
  [-17.321, -10],
]

const MARK_CELL = "M9 0 4.5 7.794 -4.5 7.794 -9 0 -4.5 -7.794 4.5 -7.794Z"

const BrandMark = ({ y }: { y: number }): JSX.Element => (
  <g transform={`translate(0 ${y}) scale(1.35)`} aria-hidden>
    {MARK_RING.map(([x, my]) => (
      <path
        key={`${x},${my}`}
        d={MARK_CELL}
        transform={`translate(${x} ${my})`}
        className="xcomb-mark-ring"
      />
    ))}
    <path d={MARK_CELL} className="xcomb-mark-core" />
  </g>
)

/**
 * The two browser marks, hand-drawn as a matched pair so the only difference
 * between them is the one the register encodes: lit, or 20%.
 */
const BrowserMark = ({
  kind,
  x,
  on,
}: {
  kind: "firefox" | "chrome"
  x: number
  on: boolean
}): JSX.Element => (
  <g
    transform={`translate(${x - 22} -40) scale(1.85)`}
    className={cn("xcomb-browser", !on && "xcomb-off")}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    {kind === "firefox" ? (
      <>
        <path d="M5.6 7.4c1.6 3 4.2 3.2 6.4 3.2 3 0 4.4-1.3 5.6-2.6" />
        <path d="M12 21c3.4 0 6-2.4 6-5.4 0-2-1.2-3.6-3-4.2" />
      </>
    ) : (
      <>
        <circle cx="12" cy="12" r="3.6" />
        <line x1="21" y1="8.4" x2="12" y2="8.4" />
        <line x1="4.2" y1="7" x2="9.4" y2="14" />
        <line x1="14.2" y1="14.6" x2="9.6" y2="21" />
      </>
    )}
  </g>
)

/**
 * The L1 mechanism register: a looping diagram of what the tool does, with no
 * words at all. Drawn in SVG rather than as HTML in a `foreignObject`, which
 * WebKit — every browser on an iPhone — positions wrongly once its content is
 * transformed or animated. Keyframes live in `index.css` and every one of them
 * stops under `prefers-reduced-motion`.
 */
const Mini = ({ kind }: { kind: Mechanism }): JSX.Element => {
  switch (kind) {
    case "tabs": {
      return (
        <g aria-hidden>
          {[0, 1, 2, 3].map((k) => (
            <rect
              key={k}
              x={-58}
              y={-46 + k * 24}
              width={116}
              height={14}
              rx={4}
              className="xcomb-mini-tab"
              style={{ animationDelay: `${k * 0.5}s` }}
            />
          ))}
        </g>
      )
    }
    case "theme": {
      return (
        <g aria-hidden>
          <rect
            x={-62}
            y={-44}
            width={124}
            height={88}
            rx={10}
            className="xcomb-mini-page"
          />
          <rect x={-48} y={-30} width={96} height={7} rx={3} />
          <rect x={-48} y={-17} width={96} height={7} rx={3} />
          <rect x={-48} y={-4} width={52} height={7} rx={3} />
          <rect
            x={-48}
            y={14}
            width={96}
            height={18}
            rx={5}
            className="xcomb-mini-accent"
          />
        </g>
      )
    }
    case "veil": {
      return (
        <g aria-hidden>
          <defs>
            <clipPath id="xcomb-veil-card">
              <rect x={-62} y={-44} width={124} height={88} rx={10} />
            </clipPath>
          </defs>
          <rect
            x={-62}
            y={-44}
            width={124}
            height={88}
            rx={10}
            className="xcomb-mini-card"
          />
          <rect x={-48} y={14} width={96} height={7} rx={3} />
          <rect x={-48} y={27} width={60} height={7} rx={3} />
          <g clipPath="url(#xcomb-veil-card)">
            <rect
              x={-62}
              y={-44}
              width={124}
              height={88}
              className="xcomb-mini-veil"
            />
          </g>
        </g>
      )
    }
    case "cubes": {
      return (
        <g aria-hidden>
          <defs>
            <clipPath id="xcomb-belt">
              <rect x={-70} y={-30} width={140} height={60} />
            </clipPath>
          </defs>
          <line x1={-70} x2={70} y1={26} y2={26} className="xcomb-mini-rail" />
          <g clipPath="url(#xcomb-belt)">
            {[0, 1, 2].map((k) => (
              <rect
                key={k}
                x={72}
                y={-14}
                width={30}
                height={30}
                rx={4}
                className="xcomb-mini-cube"
                style={{ animationDelay: `${k * 1.1}s` }}
              />
            ))}
          </g>
        </g>
      )
    }
    case "bars": {
      return (
        <g aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <rect
              key={k}
              x={-54 + k * 19}
              y={-36}
              width={12}
              height={72}
              rx={4}
              className="xcomb-mini-bar"
              style={{ animationDuration: `${(0.7 + k * 0.19).toFixed(2)}s` }}
            />
          ))}
        </g>
      )
    }
    case "pulse": {
      return (
        <g aria-hidden>
          <rect
            x={-64}
            y={-1.5}
            width={128}
            height={3}
            rx={1.5}
            className="xcomb-mini-rail"
          />
          <g className="xcomb-mini-travel">
            <circle r={9} className="xcomb-mini-ping" />
            <circle r={8} className="xcomb-mini-dot" />
          </g>
        </g>
      )
    }
    default: {
      return assertNever(kind)
    }
  }
}

// -------------------------------------------------------------- state machine

type Facet = "stage" | "privacy"

/**
 * Depth is the whole model: `null` subject is the index, a subject with no
 * facet is L1, and a subject with a facet is L2. Adding a level is the same
 * move again, which is why this is a path rather than an enum of screens.
 *
 * There is deliberately no global keydown handler and no Escape binding. The
 * back cell is the only way up, because a route with no overlay has nothing
 * for Escape to mean, and a hidden key that sometimes navigates is worse than
 * a visible cell that always does.
 */
type View = { subject: number | null; facet: Facet | null }

type Level = {
  ring: ReadonlyArray<CellSpec>
  core: CellSpec
  /** The level's one sentence, or `null` at rest. */
  caption: string | null
}

export const ExtensionsComb = (): JSX.Element => {
  const [view, setView] = useState<View>({ subject: null, facet: null })
  const [peek, setPeek] = useState<number | null>(null)

  /**
   * The cell to focus once a transition lands. Every cell is re-keyed when
   * the level changes (that is what replays the entrance), so the cell that
   * was just activated unmounts while it holds focus, and focus would fall to
   * the document: the next Tab would restart at the page chrome, outside the
   * comb. Each move therefore names where focus goes instead — into the
   * level's first facet going down, and back to the cell it came from going
   * up. `null` on arrival, so loading the page steals no focus.
   */
  const [focusKey, setFocusKey] = useState<string | null>(null)

  const subject =
    view.subject === null ? null : (EXTENSIONS[view.subject] ?? null)

  const level: Level =
    subject === null
      ? indexLevel(peek, setPeek, (i) => {
          setPeek(null)
          setView({ subject: i, facet: null })
          setFocusKey(`subject-stage-${EXTENSIONS[i]?.id ?? ""}`)
        })
      : view.facet === null
        ? subjectLevel(
            subject,
            () => {
              setView({ subject: null, facet: null })
              setFocusKey(`index-${subject.id}`)
            },
            (facet) => {
              setView({ subject: view.subject, facet })
              setFocusKey(`facet-${facet}-back`)
            }
          )
        : facetLevel(subject, view.facet, () => {
            setView({ subject: view.subject, facet: null })
            setFocusKey(`subject-${view.facet ?? "stage"}-${subject.id}`)
          })

  return (
    <div className="comb xcomb-root">
      {/*
        The page paints no prose at rest, not even a title. A screen reader
        has no comb to look at, though, and a document with no heading gives
        it nothing to announce or navigate by — so the heading exists and is
        visually hidden. It is a document label, not copy.
      */}
      <h1 className="sr-only">{PAGE_TITLE}</h1>

      <div className="xcomb-layout">
        <div className="xcomb-stage">
          <HexGrid
            cellCount={7}
            hexSize={HEX}
            viewBoxFactor={1.04}
            padding={0}
            minHexSize={1}
            backgroundOpacity={0}
            cellContent={WAX_CONTENT}
            notifyFit={false}
            fallback={null}
            renderCell={(cell, cx, cy, width) => {
              const slot = slotAt(cx, cy, width)
              const spec = slot === "core" ? level.core : level.ring[slot]
              if (!spec) return null
              const { d, radius } = localPath(cell.points, cx, cy)
              return (
                <g transform={`translate(${cx} ${cy})`}>
                  <CombCell
                    key={spec.key}
                    spec={spec}
                    focus={spec.key === focusKey}
                    d={d}
                    radius={radius}
                    index={slot === "core" ? 0 : slot + 1}
                  />
                </g>
              )
            }}
          />
        </div>

        {/*
          The level's one sentence. Page type rather than comb type, so it is
          the same readable size on a phone as on a desktop; announced
          politely, because it is what a click on a cell *said*.
        */}
        <p className="xcomb-caption" aria-live="polite">
          {level.caption !== null && (
            <span key={level.caption} className="xcomb-caption-text">
              {level.caption}
            </span>
          )}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- L0 · index

/**
 * Ring slot *i* is extension *i*, carrying its emblem and filled with honey to
 * its authored level. Hovering or focusing a cell swaps the centroid's brand
 * mark for that extension's name — cheap to enter, cheap to leave. A touch
 * screen cannot hover, so there the name also rides in the cell itself; that
 * is keyed on the pointer's capability in `index.css`, not on width, because
 * a narrow desktop window still hovers.
 */
function indexLevel(
  peek: number | null,
  onPeek: (i: number | null) => void,
  onPick: (i: number) => void
): Level {
  const peeked = peek === null ? null : (EXTENSIONS[peek] ?? null)

  const ring = EXTENSIONS.map(
    (ext, i): CellSpec => ({
      key: `index-${ext.id}`,
      honey: ext.level,
      beacon: ext.level >= 0.999,
      label: ext.name,
      onActivate: () => onPick(i),
      onPeek: (on) => onPeek(on ? i : null),
      art: () => (
        <>
          <Glyph
            icon={EMBLEM_ICON[ext.emblem]}
            size={56}
            className="xcomb-emblem"
          />
          <Label text={ext.name} y={50} className="xcomb-name" />
        </>
      ),
    })
  )

  const core: CellSpec = {
    key: "index-core",
    art: () =>
      peeked === null ? (
        <>
          <BrandMark y={-14} />
          <Label text={LABEL.cue} y={58} className="xcomb-cue" />
        </>
      ) : (
        <Words text={peeked.name} y={0} size={30} className="xcomb-title" />
      ),
  }

  return { ring, core, caption: null }
}

// -------------------------------------------------------------- L1 · subject

/**
 * Picking a ring cell makes the entire comb *become* that subject: same seven
 * registers, new meanings. Five ring slots are facets and the sixth is the way
 * up — the spec names exactly five facets, so that slot was free.
 */
function subjectLevel(
  subject: ExtensionDefinition,
  onUp: () => void,
  onFacet: (facet: Facet) => void
): Level {
  const everywhere = subject.reach === "everywhere"
  const browsers = [
    subject.firefox ? "Firefox" : null,
    subject.chrome ? "Chrome" : null,
  ].filter((b): b is string => b !== null)

  const ring: ReadonlyArray<CellSpec> = [
    {
      key: `subject-mechanism-${subject.id}`,
      art: () => <Mini kind={subject.mechanism} />,
    },
    {
      // The SAME honey value carried up from L0.
      key: `subject-stage-${subject.id}`,
      honey: subject.level,
      label: `How far along ${subject.name} is: ${STAGE_LABEL[subject.stage]}`,
      onActivate: () => onFacet("stage"),
      art: () => <Label text={STAGE_LABEL[subject.stage]} y={0} />,
    },
    {
      key: `subject-browsers-${subject.id}`,
      describe: `Runs in ${browsers.join(" and ")}`,
      art: () => (
        <>
          <BrowserMark kind="firefox" x={-26} on={subject.firefox} />
          <BrowserMark kind="chrome" x={26} on={subject.chrome} />
          <Label text={LABEL.runsIn} y={46} className="xcomb-muted" />
        </>
      ),
    },
    {
      key: `subject-reach-${subject.id}`,
      describe: everywhere ? "Acts on every site" : "Acts on one site",
      art: () => (
        <>
          <g aria-hidden>
            <rect
              x={-52}
              y={-24}
              width={20}
              height={20}
              rx={4}
              className={cn("xcomb-site-one", everywhere && "xcomb-off")}
            />
            {[0, 1, 2].map((k) => (
              <rect
                key={k}
                x={-20 + k * 26}
                y={-24}
                width={20}
                height={20}
                rx={4}
                className={cn("xcomb-site-many", !everywhere && "xcomb-off")}
              />
            ))}
          </g>
          <Label text={LABEL.reach} y={34} className="xcomb-muted" />
        </>
      ),
    },
    {
      key: `subject-privacy-${subject.id}`,
      label: "What it sends",
      onActivate: () => onFacet("privacy"),
      art: () => (
        <>
          <Glyph icon={WifiOff} size={50} y={-14} className="xcomb-accent" />
          <Label text={LABEL.privacy} y={42} className="xcomb-muted" />
        </>
      ),
    },
    backCell(`subject-up-${subject.id}`, "Back to all six", LABEL.up, onUp),
  ]

  const core: CellSpec = {
    key: `subject-core-${subject.id}`,
    art: () => (
      <>
        <Glyph
          icon={EMBLEM_ICON[subject.emblem]}
          size={44}
          y={-44}
          className="xcomb-accent"
        />
        <Words text={subject.name} y={22} size={30} className="xcomb-title" />
      </>
    ),
  }

  return { ring, core, caption: subject.line }
}

// ---------------------------------------------------------------- L2 · facet

/**
 * The same move again, one level down: the ring becomes the chosen facet's
 * atoms and the caption carries that facet's sentence. Unused slots stay as
 * ghost cells rather than being dropped — the comb never loses a cell at any
 * depth, because the geometry is the promise the page made on arrival.
 */
function facetLevel(
  subject: ExtensionDefinition,
  facet: Facet,
  onUp: () => void
): Level {
  const reached = STAGE_ORDER.indexOf(subject.stage)
  const ghost = (slot: number): CellSpec => ({
    key: `facet-${facet}-ghost-${slot}`,
    ghost: true,
  })

  const atoms: Array<CellSpec> =
    facet === "stage"
      ? STAGE_ORDER.map(
          (step: Stage, k: number): CellSpec => ({
            key: `facet-stage-${step}`,
            // A step reached is a full cell; one not yet reached is an
            // empty one, not a faded full one — a faded honey still reads
            // as honey, and the whole register is the difference.
            honey: k <= reached ? 1 : 0,
            describe: `${STAGE_LABEL[step]}${k <= reached ? ", reached" : ", not yet"}`,
            art: () => (
              <Label
                text={STAGE_LABEL[step]}
                y={0}
                className={k > reached ? "xcomb-muted" : undefined}
              />
            ),
          })
        )
      : PRIVACY_ATOMS.map(
          (atom, k): CellSpec => ({
            key: `facet-privacy-${atom.id}`,
            describe: atom.label,
            art: () => (
              <>
                <Glyph
                  icon={PRIVACY_ICON[k] ?? WifiOff}
                  size={50}
                  y={-16}
                  className="xcomb-accent"
                />
                <Label text={atom.label} y={44} className="xcomb-muted" />
              </>
            ),
          })
        )

  const ring = [0, 1, 2, 3, 4].map((slot) => atoms[slot] ?? ghost(slot))
  ring.push(backCell(`facet-${facet}-back`, "Back", LABEL.back, onUp))

  const core: CellSpec = {
    key: `facet-core-${facet}-${subject.id}`,
    art: () => (
      <>
        <Label text={subject.name} y={-44} className="xcomb-muted" />
        <Words
          text={facet === "stage" ? STAGE_LABEL[subject.stage] : LABEL.privacy}
          y={10}
          size={30}
          className="xcomb-title"
        />
      </>
    ),
  }

  return {
    ring,
    core,
    caption: facet === "stage" ? STAGE_LINE[subject.stage] : PRIVACY_LINE,
  }
}

function backCell(
  key: string,
  label: string,
  micro: string,
  onUp: () => void
): CellSpec {
  return {
    key,
    label,
    onActivate: onUp,
    art: () => (
      <>
        <Glyph icon={ArrowLeft} size={40} y={-14} className="xcomb-muted" />
        <Label text={micro} y={36} className="xcomb-muted" />
      </>
    ),
  }
}
