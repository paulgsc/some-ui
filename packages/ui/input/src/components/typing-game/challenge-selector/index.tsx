import type { FC } from "react"
import { useState } from "react"
import type { Challenge, Difficulty, PlayerProgress } from "@input/types/leetype"
import { Lock } from "lucide-react"
import {
  Badge,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "some-ui-shared"
import { cn } from "some-ui-utils"

type ChallengeSelectorProps = {
  challenges: Array<Challenge>
  progress: PlayerProgress
  onSelect: (challenge: Challenge) => void
}

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  medium: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  hard: "text-rose-400 border-rose-400/30 bg-rose-400/10",
}

type ChallengeCardProps = {
  challenge: Challenge
  locked: boolean
  onSelect: () => void
}

const ChallengeCard: FC<ChallengeCardProps> = ({ challenge, locked, onSelect }) => (
  <button
    onClick={onSelect}
    disabled={locked}
    className={cn(
      "group relative flex w-full flex-col gap-2 rounded-lg border bg-card p-4 text-left transition-colors",
      locked
        ? "cursor-not-allowed opacity-50"
        : "hover:border-primary/50 hover:bg-card/80 cursor-pointer"
    )}
  >
    {locked && (
      <div className="absolute right-3 top-3">
        <Lock className="h-4 w-4 text-muted-foreground" />
      </div>
    )}

    <div className="flex items-start justify-between gap-2 pr-6">
      <span className="text-sm font-semibold text-card-foreground leading-tight">
        {challenge.title}
      </span>
      <Badge
        variant="outline"
        className={cn("shrink-0 text-xs capitalize", DIFFICULTY_COLORS[challenge.difficulty])}
      >
        {challenge.difficulty}
      </Badge>
    </div>

    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
      {challenge.description}
    </p>

    <div className="flex flex-wrap gap-1.5 mt-1">
      {challenge.tags.map((tag) => (
        <span
          key={tag}
          className="rounded px-1.5 py-0.5 text-[10px] font-mono bg-secondary text-secondary-foreground"
        >
          {tag}
        </span>
      ))}
    </div>
  </button>
)

export const ChallengeSelector: FC<ChallengeSelectorProps> = ({
  challenges,
  progress,
  onSelect,
}) => {
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | "all">("all")

  const dsChallenges = challenges.filter((c) => c.mode === "data-structure")
  const algoChallenges = challenges.filter((c) => c.mode === "algorithm")

  const filterByDifficulty = (list: Array<Challenge>): Array<Challenge> =>
    difficultyFilter === "all"
      ? list
      : list.filter((c) => c.difficulty === difficultyFilter)

  const isLocked = (challenge: Challenge): boolean =>
    progress.level < challenge.levelRequired

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-card-foreground">Choose a Challenge</h2>
        <div className="flex gap-1.5">
          {(["all", "easy", "medium", "hard"] as const).map((d) => (
            <Button
              key={d}
              size="sm"
              variant={difficultyFilter === d ? "default" : "outline"}
              className="capitalize text-xs h-7 px-2.5"
              onClick={() => setDifficultyFilter(d)}
            >
              {d}
            </Button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="data-structure">
        <TabsList className="w-full">
          <TabsTrigger value="data-structure" className="flex-1">
            Data Structures
          </TabsTrigger>
          <TabsTrigger value="algorithm" className="flex-1">
            Algorithms
          </TabsTrigger>
        </TabsList>

        <TabsContent value="data-structure">
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filterByDifficulty(dsChallenges).map((challenge) => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                locked={isLocked(challenge)}
                onSelect={() => onSelect(challenge)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="algorithm">
          {progress.level < 3 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-400">
              <Lock className="h-4 w-4 shrink-0" />
              <span>
                Algorithm mode unlocks at Level 3. Keep typing data structures to level up!
              </span>
            </div>
          )}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filterByDifficulty(algoChallenges).map((challenge) => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                locked={isLocked(challenge)}
                onSelect={() => onSelect(challenge)}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
