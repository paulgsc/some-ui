/**
 * ManifestTicker — the scrolling cargo manifest between the rail and the belt.
 *
 * Pure view: `(props) => HTMLElement`. Segments are prop-driven (no schedule
 * data). The component handles the seamless loop (duplicated track) + masked
 * edges (`.sc-manifest` in styles/conveyor.css) + scroll (`.sc-manifest-track`,
 * paused under prefers-reduced-motion). Colour/type from shared `--cv-*` tokens.
 */

import { el, elText } from "@conveyor/components/dom"

export type ManifestSegment = {
  cube: string
  face: string
  source: string
  window: string
}

export type ManifestTickerProps = {
  segments: ReadonlyArray<ManifestSegment>
  /** Animate the scroll. Defaults to true. */
  animate?: boolean
}

function segmentEl(seg: ManifestSegment): HTMLElement {
  const node = el(
    "span",
    "mr-[34px] inline-flex items-center gap-[8px] whitespace-nowrap"
  )
  node.append(
    elText("span", "▸", "text-[var(--cv-signal)]"),
    elText("span", "cube"),
    elText("span", seg.cube, "text-[var(--cv-ink-2)]"),
    elText("span", "face"),
    elText("span", seg.face, "text-[var(--cv-ink-2)]"),
    elText("span", "·", "opacity-50"),
    elText("span", seg.source, "text-[var(--cv-ink-3)]"),
    elText("span", "· window", "opacity-70"),
    elText("span", seg.window, "text-[var(--cv-live)]")
  )
  return node
}

export function ManifestTicker(props: ManifestTickerProps): HTMLElement {
  const manifest = el(
    "div",
    "sc-manifest w-full overflow-hidden py-[7px] font-mono text-[11px] leading-none text-[var(--cv-ink-3)]"
  )

  const track = el("div", "inline-flex pl-[100%]")
  if (props.animate ?? true) track.classList.add("sc-manifest-track")

  // Author once, duplicate for a seamless -50% loop.
  for (const seg of props.segments) track.append(segmentEl(seg))
  for (const seg of props.segments) track.append(segmentEl(seg))

  manifest.append(track)
  return manifest
}
