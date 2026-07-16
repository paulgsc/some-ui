import type { FC } from "react"
import type { DisplayMode, Language } from "@leetype/types/leetype"
import { ChevronDown, Settings2 } from "lucide-react"
import {
  Card,
  Input,
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
            <label
              htmlFor="language-select"
              className="text-sm font-medium text-card-foreground"
            >
              Language
            </label>
            <Select value={language} onValueChange={onLanguageChange}>
              <SelectTrigger
                id="language-select"
                className="bg-secondary border-border text-secondary-foreground"
              >
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
              htmlFor="display-mode-select"
              className="text-sm font-medium text-card-foreground"
            >
              Display Mode
            </label>
            <Select value={displayMode} onValueChange={onDisplayModeChange}>
              <SelectTrigger
                id="display-mode-select"
                className="bg-secondary border-border text-secondary-foreground"
              >
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
              htmlFor="duration-input"
              className="text-sm font-medium text-card-foreground"
            >
              Duration
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="duration-input"
                type="number"
                min={1}
                step={1}
                value={duration}
                onChange={(e) => {
                  const value = Number.parseInt(e.target.value, 10)
                  if (!Number.isNaN(value)) {
                    onDurationChange(value)
                  }
                }}
                className="bg-secondary border-border text-secondary-foreground w-24"
              />
              <span className="text-sm text-muted-foreground">seconds</span>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
