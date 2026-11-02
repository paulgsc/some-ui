import type { JSX } from "react"
import { useState } from "react"
import { RustRounds } from "@some-ui/rust-rounds"
import { createFileRoute, notFound } from "@tanstack/react-router"

import { VIEWER_BUILD } from "@/lib/data-mode"
import { viewerRustRoundsPorts } from "@/lib/demo/rust-rounds-sample"

/**
 * Rust Rounds for a viewer (#2241; CLAUDE.md, "A viewer tries, and nothing
 * is kept"): the phone's session on sample rounds, with rustc's results
 * recorded ahead of time, no microphone and nothing kept
 * (`lib/demo/rust-rounds-sample`). The strip under the header says it is
 * sample data (`components/provenance-strip`, the Practice wing's).
 */
const ViewerRustRounds = (): JSX.Element => {
  // Made once per mount: the session reads them once.
  const [ports] = useState(viewerRustRoundsPorts)
  return <RustRounds ports={ports} />
}

/**
 * Only the Pages build is a viewer's. The flag is read inline as well, so
 * the owner's builds drop the sample (`build.paths.ts`, `lib/demo`).
 */
const SampleRoute = (): JSX.Element | null =>
  import.meta.env.VITE_STATIC_DATA === "true" ? <ViewerRustRounds /> : null

export const Route = createFileRoute("/_dashboard/rust-rounds-sample")({
  beforeLoad: () => {
    if (!VIEWER_BUILD) throw notFound()
  },
  component: SampleRoute,
})
