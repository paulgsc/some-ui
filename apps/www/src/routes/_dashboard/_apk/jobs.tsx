import type { JSX } from "react"
import { createFileRoute, Outlet } from "@tanstack/react-router"

import { useJobsKeptOnHome } from "@/components/device-home-glyph"
import { KeptOnHome } from "@/components/jobs/parts"
import type { View } from "@/components/view-strip"
import { ViewStrip } from "@/components/view-strip"

/** The Jobs wing's one screen: today's picks, my own finds, and the record. */
const VIEWS = [
  { to: "/jobs", label: "Today", exact: true },
  { to: "/jobs/scout", label: "Scout", exact: false },
  { to: "/jobs/record", label: "Record", exact: false },
] as const satisfies ReadonlyArray<View>

/** The Jobs screens, told whether Jobs is kept on home: the phone's alone. */
const KeptOutlet = (): JSX.Element => (
  <KeptOnHome value={useJobsKeptOnHome()}>
    <Outlet />
  </KeptOnHome>
)

const JobsLayout = (): JSX.Element => (
  <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-6">
    <ViewStrip label="Jobs" views={VIEWS} />
    {import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
      <KeptOutlet />
    ) : (
      <Outlet />
    )}
  </div>
)

export const Route = createFileRoute("/_dashboard/_apk/jobs")({
  component: JobsLayout,
})
