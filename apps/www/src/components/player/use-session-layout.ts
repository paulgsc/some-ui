import { useMemo } from "react"
import type { SlotId } from "@some-ui/types"
import type { LayoutNode } from "wireframes"

import type { SessionRecord } from "@/lib/tenant"

import { NAIVE_LAYOUT } from "./layout"

/**
 * The single source of truth for a session's `Layout(t)` - independent of
 * which scene the orchestrator is currently ticking through. Replaces the
 * old scene-scoped read: topology belongs to the session, not any one
 * scene passing through it.
 */
export function useSessionLayout(session: SessionRecord): LayoutNode<SlotId> {
  return useMemo(() => session.layout ?? NAIVE_LAYOUT, [session.layout])
}
