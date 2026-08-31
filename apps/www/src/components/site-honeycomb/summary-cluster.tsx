import type { JSX } from "react"

import type { SiteSummary } from "@/lib/site-honeycomb/types"

type SummaryClusterProps = {
  summary: SiteSummary
}

const Metric = ({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}): JSX.Element => (
  <div
    className="site-badge-hex"
    style={{
      background: "var(--site-surface-raised)",
      border: "1px solid var(--site-border)",
      width: 96,
      height: 110,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    }}
  >
    <span
      className="site-honeycomb-mono"
      style={{
        fontSize: 18,
        fontWeight: 700,
        color: accent ? "var(--site-amber)" : "inherit",
      }}
    >
      {value}
    </span>
    <span
      className="site-honeycomb-mono"
      style={{
        fontSize: 9,
        textTransform: "uppercase",
        letterSpacing: "0.15em",
        color: "var(--site-text-muted)",
        textAlign: "center",
      }}
    >
      {label}
    </span>
  </div>
)

/** A small aggregate cluster instead of a rectangular dashboard card (spec
 * §8.1) — three hex-silhouette tiles rather than one floating summary bar. */
export const SummaryCluster = ({
  summary,
}: SummaryClusterProps): JSX.Element => (
  <div
    role="group"
    aria-label="Site completion summary"
    style={{ display: "flex", gap: 10 }}
  >
    <Metric
      label="Total completion"
      value={`${summary.totalCompletion}%`}
      accent
    />
    <Metric label="Bays scheduled" value={String(summary.baysScheduled)} />
    <Metric label="Open bays" value={String(summary.openBays)} />
  </div>
)
