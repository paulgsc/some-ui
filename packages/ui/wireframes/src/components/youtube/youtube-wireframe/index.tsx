import type { FC } from "react"
import type { WireframeContent } from "@wireframes/components/youtube/types"
import { WireframeRegion } from "@wireframes/components/youtube/types"

type YoutubeWireframeProps = {
  content?: WireframeContent
}

const YoutubeWireframe: FC<YoutubeWireframeProps> = ({ content = {} }) => {
  return (
    <main className="bg-card absolute inset-0 grid size-full grid-flow-col grid-rows-6 gap-4 rounded-md border border-dashed p-0.5 shadow-md">
      <div className="bg-muted relative row-span-5 flex items-center justify-center rounded-md border border-dashed">
        {content[WireframeRegion.VIDEO]}
      </div>
      <div className="bg-muted relative col-span-3 col-start-2 rounded-md border border-dashed">
        {content[WireframeRegion.MARQUEE]}
      </div>
      <div className="relative col-span-3 col-start-2 row-span-4 row-start-2 rounded-md border border-dashed bg-green-500">
        {content[WireframeRegion.MAIN_CONTENT]}
      </div>
      <div className="bg-accent relative col-start-5 row-span-3 row-start-1 rounded-md border border-dashed">
        {content[WireframeRegion.SIDEBAR_TOP]}
      </div>
      <div className="bg-accent relative col-start-5 row-span-3 row-start-4 rounded-md border border-dashed">
        {content[WireframeRegion.SIDEBAR_BOTTOM]}
      </div>
      <div className="bg-accent relative row-start-6 rounded-md border border-dashed">
        {content[WireframeRegion.FOOTER_LEFT]}
      </div>
      <div className="bg-accent relative col-span-3 row-start-6 rounded-md border border-dashed">
        {content[WireframeRegion.FOOTER_RIGHT]}
      </div>
    </main>
  )
}

export default YoutubeWireframe
