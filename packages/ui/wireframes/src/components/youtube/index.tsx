import type { FC, ReactNode } from "react"

export enum WireframeRegion {
  VIDEO = "VIDEO", // Region 1
  MARQUEE = "MARQUEE", // Region 2
  MAIN_CONTENT = "MAIN_CONTENT", // Region 3
  FOOTER_LEFT = "FOOTER_LEFT", // Region 4
  SIDEBAR_TOP = "SIDEBAR_TOP", // Region 5
  SIDEBAR_BOTTOM = "SIDEBAR_BOTTOM", // Region 6
  FOOTER_RIGHT = "FOOTER_RIGHT", // Region 7
}

export type WireframeContent = {
  [WireframeRegion.VIDEO]: ReactNode
  [WireframeRegion.MARQUEE]: ReactNode
  [WireframeRegion.MAIN_CONTENT]: ReactNode
  [WireframeRegion.FOOTER_LEFT]: ReactNode
  [WireframeRegion.SIDEBAR_TOP]: ReactNode
  [WireframeRegion.SIDEBAR_BOTTOM]: ReactNode
  [WireframeRegion.FOOTER_RIGHT]: ReactNode
}

type YoutubeWireframeProps = {
  content?: WireframeContent
}

const YoutubeWireframe: FC<YoutubeWireframeProps> = ({ content = {} }) => {
  return (
    <main className="bg-card absolute inset-0 grid size-full grid-flow-col grid-rows-6 gap-4 rounded-md border border-dashed p-0.5 shadow-md">
      <div className="bg-muted relative row-span-5 rounded-md border border-dashed">
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
