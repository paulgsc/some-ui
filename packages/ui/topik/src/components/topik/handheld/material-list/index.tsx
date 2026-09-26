import type { JSX } from "react"
import { Button } from "@some-ui/shared"
import type { TopikMetadata } from "@topik/lib/topik"
import { topikLevelOf } from "@topik/lib/topik/generation/intake"
import {
  ChevronRight,
  Loader2,
  PlayCircle,
  Sparkles,
  Trash2,
} from "lucide-react"

type MaterialListProps = {
  /** Served material. */
  items: Array<TopikMetadata>
  /** Lessons the learner generated, kept on this device. */
  mine?: Array<TopikMetadata>
  loading: boolean
  error: string | null
  resume: { topik: TopikMetadata; conversation: number } | null
  onSelect: (key: string) => void
  onReload: () => void
  /** Opens the generation loop; absent where it isn't offered. */
  onCreate?: () => void
  onRemove?: (key: string) => void
}

const details = (item: TopikMetadata): string => {
  const level = topikLevelOf(item.tags)
  return [
    `${item.batchCount} conversations`,
    level ? `TOPIK ${level}` : item.difficulty,
  ]
    .filter(Boolean)
    .join(" · ")
}

const Row = ({
  item,
  onSelect,
  onRemove,
}: {
  item: TopikMetadata
  onSelect: (key: string) => void
  onRemove?: (key: string) => void
}): JSX.Element => (
  <li className="bg-card border-border flex min-h-16 items-stretch rounded-2xl border">
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{item.displayName}</span>
        {item.description && (
          <span className="text-muted-foreground line-clamp-2 text-sm">
            {item.description}
          </span>
        )}
        <span className="text-muted-foreground mt-1 block text-xs">
          {details(item)}
        </span>
      </span>
      {!onRemove && (
        <ChevronRight className="text-muted-foreground size-5 shrink-0" />
      )}
    </button>
    {onRemove && (
      <button
        type="button"
        aria-label={`Remove ${item.displayName}`}
        onClick={() => onRemove(item.key)}
        className="text-muted-foreground flex w-12 shrink-0 items-center justify-center"
      >
        <Trash2 className="size-4" />
      </button>
    )}
  </li>
)

/**
 * The handheld start screen. Picking material is the first tap, and the
 * lesson is one tap away from anywhere a learner left off.
 */
export const MaterialList = ({
  items,
  mine = [],
  loading,
  error,
  resume,
  onSelect,
  onReload,
  onCreate,
  onRemove,
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

    {onCreate && (
      <button
        type="button"
        onClick={onCreate}
        className="border-primary/40 bg-primary/10 flex min-h-16 items-center gap-3 rounded-2xl border border-dashed p-4 text-left"
      >
        <Sparkles className="text-primary size-6 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Write a new lesson</span>
          <span className="text-muted-foreground block text-sm">
            Your model writes it from the app&apos;s prompt; the app checks it.
          </span>
        </span>
        <ChevronRight className="text-muted-foreground size-5 shrink-0" />
      </button>
    )}

    {mine.length > 0 && (
      <section aria-label="Your lessons" className="flex flex-col gap-2">
        <h2 className="text-muted-foreground px-1 pt-2 text-xs font-medium tracking-wider uppercase">
          Your lessons
        </h2>
        <ul className="flex flex-col gap-2">
          {mine.map((item) => (
            <Row
              key={item.key}
              item={item}
              onSelect={onSelect}
              onRemove={onRemove}
            />
          ))}
        </ul>
      </section>
    )}

    {mine.length > 0 && items.length > 0 && (
      <h2 className="text-muted-foreground px-1 pt-2 text-xs font-medium tracking-wider uppercase">
        Other material
      </h2>
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

    {!loading && !error && items.length === 0 && mine.length === 0 && (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {onCreate
          ? "No lessons yet. Write one with your model to begin."
          : "No study material is available here yet."}
      </p>
    )}

    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <Row key={item.key} item={item} onSelect={onSelect} />
      ))}
    </ul>
  </div>
)
