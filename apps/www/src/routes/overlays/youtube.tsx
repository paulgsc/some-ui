import { componentRegistry } from "@some-ui/content-registry"
import { createFileRoute } from "@tanstack/react-router"
import { useSceneLifetimes } from "some-ui-utils"
import { dramaTree, OrchestratedYouTubeViewport } from "wireframes"

// Search params validation
type YouTubeWireframeSearch = {
  transitionMs?: number
  enableFocus?: boolean
  layoutMode?: "study" | "drama" | "voice" | "topik" | "children-only"
}

function isLayoutMode(
  value: unknown
): value is NonNullable<YouTubeWireframeSearch["layoutMode"]> {
  return (
    value === "study" ||
    value === "drama" ||
    value === "voice" ||
    value === "topik" ||
    value === "children-only"
  )
}

const YouTubeWireframeRoute = (): React.JSX.Element => {
  const { transitionMs, enableFocus, layoutMode } = Route.useSearch()

  const activeLifetimes = useSceneLifetimes()

  // Select layout tree based on mode. This route is a standalone engine
  // demo, disconnected from the real player's scene/session data - see
  // epic #693 story 4 (#696) for why there's no scene- or session-driven
  // layout to fall back to here anymore.
  const layoutTree = layoutMode === "drama" ? dramaTree : null

  return (
    <div className="absolute inset-0">
      <OrchestratedYouTubeViewport
        layoutTree={layoutTree}
        activeLifetimes={activeLifetimes}
        componentRegistry={componentRegistry}
        transitionMs={transitionMs ?? 300}
        enableFocus={enableFocus ?? true}
      />
    </div>
  )
}

export const Route = createFileRoute("/overlays/youtube")({
  validateSearch: (search: Record<string, unknown>): YouTubeWireframeSearch => {
    return {
      transitionMs: search.transitionMs
        ? Number(search.transitionMs)
        : undefined,
      enableFocus: search.enableFocus !== "false",
      layoutMode: isLayoutMode(search.layoutMode)
        ? search.layoutMode
        : undefined,
    }
  },
  component: YouTubeWireframeRoute,
})
