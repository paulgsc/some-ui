import type { MoodEvent } from "@nfl/types/hopium-tracker"

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

export function aggregateWeekTallies(
  events: Array<MoodEvent>,
  uptoIndex: number
) {
  const slice = events.filter((e) => e.index <= uptoIndex)
  const byWeek = new Map<
    number,
    { week: number; change: number; lastMood: number }
  >()
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

export function minMaxMood(events: Array<MoodEvent>) {
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

export function computeStreak(events: Array<MoodEvent>, uptoIndex: number) {
  if (events.length === 0 || uptoIndex < 0)
    return { direction: "neutral" as const, count: 0, bestUp: 0, bestDown: 0 }
  const last = events[Math.min(uptoIndex, events.length - 1)]
  const dir =
    last.delta > 0 ? "up" : last.delta < 0 ? "down" : ("neutral" as const)

  let count = 0
  if (dir !== "neutral") {
    for (let i = Math.min(uptoIndex, events.length - 1); i >= 0; i--) {
      const d = events[i].delta
      if ((dir === "up" && d > 0) || (dir === "down" && d < 0)) count++
      else if (d === 0) break
      else break
    }
  }

  // best streaks so far
  let bestUp = 0
  let bestDown = 0
  let runUp = 0
  let runDown = 0
  for (let i = 0; i <= Math.min(uptoIndex, events.length - 1); i++) {
    const d = events[i].delta
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
