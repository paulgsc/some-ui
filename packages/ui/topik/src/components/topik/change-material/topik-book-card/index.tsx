import type { JSX } from "react"
import { Badge } from "@some-ui/shared"
import type { TopikMetadata } from "@topik/lib/topik"
import { Layers, Target } from "lucide-react"
import { cn } from "some-ui-utils"

// ═══════════════════════════════════════════════════════════════
// Spine accent colors — muted, library-like palette
// ═══════════════════════════════════════════════════════════════
const SPINE_COLORS = [
  "bg-[hsl(30,30%,40%)]",
  "bg-[hsl(200,18%,42%)]",
  "bg-[hsl(150,16%,38%)]",
  "bg-[hsl(350,20%,42%)]",
  "bg-[hsl(40,28%,44%)]",
  "bg-[hsl(270,14%,40%)]",
]

function getSpineColor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash)
  }
  return SPINE_COLORS[Math.abs(hash) % SPINE_COLORS.length]!
}

const DIFFICULTY_STYLES: Record<string, string> = {
  Beginner:
    "bg-[hsl(150,20%,88%)] text-[hsl(150,25%,30%)] dark:bg-[hsl(150,15%,18%)] dark:text-[hsl(150,20%,70%)]",
  Intermediate:
    "bg-[hsl(40,25%,88%)] text-[hsl(40,30%,30%)] dark:bg-[hsl(40,15%,18%)] dark:text-[hsl(40,20%,70%)]",
  Advanced:
    "bg-[hsl(350,20%,88%)] text-[hsl(350,25%,35%)] dark:bg-[hsl(350,15%,18%)] dark:text-[hsl(350,20%,70%)]",
}

// ═══════════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════════

type TopikBookCardProps = {
  item: TopikMetadata
  selected?: boolean
  onClick?: () => void
  variant?: "normal" | "recommended"
}

export const TopikBookCard = ({
  item,
  selected = false,
  onClick,
  variant = "normal",
}: TopikBookCardProps): JSX.Element => {
  const spineColor = getSpineColor(item.key)
  const isRecommended = variant === "recommended"

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex flex-col text-left rounded-lg border transition-all duration-200",
        "shadow-sm hover:shadow-md",
        "hover:scale-[1.03]",
        isRecommended ? "h-[140px] min-w-[160px]" : "h-[200px]",
        selected
          ? "border-primary ring-2 ring-primary/30 bg-primary/5"
          : "border-border bg-card hover:bg-accent/40"
      )}
    >
      {/* Spine accent */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 rounded-l-lg",
          isRecommended ? "w-1.5" : "w-2",
          spineColor
        )}
      />

      {/* Content */}
      <div
        className={cn(
          "flex flex-col justify-between h-full",
          isRecommended ? "pl-4 pr-3 py-2.5" : "pl-5 pr-3 py-3"
        )}
      >
        <div className="flex-1 min-h-0">
          <h3
            className={cn(
              "font-semibold text-card-foreground leading-snug",
              isRecommended ? "text-xs line-clamp-2" : "text-sm line-clamp-2"
            )}
          >
            {item.displayName}
          </h3>
          {!isRecommended && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {item.description}
            </p>
          )}
        </div>

        {/* Metadata footer */}
        <div className="mt-auto pt-2 flex flex-col gap-1.5">
          {item.difficulty && (
            <Badge
              variant="secondary"
              className={cn(
                "w-fit text-[10px] px-1.5 py-0 font-medium border-0",
                DIFFICULTY_STYLES[item.difficulty] ?? ""
              )}
            >
              {item.difficulty}
            </Badge>
          )}

          <div
            className={cn(
              "flex items-center gap-3 text-muted-foreground",
              isRecommended ? "text-[10px]" : "text-xs"
            )}
          >
            <span className="flex items-center gap-1">
              <Layers className="size-3" />
              {item.batchCount}
            </span>
            <span className="flex items-center gap-1">
              <Target className="size-3" />
              {item.totalQuestions}
            </span>
            <span className="ml-auto">{"est_time"}</span>
          </div>
        </div>
      </div>

      {/* Bottom resting shadow */}
      <div className="absolute -bottom-px left-1 right-1 h-px bg-border/60 rounded-full" />

      {/* Recommended badge overlay */}
      {isRecommended && (
        <div className="absolute -top-1.5 -right-1.5">
          <span className="flex size-3 rounded-full bg-primary shadow-sm" />
        </div>
      )}
    </button>
  )
}
