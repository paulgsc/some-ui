export type DisclosureLevel = 0 | 1 | 2 | 3

export type FSMState = {
  level: DisclosureLevel
  locked: boolean
  lastEventTs: number | null
}

export type FSMEvent =
  | { type: "HOVER_START" }
  | { type: "HOVER_END" }
  | { type: "CLICK"; ts: number }
  | { type: "DBLCLICK"; ts: number }
  | { type: "RESET" }

// Transition table - single source of truth
const TRANSITIONS: Record<
  DisclosureLevel,
  Partial<Record<FSMEvent["type"], (s: FSMState, e: FSMEvent) => FSMState>>
> = {
  0: {
    // MASKED
    CLICK: (s, e) => ({
      ...s,
      level: 2,
      lastEventTs: (e as { ts: number }).ts,
    }),
    DBLCLICK: (s) => ({ ...s, level: 3, locked: true }),
  },
  1: {
    // METADATA (never stored, only derived from hover)
    CLICK: (s, e) => ({
      ...s,
      level: 2,
      lastEventTs: (e as { ts: number }).ts,
    }),
    DBLCLICK: (s) => ({ ...s, level: 3, locked: true }),
  },
  2: {
    // TITLE
    DBLCLICK: (s) => ({ ...s, level: 3, locked: true }),
  },
  3: {
    // REVEALED (terminal)
    RESET: () => ({ level: 0, locked: false, lastEventTs: null }),
  },
}

/**
 * Pure state transition function
 * Input: current state + event → new state
 */
export function transition(state: FSMState, event: FSMEvent): FSMState {
  const handler = TRANSITIONS[state.level][event.type]
  return handler ? handler(state, event) : state
}

/**
 * Derive display level from persistent level + hover state
 * CRITICAL: Hover doesn't change state, only affects rendering
 */
export function deriveDisplayLevel(
  persistedLevel: DisclosureLevel,
  isHovered: boolean
): DisclosureLevel {
  // Show metadata preview when hovering over MASKED
  if (persistedLevel === 0 && isHovered) {
    return 1
  }
  return persistedLevel
}

/**
 * Helper: get next level (for single-step advancement)
 */
export function nextLevel(current: DisclosureLevel): DisclosureLevel {
  return Math.min(3, current + 1) as DisclosureLevel
}

/**
 * Initial state factory
 */
export function createInitialState(isWhitelisted: boolean): FSMState {
  return {
    level: isWhitelisted ? 3 : 0,
    locked: isWhitelisted,
    lastEventTs: null,
  }
}
