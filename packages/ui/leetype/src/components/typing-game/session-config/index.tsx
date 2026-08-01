import type { ChangeEvent, FC } from "react"
import { useState } from "react"
import type {
  Challenge,
  Difficulty,
  Language,
  NContext,
} from "@leetype/types/leetype"
import { ArrowLeft, Eye, EyeOff } from "lucide-react"
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@some-ui/shared"
import { cn } from "some-ui-utils"

export type SessionStartConfig = {
  language: Language
  duration: number
  nContext: NContext | null
}

type SessionConfigProps = {
  challenge: Challenge
  onStart: (config: SessionStartConfig) => void
  onBack: () => void
}

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  medium: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  hard: "text-rose-400 border-rose-400/30 bg-rose-400/10",
}

const N_OPTIONS: Array<{ value: NContext; label: string; n: number }> = [
  { value: "tiny", label: "Tiny", n: 10 },
  { value: "small", label: "Small", n: 100 },
  { value: "medium", label: "Medium", n: 1000 },
  { value: "large", label: "Large", n: 10000 },
]

function toLanguage(v: string): Language | null {
  if (v === "typescript" || v === "rust" || v === "cpp" || v === "c") return v
  return null
}

function toNContext(v: string): NContext | null {
  if (v === "tiny" || v === "small" || v === "medium" || v === "large") return v
  return null
}

export const SessionConfig: FC<SessionConfigProps> = ({
  challenge,
  onStart,
  onBack,
}) => {
  const [language, setLanguage] = useState<Language>("typescript")
  const [duration, setDuration] = useState(300)
  const [nContext, setNContext] = useState<NContext>("small")

  const isAlgo = challenge.mode === "algorithm"
  const isHard = challenge.difficulty === "hard"

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mt-0.5 -ml-2 gap-1.5 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold text-card-foreground">
              {challenge.title}
            </h2>
            <Badge
              variant="outline"
              className={cn(
                "capitalize",
                DIFFICULTY_COLORS[challenge.difficulty]
              )}
            >
              {challenge.difficulty}
            </Badge>
            <Badge variant="secondary" className="capitalize text-xs">
              {challenge.mode === "data-structure"
                ? "Data Structure"
                : "Algorithm"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {challenge.description}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {challenge.tags.map((tag) => (
              <span
                key={tag}
                className="rounded px-1.5 py-0.5 text-[10px] font-mono bg-secondary text-secondary-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Config fields */}
      <Card className="p-5 bg-card border-border">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* Language */}
          <div className="space-y-2">
            <span className="text-sm font-medium text-card-foreground">
              Language
            </span>
            <Select
              value={language}
              onValueChange={(v: string) => {
                const lang = toLanguage(v)
                if (lang) setLanguage(lang)
              }}
            >
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

          {/* Duration */}
          <div className="space-y-2">
            <span className="text-sm font-medium text-card-foreground">
              Duration
            </span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={30}
                step={30}
                value={duration}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const val = Number.parseInt(e.target.value, 10)
                  if (!Number.isNaN(val) && val > 0) setDuration(val)
                }}
                className="bg-secondary border-border text-secondary-foreground w-24"
              />
              <span className="text-sm text-muted-foreground">seconds</span>
            </div>
          </div>

          {/* N context (algo mode only) */}
          {isAlgo && (
            <div className="space-y-2">
              <span className="text-sm font-medium text-card-foreground">
                Input size (N)
              </span>
              <Select
                value={nContext}
                onValueChange={(v: string) => {
                  const ctx = toNContext(v)
                  if (ctx) setNContext(ctx)
                }}
              >
                <SelectTrigger className="bg-secondary border-border text-secondary-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {N_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label} (N={opt.n.toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Display mode note */}
        <div
          className={cn(
            "mt-5 flex items-center gap-2 rounded-md px-3 py-2.5 text-sm",
            isHard
              ? "bg-rose-400/10 text-rose-400 border border-rose-400/20"
              : "bg-muted/50 text-muted-foreground"
          )}
        >
          {isHard ? (
            <EyeOff className="h-4 w-4 shrink-0" />
          ) : (
            <Eye className="h-4 w-4 shrink-0" />
          )}
          {isHard ? (
            <span>
              Hard mode — source is always hidden. Type entirely from memory.
            </span>
          ) : (
            <span>
              Source visible. Adaptive mode will hide it once you hit{" "}
              <span className="font-medium">40 WPM</span>.
            </span>
          )}
        </div>
      </Card>

      <Button
        size="lg"
        onClick={() =>
          onStart({ language, duration, nContext: isAlgo ? nContext : null })
        }
        className="self-start"
      >
        Start Session
      </Button>
    </div>
  )
}
