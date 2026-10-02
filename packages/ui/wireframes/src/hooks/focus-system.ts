import type { SlotId } from "@some-ui/types"
import { create } from "zustand"

type FocusProposal = {
  source: "server" | "component"
  region: string
  intensity: number // 0..1
  priority: number
  expiresAt?: number
}

// Focus Store
type FocusStore = {
  proposals: Array<FocusProposal>
  emit: (p: FocusProposal) => void
  prune: (now: number) => void
}

const useFocusStore = create<FocusStore>((set) => ({
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

// Hook for components to request focus (sandboxed)
export function useRequestFocus(
  region: SlotId
): (intensity: number, ttlMs?: number) => void {
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
