import type { YouTubeRegion } from "some-types-utils"
import { z } from "zod"
import { create } from "zustand"

// Focus Proposal Schema
export const FocusProposalSchema = z.object({
  source: z.enum(["server", "component"]),
  region: z.string(),
  intensity: z.number().min(0).max(1),
  priority: z.number(),
  expiresAt: z.number().optional(),
})

export type FocusProposal = z.infer<typeof FocusProposalSchema>

export type ResolvedFocus = {
  region: YouTubeRegion
  intensity: number
} | null

// Focus Store
type FocusStore = {
  proposals: Array<FocusProposal>
  emit: (p: FocusProposal) => void
  prune: (now: number) => void
}

export const useFocusStore = create<FocusStore>((set) => ({
  proposals: [],

  emit: (p): void =>
    set((s) => ({
      proposals: [...s.proposals, p],
    })),

  prune: (now): void =>
    set((s) => ({
      proposals: s.proposals.filter(
        (p) => p.expiresAt == null || p.expiresAt > now
      ),
    })),
}))

// Focus Resolution (Pure Function)
export function selectResolvedFocus(now: number): (s: FocusStore) => ResolvedFocus {
  return (s: FocusStore): ResolvedFocus => {
    const active = s.proposals.filter(
      (p) => p.expiresAt == null || p.expiresAt > now
    )

    if (active.length === 0) return null

    const winner = active.reduce((a, b) => (b.priority > a.priority ? b : a))

    return {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      region: winner.region as YouTubeRegion,
      intensity: winner.intensity,
    }
  }
}

// Hook for components to request focus (sandboxed)
export function useRequestFocus(region: YouTubeRegion): (intensity: number, ttlMs?: number) => void {
  const emit = useFocusStore((s) => s.emit)

  return (intensity: number, ttlMs = 1000): void => {
    emit({
      source: "component",
      region,
      intensity,
      priority: 1,
      expiresAt: Date.now() + ttlMs,
    })
  }
}
