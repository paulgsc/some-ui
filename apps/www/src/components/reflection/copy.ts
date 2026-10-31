import { counted } from "@some-ui/core-utils"
import type { ConfirmRequest } from "@some-ui/shared"

/**
 * What the whole export carried out, as "2 reflections, 1 soundbite and 8
 * grammar-lens answers"; empty when nothing went out.
 */
export function goingOut(counts: {
  reflections: number
  soundbites: number
  lensAnswers: number
  lensTakes: number
  leetypeAnswers: number
  leetypeTakes: number
}): string {
  const parts = [
    [counts.reflections, "reflection"] as const,
    [counts.soundbites, "soundbite"] as const,
    [counts.lensAnswers, "grammar-lens answer"] as const,
    [counts.lensTakes, "grammar-lens take"] as const,
    [counts.leetypeAnswers, "LeetType answer"] as const,
    [counts.leetypeTakes, "LeetType take"] as const,
  ].flatMap(([n, noun]) => (n > 0 ? [counted(n, noun)] : []))
  const last = parts.pop() ?? ""
  return parts.length > 0 ? `${parts.join(", ")} and ${last}` : last
}

/**
 * The question after a share: Android says "shared" once an app is picked,
 * even if the person backs out of it, so `what` counts as shared only on
 * their word.
 */
export function arrived(
  what: string,
  keep: string,
  onConfirm: () => void
): ConfirmRequest {
  return {
    title: "Did they arrive?",
    description: `Once they have, ${what} count as shared. They stay on this phone.`,
    confirm: "They arrived",
    keep,
    onConfirm,
  }
}
