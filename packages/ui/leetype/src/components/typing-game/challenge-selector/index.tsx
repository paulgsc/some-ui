import type { FC } from "react"
import { useState } from "react"
import {
  compareByCurriculum,
  hasCurriculum,
  STAGE_META,
} from "@leetype/lib/leetype/curriculum"
import type {
  Challenge,
  CurriculumStage,
  Difficulty,
  PlayerProgress,
} from "@leetype/types/leetype"
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

const ChallengeCard: FC<ChallengeCardProps> = ({
  challenge,
  locked,
  onSelect,
}) => (
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
        className={cn(
          "shrink-0 text-xs capitalize",
          DIFFICULTY_COLORS[challenge.difficulty]
        )}
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

type CurriculumRowProps = {
  challenge: Challenge
  locked: boolean
  isLast: boolean
  onSelect: () => void
}

/**
 * One rung of the ladder. Reads as a numbered step on a rail rather than as a
 * card in a grid, because the ordering *is* the information: exercise 4 is not
 * an alternative to exercise 3, it is what comes after it.
 */
const CurriculumRow: FC<CurriculumRowProps> = ({
  challenge,
  locked,
  isLast,
  onSelect,
}) => {
  const curriculum = challenge.curriculum
  const isFinal = curriculum?.stage === "master"

  return (
    <li className="relative flex gap-3">
      {/* The rail: a numbered node with a line running to the next step. */}
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold tabular-nums",
            isFinal
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : "border-border bg-card text-muted-foreground"
          )}
        >
          {curriculum?.step ?? "–"}
        </span>
        {!isLast && <span className="w-px flex-1 bg-border" />}
      </div>

      <button
        onClick={onSelect}
        disabled={locked}
        className={cn(
          "mb-2 flex w-full flex-col gap-1.5 rounded-lg border bg-card p-3 text-left transition-colors",
          locked
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:border-primary/50 hover:bg-card/80",
          isFinal && "border-destructive/40"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold leading-tight text-card-foreground">
            {challenge.title}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
            <Badge
              variant="outline"
              className={cn(
                "text-xs capitalize",
                DIFFICULTY_COLORS[challenge.difficulty]
              )}
            >
              {challenge.difficulty}
            </Badge>
          </span>
        </div>

        {/* The insight, not the description: on a ladder the useful preview is
            "what will this teach me", and the description is a click away. */}
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {curriculum?.insight ?? challenge.description}
        </p>

        {curriculum && curriculum.conceptsIntroduced.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {curriculum.conceptsIntroduced.map((concept) => (
              <span
                key={concept}
                className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary"
              >
                {concept}
              </span>
            ))}
          </div>
        )}
      </button>
    </li>
  )
}

type CurriculumViewProps = {
  challenges: Array<Challenge>
  isLocked: (challenge: Challenge) => boolean
  onSelect: (challenge: Challenge) => void
}

/**
 * The curriculum framing: a destination, then the ordered path to it.
 *
 * Deliberately not the difficulty/mode grid below. Those axes let a player
 * shop for a challenge, which is the right affordance for a flat pool and the
 * wrong one for a decomposition — here the exercises are not interchangeable
 * and their order is the whole product.
 */
const CurriculumView: FC<CurriculumViewProps> = ({
  challenges,
  isLocked,
  onSelect,
}) => {
  const ordered = [...challenges].sort(compareByCurriculum)
  const target = ordered.find((c) => c.curriculum)?.curriculum?.targetProblem

  // Group consecutive runs by stage so the rungs get named headers without
  // reordering anything the decomposition already linearized.
  const groups: Array<{
    stage: CurriculumStage | null
    rows: Array<Challenge>
  }> = []
  for (const challenge of ordered) {
    const stage = challenge.curriculum?.stage ?? null
    const last = groups.at(-1)
    if (last?.stage === stage) {
      last.rows.push(challenge)
    } else {
      groups.push({ stage, rows: [challenge] })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {target && (
        <div className="rounded-lg border border-border bg-muted/30 p-3.5">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {ordered.length} exercises, all building to
          </div>
          <p className="text-sm leading-relaxed text-card-foreground">
            {target}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Work them in order — each one exists because the next one needs it.
          </p>
        </div>
      )}

      {groups.map((group, groupIndex) => (
        <div key={group.stage ?? `loose-${groupIndex}`} className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-card-foreground">
              {group.stage ? STAGE_META[group.stage].label : "Also available"}
            </h3>
            <span className="text-[11px] text-muted-foreground">
              {group.stage
                ? STAGE_META[group.stage].blurb
                : "Standalone challenges, outside the ladder."}
            </span>
          </div>
          <ol className="flex flex-col">
            {group.rows.map((challenge, index) => (
              <CurriculumRow
                key={challenge.id}
                challenge={challenge}
                locked={isLocked(challenge)}
                isLast={
                  groupIndex === groups.length - 1 &&
                  index === group.rows.length - 1
                }
                onSelect={() => onSelect(challenge)}
              />
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}

export const ChallengeSelector: FC<ChallengeSelectorProps> = ({
  challenges,
  progress,
  onSelect,
}) => {
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | "all">(
    "all"
  )

  const dsChallenges = challenges.filter((c) => c.mode === "data-structure")
  const algoChallenges = challenges.filter((c) => c.mode === "algorithm")

  const filterByDifficulty = (list: Array<Challenge>): Array<Challenge> =>
    difficultyFilter === "all"
      ? list
      : list.filter((c) => c.difficulty === difficultyFilter)

  const isLocked = (challenge: Challenge): boolean =>
    progress.level < challenge.levelRequired

  // A decomposed pool is presented as a ladder; a flat pool keeps the
  // mode/difficulty grid it always had.
  if (hasCurriculum(challenges)) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-card-foreground">
            Pick up the curriculum
          </h2>
          <p className="text-xs text-muted-foreground">
            A dense problem, decomposed into progressively harder exercises.
          </p>
        </div>
        <CurriculumView
          challenges={challenges}
          isLocked={isLocked}
          onSelect={onSelect}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-card-foreground">
          Choose a Challenge
        </h2>
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
                Algorithm mode unlocks at Level 3. Keep typing data structures
                to level up!
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
