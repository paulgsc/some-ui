import { selectors } from "@chat/lib/topik"
import type { SessionState } from "@chat/lib/topik"

// ─────────────────────────────────────────────
// Pure UI Derivations
// ─────────────────────────────────────────────

export function deriveChatPlayState(state: SessionState) {
  if (state.phase === "selecting" || state.phase === "hydrating") {
    return "not-started" as const
  }

  if (!selectors.isActive(state)) {
    return "not-started" as const
  }

  if (selectors.isInChat(state)) {
    return selectors.isChatPlaying(state) ? "playing" : "paused"
  }

  return "finished" as const
}

export function deriveQuizState(state: SessionState) {
  if (!selectors.isActive(state)) return "standby" as const
  if (!selectors.isInQuiz(state)) return "standby" as const

  const stage = selectors.getQuizStage(state)

  switch (stage) {
    case "question":
      return "active" as const
    case "feedback":
      return "feedback" as const
    case "summary":
      return "summary" as const
    default:
      return "standby" as const
  }
}
