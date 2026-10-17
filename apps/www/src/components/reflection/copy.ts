import { counted } from "@some-ui/core-utils"
import type { ConfirmRequest } from "@some-ui/shared"

/**
 * What the whole export's hand-off lets go, as "2 reflections, 1 soundbite
 * and 8 grammar-lens answers"; empty when nothing went out that the phone
 * would let go.
 */
export function goingOut(
  reflections: number,
  soundbites: number,
  lens: number
): string {
  const parts = [
    reflections > 0 ? counted(reflections, "reflection") : null,
    soundbites > 0 ? counted(soundbites, "soundbite") : null,
    lens > 0 ? counted(lens, "grammar-lens answer") : null,
  ].filter((part) => part !== null)
  const last = parts.pop() ?? ""
  return parts.length > 0 ? `${parts.join(", ")} and ${last}` : last
}

/**
 * The question after a share: Android says "shared" once an app is picked,
 * even if the person backs out of it, so `what` leaves the phone only on
 * their word.
 */
export function arrived(
  what: string,
  keep: string,
  onConfirm: () => void
): ConfirmRequest {
  return {
    title: "Did they arrive?",
    description: `Once they have, ${what} can leave this phone.`,
    confirm: "They arrived: let them go",
    keep,
    onConfirm,
  }
}

/** What a reflection refused for want of a slot says. */
export const NO_ROOM = "No room for it: share or let some go first."
