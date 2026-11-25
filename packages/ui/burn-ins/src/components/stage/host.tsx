import type { JSX } from "react"
import type { Units } from "@burn-ins/components/stage/units"
import type { HostFrame } from "@burn-ins/lib/host"

/**
 * The host (HOST1): its drawing at this moment as one picture over the card,
 * at its box and opacity (C1485). The drawing is the cast's SVG text
 * (`@some-ui/styles/brand/host`), shown as an image so the stage draws the
 * very bytes the frame model made.
 */
export const HostLayer = ({
  frame,
  units,
}: {
  frame: HostFrame
  units: Units
}): JSX.Element | null =>
  frame === null ? null : (
    <img
      className="bi-host"
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(frame.svg)}`}
      alt=""
      style={{ ...units.placed(frame.box), opacity: frame.opacity }}
    />
  )
