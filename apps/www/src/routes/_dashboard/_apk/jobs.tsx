import type { JSX } from "react"
import { createFileRoute, Link, Outlet } from "@tanstack/react-router"

/**
 * The Jobs wing's one screen, in three views: today's picks, my own finds,
 * and the record. The views share this strip, so moving between them is
 * never a trip back to the foyer.
 */
const VIEWS = [
  { to: "/jobs", label: "Today", exact: true },
  { to: "/jobs/scout", label: "Scout", exact: false },
  { to: "/jobs/record", label: "Record", exact: false },
] as const

const JobsLayout = (): JSX.Element => (
  <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-6">
    <nav
      aria-label="Jobs"
      className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1"
    >
      {VIEWS.map((v) => (
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
    <Outlet />
  </div>
)

export const Route = createFileRoute("/_dashboard/_apk/jobs")({
  component: JobsLayout,
})
