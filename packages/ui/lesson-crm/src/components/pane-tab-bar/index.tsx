import type { ComponentType, JSX } from "react"
import type { Pane } from "@lesson-crm/lib/panes"
import { PANE_LABELS } from "@lesson-crm/lib/panes"
import { BottomTabBar } from "@some-ui/shared"
import {
  FileText,
  List,
  ListChecks,
  MessagesSquare,
  Sparkles,
  Tags,
} from "lucide-react"

const ICONS: Record<Pane, ComponentType<{ className?: string }>> = {
  lessons: List,
  prompt: Sparkles,
  lesson: FileText,
  details: Tags,
  preview: MessagesSquare,
  check: ListChecks,
}

type PaneTabBarProps = {
  panes: Array<Pane>
  current: Pane
  /** Panes that need a lesson open first. */
  disabled: (pane: Pane) => boolean
  shown: boolean
  onPane: (pane: Pane) => void
}

/**
 * The phone's bottom tab bar, one tab per pane: the shared `BottomTabBar`
 * (`@some-ui/shared`, also the session composer's) given this CRM's panes.
 * The ids it gives its tabs - `lesson-tab-*`, controlling `lesson-pane-*` -
 * are what `LessonCrm`'s panels carry.
 */
export const PaneTabBar = ({
  panes,
  current,
  disabled,
  shown,
  onPane,
}: PaneTabBarProps): JSX.Element => (
  <BottomTabBar
    tabs={panes.map((pane) => ({
      id: pane,
      label: PANE_LABELS[pane],
      icon: ICONS[pane],
      disabled: disabled(pane),
    }))}
    current={current}
    onChange={onPane}
    shown={shown}
    label="Lesson panes"
    idPrefix="lesson"
  />
)
