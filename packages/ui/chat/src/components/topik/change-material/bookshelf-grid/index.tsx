import type { JSX } from "react"
import { TopikBookCard } from "@chat/components/topik/change-material/topik-book-card"
import type { TopikMetadata } from "@chat/lib/topik"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "some-ui-shared"

const ITEMS_PER_PAGE = 8
type BookshelfGridProps = {
  items: Array<TopikMetadata>
  selectedKey?: string
  onSelect: (key: string) => void
  page: number
  onPageChange: (page: number) => void
}

export const BookshelfGrid = ({
  items,
  selectedKey,
  onSelect,
  page,
  onPageChange,
}: BookshelfGridProps): JSX.Element => {
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * ITEMS_PER_PAGE
  const paginatedItems = items.slice(start, start + ITEMS_PER_PAGE)

  // Split into rows of 4 for shelf lines
  const rows: Array<Array<TopikMetadata>> = []
  for (let i = 0; i < paginatedItems.length; i += 4) {
    rows.push(paginatedItems.slice(i, i + 4))
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        No materials match your search.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Bookshelf area */}
      <div className="rounded-lg bg-shelf/10 p-4">
        <div className="flex flex-col gap-6">
          {rows.map((row, rowIdx) => (
            <div key={rowIdx}>
              <div className="grid grid-cols-4 gap-x-4 gap-y-3">
                {row.map((item) => (
                  <TopikBookCard
                    key={item.key}
                    item={item}
                    selected={selectedKey === item.key}
                    onClick={() => onSelect(item.key)}
                  />
                ))}
              </div>
              {/* Shelf line */}
              <div className="mt-3 h-px bg-shelf-line/60" />
            </div>
          ))}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1}
            className="h-8 px-2"
          >
            <ChevronLeft className="size-4" />
            <span className="sr-only">Previous page</span>
          </Button>
          <span className="text-sm text-muted-foreground font-medium tabular-nums">
            {safePage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= totalPages}
            className="h-8 px-2"
          >
            <ChevronRight className="size-4" />
            <span className="sr-only">Next page</span>
          </Button>
        </div>
      )}
    </div>
  )
}
