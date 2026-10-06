import type { SoundbiteContext } from "./types"

const DAY_MS = 86_400_000

/** `0:07`, `1:00`. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1_000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** `Today 21:04`, `Yesterday 08:10`, `Mon 21:04`, then `Sep 3, 21:04`. */
export function formatWhen(iso: string, now: Date): string {
  const at = new Date(iso)
  const time = at.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS)
  if (days <= 0) return `Today ${time}`
  if (days === 1) return `Yesterday ${time}`
  if (days < 7)
    return `${at.toLocaleDateString(undefined, { weekday: "short" })} ${time}`
  return `${at.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`
}

/**
 * The context line under a soundbite: what the app noted, in the words the
 * person would use. "From a reminder · 3 days since a session · 2 open".
 */
export function describeContext(
  context: SoundbiteContext,
  recordedAt: string
): string {
  const parts: Array<string> = []
  if (context.source === "reminder") parts.push("From a reminder")
  if (context.source === "wrap") parts.push("After a session")
  if (context.lastSessionAt === null) {
    parts.push("No sessions yet")
  } else {
    const days = Math.floor(
      (new Date(recordedAt).getTime() -
        new Date(context.lastSessionAt).getTime()) /
        DAY_MS
    )
    parts.push(
      days < 1
        ? "Under a day since a session"
        : `${days} day${days === 1 ? "" : "s"} since a session`
    )
  }
  if (context.openSessions > 0) parts.push(`${context.openSessions} open`)
  return parts.join(" · ")
}
