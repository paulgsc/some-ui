import type { JSX } from "react"
import type { FileRoutesByTo } from "@/routeTree.gen"
import { cn } from "@some-ui/core-utils"
import { Link } from "@tanstack/react-router"

export type View = {
  to: keyof FileRoutesByTo
  label: string
  /** Active only on `to` itself, not on the routes under it. */
  exact: boolean
}

const COLUMNS: Readonly<Record<number, string>> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
}

/**
 * One screen's views as a strip of tabs, so moving between them is never a
 * trip back to the wing's Home.
 */
export const ViewStrip = ({
  label,
  views,
}: {
  label: string
  views: ReadonlyArray<View>
}): JSX.Element => (
  <nav
    aria-label={label}
    className={cn("bg-muted grid gap-1 rounded-lg p-1", COLUMNS[views.length])}
  >
    {views.map((v) => (
      <Link
        key={v.to}
        to={v.to}
        activeOptions={{ exact: v.exact, includeSearch: false }}
        className="text-muted-foreground flex h-9 items-center justify-center rounded-md text-sm"
        activeProps={{
          className: "bg-background text-foreground font-medium shadow-sm",
          "aria-current": "page",
        }}
      >
        {v.label}
      </Link>
    ))}
  </nav>
)
