import type { JSX } from "react"
import { createFileRoute, Outlet } from "@tanstack/react-router"

import { JobsHomeWatch } from "@/components/jobs/keep-on-home"
import type { View } from "@/components/view-strip"
import { ViewStrip } from "@/components/view-strip"

/** The Jobs wing's one screen: today's picks, my own finds, and the record. */
const VIEWS = [
  { to: "/jobs", label: "Today", exact: true },
  { to: "/jobs/scout", label: "Scout", exact: false },
  { to: "/jobs/record", label: "Record", exact: false },
] as const satisfies ReadonlyArray<View>

const JobsLayout = (): JSX.Element => (
  <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-6">
    <ViewStrip label="Jobs" views={VIEWS} />
    {import.meta.env.VITE_DEVICE_BACKEND === "true" ? <JobsHomeWatch /> : null}
    <Outlet />
  </div>
)

export const Route = createFileRoute("/_dashboard/_apk/jobs")({
  component: JobsLayout,
})
