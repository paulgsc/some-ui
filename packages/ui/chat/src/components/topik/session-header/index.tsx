import type { JSX } from "react"
import { useState } from "react"
import type { TopikLibraryItem } from "@chat/hooks/topik/use-topik-library"
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Layers,
  RotateCcw,
  Target,
  Trophy,
} from "lucide-react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ScrollArea,
} from "some-ui-shared"

type SessionHeaderProps = {
  timeRemaining: number
  score: number
  totalQuestions: number
  currentBatch: number
  totalBatches: number
  topikDisplayName?: string
  onEndSession: () => void
  // Dialog props
  topikItems: Array<TopikLibraryItem>
  topikLoading: boolean
  topikError: string | null
  currentTopikKey?: string
  onTopikSelect: (key: string) => void
}

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
}: SessionHeaderProps): JSX.Element => {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | undefined>(
    currentTopikKey
  )

  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60

  const handleSelect = (key: string): void => {
    setSelectedKey(key)
  }

  const handleConfirm = (): void => {
    if (selectedKey) {
      onTopikSelect(selectedKey)
      setDialogOpen(false)
    }
  }

  return (
    <>
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Korean Study Session
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-muted-foreground">
                  TOPIK 3-4 Comprehension Practice
                </p>
                {topikDisplayName && (
                  <>
                    <span className="text-muted-foreground">•</span>
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
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-lg">
              <Layers className="size-4 text-accent" />
              <span className="font-semibold">
                Conversation {currentBatch}/{totalBatches}
              </span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-lg">
              <Clock className="size-4 text-primary" />
              <span className="font-mono font-semibold text-lg">
                {String(minutes).padStart(2, "0")}:
                {String(seconds).padStart(2, "0")}
              </span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-lg">
              <Trophy className="size-4 text-accent" />
              <span className="font-semibold">
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

      {/* Topik Selection Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="size-5" />
              Select Topik Study Material
            </DialogTitle>
            <DialogDescription>
              Choose a conversation set to practice your Korean comprehension
              skills
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            {topikLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Loading topik materials...
                  </p>
                </div>
              </div>
            )}

            {topikError && (
              <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                <p className="text-sm text-destructive">
                  Failed to load topik materials: {topikError}
                </p>
              </div>
            )}

            {!topikLoading && !topikError && topikItems.length === 0 && (
              <div className="rounded-lg border border-dashed p-12 text-center">
                <BookOpen className="mx-auto size-12 text-muted-foreground/50" />
                <p className="mt-4 text-sm text-muted-foreground">
                  No topik materials found
                </p>
              </div>
            )}

            {!topikLoading && !topikError && topikItems.length > 0 && (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-2">
                  {topikItems.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => handleSelect(item.key)}
                      className={`w-full rounded-lg border-2 p-4 text-left transition-all hover:bg-accent/50 ${
                        selectedKey === item.key
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">
                              {item.displayName}
                            </h3>
                            {selectedKey === item.key && (
                              <CheckCircle2 className="size-4 text-primary" />
                            )}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {item.description}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2 text-right">
                          <div className="flex items-center gap-1.5 text-sm">
                            <Layers className="size-4 text-accent" />
                            <span className="font-medium">
                              {item.batchCount} batch
                              {item.batchCount === 1 ? "" : "es"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-sm">
                            <Target className="size-4 text-primary" />
                            <span className="font-medium">
                              {item.totalQuestions} question
                              {item.totalQuestions === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!selectedKey || topikLoading}
            >
              Start Study Session
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
