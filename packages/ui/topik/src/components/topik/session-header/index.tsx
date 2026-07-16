import type { JSX } from "react"
import { useState } from "react"
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
import { Button } from "some-ui-shared"

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
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-card-foreground">
                Korean Study Session
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-muted-foreground">
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

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-lg">
              <Layers className="size-4 text-secondary-foreground/70" />
              <span className="font-semibold text-secondary-foreground">
                Conversation {currentBatch}/{totalBatches}
              </span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-lg">
              <Clock className="size-4 text-primary" />
              <span className="font-mono font-semibold text-lg text-secondary-foreground">
                {String(minutes).padStart(2, "0")}:
                {String(seconds).padStart(2, "0")}
              </span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-lg">
              <Trophy className="size-4 text-secondary-foreground/70" />
              <span className="font-semibold text-secondary-foreground">
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
