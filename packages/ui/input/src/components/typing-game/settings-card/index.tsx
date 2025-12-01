import type { FC } from "react"
import type { DisplayMode, Language } from "@input/types/leetype"
import { ChevronDown, Settings2 } from "lucide-react"
import {
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "some-ui-shared"
import { cn } from "some-ui-utils"

type SettingsCardProps = {
  language: Language
  displayMode: DisplayMode
  duration: number
  expanded: boolean
  onLanguageChange: (lang: Language) => void
  onDisplayModeChange: (mode: DisplayMode) => void
  onDurationChange: (duration: number) => void
  onToggleExpanded: () => void
}

export const SettingsCard: FC<SettingsCardProps> = ({
  language,
  displayMode,
  duration,
  expanded,
  onLanguageChange,
  onDisplayModeChange,
  onDurationChange,
  onToggleExpanded,
}) => {
  return (
    <Card className="p-4 mb-6 bg-card border-border">
      <button
        onClick={onToggleExpanded}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-card-foreground">
            Game Settings
          </h2>
        </div>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
          <div className="space-y-2">
            <label className="text-sm font-medium text-card-foreground">
              Language
            </label>
            <Select value={language} onValueChange={onLanguageChange}>
              <SelectTrigger className="bg-secondary border-border text-secondary-foreground">
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
            <label className="text-sm font-medium text-card-foreground">
              Display Mode
            </label>
            <Select value={displayMode} onValueChange={onDisplayModeChange}>
              <SelectTrigger className="bg-secondary border-border text-secondary-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shown">Shown</SelectItem>
                <SelectItem value="hidden">Hidden</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-card-foreground">
              Duration
            </label>
            <Select
              value={duration.toString()}
              onValueChange={(v) => onDurationChange(Number.parseInt(v))}
            >
              <SelectTrigger className="bg-secondary border-border text-secondary-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60">1 minute</SelectItem>
                <SelectItem value="180">3 minutes</SelectItem>
                <SelectItem value="300">5 minutes</SelectItem>
                <SelectItem value="600">10 minutes</SelectItem>
                <SelectItem value="900">15 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </Card>
  )
}
