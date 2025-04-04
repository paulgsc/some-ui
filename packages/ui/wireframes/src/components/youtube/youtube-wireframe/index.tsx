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
  return (
    <>
      <main
        className={cn(
          "absolute inset-0 grid size-full grid-flow-col grid-rows-6 gap-4 rounded-md",
          "border border-dashed bg-none p-0.5 shadow-md",
          className
        )}
      >
        <div className="bg-muted relative row-span-5 flex items-center justify-center rounded-md border border-dashed">
          {content[WireframeRegion.VIDEO]}
        </div>
        <div className="relative col-span-3 col-start-2 row-span-5 rounded-md border border-dashed bg-none">
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
              className="bg-none"
            >
              {content[WireframeRegion.MAIN_CONTENT]}
            </ResizableLayout.PanelB>
          </ResizableLayout.Root>
        </div>
        <div className="bg-accent relative z-0 col-start-5 row-span-3 row-start-1 rounded-md border border-dashed">
          {content[WireframeRegion.SIDEBAR_TOP]}
        </div>
        <div className="bg-accent relative col-start-5 row-span-3 row-start-4 rounded-md border border-dashed">
          {content[WireframeRegion.SIDEBAR_BOTTOM]}
        </div>
        <div className="bg-accent relative col-span-4 row-start-6 rounded-md border border-dashed">
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
