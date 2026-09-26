import type { JSX } from "react"
import { Button } from "@some-ui/shared"
import type { TopikMetadata } from "@topik/lib/topik"
import { ChevronRight, Loader2, PlayCircle } from "lucide-react"

type MaterialListProps = {
  items: Array<TopikMetadata>
  loading: boolean
  error: string | null
  resume: { topik: TopikMetadata; conversation: number } | null
  onSelect: (key: string) => void
  onReload: () => void
}

/**
 * The handheld start screen. Picking material is the first tap, and the
 * lesson is one tap away from anywhere a learner left off.
 */
export const MaterialList = ({
  items,
  loading,
  error,
  resume,
  onSelect,
  onReload,
}: MaterialListProps): JSX.Element => (
  <div
    data-slot="topik-material-list"
    data-scroll-intent="long-form"
    className={
      // scroll-intent: long-form — the catalogue is as long as the library;
      // a list a thumb scrolls is the phone's native way to browse one.
      "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
    }
  >
    {resume && (
      <button
        type="button"
        onClick={() => onSelect(resume.topik.key)}
        className="bg-primary text-primary-foreground flex min-h-16 items-center gap-3 rounded-2xl p-4 text-left"
      >
        <PlayCircle className="size-8 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium tracking-wider uppercase opacity-80">
            Continue
          </span>
          <span className="block truncate font-semibold">
            {resume.topik.displayName}
          </span>
          <span className="block text-sm opacity-80">
            Conversation {resume.conversation + 1} of {resume.topik.batchCount}
          </span>
        </span>
      </button>
    )}

    {loading && (
      <p className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading materials...
      </p>
    )}

    {error && (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-destructive text-sm">{error}</p>
        <Button
          variant="outline"
          className="h-11 rounded-xl"
          onClick={onReload}
        >
          Try again
        </Button>
      </div>
    )}

    {!loading && !error && items.length === 0 && (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No study material is available here yet.
      </p>
    )}

    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            onClick={() => onSelect(item.key)}
            className="bg-card border-border flex min-h-16 w-full items-center gap-3 rounded-2xl border p-4 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {item.displayName}
              </span>
              <span className="text-muted-foreground line-clamp-2 text-sm">
                {item.description}
              </span>
              <span className="text-muted-foreground mt-1 block text-xs">
                {item.batchCount} conversations · {item.totalQuestions}{" "}
                questions
                {item.difficulty ? ` · ${item.difficulty}` : ""}
              </span>
            </span>
            <ChevronRight className="text-muted-foreground size-5 shrink-0" />
          </button>
        </li>
      ))}
    </ul>
  </div>
)
