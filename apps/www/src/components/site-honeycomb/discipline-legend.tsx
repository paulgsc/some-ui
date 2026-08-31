import type { JSX } from "react"

import {
  DISCIPLINE_ORDER,
  DISCIPLINE_TOKENS,
} from "@/lib/site-honeycomb/tokens"
import type { Discipline } from "@/lib/site-honeycomb/types"

type DisciplineLegendProps = {
  pinned: Discipline | null
  onSelect: (discipline: Discipline) => void
}

/**
 * Spec §11/§15: each tile is a real toggle button exposing its selected
 * state programmatically (the observed demo communicated it visually only
 * — `aria-pressed` here is one of the spec's explicit production fixes).
 */
export const DisciplineLegend = ({
  pinned,
  onSelect,
}: DisciplineLegendProps): JSX.Element => (
  <div
    role="group"
    aria-label="Discipline filter"
    style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
  >
    {DISCIPLINE_ORDER.map((discipline) => {
      const token = DISCIPLINE_TOKENS[discipline]
      const isPinned = pinned === discipline
      return (
        <button
          key={discipline}
          type="button"
          aria-pressed={isPinned}
          onClick={() => onSelect(discipline)}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "8px 12px",
            minWidth: 168,
            border: `1px solid ${isPinned ? token.accent : "var(--site-border)"}`,
            background: "var(--site-surface)",
            color: "inherit",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span
            className="site-badge-hex"
            aria-hidden
            style={{
              width: 14,
              height: 16,
              flexShrink: 0,
              marginTop: 2,
              background: token.accent,
            }}
          />
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span
              className="site-honeycomb-mono"
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
              }}
            >
              {token.label}
            </span>
            <span style={{ fontSize: 11, color: "var(--site-text-muted)" }}>
              {token.description}
            </span>
          </span>
        </button>
      )
    })}
  </div>
)
