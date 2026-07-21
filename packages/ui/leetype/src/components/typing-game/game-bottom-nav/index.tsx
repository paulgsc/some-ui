import type { FC } from "react"
import type { DisplayMode, GameState, Language } from "@leetype/types/leetype"
import { Info, Play, RotateCcw, Settings2 } from "lucide-react"
import {
  Badge,
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
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
} from "some-ui-shared"

export type GameInfoContent = {
  title: string
  description: string
  tags: Array<string>
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
  settingsEnabled: boolean
  onLanguageChange: (lang: Language) => void
  onDisplayModeChange: (mode: DisplayMode) => void
  onDurationChange: (duration: number) => void
  info: GameInfoContent
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
  settingsEnabled,
  onLanguageChange,
  onDisplayModeChange,
  onDurationChange,
  info,
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
        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Challenge info">
              <Info className="h-4 w-4" />
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{info.title}</DrawerTitle>
              <DrawerDescription>{info.description}</DrawerDescription>
            </DrawerHeader>
            {info.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 px-4 pb-6">
                {info.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="font-mono text-xs"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </DrawerContent>
        </Drawer>

        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Settings"
              disabled={!settingsEnabled}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Game Settings</SheetTitle>
              <SheetDescription>
                Changing language or duration restarts the current session.
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
                >
                  <SelectTrigger id="bottom-nav-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="typescript">TypeScript</SelectItem>
                    <SelectItem value="rust">Rust</SelectItem>
                    <SelectItem value="cpp">C++</SelectItem>
                    <SelectItem value="c">C</SelectItem>
                  </SelectContent>
                </Select>
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
