import type { JSX } from "react"
import { X } from "lucide-react"
import { toast } from "sonner"

import { DISCIPLINE_TOKENS, STATUS_TOKENS } from "@/lib/site-honeycomb/tokens"
import type {
  Discipline,
  ExpandedMode,
  WorkBay,
} from "@/lib/site-honeycomb/types"

type FocusedBayContentProps = {
  bay: WorkBay
  mode: ExpandedMode
  onCollapse: () => void
  onOpenWorkOrder: (bay: WorkBay) => void
  onPinDiscipline: (discipline: Discipline) => void
}

const specRow = (label: string, value: string): JSX.Element => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      padding: "6px 0",
      borderTop: "1px solid oklch(0.34 0.02 260)",
      fontSize: 12,
    }}
  >
    <span
      className="site-honeycomb-mono"
      style={{
        opacity: 0.7,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      {label}
    </span>
    <span>{value}</span>
  </div>
)

const CloseButton = ({
  onCollapse,
}: {
  onCollapse: () => void
}): JSX.Element => (
  <button
    type="button"
    aria-label="Close"
    onClick={(e) => {
      e.stopPropagation()
      onCollapse()
    }}
    style={{
      position: "absolute",
      top: 6,
      right: 6,
      width: 22,
      height: 22,
      border: "1px solid oklch(0.7 0.02 258)",
      background: "transparent",
      color: "inherit",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <X aria-hidden style={{ width: 12, height: 12 }} />
  </button>
)

const WorkOrderView = ({
  bay,
  onCollapse,
}: {
  bay: WorkBay
  onCollapse: () => void
}): JSX.Element => {
  const discipline = DISCIPLINE_TOKENS[bay.discipline]
  const status = STATUS_TOKENS[bay.status]

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        textAlign: "left",
        overflow: "auto",
      }}
    >
      <CloseButton onCollapse={onCollapse} />
      <span
        className="site-honeycomb-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: discipline.accent,
        }}
      >
        WORK ORDER · {bay.shortCode}
      </span>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "2px 0" }}>
        {bay.title}
      </h2>
      <p style={{ fontSize: 11, opacity: 0.85, margin: 0, lineHeight: 1.4 }}>
        {bay.description}
      </p>
      <div>
        {specRow("Discipline", discipline.label)}
        {specRow("Status", status.label)}
        {specRow("Crew", bay.crew)}
        {specRow("ETA", bay.eta)}
        {specRow("Site texture", bay.siteTexture)}
      </div>
      <div style={{ marginTop: "auto" }}>
        <div
          role="progressbar"
          aria-label={`${bay.title} completion`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={bay.completion}
          style={{
            height: 6,
            borderRadius: 9999,
            background:
              "color-mix(in oklab, var(--site-cell-accent) 25%, transparent)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${bay.completion}%`,
              height: "100%",
              background: discipline.accent,
            }}
          />
        </div>
        <span
          className="site-honeycomb-mono"
          style={{
            display: "block",
            marginTop: 4,
            fontSize: 11,
            fontWeight: 600,
            color: discipline.accent,
          }}
        >
          {bay.completion}% COMPLETE
        </span>
      </div>
    </div>
  )
}

const ActionButton = ({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}): JSX.Element => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation()
      onClick()
    }}
    className="site-honeycomb-mono"
    style={{
      textAlign: "left",
      border: "1px solid oklch(0.34 0.02 260)",
      background: "oklch(0.23 0.016 260)",
      color: "inherit",
      padding: "6px 8px",
      fontSize: 11,
      cursor: "pointer",
    }}
  >
    {label}
  </button>
)

const ActionsView = ({
  bay,
  onCollapse,
  onOpenWorkOrder,
  onPinDiscipline,
}: {
  bay: WorkBay
  onCollapse: () => void
  onOpenWorkOrder: (bay: WorkBay) => void
  onPinDiscipline: (discipline: Discipline) => void
}): JSX.Element => (
  <div
    role="menu"
    aria-label={`${bay.title} site actions`}
    style={{
      position: "relative",
      width: "100%",
      height: "100%",
      padding: 10,
      display: "flex",
      flexDirection: "column",
      gap: 6,
      textAlign: "left",
    }}
  >
    <CloseButton onCollapse={onCollapse} />
    <h2 style={{ fontSize: 13, fontWeight: 700, margin: "2px 0 4px" }}>
      {bay.title}
    </h2>
    <div
      style={{
        borderTop: "1px solid oklch(0.34 0.02 260)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        paddingTop: 6,
      }}
    >
      <ActionButton
        label="Open work order"
        onClick={() => onOpenWorkOrder(bay)}
      />
      <ActionButton
        label="Pin site theme"
        onClick={() => {
          onPinDiscipline(bay.discipline)
          toast.info(`Pinned ${DISCIPLINE_TOKENS[bay.discipline].label}`)
          onCollapse()
        }}
      />
      <ActionButton
        label="Request inspection"
        onClick={() => {
          toast.info(`Inspection requested for ${bay.title}`)
          onCollapse()
        }}
      />
      <ActionButton
        label="Flag this bay"
        onClick={() => {
          toast.warning(`${bay.title} flagged`)
          onCollapse()
        }}
      />
    </div>
  </div>
)

export const FocusedBayContent = ({
  bay,
  mode,
  onCollapse,
  onOpenWorkOrder,
  onPinDiscipline,
}: FocusedBayContentProps): JSX.Element =>
  mode === "workorder" ? (
    <WorkOrderView bay={bay} onCollapse={onCollapse} />
  ) : (
    <ActionsView
      bay={bay}
      onCollapse={onCollapse}
      onOpenWorkOrder={onOpenWorkOrder}
      onPinDiscipline={onPinDiscipline}
    />
  )
