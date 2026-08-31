import type { JSX } from "react"

import { DISCIPLINE_TOKENS, STATUS_TOKENS } from "@/lib/site-honeycomb/tokens"
import type { WorkBay } from "@/lib/site-honeycomb/types"

type InspectionStripProps = {
  bay: WorkBay | null
}

/**
 * The persistent, spatially-stable inspection surface (spec §8). Hex-notched
 * corners (site-inspection-strip's clip-path) keep it silhouette-conformant
 * with the lattice rather than a plain rectangle, while staying an ordinary
 * reading layout internally — spec §4.3 draws that line explicitly.
 */
export const InspectionStrip = ({ bay }: InspectionStripProps): JSX.Element => {
  if (!bay) {
    return (
      <div
        className="site-inspection-strip"
        style={{
          border: "1px solid var(--site-border)",
          background: "var(--site-surface-raised)",
          padding: "10px 20px",
        }}
      >
        <span
          className="site-honeycomb-mono"
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.25em",
            color: "var(--site-text-muted)",
          }}
        >
          Awaiting inspection — hover or focus a bay to read its work order
        </span>
      </div>
    )
  }

  const discipline = DISCIPLINE_TOKENS[bay.discipline]
  const status = STATUS_TOKENS[bay.status]

  return (
    <div
      className="site-inspection-strip"
      style={{
        border: "1px solid var(--site-border)",
        background: "var(--site-surface-raised)",
        padding: "20px",
        display: "flex",
        flexWrap: "wrap",
        gap: 24,
        justifyContent: "space-between",
      }}
    >
      <div style={{ maxWidth: 480 }}>
        <span
          className="site-honeycomb-mono"
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.25em",
            color: discipline.accent,
          }}
        >
          {discipline.label} · {status.label}
        </span>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "6px 0" }}>
          {bay.title}
        </h2>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--site-text-muted)",
          }}
        >
          {bay.description}
        </p>
      </div>
      <dl
        className="site-honeycomb-mono"
        style={{
          display: "grid",
          gridTemplateColumns: "auto auto",
          columnGap: 16,
          rowGap: 4,
          fontSize: 12,
          alignSelf: "start",
        }}
      >
        <dt style={{ opacity: 0.7, textTransform: "uppercase" }}>Crew</dt>
        <dd style={{ margin: 0 }}>{bay.crew}</dd>
        <dt style={{ opacity: 0.7, textTransform: "uppercase" }}>ETA</dt>
        <dd style={{ margin: 0 }}>{bay.eta}</dd>
        <dt style={{ opacity: 0.7, textTransform: "uppercase" }}>Done</dt>
        <dd style={{ margin: 0, color: discipline.accent, fontWeight: 600 }}>
          {bay.completion}%
        </dd>
      </dl>
    </div>
  )
}
