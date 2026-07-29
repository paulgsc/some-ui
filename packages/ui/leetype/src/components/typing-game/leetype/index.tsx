import type { FC } from "react"
import { useEffect, useRef, useState } from "react"
import { ChallengeSelector } from "@leetype/components/typing-game/challenge-selector"
import { CodeInputCard } from "@leetype/components/typing-game/code-input-card"
import type { GameInfoContent } from "@leetype/components/typing-game/game-bottom-nav"
import { GameBottomNav } from "@leetype/components/typing-game/game-bottom-nav"
import { SectionNavigator } from "@leetype/components/typing-game/section-navigator"
import { TypingErrorAlert } from "@leetype/components/typing-game/typing-error-alert"
import { useGameTimer } from "@leetype/hooks"
import { useTypingGame } from "@leetype/hooks/leetype"
import { useChunkedCode } from "@leetype/hooks/leetype/use-chunked-code"
import { usePlayerProgress } from "@leetype/hooks/leetype/use-player-progress"
import {
  availableLanguages,
  resolveLanguage,
  STAGE_META,
} from "@leetype/lib/leetype/curriculum"
import type { PrettierParser } from "@leetype/lib/leetype/format-code"
import { ADAPTIVE_WPM_THRESHOLD } from "@leetype/lib/leetype/player-store"
import type {
  Challenge,
  ChunkCompletionStats,
  CompletedSessionStats,
  DisplayMode,
  GameState,
  Language,
  NContext,
  TextGradient,
} from "@leetype/types/leetype"
import { CHALLENGES } from "@some-ui/content"
import {
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "some-ui-shared"

type LeetypeProps = {
  /** Direct code paths (legacy / story mode) — skips the challenge picker. */
  codePaths?: Record<Language, string>
  /**
   * A pre-hydrated challenge, e.g. from a host flow (like `LeetypeApp`) that
   * already ran its own selection step before mounting this component.
   * Skips the challenge picker below.
   */
  challenge?: Challenge
  /**
   * The pool the required challenge picker selects from when neither
   * `challenge` nor `codePaths` is given (the config-driven "LeetType"
   * activity's path - see apps/www's activity-catalog). Defaults to the
   * bundled demo set (`@some-ui/content`'s `CHALLENGES`). This is the seam a
   * host app uses to swap in its own challenge corpus (e.g. an
   * LLM-generated, environment-specific set fetched at runtime) without this
   * component knowing or caring where the challenges came from.
   */
  challenges?: Array<Challenge>
  /** Pre-selected language (challenge mode) */
  initialLanguage?: Language
  /** Pre-selected duration in seconds (challenge mode) */
  initialDuration?: number
  /** N context label (challenge mode, algo challenges only) */
  nContext?: NContext | null
  /** Called when the session ends (finished or timeout) */
  onSessionComplete?: (stats: CompletedSessionStats) => void
}

const PRETTIER_PARSER_MAP: Record<Language, PrettierParser> = {
  typescript: "typescript",
  rust: "rust",
  cpp: "cpp",
  c: "c",
}

const DEFAULT_PROMPT_DESCRIPTION =
  "Describe what the user is supposed to implement, constraints, edge cases, or reasoning hints here."

type CumulativeStats = {
  totalChunks: number
  totalCharsTyped: number
  totalErrors: number
}

export const Leetype: FC<LeetypeProps> = ({
  codePaths,
  challenge,
  challenges = CHALLENGES,
  initialLanguage,
  initialDuration,
  nContext,
  onSessionComplete,
}) => {
  // Neither a fully-hydrated challenge nor direct code paths were given, so
  // this mount is the config-driven "LeetType" activity's path: the picker
  // below is a required, blocking step of the session itself (not a
  // composer-time setting) — see issue #829.
  const needsChallengeSelection = !challenge && codePaths === undefined
  const [pickedChallenge, setPickedChallenge] = useState<Challenge | null>(null)
  const { progress: playerProgress } = usePlayerProgress()

  const resolvedChallenge = challenge ?? pickedChallenge ?? undefined
  const isLegacyMode = !needsChallengeSelection && !resolvedChallenge
  const awaitingChallengeSelection =
    needsChallengeSelection && !resolvedChallenge

  const [gameState, setGameState] = useState<GameState>("idle")
  const [displayMode, setDisplayMode] = useState<DisplayMode>("shown")
  const [textGradient, setTextGradient] = useState<TextGradient>("none")
  const [preferredLanguage, setPreferredLanguage] = useState<Language>(
    initialLanguage ?? "typescript"
  )
  const [duration, setDuration] = useState(initialDuration ?? 300)
  const [adaptiveHidden, setAdaptiveHidden] = useState(false)
  const [cumulativeStats, setCumulativeStats] = useState<CumulativeStats>({
    totalChunks: 0,
    totalCharsTyped: 0,
    totalErrors: 0,
  })

  const inputRef = useRef<HTMLTextAreaElement>(null)
  // Portal target for the bottom nav's Sheet/Drawer/Dialog: this activity
  // forces its own "code" app-theme on its root (like every other activity
  // in this design system), but Radix/vaul portals default to document.body
  // — outside that subtree — so without an explicit container they'd fall
  // back to whatever theme happens to be ambient at the document root
  // instead of matching the card.
  const [themedContainer, setThemedContainer] = useState<HTMLDivElement | null>(
    null
  )
  const onSessionCompleteRef = useRef(onSessionComplete)
  const latestStatsRef = useRef<CompletedSessionStats>({
    wpm: 0,
    accuracy: 100,
    elapsedTime: 0,
    errors: 0,
    displayMode: "shown",
    wasAdaptive: false,
    gameState: "finished",
  })

  useEffect(() => {
    onSessionCompleteRef.current = onSessionComplete
  }, [onSessionComplete])

  const effectiveCodePaths: Partial<Record<Language, string>> =
    resolvedChallenge?.codePaths ?? codePaths ?? {}

  // A decomposed curriculum ships Rust only (see the Curriculum Decomposer
  // prompt), so the preferred language — a default, or whatever the player
  // picked for some earlier multi-language challenge — may not exist here.
  // Resolving it down to something the challenge actually carries is the
  // difference between "this exercise is in Rust" and a load error.
  const language = resolveLanguage(effectiveCodePaths, preferredLanguage)
  const offeredLanguages = availableLanguages(effectiveCodePaths)

  const codeState = useChunkedCode(effectiveCodePaths[language] ?? "", {
    prettierParser: PRETTIER_PARSER_MAP[language],
    linesPerChunk: 150,
  })

  const targetCode = codeState.currentChunk?.content ?? ""

  const currentChunkNumber =
    codeState.totalLines > 0 ? Math.floor(codeState.currentLine / 100) + 1 : 1
  const totalChunksEstimate =
    codeState.totalLines > 0 ? Math.ceil(codeState.totalLines / 100) : 1

  const handleChunkComplete = (chunkStats: ChunkCompletionStats): void => {
    setCumulativeStats((prev) => ({
      totalChunks: prev.totalChunks + 1,
      totalCharsTyped: prev.totalCharsTyped + chunkStats.charsTyped,
      totalErrors: prev.totalErrors + chunkStats.errors,
    }))

    if (codeState.hasMore) {
      codeState.loadNextChunk()
    } else {
      setGameState("finished")
    }
  }

  const {
    layout,
    roles,
    slotOfDisplay,
    slotStatus,
    snapshot,
    readSectionProgress,
    rejection,
    onDismiss,
    press,
    backspace,
    jumpToSection,
    resume,
    start,
    reset,
  } = useTypingGame({
    targetCode,
    gameState,
    onComplete: () => {},
    onChunkComplete: handleChunkComplete,
  })

  const {
    showErrorAlert,
    consecutiveErrors,
    elapsedTime,
    cursorDisplay,
    totalErrors: errors,
    progress,
    accuracy,
    wpm,
  } = snapshot

  // The caret is "behind" whenever an earlier section was skipped — that is
  // exactly when "resume where you left off" has somewhere to go.
  const hasUnfinishedWork =
    snapshot.firstGapSlot !== null &&
    snapshot.firstGapSlot < snapshot.cursorSlot

  const timer = useGameTimer({
    gameState,
    duration,
    onTimeout: () => setGameState("timeout"),
  })

  // Adaptive mode: latch hidden flag when WPM crosses threshold during play.
  // Calling setState during render (getDerivedStateFromProps equivalent) causes
  // React to discard the current render and immediately re-render — not an effect.
  if (
    !adaptiveHidden &&
    gameState === "playing" &&
    wpm >= ADAPTIVE_WPM_THRESHOLD
  ) {
    setAdaptiveHidden(true)
  }

  const isHardDifficulty = resolvedChallenge?.difficulty === "hard"
  const effectiveDisplayMode: DisplayMode =
    isHardDifficulty || adaptiveHidden ? "hidden" : displayMode

  const totalErrors = cumulativeStats.totalErrors + errors

  useEffect(() => {
    latestStatsRef.current = {
      wpm,
      accuracy,
      elapsedTime,
      errors: totalErrors,
      displayMode: effectiveDisplayMode,
      wasAdaptive: adaptiveHidden,
      gameState: "finished",
    }
  }, [
    wpm,
    accuracy,
    elapsedTime,
    totalErrors,
    effectiveDisplayMode,
    adaptiveHidden,
  ])

  // Fire onSessionComplete when game ends
  useEffect(() => {
    if (gameState !== "finished" && gameState !== "timeout") return
    const statsSnapshot: CompletedSessionStats = {
      ...latestStatsRef.current,
      gameState,
    }
    onSessionCompleteRef.current?.(statsSnapshot)
  }, [gameState])

  useEffect(() => {
    if (codeState.status === "SUCCESS") {
      reset()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGameState("idle")
      setCumulativeStats({ totalChunks: 0, totalCharsTyped: 0, totalErrors: 0 })
      setAdaptiveHidden(false)
    }
  }, [reset, language, codeState.status])

  const handleStart = (): void => {
    if (codeState.status !== "SUCCESS") return
    setGameState("playing")
    start()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const handleReset = (): void => {
    setGameState("idle")
    reset()
    setCumulativeStats({ totalChunks: 0, totalCharsTyped: 0, totalErrors: 0 })
    setAdaptiveHidden(false)
  }

  const handleLanguageChange = (lang: Language): void => {
    setPreferredLanguage(lang)
    setGameState("idle")
    setCumulativeStats({ totalChunks: 0, totalCharsTyped: 0, totalErrors: 0 })
    setAdaptiveHidden(false)
  }

  const overallProgress =
    totalChunksEstimate > 0
      ? ((cumulativeStats.totalChunks + progress / 100) / totalChunksEstimate) *
        100
      : progress

  const chunkLabel = `Chunk ${currentChunkNumber}/${totalChunksEstimate}${
    codeState.hasMore ? "+" : ""
  }`

  const curriculum = resolvedChallenge?.curriculum

  const info: GameInfoContent = {
    title: resolvedChallenge ? resolvedChallenge.title : "Problem Description",
    description: resolvedChallenge
      ? resolvedChallenge.description
      : DEFAULT_PROMPT_DESCRIPTION,
    tags: resolvedChallenge ? resolvedChallenge.tags : [],
    curriculum,
  }

  return (
    <div
      ref={setThemedContainer}
      className="dark code absolute inset-0 flex flex-col overflow-hidden"
    >
      {awaitingChallengeSelection ? (
        // Required, blocking step of the session itself — no close button,
        // and outside interactions are suppressed so a session can't start
        // without a challenge picked (see issue #829: this used to be a
        // silent composer-time "difficulty" setting instead).
        <Dialog open>
          <DialogContent
            container={themedContainer}
            showOverlay
            showCloseButton={false}
            className="max-h-[85vh] max-w-3xl overflow-y-auto"
            onEscapeKeyDown={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>Choose a Challenge</DialogTitle>
              <DialogDescription>
                Pick what you want to type before the session begins.
              </DialogDescription>
            </DialogHeader>
            <ChallengeSelector
              challenges={challenges}
              progress={playerProgress}
              onSelect={setPickedChallenge}
            />
          </DialogContent>
        </Dialog>
      ) : (
        <>
          {/* Challenge identity strip — kept slim so the viewport still
              belongs to the code/input card below; everything actionable
              lives in the bottom nav's menus instead of inline controls. */}
          {resolvedChallenge && (
            <div className="mb-3 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5">
              {/* Curriculum position leads the strip when there is one: on a
                  decomposed ladder, "step 4 of 10, Apply" is what tells the
                  player what they're looking at — the title alone reads as a
                  standalone problem, which is exactly the wrong frame. */}
              {curriculum && (
                <span className="flex items-center gap-2">
                  <Badge
                    variant={
                      curriculum.stage === "master" ? "destructive" : "default"
                    }
                    className="text-xs"
                  >
                    {STAGE_META[curriculum.stage].label}
                  </Badge>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {curriculum.step}/{curriculum.totalSteps}
                  </span>
                </span>
              )}
              <span className="text-base font-semibold text-card-foreground">
                {resolvedChallenge.title}
              </span>
              <Badge
                variant={
                  resolvedChallenge.difficulty === "easy"
                    ? "default"
                    : resolvedChallenge.difficulty === "medium"
                      ? "secondary"
                      : "destructive"
                }
                className="capitalize"
              >
                {resolvedChallenge.difficulty}
              </Badge>
              {nContext && (
                <Badge
                  variant="outline"
                  className="font-mono text-xs capitalize"
                >
                  N={nContext}
                </Badge>
              )}
              {effectiveDisplayMode === "hidden" && (
                <Badge
                  variant="outline"
                  className="text-xs text-muted-foreground"
                >
                  {adaptiveHidden ? "Adaptive: hidden" : "Hidden mode"}
                </Badge>
              )}
            </div>
          )}

          <div className="relative min-h-0 flex-1">
            <CodeInputCard
              status={codeState.status}
              loadError={codeState.error}
              path={effectiveCodePaths[language] ?? ""}
              onRetryLoad={() => handleLanguageChange(language)}
              displayCode={targetCode}
              language={language}
              roles={roles}
              slotOfDisplay={slotOfDisplay}
              slotStatus={slotStatus}
              cursorDisplay={cursorDisplay}
              displayMode={effectiveDisplayMode}
              adaptiveMessage={
                adaptiveHidden
                  ? `Adaptive mode engaged at ${ADAPTIVE_WPM_THRESHOLD} WPM`
                  : undefined
              }
              textGradient={textGradient}
              gameState={gameState}
              onKey={press}
              onBackspace={backspace}
              rejection={rejection}
              inputRef={inputRef}
              elapsedTime={elapsedTime}
              accuracy={accuracy}
              progress={progress}
            />

            <div className="pointer-events-none absolute inset-x-4 top-4 z-10">
              <div className="pointer-events-auto">
                <TypingErrorAlert
                  consecutiveErrors={consecutiveErrors}
                  onDismiss={onDismiss}
                  showErrorAlert={showErrorAlert}
                />
              </div>
            </div>
          </div>

          <GameBottomNav
            gameState={gameState}
            onStart={handleStart}
            onReset={handleReset}
            timeLeft={timer.timeLeft}
            duration={duration}
            wpm={wpm}
            accuracy={accuracy}
            progress={overallProgress}
            errors={totalErrors}
            chunkLabel={chunkLabel}
            language={language}
            displayMode={displayMode}
            displayModeLocked={isHardDifficulty || adaptiveHidden}
            settingsEnabled={isLegacyMode && gameState === "idle"}
            textGradient={textGradient}
            onLanguageChange={handleLanguageChange}
            onDisplayModeChange={setDisplayMode}
            onDurationChange={setDuration}
            onTextGradientChange={setTextGradient}
            languages={offeredLanguages}
            info={info}
            sectionNavigator={
              <SectionNavigator
                sections={layout.sections}
                readProgress={readSectionProgress}
                currentSection={snapshot.cursorSection}
                hasUnfinishedWork={hasUnfinishedWork}
                onJumpToSection={jumpToSection}
                onResume={resume}
                disabled={gameState !== "playing"}
                portalContainer={themedContainer}
              />
            }
            portalContainer={themedContainer}
          />
        </>
      )}
    </div>
  )
}
