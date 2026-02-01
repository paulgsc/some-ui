import { dramaTree } from "@content/data/layout-tree"
import { componentRegistry } from "@some-ui/content"
import { useSceneDrivenLayout } from "@some-ui/content/hooks/use-scene-driven-layout"
import { createFileRoute } from "@tanstack/react-router"
import { useSceneLifetimes } from "some-ui-utils"
import { OrchestratedYouTubeViewport } from "wireframes"

// Search params validation
type YouTubeWireframeSearch = {
  transitionMs?: number
  enableFocus?: boolean
  layoutMode?: "study" | "drama" | "voice" | "topik" | "children-only"
}

const YouTubeWireframeRoute = (): React.JSX.Element => {
  const { transitionMs, enableFocus, layoutMode } = Route.useSearch()

  const activeLifetimes = useSceneLifetimes()
  const { currentLayout } = useSceneDrivenLayout()

  // Select layout tree based on mode
  const layoutTree = layoutMode === "drama" ? dramaTree : currentLayout

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

export const Route = createFileRoute("/wireframes/youtube")({
  validateSearch: (search: Record<string, unknown>): YouTubeWireframeSearch => {
    return {
      transitionMs: search.transitionMs
        ? Number(search.transitionMs)
        : undefined,
      enableFocus: search.enableFocus !== "false",
      layoutMode: [
        "study",
        "drama",
        "voice",
        "topik",
        "children-only",
      ].includes(search.layoutMode as string)
        ? (search.layoutMode as YouTubeWireframeSearch["layoutMode"])
        : undefined,
    }
  },
  component: YouTubeWireframeRoute,
})
