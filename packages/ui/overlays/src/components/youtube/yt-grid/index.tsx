import { Fragment } from "react"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "some-ui-shared"

export const YtGrid = (): React.JSX.Element => {
  return (
    <ResizablePanelGroup
      direction="vertical"
      className="min-h-[600px] w-full rounded-lg border"
    >
      {Array.from({ length: 3 }, (_, i) => (
        <Fragment key={i}>
          <ResizablePanel defaultSize={100 / 3}>
            <div className="flex h-full items-center justify-center p-6">
              <div className="grid size-full grid-flow-col gap-1.5">
                {Array.from({ length: 4 }, (_, k) => (
                  <div
                    key={k}
                    className="rounded-xl border-2 border-dashed border-muted-foreground bg-muted"
                  />
                ))}
              </div>
            </div>
          </ResizablePanel>
          {i < 2 && <ResizableHandle />}
        </Fragment>
      ))}
    </ResizablePanelGroup>
  )
}
