import type { FC } from "react"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "some-ui-shared"

type InsetTopVerticalHeight = 10 | 15 | 20 | 25
type InsetCardProps = {
  topVh?: InsetTopVerticalHeight
}

export const InsetCard: FC<InsetCardProps> = ({
  topVh = 25,
}): React.JSX.Element => {
  return (
    <ResizablePanelGroup
      direction="vertical"
      className="flex min-h-screen flex-1 flex-col gap-4 p-4"
    >
      <ResizablePanel defaultSize={topVh}>
        <div className="grid auto-rows-min gap-4 md:grid-cols-3">
          <div className="aspect-video rounded-xl bg-muted/50" />
          <div className="aspect-video rounded-xl bg-muted/50" />
          <div className="aspect-video rounded-xl bg-muted/50" />
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={100 - topVh} minSize={100 - topVh}>
        <div className="size-full flex-1 rounded-xl bg-muted/50" />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
