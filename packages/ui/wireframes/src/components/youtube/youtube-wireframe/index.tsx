import type { FC } from "react"
import { ResizableLayout } from "@wireframes/components/youtube/resizable-wireframe"
import type { WireframeContent } from "@wireframes/components/youtube/types"
import { WireframeRegion } from "@wireframes/components/youtube/types"
import type { Chapter } from "some-ui-slideshow"
import { GanttDrawer } from "some-ui-slideshow"
import { cn } from "some-ui-utils"

type YoutubeWireframeProps = {
  content?: WireframeContent
  chapters: Array<Chapter>
  totalDuration: number
  className?: string
}

export const YoutubeWireframe: FC<YoutubeWireframeProps> = ({
  content = {},
  chapters,
  totalDuration,
  className,
}) => {
  const sidebarTop = content[WireframeRegion.SIDEBAR_TOP]
  const sidebarBottom = content[WireframeRegion.SIDEBAR_BOTTOM]

  return (
    <>
      <div className="absolute inset-0 -z-10 animate-pulse rounded-lg border-8 border-[oklch(75%_0.22_340)] bg-none" />
      <main
        className={cn(
          "absolute inset-0 grid size-full grid-flow-col grid-rows-6 gap-0.5 rounded-md",
          "border bg-none p-2.5 shadow-md",
          "box-border",
          className
        )}
      >
        <div className="bg-muted relative row-span-5 flex items-center justify-center rounded-md">
          {content[WireframeRegion.VIDEO]}
        </div>
        <div className="relative col-span-3 col-start-2 row-span-5 rounded-md bg-none">
          <ResizableLayout.Root direction="vertical">
            <ResizableLayout.PanelA
              defaultSize={12}
              className="flex items-center justify-center p-1.5"
            >
              {content[WireframeRegion.MARQUEE]}
            </ResizableLayout.PanelA>
            <ResizableLayout.PanelB
              defaultSize={88}
              minSize={88}
              className="z-10 bg-none"
            >
              {content[WireframeRegion.MAIN_CONTENT]}
            </ResizableLayout.PanelB>
          </ResizableLayout.Root>
        </div>
        <div className="bg-accent relative z-0 col-start-5 row-span-6 row-start-1 rounded-md">
          <ResizableLayout.Root direction="vertical">
            <ResizableLayout.PanelA
              defaultSize={sidebarTop?.size ?? 50}
              className=""
            >
              {sidebarTop && sidebarTop.node}
            </ResizableLayout.PanelA>
            <ResizableLayout.PanelB
              defaultSize={sidebarBottom?.size ?? 0}
              minSize={10}
              className=""
            >
              {sidebarBottom && sidebarBottom.node}
            </ResizableLayout.PanelB>
          </ResizableLayout.Root>
        </div>
        <div className="bg-accent relative col-span-4 row-start-6 rounded-md">
          <ResizableLayout.Root direction="horizontal">
            <ResizableLayout.PanelA defaultSize={10} className="">
              {content[WireframeRegion.FOOTER_LEFT]}
            </ResizableLayout.PanelA>
            <ResizableLayout.PanelB defaultSize={90} minSize={90} className="">
              {content[WireframeRegion.FOOTER_RIGHT]}
            </ResizableLayout.PanelB>
          </ResizableLayout.Root>
        </div>
      </main>
      <GanttDrawer chapters={chapters} totalDuration={totalDuration} />
    </>
  )
}
