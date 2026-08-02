import type { FC } from "react"
import { useMemo, useState } from "react"
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
import {
  Badge,
  Button,
  PageControls,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@some-ui/shared"
import { Lock } from "lucide-react"
import { cn, useFittedPage } from "some-ui-utils"

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
  const ordered = useMemo(
    () => [...challenges].sort(compareByCurriculum),
    [challenges]
  )
  const target = ordered.find((c) => c.curriculum)?.curriculum?.targetProblem

  // Group by stage, preserving the decomposition's own linearization inside
  // each group.
  const groups = useMemo(() => {
    const byStage: Array<{
      stage: CurriculumStage | null
      rows: Array<Challenge>
    }> = []
    for (const challenge of ordered) {
      const stage = challenge.curriculum?.stage ?? null
      const last = byStage.at(-1)
      if (last?.stage === stage) {
        last.rows.push(challenge)
      } else {
        byStage.push({ stage, rows: [challenge] })
      }
    }
    return byStage
  }, [ordered])

  const [activeGroup, setActiveGroup] = useState(0)
  const current = groups[Math.min(activeGroup, groups.length - 1)]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {target && (
        <div className="shrink-0 rounded-lg border border-border bg-muted/30 p-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {ordered.length} exercises, all building to
          </div>
          <p className="line-clamp-2 text-sm leading-relaxed text-card-foreground">
            {target}
          </p>
        </div>
      )}

      {/* A stage rail rather than one long scroll: the ladder is already
          grouped, and a group is 1-3 rungs, so showing one group at a time
          means the list always fits without a scrollbar. Rail on the side at
          width, a row of pills below it - the same navigation either way. */}
      <div className="flex min-h-0 flex-1 flex-col items-start gap-3 sm:flex-row sm:gap-4">
        <nav
          aria-label="Curriculum stage"
          className="flex shrink-0 gap-1.5 overflow-x-auto sm:w-40 sm:flex-col sm:overflow-x-visible"
        >
          {groups.map((group, index) => {
            const isActive = index === Math.min(activeGroup, groups.length - 1)
            return (
              <button
                key={group.stage ?? `loose-${index}`}
                type="button"
                onClick={() => setActiveGroup(index)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "flex shrink-0 items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-accent/40"
                )}
              >
                <span className="truncate font-medium">
                  {group.stage ? STAGE_META[group.stage].label : "Also"}
                </span>
                <span className="shrink-0 font-mono tabular-nums opacity-60">
                  {group.rows.length}
                </span>
              </button>
            )
          })}
        </nav>

        <div className="flex min-h-0 flex-1 w-full flex-col gap-2 overflow-hidden">
          <p className="shrink-0 text-[11px] text-muted-foreground">
            {current?.stage
              ? STAGE_META[current.stage].blurb
              : "Standalone challenges, outside the ladder."}
          </p>
          <ol className="flex min-h-0 flex-col">
            {(current?.rows ?? []).map((challenge, index) => (
              <CurriculumRow
                key={challenge.id}
                challenge={challenge}
                locked={isLocked(challenge)}
                isLast={index === (current?.rows.length ?? 0) - 1}
                onSelect={() => onSelect(challenge)}
              />
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

type PagedChallengeGridProps = {
  challenges: Array<Challenge>
  isLocked: (challenge: Challenge) => boolean
  onSelect: (challenge: Challenge) => void
}

/**
 * The flat pool's grid, showing as many cards as the box fits and paging the
 * rest. A fixed page size would be wrong at every viewport but one, so the
 * count comes from measuring - see `useFittedPage`.
 */
const PagedChallengeGrid: FC<PagedChallengeGridProps> = ({
  challenges,
  isLocked,
  onSelect,
}) => {
  const {
    viewportRef,
    contentRef,
    pageItems,
    page,
    pageCount,
    next,
    previous,
  } = useFittedPage(challenges, { minPerPage: 2 })

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2">
      <div ref={viewportRef} className="min-h-0 flex-1 overflow-hidden">
        <div ref={contentRef} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {pageItems.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              locked={isLocked(challenge)}
              onSelect={() => onSelect(challenge)}
            />
          ))}
        </div>
      </div>

      <PageControls
        page={page}
        pageCount={pageCount}
        onPrevious={previous}
        onNext={next}
        label="challenges"
      />
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
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="shrink-0">
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
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between">
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

      <Tabs
        defaultValue="data-structure"
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="w-full shrink-0">
          <TabsTrigger value="data-structure" className="flex-1">
            Data Structures
          </TabsTrigger>
          <TabsTrigger value="algorithm" className="flex-1">
            Algorithms
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="data-structure"
          className="min-h-0 flex-1 data-[state=active]:flex data-[state=active]:flex-col"
        >
          <PagedChallengeGrid
            challenges={filterByDifficulty(dsChallenges)}
            isLocked={isLocked}
            onSelect={onSelect}
          />
        </TabsContent>

        <TabsContent value="algorithm" className="min-h-0 flex-1">
          {progress.level < 3 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-400">
              <Lock className="h-4 w-4 shrink-0" />
              <span>
                Algorithm mode unlocks at Level 3. Keep typing data structures
                to level up!
              </span>
            </div>
          )}
          <PagedChallengeGrid
            challenges={filterByDifficulty(algoChallenges)}
            isLocked={isLocked}
            onSelect={onSelect}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
