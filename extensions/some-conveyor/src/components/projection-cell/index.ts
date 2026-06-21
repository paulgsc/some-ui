/**
 * ProjectionCell — the canonical face primitive (the design "floor" cell).
 *
 * Pure view: `(props) => HTMLElement`. No I/O, no app state, no browser.* —
 * DOM composed from @some-ui/styles preset utilities (compiled to static CSS by
 * @unocss/cli). Colour/type come from the steel ThemeEngine custom-property
 * contract (`--face-text*`) and the shared `--cv-*` tokens, surfaced on `:host`
 * in the shadow scope (or via CONVEYOR_TOKENS in Storybook).
 *
 * Structure mirrors the intent cell:
 *   tag (label + status dot) · body · meta
 * plus a `queued` variant for faces staged for a future rotation.
 */

export type CellStatus = "live" | "warn" | "down" | "idle"
export type MetaTone = "default" | "pos" | "neg" | "num"
export type CellMetaPart = { text: string; tone?: MetaTone }

export type ProjectionCellProps = {
  /** Short instrumentation label, e.g. "CI", "STREAK", "NVDA". */
  tag: string
  /** Status dot accent. Defaults to "idle". */
  status?: CellStatus
  /** Primary content — a string, or a caller-built node (lists, rows, …). */
  body: string | HTMLElement
  /** Render the body larger (the intent's emphasised value/glyph). */
  emphasizeBody?: boolean
  /** Mono meta line: a string, or toned parts joined by middots. */
  meta?: string | ReadonlyArray<CellMetaPart>
  /** Staged-for-future-rotation variant: hatched, dimmed, no live dot. */
  queued?: boolean
  /** Mark the cell as actionable (cursor affordance only — no handlers). */
  interactive?: boolean
}

const STATUS_DOT_BG: Record<CellStatus, string> = {
  idle: "bg-[var(--cv-ink-3)] opacity-60",
  live: "bg-[var(--cv-live)]",
  warn: "bg-[var(--cv-signal)]",
  down: "bg-[var(--cv-alert)]",
}

const META_TONE: Record<MetaTone, string> = {
  default: "text-[var(--cv-ink-2)]",
  pos: "text-[var(--cv-live)]",
  neg: "text-[var(--cv-alert)]",
  num: "text-[var(--cv-live)]",
}

function el(tag: string, cls: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = cls
  return node
}

/**
 * Small element helper for callers building richer cell bodies (task lists,
 * category grids, …) to pass as the `body` node.
 */
export function cellNode(tag: string, cls = ""): HTMLElement {
  return el(tag, cls)
}

/** Status indicator dot. The live state gets a soft phosphor-free glow. */
export function statusDot(status: CellStatus = "idle"): HTMLElement {
  const dot = el(
    "span",
    `inline-block size-[6px] shrink-0 rounded-full ${STATUS_DOT_BG[status]}`
  )
  if (status === "live") {
    dot.style.boxShadow = "0 0 6px rgb(95 209 187 / 50%)"
  }
  return dot
}

/** Tag row: label on the left, status dot on the right. */
export function cellTag(
  text: string,
  status: CellStatus = "idle",
  muted = false
): HTMLElement {
  const row = el(
    "div",
    `flex items-center justify-between gap-[8px] font-mono text-[10px] font-semibold uppercase tracking-[0.16em] ${
      muted ? "text-[var(--cv-steel-550)]" : "text-[var(--cv-ink-3)]"
    }`
  )
  const label = el("span", "truncate")
  label.textContent = text
  row.append(label)
  if (!muted) row.append(statusDot(status))
  return row
}

/** Mono meta line built from toned parts joined by middots. */
export function cellMeta(
  meta: string | ReadonlyArray<CellMetaPart>
): HTMLElement {
  const row = el(
    "div",
    "flex flex-wrap items-center gap-[6px] font-mono text-[10.5px] text-[var(--cv-ink-2)]"
  )
  const parts = typeof meta === "string" ? [{ text: meta }] : meta
  parts.forEach((part, i) => {
    if (i > 0) {
      const sep = el("span", "opacity-50")
      sep.textContent = "·"
      row.append(sep)
    }
    const span = el("span", META_TONE[part.tone ?? "default"])
    span.textContent = part.text
    row.append(span)
  })
  return row
}

export function ProjectionCell(props: ProjectionCellProps): HTMLElement {
  const queued = props.queued ?? false

  const cell = el(
    "div",
    [
      "grid h-full w-full grid-rows-[auto_1fr_auto] gap-[7px] p-[13px] box-border",
      props.interactive ? "cursor-pointer" : "",
    ]
      .filter(Boolean)
      .join(" ")
  )

  if (queued) {
    // Hatched "staged" texture — an irreducible decorative gradient set inline
    // so the cell stays self-contained (storyable outside the shadow scope).
    cell.style.backgroundImage =
      "repeating-linear-gradient(135deg, rgb(255 255 255 / 1.2%) 0 8px, transparent 8px 16px)"
  }

  cell.append(cellTag(props.tag, props.status ?? "idle", queued))

  const body = el(
    "div",
    [
      "self-center font-sans tracking-[-0.01em]",
      queued
        ? "font-medium text-[13px] text-[var(--cv-ink-3)]"
        : "font-semibold text-[var(--face-text-active)]",
      props.emphasizeBody
        ? "text-[18px] leading-[1.1]"
        : "text-[15px] leading-[1.22]",
    ].join(" ")
  )
  if (typeof props.body === "string") body.textContent = props.body
  else body.append(props.body)
  cell.append(body)

  if (props.meta !== undefined && !queued) {
    cell.append(cellMeta(props.meta))
  }

  return cell
}
