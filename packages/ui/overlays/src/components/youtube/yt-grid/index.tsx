import { useEffect, useRef } from "react"
import { useRandomPanelExpansion } from "@overlays/hooks"
import type { ImperativePanelHandle } from "some-ui-shared"
import { ResizablePanel, ResizablePanelGroup } from "some-ui-shared"

export const YtGrid = (): React.JSX.Element => {
  const rows = 3
  const cols = 4
  const { updatePanelSize } = useRandomPanelExpansion(rows, cols)
  const rowsRef = useRef<Array<ImperativePanelHandle>>(Array(rows).fill(null))
  const colsRef = useRef<Array<ImperativePanelHandle>>(Array(cols).fill(null))

  useEffect(() => {
    rowsRef.current.forEach((ref, index) => {
      updatePanelSize(index, true, ref)
    })

    colsRef.current.forEach((ref, index) => {
      updatePanelSize(index, false, ref)
    })
  }, [updatePanelSize])

  return (
    <div className="h-[600px] w-full">
      <ResizablePanelGroup
        direction="vertical"
        className="size-full rounded-lg border"
      >
        {Array.from({ length: rows }, (_, i) => (
          <ResizablePanel
            ref={(el) => {
              if (el) rowsRef.current[i] = el
            }}
            key={i}
            defaultSize={100 / rows}
          >
            <ResizablePanelGroup direction="horizontal" className="h-full">
              {Array.from({ length: cols }, (_, k) => {
                return (
                  <ResizablePanel
                    key={k}
                    ref={(el) => {
                      if (el) colsRef.current[k] = el
                    }}
                    defaultSize={100 / cols}
                    className="transition-all duration-100 ease-linear"
                  >
                    <div
                      className={`flex size-full items-center justify-center rounded-xl border-2 border-dashed`}
                    >
                      Panel {i}-{k}
                    </div>
                  </ResizablePanel>
                )
              })}
            </ResizablePanelGroup>
          </ResizablePanel>
        ))}
      </ResizablePanelGroup>
    </div>
  )
}
