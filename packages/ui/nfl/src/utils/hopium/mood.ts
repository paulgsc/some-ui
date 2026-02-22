import type { MoodEvent } from "@nfl/types/hopium/hopium-tracker"

export function moodEmoji(points: number): string {
  if (points >= 120) return "🤩"
  if (points >= 110) return "😍"
  if (points >= 100) return "😊"
  if (points >= 90) return "🙂"
  if (points >= 80) return "😐"
  if (points >= 70) return "😟"
  if (points >= 60) return "😞"
  return "😭"
}

export function moodLabel(points: number): string {
  if (points >= 120) return "Euphoric"
  if (points >= 110) return "Elated"
  if (points >= 100) return "Hopeful"
  if (points >= 90) return "Optimistic"
  if (points >= 80) return "Neutral"
  if (points >= 70) return "Concerned"
  if (points >= 60) return "Deflated"
  return "Devastated"
}

export type WeeklyTally = {
  week: number
  change: number
  lastMood: number
}

export function aggregateWeekTallies(
  events: Array<MoodEvent>,
  uptoIndex: number
): Array<WeeklyTally> {
  const slice = events.filter((e) => e.index <= uptoIndex)
  const byWeek = new Map<number, WeeklyTally>()

  for (const e of slice) {
    const curr = byWeek.get(e.week) ?? {
      week: e.week,
      change: 0,
      lastMood: e.mood,
    }
    curr.change += e.delta
    curr.lastMood = e.mood
    byWeek.set(e.week, curr)
  }
  return Array.from(byWeek.values()).sort((a, b) => a.week - b.week)
}

export function minMaxMood(events: Array<MoodEvent>): {
  min: number
  max: number
} {
  let min = Infinity
  let max = -Infinity
  for (const e of events) {
    min = Math.min(min, e.mood)
    max = Math.max(max, e.mood)
  }
  if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 150 }
  const pad = Math.max(5, Math.round((max - min) * 0.1))
  return { min: min - pad, max: max + pad }
}

export type StreakDirection = "up" | "down" | "neutral"

export type StreakStats = {
  direction: StreakDirection
  count: number
  bestUp: number
  bestDown: number
}

export function computeStreak(
  events: Array<MoodEvent>,
  uptoIndex: number
): StreakStats {
  if (events.length === 0 || uptoIndex < 0) {
    return { direction: "neutral", count: 0, bestUp: 0, bestDown: 0 }
  }

  // Safely get the target event
  const safeIndex = Math.min(uptoIndex, events.length - 1)
  const last = events[safeIndex]

  // Fix 18048: Check if last is defined (even though index math says it should be)
  const lastDelta = last?.delta ?? 0
  const dir: StreakDirection =
    lastDelta > 0 ? "up" : lastDelta < 0 ? "down" : "neutral"

  let count = 0
  if (dir !== "neutral") {
    for (let i = safeIndex; i >= 0; i--) {
      // Fix 2532: Ensure events[i] exists
      const currentEvent = events[i]
      if (!currentEvent) break

      const d = currentEvent.delta
      if ((dir === "up" && d > 0) || (dir === "down" && d < 0)) {
        count++
      } else {
        break
      }
    }
  }

  // Best streaks so far
  let bestUp = 0
  let bestDown = 0
  let runUp = 0
  let runDown = 0

  for (let i = 0; i <= safeIndex; i++) {
    const currentEvent = events[i]
    if (!currentEvent) continue // Fix 2532

    const d = currentEvent.delta
    if (d > 0) {
      runUp++
      runDown = 0
    } else if (d < 0) {
      runDown++
      runUp = 0
    } else {
      runUp = 0
      runDown = 0
    }
    bestUp = Math.max(bestUp, runUp)
    bestDown = Math.max(bestDown, runDown)
  }

  return { direction: dir, count, bestUp, bestDown }
}
