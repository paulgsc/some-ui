import { useRef, useState } from "react"
import type { CSSProperties, JSX, ReactNode } from "react"
import { assertNever } from "@honeycomb/utils/error"
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
import { useResizeObserver } from "some-ui-utils"

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
 * > The page communicates visually. Title copy is given. Every other word is
 * > a function of a purposeful user interaction.
 *
 * At rest the page holds an `<h1>` and the comb, and no other sentence. Some
 * signal genuinely needs words; those are disclosed progressively, never
 * rendered preemptively, and they surface in exactly one place — the centroid
 * cell. Nothing ever covers the comb: no dialog, no drawer, no popover. The
 * comb promised a structure, and occluding it breaks that promise, so
 * disclosure happens by *re-roling the cells that are already there*.
 *
 * ## The register model
 *
 * Seven registers — six ring, one centroid — whose meaning is reassigned by
 * depth. The geometry is invariant at every level; only what the registers
 * hold changes, which is what makes the model recursive: an L3 would be the
 * same move again.
 *
 *   L0 · index    ring = the six extensions      core = brand mark + rest cue
 *   L1 · subject  ring = facets of one extension core = its name + sentence
 *   L2 · facet    ring = that facet's atoms      core = that facet's sentence
 *
 * ## Why this is not built on `HexGrid`
 *
 * `HexGrid` next door is the general hex surface, and it was the obvious
 * candidate. Three things decided against it, all of them specific to this
 * page rather than complaints about that component:
 *
 *  1. It is pointy-top, because its geometry comes from the Rust crate's
 *     `hex_to_pixel`. The brand mark is flat-top. Rotating the render 30°
 *     to match would put the drawn content outside the viewBox, because
 *     `measureHexGridBounds` is a closed form derived for an *unrotated
 *     pointy-top* grid — it would clip at exactly the viewport sizes the
 *     ui-fit sweep checks.
 *  2. Its fit negotiation can reduce the grid radius, which makes outer-ring
 *     cells disappear. That is a graceful degradation for a game board whose
 *     cells are interchangeable, and a correctness bug here, where each of
 *     the six ring cells carries a distinct register.
 *  3. It supplies no interaction at all — no selection, no keyboard reach, no
 *     focus management, no labelling. The whole contract below is new work
 *     either way, so building on it would have saved only the hexagon path
 *     math, in exchange for 1 and 2.
 *
 * The geometry here is therefore the brand mark's own, scaled: flat-top
 * hexagons of circumradius 90 with neighbour centres 200 apart. That 20:9
 * spacing ratio is lifted from `hex-comb-mark.tsx` so the comb reads as the
 * logo enlarged rather than as a generic honeycomb. Do not "tidy" the numbers.
 */

// ------------------------------------------------------------------ geometry

const CELL_W = 180
const CELL_H = 155.88 // sqrt(3) * 90
const RING_DX = 173.21
const RING_DY = 200

/**
 * Breathing room around the comb's own bounding box. The hover halo bleeds
 * 16px past a cell and the beacon bleeds further; without this they would
 * paint outside the scaled box and widen the page, which `no-overflow.spec`
 * reads — correctly — as a box handed content wider than itself.
 */
const PAD = 18

const COMB_W = 2 * RING_DX + CELL_W + 2 * PAD
const COMB_H = 2 * RING_DY + CELL_H + 2 * PAD
const ORIGIN_X = COMB_W / 2
const ORIGIN_Y = COMB_H / 2

/** Ring slot centres, clockwise from the top. Slot 5 is always the way up. */
const SLOTS: ReadonlyArray<readonly [number, number]> = [
  [0, -RING_DY],
  [RING_DX, -RING_DY / 2],
  [RING_DX, RING_DY / 2],
  [0, RING_DY],
  [-RING_DX, RING_DY / 2],
  [-RING_DX, -RING_DY / 2],
]

function slotBox(slot: number): { left: number; top: number } {
  const [dx, dy] = SLOTS[slot] ?? [0, 0]
  return { left: ORIGIN_X + dx - CELL_W / 2, top: ORIGIN_Y + dy - CELL_H / 2 }
}

/**
 * The comb is drawn once at natural size and scaled to whatever box it lands
 * in, so every level is the same drawing at a different magnification and the
 * geometry cannot drift between them.
 *
 * The scale fits *both* axes of the box and is not capped at 1: the comb is
 * the page rather than an illustration on it, so on a roomy window it grows
 * past natural size to fill the viewport instead of sitting small in the
 * middle of it. Because it fits height as well as width, a landscape phone —
 * the shape this layout is most likely to fail on — is bounded by its short
 * axis and still shows all seven registers at once.
 *
 * Type scales with the geometry, which is what makes the fit safe to assert
 * once: the ratio of characters to box is constant at every size, so a
 * sentence that fits the centroid on a desktop fits it on a phone.
 */
function combScale(box: { width?: number; height?: number }): number {
  if (box.width === undefined || box.height === undefined) return 1
  return Math.min(box.width / COMB_W, box.height / COMB_H)
}

// -------------------------------------------------------------------- colour

/**
 * Honey is the brand pair from `public/favicon.svg`, written as literals and
 * never themed — the same call `hex-comb-mark.tsx` makes and for the same
 * reason. Running it through `--primary` would make the fill grey-blue in one
 * theme and rose in another, and the fill is the page's single quantitative
 * encoding; it has to mean the same thing everywhere.
 *
 * `HONEY_INK` is the ink that sits *on* honey. It is fixed for the same
 * reason its background is: a light theme's `--foreground` is near-black and
 * would be fine, but a dark theme's is near-white and would vanish into
 * `#fbbf24`. Ink paired with a fixed surface cannot float with the theme.
 */
const HONEY_DEEP = "#b45309"
const HONEY_MID = "#f59e0b"
const HONEY_SURFACE = "#fbbf24"
const HONEY_MENISCUS = "#fde68a"
const HONEY_INK = "oklch(14.5% 0 0deg)"

/** Reads as "empty" against the page ground in every theme, unlike a literal. */
const EMPTY_FILL = "color-mix(in oklab, var(--foreground) 5%, transparent)"

/**
 * Honey as a hard-stop gradient at `level`, with the meniscus drawn as a
 * second layer immediately below the stop.
 *
 * A full cell returns early with no meniscus, which is not a special case to
 * tidy away: a full cell has no waterline, and drawing one at 100% would put
 * a bright band along the cell's top edge and read as a rim light.
 *
 * `level` is authored, and the same value is handed to this function at L0
 * and at L1. That is load-bearing — seeing one fill survive the transition
 * unchanged is how a viewer learns the fill is a quantity rather than
 * decoration — so never re-round or re-derive it between levels.
 */
function honey(level: number): string {
  if (level >= 0.999) {
    return `linear-gradient(to top, ${HONEY_DEEP} 0%, ${HONEY_MID} 58%, ${HONEY_SURFACE} 100%)`
  }
  const p = Number((level * 100).toFixed(2))
  const meniscus =
    `linear-gradient(to top, rgba(0,0,0,0) calc(${p}% - 2.5px), ${HONEY_MENISCUS} calc(${p}% - 2.5px), ` +
    `${HONEY_MENISCUS} ${p}%, rgba(0,0,0,0) ${p}%)`
  const body =
    `linear-gradient(to top, rgba(180,83,9,0.92) 0%, rgba(245,158,11,0.95) ${Number((p * 0.72).toFixed(2))}%, ` +
    `${HONEY_SURFACE} ${p}%, ${EMPTY_FILL} ${p}%, ${EMPTY_FILL} 100%)`
  return `${meniscus}, ${body}`
}

function ringTone(level: number): string {
  return `rgba(245,158,11,${(0.24 + 0.3 * level).toFixed(2)})`
}

// --------------------------------------------------------------------- cells

type CellSkin = { background?: string; ring?: string }

/**
 * One register.
 *
 * Actionable registers are real `<button type="button">`s carrying an
 * `aria-label`, never a `<div>` with an `onClick` — Tab has to reach every
 * one of them, and the arrow-key grid navigation a `role="grid"` would
 * promise is not implemented here, so the plain tab order is the honest
 * affordance. Display-only registers are plain elements whose micro-label is
 * real text in the DOM, readable in order by a screen reader.
 */
const Cell = ({
  slot,
  children,
  skin,
  onClick,
  label,
  onPointerEnter,
  onPointerLeave,
  opacity,
}: {
  slot: number
  children?: ReactNode
  skin?: CellSkin
  onClick?: () => void
  label?: string
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  opacity?: number
}): JSX.Element => {
  const { left, top } = slotBox(slot)
  const style: CSSProperties = { left, top, width: CELL_W, height: CELL_H }
  if (opacity !== undefined) style.opacity = opacity

  const inner = (
    <>
      <span aria-hidden className="xcomb-halo" />
      <span
        aria-hidden
        className="xcomb-skin"
        style={{ background: skin?.background ?? EMPTY_FILL }}
      />
      <span
        aria-hidden
        className="xcomb-ring"
        style={{
          boxShadow: `inset 0 0 0 1.5px ${skin?.ring ?? ringTone(0)}`,
        }}
      />
      <span aria-hidden className="xcomb-focus-ring" />
      <span className="xcomb-face">{children}</span>
    </>
  )

  if (!onClick) {
    return (
      <div className="xcomb-reg" style={style}>
        {inner}
      </div>
    )
  }

  return (
    <button
      type="button"
      className="xcomb-cell"
      style={style}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onPointerEnter}
      onBlur={onPointerLeave}
      aria-label={label}
    >
      {inner}
    </button>
  )
}

/** The centroid: the only surface on this page allowed to hold a sentence. */
const Core = ({
  children,
  scale = 1,
}: {
  children: ReactNode
  scale?: number
}): JSX.Element => {
  const w = CELL_W * scale
  const h = CELL_H * scale
  return (
    <div
      className="xcomb-reg"
      style={{
        left: ORIGIN_X - w / 2,
        top: ORIGIN_Y - h / 2,
        width: w,
        height: h,
      }}
    >
      <span
        aria-hidden
        className="xcomb-skin"
        style={{ background: "var(--card)" }}
      />
      <span
        aria-hidden
        className="xcomb-ring"
        style={{ boxShadow: "inset 0 0 0 1.5px rgba(245,158,11,0.30)" }}
      />
      <span className="xcomb-face" style={{ padding: `0 ${24 * scale}px` }}>
        {children}
      </span>
    </div>
  )
}

/** Three words maximum. Anything longer is a sentence and belongs in the core. */
const Micro = ({
  children,
  tone,
  className,
}: {
  children: ReactNode
  tone: string
  className?: string
}): JSX.Element => {
  return (
    <span
      className={className}
      style={{
        marginTop: 9,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 9.5,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        color: tone,
      }}
    >
      {children}
    </span>
  )
}

const Sentence = ({ children }: { children: ReactNode }): JSX.Element => {
  return (
    <span
      style={{
        marginTop: 11,
        fontSize: 12.5,
        lineHeight: 1.55,
        color: "var(--muted-foreground)",
      }}
    >
      {children}
    </span>
  )
}

const CoreTitle = ({ children }: { children: ReactNode }): JSX.Element => {
  return (
    <span
      style={{
        fontSize: 19,
        fontWeight: 700,
        letterSpacing: "-0.015em",
        lineHeight: 1.15,
        color: "var(--primary)",
      }}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------- miniatures

/**
 * The L1 top register: a looping diagram of what the tool actually does, with
 * no words at all. This is the payload the whole design exists to make room
 * for — the mechanism gets shown instead of described, which is the only way
 * a wordless page can say anything specific. Keyframes live in `index.css`,
 * and every one of them is switched off under `prefers-reduced-motion`.
 */
const Mini = ({ kind }: { kind: Mechanism }): JSX.Element => {
  switch (kind) {
    case "tabs": {
      return (
        <div className="xcomb-mini-tabs" aria-hidden>
          {[0, 1, 2, 3].map((k) => (
            <i key={k} style={{ animationDelay: `${k * 0.5}s` }} />
          ))}
        </div>
      )
    }
    case "theme": {
      return (
        <div className="xcomb-mini-page" aria-hidden>
          <i />
          <i />
          <i style={{ width: "54%" }} />
          <b />
        </div>
      )
    }
    case "veil": {
      return (
        <div className="xcomb-mini-card" aria-hidden>
          <u />
          <u style={{ width: "62%" }} />
          <span className="xcomb-mini-veil" />
        </div>
      )
    }
    case "cubes": {
      return (
        <div className="xcomb-mini-belt" aria-hidden>
          {[0, 1, 2].map((k) => (
            <i key={k} style={{ animationDelay: `${k * 1.1}s` }} />
          ))}
        </div>
      )
    }
    case "bars": {
      return (
        <div className="xcomb-mini-eq" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <i
              key={k}
              style={{ animationDuration: `${(0.7 + k * 0.19).toFixed(2)}s` }}
            />
          ))}
        </div>
      )
    }
    case "pulse": {
      return (
        <div className="xcomb-mini-line" aria-hidden>
          <i />
          <span className="xcomb-mini-dot" />
        </div>
      )
    }
    default: {
      return assertNever(kind)
    }
  }
}

// -------------------------------------------------------------------- glyphs

const EMBLEM_ICON = {
  memory: HardDrive,
  contrast: Contrast,
  covered: EyeOff,
  belt: Boxes,
  music: Music,
  beat: HeartPulse,
} as const satisfies Record<Emblem, typeof HardDrive>

const PRIVACY_ICON = [WifiOff, UserX, CodeXml] as const

/**
 * The two browser marks, hand-drawn as a matched pair.
 *
 * lucide ships a Chrome glyph and no Firefox one, so taking the Chrome icon
 * and drawing a partner for it would put two different hands side by side in
 * a register whose entire job is a like-for-like comparison — the eye would
 * read the mismatch as meaning. Both are drawn here at the same weight
 * instead, in `currentColor`, so the only difference between them is the one
 * the register is encoding: full opacity, or 16%.
 */
const BrowserMark = ({ kind }: { kind: "firefox" | "chrome" }): JSX.Element => {
  return (
    <svg
      width={30}
      height={30}
      viewBox="0 0 24 24"
      aria-hidden
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
    </svg>
  )
}

/**
 * The mark's own ring offsets, at the mark's own scale rather than the comb's.
 * Typed as tuples so destructuring yields numbers: a bare nested array literal
 * widens to `Array<Array<number>>`, whose elements are possibly-undefined.
 */
const MARK_RING: ReadonlyArray<readonly [number, number]> = [
  [0, -20],
  [17.321, -10],
  [17.321, 10],
  [0, 20],
  [-17.321, 10],
  [-17.321, -10],
]

const BrandMark = (): JSX.Element => {
  const cell = "M9 0 4.5 7.794 -4.5 7.794 -9 0 -4.5 -7.794 4.5 -7.794Z"
  return (
    <svg width={40} height={40} viewBox="0 0 64 64" aria-hidden>
      <g transform="translate(32,32)">
        <g fill={HONEY_MID}>
          {MARK_RING.map(([x, y]) => (
            <path
              key={`${x},${y}`}
              d={cell}
              transform={`translate(${x},${y})`}
            />
          ))}
        </g>
        <path d={cell} fill={HONEY_MENISCUS} />
      </g>
    </svg>
  )
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

export const ExtensionsComb = (): JSX.Element => {
  const boxRef = useRef<HTMLDivElement>(null)
  const size = useResizeObserver({ ref: boxRef })
  const [view, setView] = useState<View>({ subject: null, facet: null })
  const [peek, setPeek] = useState<number | null>(null)

  const scale = combScale(size)
  const subject =
    view.subject === null ? null : (EXTENSIONS[view.subject] ?? null)

  return (
    <div ref={boxRef} className="absolute inset-0 overflow-hidden p-3 md:p-6">
      {/*
        The page shows no prose at rest at all - not even a title. That is the
        design law taken to its end: everything a visitor reads, they asked
        for by touching a cell.

        A screen reader has no comb to look at, though, and a document with no
        heading gives it nothing to announce or navigate by. So the heading
        exists and is visually hidden: it is a document label, not copy, and
        it renders nothing. The six cells carry their own names as
        `aria-label`s, so the structure below it is already legible.
      */}
      <h1 className="sr-only">{PAGE_TITLE}</h1>

      <div className="relative size-full">
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            width: COMB_W,
            height: COMB_H,
            marginLeft: -COMB_W / 2,
            marginTop: -COMB_H / 2,
            transform: `scale(${scale})`,
          }}
        >
          {subject === null ? (
            <IndexLevel
              peek={peek}
              onPeek={setPeek}
              onPick={(i) => {
                setPeek(null)
                setView({ subject: i, facet: null })
              }}
            />
          ) : view.facet === null ? (
            <SubjectLevel
              subject={subject}
              onUp={() => setView({ subject: null, facet: null })}
              onFacet={(facet) => setView({ subject: view.subject, facet })}
            />
          ) : (
            <FacetLevel
              subject={subject}
              facet={view.facet}
              onUp={() => setView({ subject: view.subject, facet: null })}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- L0 · index

/**
 * Ring slot *i* is extension *i*, carrying its emblem and filled with honey to
 * its authored level. Nothing else: no names, no stage words, no counts.
 *
 * Hovering a cell swaps the centroid's brand mark for that extension's name —
 * cheap to enter, cheap to leave, and it teaches the vocabulary without
 * costing a click. It is also the one piece of this page that a touch device
 * cannot reach, which is why the name additionally rides along in the cell
 * itself under `@media (hover: none)`; see `index.css`.
 *
 * `onFocus`/`onBlur` drive the same peek as the pointer, so a keyboard user
 * gets it too rather than tabbing through six unlabelled cells.
 */
const IndexLevel = ({
  peek,
  onPeek,
  onPick,
}: {
  peek: number | null
  onPeek: (i: number | null) => void
  onPick: (i: number) => void
}): JSX.Element => {
  const peeked = peek === null ? null : (EXTENSIONS[peek] ?? null)

  return (
    <div className="xcomb-layer">
      {EXTENSIONS.map((ext, i) => {
        const done = ext.level >= 0.999
        const box = slotBox(i)
        const Emblem = EMBLEM_ICON[ext.emblem]
        return (
          <div key={ext.id}>
            {/* The single at-rest motion: the one finished tool breathes. */}
            {done && (
              <span
                aria-hidden
                className="xcomb-beacon"
                style={{
                  left: box.left - 14,
                  top: box.top - 12,
                  width: CELL_W + 28,
                  height: CELL_H + 24,
                  inset: "auto",
                }}
              />
            )}
            <Cell
              slot={i}
              label={ext.name}
              onClick={() => onPick(i)}
              onPointerEnter={() => onPeek(i)}
              onPointerLeave={() => onPeek(null)}
              skin={{
                background: honey(ext.level),
                ring: done ? HONEY_MENISCUS : ringTone(ext.level),
              }}
            >
              <span
                aria-hidden
                style={{ color: done ? HONEY_INK : HONEY_MENISCUS }}
              >
                <Emblem size={36} strokeWidth={1.7} />
              </span>
              <Micro
                className="xcomb-cell-name"
                tone={done ? HONEY_INK : HONEY_MENISCUS}
              >
                {ext.name}
              </Micro>
            </Cell>
          </div>
        )
      })}

      <Core>
        {peeked === null ? (
          <>
            <BrandMark />
            <Micro tone="rgba(245,158,11,0.9)">
              <span className="xcomb-cue">{LABEL.cue}</span>
            </Micro>
          </>
        ) : (
          <span
            style={{
              fontSize: 17,
              fontWeight: 700,
              lineHeight: 1.2,
              color: "var(--primary)",
            }}
          >
            {peeked.name}
          </span>
        )}
      </Core>
    </div>
  )
}

// -------------------------------------------------------------- L1 · subject

/**
 * Clicking ring cell *i* makes the entire comb *become* that subject: same
 * seven registers, new meanings. Five of the six ring slots are facets and
 * the sixth is the way up.
 *
 * That exit costs a facet, and it is worth being explicit that it costs
 * nothing today: the spec names exactly five facets, so the sixth slot was
 * free. The alternative — clicking the centroid to ascend — buys a slot back
 * by hiding the only way out of the level behind an unlabelled affordance,
 * and is the trade to make when a seventh facet actually exists.
 */
const SubjectLevel = ({
  subject,
  onUp,
  onFacet,
}: {
  subject: ExtensionDefinition
  onUp: () => void
  onFacet: (facet: Facet) => void
}): JSX.Element => {
  const everywhere = subject.reach === "everywhere"
  const lit = (on: boolean): number => (on ? 1 : 0.16)

  return (
    <div className="xcomb-layer">
      {/* top — the mechanism, wordless */}
      <Cell slot={0}>
        <Mini kind={subject.mechanism} />
      </Cell>

      {/* upper-right — the SAME honey value carried up from L0, enlarged */}
      <Cell
        slot={1}
        label={`How far along ${subject.name} is`}
        onClick={() => onFacet("stage")}
        skin={{
          background: honey(subject.level),
          ring: "rgba(245,158,11,0.5)",
        }}
      >
        <Micro tone={HONEY_INK}>{STAGE_LABEL[subject.stage]}</Micro>
      </Cell>

      {/* lower-right — which browsers */}
      <Cell slot={2}>
        <div style={{ display: "flex", gap: 12, color: HONEY_MENISCUS }}>
          <span style={{ opacity: lit(subject.firefox) }}>
            <BrowserMark kind="firefox" />
          </span>
          <span style={{ opacity: lit(subject.chrome) }}>
            <BrowserMark kind="chrome" />
          </span>
        </div>
        <Micro tone="var(--muted-foreground)">{LABEL.runsIn}</Micro>
      </Cell>

      {/* bottom — one site, or the whole web */}
      <Cell slot={3}>
        <div style={{ display: "flex", gap: 7 }} aria-hidden>
          <span
            style={{
              width: 13,
              height: 13,
              borderRadius: 3,
              background: HONEY_SURFACE,
              opacity: lit(!everywhere),
            }}
          />
          {[0, 1, 2].map((k) => (
            <span
              key={k}
              style={{
                width: 13,
                height: 13,
                borderRadius: 3,
                border: `1.4px solid ${HONEY_SURFACE}`,
                opacity: lit(everywhere),
              }}
            />
          ))}
        </div>
        <Micro tone="var(--muted-foreground)">{LABEL.reach}</Micro>
      </Cell>

      {/* lower-left — what leaves your machine */}
      <Cell slot={4} label="What it sends" onClick={() => onFacet("privacy")}>
        <span aria-hidden style={{ color: HONEY_SURFACE }}>
          <WifiOff size={32} strokeWidth={1.7} />
        </span>
        <Micro tone="var(--muted-foreground)">{LABEL.privacy}</Micro>
      </Cell>

      {/* upper-left — the way up */}
      <Cell slot={5} label="Back to all six" onClick={onUp}>
        <span aria-hidden style={{ color: "var(--muted-foreground)" }}>
          <ArrowLeft size={26} strokeWidth={1.7} />
        </span>
        <Micro tone="var(--muted-foreground)">{LABEL.up}</Micro>
      </Cell>

      <Core scale={1.2}>
        <CoreTitle>{subject.name}</CoreTitle>
        <Sentence>{subject.line}</Sentence>
      </Core>
    </div>
  )
}

// ---------------------------------------------------------------- L2 · facet

/**
 * The same move again, one level down: the ring becomes the chosen facet's
 * atoms, and the centroid carries that facet's sentence.
 *
 * Unused slots stay as ghost cells rather than being dropped. The comb never
 * loses a cell at any depth — the geometry is the promise the page made on
 * arrival, and a level that quietly renders five hexagons breaks it as surely
 * as an overlay would.
 */
const FacetLevel = ({
  subject,
  facet,
  onUp,
}: {
  subject: ExtensionDefinition
  facet: Facet
  onUp: () => void
}): JSX.Element => {
  const reached = STAGE_ORDER.indexOf(subject.stage)
  const ghosts = facet === "stage" ? [4] : [3, 4]

  return (
    <div className="xcomb-layer">
      {facet === "stage"
        ? STAGE_ORDER.map((step: Stage, k: number) => (
            <Cell
              key={step}
              slot={k}
              opacity={k <= reached ? 1 : 0.16}
              skin={{
                background: `linear-gradient(to top, ${HONEY_DEEP}, ${HONEY_SURFACE})`,
                ring: "rgba(245,158,11,0.55)",
              }}
            >
              <Micro tone={HONEY_INK}>{STAGE_LABEL[step]}</Micro>
            </Cell>
          ))
        : PRIVACY_ATOMS.map((atom, k) => {
            const Icon = PRIVACY_ICON[k] ?? WifiOff
            return (
              <Cell key={atom.id} slot={k}>
                <span aria-hidden style={{ color: HONEY_SURFACE }}>
                  <Icon size={32} strokeWidth={1.7} />
                </span>
                <Micro tone="var(--muted-foreground)">{atom.label}</Micro>
              </Cell>
            )
          })}

      {ghosts.map((slot) => (
        <Cell
          key={slot}
          slot={slot}
          skin={{
            background:
              "color-mix(in oklab, var(--foreground) 3%, transparent)",
            ring: "rgba(245,158,11,0.12)",
          }}
        />
      ))}

      <Cell slot={5} label="Back" onClick={onUp}>
        <span aria-hidden style={{ color: "var(--muted-foreground)" }}>
          <ArrowLeft size={26} strokeWidth={1.7} />
        </span>
        <Micro tone="var(--muted-foreground)">{LABEL.back}</Micro>
      </Cell>

      <Core scale={1.2}>
        <Micro tone={HONEY_MENISCUS}>
          {facet === "stage" ? STAGE_LABEL[subject.stage] : LABEL.privacy}
        </Micro>
        <Sentence>
          {facet === "stage" ? STAGE_LINE[subject.stage] : PRIVACY_LINE}
        </Sentence>
      </Core>
    </div>
  )
}
