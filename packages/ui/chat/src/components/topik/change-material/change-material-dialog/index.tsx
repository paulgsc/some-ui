import type { JSX } from "react"
import { useCallback, useMemo, useState } from "react"
import { BookshelfGrid } from "@chat/components/topik/change-material/bookshelf-grid"
import { OmniSearchInput } from "@chat/components/topik/change-material/omni-search-input"
import { TopikBookCard } from "@chat/components/topik/change-material/topik-book-card"
import type { TopikMetadata } from "@chat/lib/topik"
import { getRecommendedItems } from "@chat/lib/topik/utils"
import {
  AlertCircle,
  BookOpen,
  Clock,
  Layers,
  RefreshCw,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "some-ui-shared"

// ═══════════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════════

type ChangeMaterialDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  topikItems: Array<TopikMetadata>
  loading: boolean
  error?: string | null
  currentTopikKey?: string | null
  onConfirm: (key: string) => void
  onReload?: () => void
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export const ChangeMaterialDialog = ({
  open,
  onOpenChange,
  topikItems,
  loading,
  error,
  currentTopikKey,
  onConfirm,
  onReload,
}: ChangeMaterialDialogProps): JSX.Element => {
  // ─── Internal state ─────────────────────────────────────────
  const [search, setSearch] = useState("")
  const [selectedKey, setSelectedKey] = useState<string | undefined | null>(
    currentTopikKey
  )
  const [highlightedKey, setHighlightedKey] = useState<string | undefined>()
  const [page, setPage] = useState(1)
  const [isReloading, setIsReloading] = useState(false)

  const items = useMemo(() => topikItems, [topikItems])

  // ─── Derived state ─────────────────────────────────────────
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (item) =>
        item.displayName.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    )
  }, [items, search])

  const recommendedItems = useMemo(() => getRecommendedItems(items), [items])

  const selectedItem = useMemo(
    () => items.find((i) => i.key === selectedKey),
    [items, selectedKey]
  )

  const hasFatalError = error && items.length === 0

  // ─── Reset page when filter changes ─────────────────────────
  // Adjusted directly during render (rather than in an effect) per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevSearch, setPrevSearch] = useState(search)
  if (search !== prevSearch) {
    setPrevSearch(search)
    setPage(1)
  }

  // ─── Reset state on open ────────────────────────────────────
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setSearch("")
      setSelectedKey(currentTopikKey)
      setHighlightedKey(undefined)
      setPage(1)
    }
  }

  // ─── Handlers ───────────────────────────────────────────────
  const handleSelect = useCallback((key: string) => {
    setSelectedKey(key)
  }, [])

  const handleConfirm = useCallback(() => {
    if (selectedKey) {
      onConfirm(selectedKey)
      onOpenChange(false)
    }
  }, [selectedKey, onConfirm, onOpenChange])

  const handleCancel = useCallback(() => {
    setSearch("")
    setSelectedKey(currentTopikKey)
    setHighlightedKey(undefined)
    setPage(1)
    onOpenChange(false)
  }, [currentTopikKey, onOpenChange])

  const handleReload = useCallback(() => {
    if (!onReload) return
    setIsReloading(true)
    try {
      onReload()
    } finally {
      setIsReloading(false)
    }
  }, [onReload])

  const handleHighlight = useCallback((key: string | undefined) => {
    setHighlightedKey(key)
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <BookOpen className="size-5" />
            Select Study Material
          </DialogTitle>
          <DialogDescription>
            Browse and choose a conversation set for your Korean study session
          </DialogDescription>
        </DialogHeader>

        {/* ─── Loading state ───────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="inline-block size-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
              <p className="mt-3 text-sm text-muted-foreground">
                Loading materials...
              </p>
            </div>
          </div>
        )}

        {/* ─── Fatal error (no items available) ────────────── */}
        {!loading && hasFatalError && (
          <div className="py-8">
            <Alert variant="destructive">
              <XCircle className="size-4" />
              <AlertTitle>Failed to Load Materials</AlertTitle>
              <AlertDescription className="mt-2 space-y-3">
                <p>{error}</p>
                {onReload && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReload}
                    disabled={isReloading}
                  >
                    <RefreshCw
                      className={`size-4 mr-2 ${isReloading ? "animate-spin" : ""}`}
                    />
                    {isReloading ? "Retrying..." : "Retry"}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* ─── Main content ────────────────────────────────── */}
        {!loading && !hasFatalError && (
          <div className="flex flex-col gap-5 mt-2">
            {/* Non-fatal error banner */}
            {error && items.length > 0 && (
              <Alert className="border-[hsl(40,50%,65%)] bg-[hsl(40,30%,93%)] dark:bg-[hsl(40,12%,14%)]">
                <AlertCircle className="size-4 text-[hsl(40,60%,40%)]" />
                <AlertTitle className="text-[hsl(40,35%,25%)] dark:text-[hsl(40,30%,75%)]">
                  Partial Load
                </AlertTitle>
                <AlertDescription className="mt-2 space-y-3 text-[hsl(40,25%,35%)] dark:text-[hsl(40,20%,65%)]">
                  <p>{error}</p>
                  {onReload && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReload}
                      disabled={isReloading}
                    >
                      <RefreshCw
                        className={`size-4 mr-2 ${isReloading ? "animate-spin" : ""}`}
                      />
                      {isReloading ? "Retrying..." : "Retry"}
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Search */}
            <OmniSearchInput
              value={search}
              onChange={setSearch}
              items={filteredItems}
              onHighlight={handleHighlight}
              onSelect={handleSelect}
              highlightedKey={highlightedKey}
              disabled={loading}
            />

            {/* Preview panel */}
            {selectedItem && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">
                        {selectedItem.displayName}
                      </h3>
                      {selectedItem.difficulty && (
                        <Badge variant="secondary" className="text-xs">
                          {selectedItem.difficulty}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedItem.description}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 text-xs text-muted-foreground shrink-0">
                    <span className="flex items-center gap-1.5">
                      <Layers className="size-3.5" />
                      {selectedItem.batchCount} batches
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Target className="size-3.5" />
                      {selectedItem.totalQuestions} questions
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3.5" />
                      {"est_time"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Recommended strip */}
            {!search.trim() && recommendedItems.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="size-4 text-primary" />
                  <h4 className="text-sm font-semibold text-foreground">
                    Recommended for Study
                  </h4>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {recommendedItems.map((item) => (
                    <TopikBookCard
                      key={item.key}
                      item={item}
                      selected={selectedKey === item.key}
                      onClick={() => handleSelect(item.key)}
                      variant="recommended"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Bookshelf grid */}
            <BookshelfGrid
              items={filteredItems}
              selectedKey={selectedKey}
              onSelect={handleSelect}
              page={page}
              onPageChange={setPage}
            />
          </div>
        )}

        {/* ─── Footer ──────────────────────────────────────── */}
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedKey || loading}>
            Start Study Session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
