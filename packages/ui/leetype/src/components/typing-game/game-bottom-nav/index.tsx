import type { FC, ReactNode } from "react"
import { ChallengeBrief } from "@leetype/components/typing-game/challenge-brief"
import { STAGE_META } from "@leetype/lib/leetype/curriculum"
import type {
  ChallengeCurriculum,
  DisplayMode,
  GameState,
  Language,
  TextGradient,
} from "@leetype/types/leetype"
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@some-ui/shared"
import {
  Gauge,
  GraduationCap,
  Info,
  Palette,
  Play,
  RotateCcw,
  Settings2,
} from "lucide-react"

export type GameInfoContent = {
  title: string
  description: string
  tags: Array<string>
  /**
   * The challenge's place in a decomposed curriculum, when it has one. Its
   * presence changes what the info panel *is*: not a problem statement but a
   * "why am I on this rung" brief — see `ChallengeBrief`.
   */
  curriculum?: ChallengeCurriculum
}

type GameBottomNavProps = {
  gameState: GameState
  onStart: () => void
  onReset: () => void
  timeLeft: number
  duration: number
  wpm: number
  accuracy: number
  progress: number
  errors: number
  chunkLabel: string
  language: Language
  displayMode: DisplayMode
  displayModeLocked: boolean
  /**
   * Whether the session-shaping controls (language, duration) can be touched
   * right now. They restart the run, so they are held back mid-play — but the
   * panel itself always opens, because "you cannot change the duration while
   * typing" and "the settings button does nothing" are different messages and
   * only one of them is true.
   *
   * This used to gate the trigger's `disabled` instead, computed from a
   * predicate (`isLegacyMode`) that is false for every challenge-driven
   * session — which is all of them in the app. The button was inert in every
   * state, with no way to tell that from a button that simply did not work.
   */
  sessionControlsEnabled: boolean
  textGradient: TextGradient
  onLanguageChange: (lang: Language) => void
  onDisplayModeChange: (mode: DisplayMode) => void
  onDurationChange: (duration: number) => void
  onTextGradientChange: (gradient: TextGradient) => void
  /**
   * The languages the current challenge actually ships source for. A
   * decomposed curriculum is Rust-only, so offering all four would let the
   * player pick their way into a load error. Defaults to all four for the
   * flat demo pool, which has them.
   */
  languages?: ReadonlyArray<Language>
  info: GameInfoContent
  /**
   * The skip/resume picker, rendered inline with the other overlay
   * triggers. Passed as a node rather than as props because it owns its own
   * dialog state and reads section progress lazily from the engine — this
   * nav's job is placement, not knowing what a section is.
   */
  sectionNavigator?: ReactNode
  /**
   * Element the Sheet/Drawer/Dialog portal into. This activity forces its
   * own app-theme on its root (like every other activity in the design
   * system) — passing that root here keeps the overlays themed consistently
   * with the card instead of falling back to whatever theme is ambient at
   * the document root.
   */
  portalContainer?: HTMLElement | null
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function toLanguage(v: string): Language | null {
  if (v === "typescript" || v === "rust" || v === "cpp" || v === "c") return v
  return null
}

function toTextGradient(v: string): TextGradient | null {
  if (v === "none" || v === "heading" || v === "accent" || v === "muted") {
    return v
  }
  return null
}

const LANGUAGE_LABELS: Record<Language, string> = {
  typescript: "TypeScript",
  rust: "Rust",
  cpp: "C++",
  c: "C",
}

const ALL_LANGUAGES: ReadonlyArray<Language> = [
  "typescript",
  "rust",
  "cpp",
  "c",
]

const TEXT_GRADIENT_OPTIONS: ReadonlyArray<{
  value: TextGradient
  label: string
}> = [
  { value: "none", label: "Off (syntax highlight)" },
  { value: "heading", label: "Heading" },
  { value: "accent", label: "Accent" },
  { value: "muted", label: "Muted" },
]

type StatTileProps = {
  label: string
  value: string
  highlight?: boolean
}

const StatTile: FC<StatTileProps> = ({ label, value, highlight }) => (
  <Card className="flex flex-col items-center gap-1 border-border bg-card p-4">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span
      className={`font-mono text-2xl font-bold tabular-nums ${
        highlight ? "text-primary" : "text-card-foreground"
      }`}
    >
      {value}
    </span>
  </Card>
)

export const GameBottomNav: FC<GameBottomNavProps> = ({
  gameState,
  onStart,
  onReset,
  timeLeft,
  duration,
  wpm,
  accuracy,
  progress,
  errors,
  chunkLabel,
  language,
  displayMode,
  displayModeLocked,
  sessionControlsEnabled,
  textGradient,
  onLanguageChange,
  onDisplayModeChange,
  onDurationChange,
  onTextGradientChange,
  languages = ALL_LANGUAGES,
  info,
  sectionNavigator,
  portalContainer,
}) => {
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-border bg-card px-3 py-2.5">
      <div className="flex flex-1 items-center gap-3 overflow-x-auto font-mono text-xs text-muted-foreground">
        <span className="tabular-nums">
          {formatTime(gameState === "playing" ? timeLeft : duration)}
        </span>
        <span className="text-primary tabular-nums">{wpm} WPM</span>
        <span className="text-accent tabular-nums">{accuracy.toFixed(0)}%</span>
        <span className="tabular-nums">{progress.toFixed(0)}%</span>
        {errors > 0 && (
          <span className="text-destructive tabular-nums">{errors} err</span>
        )}
        <Badge variant="outline" className="shrink-0 font-mono text-xs">
          {chunkLabel}
        </Badge>
        <Badge variant="secondary" className="shrink-0 font-mono text-xs">
          {language}
        </Badge>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {sectionNavigator}

        <Drawer>
          <DrawerTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              // The trigger says which kind of panel is behind it: a
              // curriculum exercise gets the graduation cap, a standalone
              // problem keeps the plain info glyph.
              aria-label={
                info.curriculum
                  ? `Exercise brief: step ${info.curriculum.step} of ${info.curriculum.totalSteps}`
                  : "Challenge info"
              }
            >
              {info.curriculum ? (
                <GraduationCap className="h-4 w-4" />
              ) : (
                <Info className="h-4 w-4" />
              )}
            </Button>
          </DrawerTrigger>
          <DrawerContent container={portalContainer}>
            <DrawerHeader>
              <DrawerTitle className="flex flex-wrap items-center gap-2">
                {info.title}
                {info.curriculum && (
                  <Badge variant="secondary" className="font-mono text-xs">
                    {info.curriculum.step}/{info.curriculum.totalSteps}
                  </Badge>
                )}
              </DrawerTitle>
              {/* One line of framing, never the description itself — that
                  lives in the body below, so the two don't say it twice. */}
              <DrawerDescription>
                {info.curriculum
                  ? `${STAGE_META[info.curriculum.stage].label} — one step of a decomposed curriculum, not a standalone problem.`
                  : "Standalone problem — what to implement, and its constraints."}
              </DrawerDescription>
            </DrawerHeader>
            {/* No scroll fallback: ChallengeBrief splits itself across tabs
                so each pane fits the box, and the box is bounded here. */}
            <div className="min-h-0 overflow-hidden px-4 pb-6">
              <ChallengeBrief
                description={info.description}
                tags={info.tags}
                curriculum={info.curriculum}
              />
            </div>
          </DrawerContent>
        </Drawer>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Session stats">
              <Gauge className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent container={portalContainer} showOverlay>
            <DialogHeader>
              <DialogTitle>Session Stats</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile
                label="Time"
                value={formatTime(
                  gameState === "playing" ? timeLeft : duration
                )}
              />
              <StatTile label="WPM" value={String(wpm)} highlight />
              <StatTile label="Accuracy" value={`${accuracy.toFixed(0)}%`} />
              <StatTile label="Progress" value={`${progress.toFixed(0)}%`} />
              <StatTile label="Errors" value={String(errors)} />
            </div>
          </DialogContent>
        </Dialog>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Source text color">
              <Palette className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            container={portalContainer}
            align="end"
            className="w-48"
          >
            <DropdownMenuLabel>Source text color</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={textGradient}
              onValueChange={(v) => {
                const gradient = toTextGradient(v)
                if (gradient) onTextGradientChange(gradient)
              }}
            >
              {TEXT_GRADIENT_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Settings">
              <Settings2 className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" container={portalContainer}>
            <SheetHeader>
              <SheetTitle>Game Settings</SheetTitle>
              <SheetDescription>
                {sessionControlsEnabled
                  ? "Changing language or duration restarts the current session."
                  : "Language and duration restart the session, so they are locked while you are typing. Finish or reset first."}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-5">
              <div className="space-y-2">
                <label
                  htmlFor="bottom-nav-language"
                  className="text-sm font-medium text-card-foreground"
                >
                  Language
                </label>
                <Select
                  value={language}
                  onValueChange={(v: string) => {
                    const lang = toLanguage(v)
                    if (lang) onLanguageChange(lang)
                  }}
                  // A single-language challenge (every curriculum exercise is
                  // Rust-only) has nothing to choose between; the select stays
                  // visible so the language is still legible, but inert.
                  disabled={!sessionControlsEnabled || languages.length <= 1}
                >
                  <SelectTrigger id="bottom-nav-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((option) => (
                      <SelectItem key={option} value={option}>
                        {LANGUAGE_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {languages.length <= 1 && (
                  <p className="text-xs text-muted-foreground">
                    This challenge ships {LANGUAGE_LABELS[language]} only.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="bottom-nav-display-mode"
                  className="text-sm font-medium text-card-foreground"
                >
                  Display Mode
                </label>
                <Select
                  value={displayMode}
                  onValueChange={(v: string) => {
                    if (v === "shown" || v === "hidden") onDisplayModeChange(v)
                  }}
                  disabled={displayModeLocked}
                >
                  <SelectTrigger id="bottom-nav-display-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shown">Shown</SelectItem>
                    <SelectItem value="hidden">Hidden</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="bottom-nav-duration"
                  className="text-sm font-medium text-card-foreground"
                >
                  Duration
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id="bottom-nav-duration"
                    type="number"
                    min={1}
                    step={1}
                    value={duration}
                    onChange={(e) => {
                      const value = Number.parseInt(e.target.value, 10)
                      if (!Number.isNaN(value)) onDurationChange(value)
                    }}
                    disabled={!sessionControlsEnabled}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">seconds</span>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {gameState === "idle" && (
          <Button onClick={onStart} size="sm" className="gap-2">
            <Play className="h-4 w-4" />
            Start
          </Button>
        )}
        {(gameState === "finished" || gameState === "timeout") && (
          <Button
            onClick={onReset}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        )}
      </div>
    </div>
  )
}
