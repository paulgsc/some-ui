import type {
  Difficulty,
  DisplayMode,
  NContext,
  PlayerProgress,
  SolveRecord,
} from "@leetype/types/leetype"

const STORAGE_KEY = "leetyping_progress"

const LEVEL_THRESHOLDS = [0, 50, 100, 200, 400, 800] as const
export const ALGORITHM_UNLOCK_LEVEL = 3
export const ADAPTIVE_WPM_THRESHOLD = 40

const DIFFICULTY_BASE_XP: Record<Difficulty, number> = {
  easy: 10,
  medium: 25,
  hard: 50,
}

const N_MULTIPLIERS: Record<NContext, number> = {
  tiny: 1,
  small: 1.5,
  medium: 2,
  large: 3,
}

export function computeLevel(xp: number): number {
  let level = 1
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    const threshold = LEVEL_THRESHOLDS[i]
    if (threshold !== undefined && xp >= threshold) {
      level = i + 1
    } else {
      break
    }
  }
  return level
}

export function xpForNextLevel(level: number): number {
  if (level >= LEVEL_THRESHOLDS.length) return 800
  return LEVEL_THRESHOLDS[level] ?? 800
}

export function computeXP(
  difficulty: Difficulty,
  wpm: number,
  accuracy: number,
  n: NContext | null,
  displayMode: DisplayMode
): number {
  const base = DIFFICULTY_BASE_XP[difficulty]
  const speedMult =
    wpm >= 80 ? 2 : wpm >= 60 ? 1.5 : wpm >= ADAPTIVE_WPM_THRESHOLD ? 1.2 : 1
  const accMult = accuracy >= 95 ? 1 : accuracy >= 80 ? 0.8 : 0.6
  const nMult = n ? N_MULTIPLIERS[n] : 1
  const hiddenBonus = displayMode === "hidden" ? 1.5 : 1
  return Math.round(base * speedMult * accMult * nMult * hiddenBonus)
}

function defaultProgress(): PlayerProgress {
  return { xp: 0, level: 1, solves: [] }
}

export function loadProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultProgress()
    // JSON.parse returns `any`; member access is fine (no-unsafe-member-access: off)
    const parsed = JSON.parse(raw)
    const xp = typeof parsed.xp === "number" ? parsed.xp : 0
    const level = typeof parsed.level === "number" ? parsed.level : 1
    const solves: Array<SolveRecord> = Array.isArray(parsed.solves)
      ? parsed.solves
      : []
    return { xp, level, solves }
  } catch {
    return defaultProgress()
  }
}

export function saveProgress(progress: PlayerProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Storage quota exceeded or unavailable — fail silently
  }
}

export function addSolve(
  progress: PlayerProgress,
  solve: Omit<SolveRecord, "xpEarned">,
  difficulty: Difficulty
): { next: PlayerProgress; xpEarned: number } {
  const xpEarned = computeXP(
    difficulty,
    solve.wpm,
    solve.accuracy,
    solve.n,
    solve.displayMode
  )
  const fullSolve: SolveRecord = { ...solve, xpEarned }
  const newXP = progress.xp + xpEarned
  const next: PlayerProgress = {
    xp: newXP,
    level: computeLevel(newXP),
    solves: [...progress.solves, fullSolve],
  }
  return { next, xpEarned }
}
