import type { JSX } from "react"
import { useState } from "react"
import { Button } from "@some-ui/shared"
import { ChangeMaterialDialog } from "@topik/components/topik/change-material/change-material-dialog"
import type { TopikMetadata } from "@topik/lib/topik"
import {
  BookOpen,
  Clock,
  Layers,
  RotateCcw,
  Target,
  Trophy,
} from "lucide-react"

// ═══════════════════════════════════════════════════════════════
// Props — public API unchanged
// ═══════════════════════════════════════════════════════════════

type SessionHeaderProps = {
  timeRemaining: number
  score: number
  totalQuestions: number
  currentBatch: number
  totalBatches: number
  topikDisplayName?: string | null
  onEndSession: () => void
  // Dialog & Data Props
  topikItems: Array<TopikMetadata>
  topikLoading: boolean
  topikError: string | null
  currentTopikKey?: string | null
  onTopikSelect: (key: string) => void
  onTopikReload?: () => void
}

// ═══════════════════════════════════════════════════════════════
// Component — Session orchestration only
// ═══════════════════════════════════════════════════════════════

export const SessionHeader = ({
  timeRemaining,
  score,
  totalQuestions,
  currentBatch,
  totalBatches,
  topikDisplayName,
  onEndSession,
  topikItems,
  topikLoading,
  topikError,
  currentTopikKey,
  onTopikSelect,
  onTopikReload,
}: SessionHeaderProps): JSX.Element => {
  const [dialogOpen, setDialogOpen] = useState(false)

  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60

  return (
    <>
      {/*
       * Wraps rather than pushing: the header is the first thing the session
       * body's height is taken from, and a row of chips that refuses to wrap
       * pushes itself out of the panel's rect on a narrow leaf (docs/ui-fit).
       */}
      <header className="border-border bg-card shrink-0 border-b px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-6">
            <div className="min-w-0">
              <h1 className="text-card-foreground truncate text-xl font-bold tracking-tight sm:text-2xl">
                Korean Study Session
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2">
                <p className="text-muted-foreground text-sm">
                  TOPIK 3-4 Comprehension Practice
                </p>
                {topikDisplayName && (
                  <>
                    <span className="text-muted-foreground">{"/"}</span>
                    <div className="flex items-center gap-1.5">
                      <BookOpen className="size-3.5 text-primary" />
                      <span className="text-sm font-medium text-primary">
                        {topikDisplayName}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="bg-secondary flex items-center gap-2 rounded-lg px-3 py-1.5">
              <Layers className="text-secondary-foreground/70 size-4" />
              <span className="text-secondary-foreground text-sm font-semibold">
                Conversation {currentBatch}/{totalBatches}
              </span>
            </div>
            <div className="bg-secondary flex items-center gap-2 rounded-lg px-3 py-1.5">
              <Clock className="text-primary size-4" />
              <span className="text-secondary-foreground font-mono font-semibold">
                {String(minutes).padStart(2, "0")}:
                {String(seconds).padStart(2, "0")}
              </span>
            </div>
            <div className="bg-secondary flex items-center gap-2 rounded-lg px-3 py-1.5">
              <Trophy className="text-secondary-foreground/70 size-4" />
              <span className="text-secondary-foreground text-sm font-semibold">
                {score}/{totalQuestions}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(true)}
            >
              <RotateCcw className="size-4 mr-2" />
              Change Material
            </Button>
            <Button variant="outline" size="sm" onClick={onEndSession}>
              <Target className="size-4 mr-2" />
              End Session
            </Button>
          </div>
        </div>
      </header>

      <ChangeMaterialDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        topikItems={topikItems}
        loading={topikLoading}
        error={topikError}
        currentTopikKey={currentTopikKey}
        onConfirm={onTopikSelect}
        onReload={onTopikReload}
      />
    </>
  )
}
