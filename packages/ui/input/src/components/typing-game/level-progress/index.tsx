import type { FC } from "react"
import {
  ALGORITHM_UNLOCK_LEVEL,
  xpForNextLevel,
} from "@input/lib/leetype/player-store"
import type { PlayerProgress } from "@input/types/leetype"
import { Lock, Unlock } from "lucide-react"
import { Badge, Progress } from "some-ui-shared"
import { cn } from "some-ui-utils"

type LevelProgressProps = {
  progress: PlayerProgress
  compact?: boolean
  className?: string
}

export const LevelProgress: FC<LevelProgressProps> = ({
  progress,
  compact = false,
  className,
}) => {
  const nextLevelXP = xpForNextLevel(progress.level)
  const prevLevelXP = xpForNextLevel(progress.level - 1)
  const xpIntoLevel = progress.xp - prevLevelXP
  const xpNeeded = nextLevelXP - prevLevelXP
  const pct = Math.min(100, Math.round((xpIntoLevel / xpNeeded) * 100))
  const algorithmUnlocked = progress.level >= ALGORITHM_UNLOCK_LEVEL

  if (compact) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <Badge variant="secondary" className="font-mono tabular-nums">
          Lv {progress.level}
        </Badge>
        <div className="flex flex-1 items-center gap-2">
          <Progress value={pct} className="h-1.5 flex-1" />
          <span className="text-xs text-muted-foreground tabular-nums">
            {progress.xp} XP
          </span>
        </div>
        {algorithmUnlocked ? (
          <Unlock className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
    )
  }

  return (
    <div className={cn("space-y-3 rounded-lg border bg-card p-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono text-sm tabular-nums">
            Level {progress.level}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {progress.xp} / {nextLevelXP} XP
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{pct}%</span>
      </div>

      <Progress value={pct} className="h-2" />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{progress.solves.length} solves</span>
        <div className="flex items-center gap-1.5">
          {algorithmUnlocked ? (
            <>
              <Unlock className="h-3.5 w-3.5 text-primary" />
              <span className="text-primary font-medium">Algorithm mode unlocked</span>
            </>
          ) : (
            <>
              <Lock className="h-3.5 w-3.5" />
              <span>
                Algorithm mode unlocks at Level {ALGORITHM_UNLOCK_LEVEL} (
                {Math.max(0, xpForNextLevel(ALGORITHM_UNLOCK_LEVEL - 1) - progress.xp)} XP away)
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
