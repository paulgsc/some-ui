import { useEffect, useRef } from "react"
import { useRandomPanelExpansion } from "@overlays/hooks"
import type { ImperativePanelHandle } from "some-ui-shared"
import { ResizablePanel, ResizablePanelGroup } from "some-ui-shared"
import { cn } from "some-ui-utils"

export const YtGrid = (): React.JSX.Element => {
  const rows = 3
  const cols = 4
  const { expandedPanel, updatePanelSize } = useRandomPanelExpansion(rows, cols)
  const rowsRef = useRef<Array<ImperativePanelHandle>>(Array(rows).fill(null))
  const colsRef = useRef<Array<ImperativePanelHandle>>(Array(cols).fill(null))

  return (
    <div className="h-[600px] w-full">
      <ResizablePanelGroup
        direction="vertical"
        autoSaveId="conditional"
        onLayout={() =>
          updatePanelSize({ refs: rowsRef.current, dimension: "row" })
        }
        className="size-full rounded-lg border"
      >
        {Array.from({ length: rows }, (_, i) => (
          <ResizablePanel
            id={`yt_grid_row_${i}`}
            ref={(el) => {
              if (el) rowsRef.current[i] = el
            }}
            key={i}
            order={i}
            defaultSize={100 / rows}
          >
            <ResizablePanelGroup
              direction="horizontal"
              autoSaveId="conditional"
              onLayout={() =>
                updatePanelSize({ refs: colsRef.current, dimension: "col" })
              }
              className="h-full"
            >
              {Array.from({ length: cols }, (_, k) => {
                return (
                  <ResizablePanel
                    id={`yt_grid_${i}_${k}`}
                    key={k}
                    order={k}
                    ref={(el) => {
                      if (el) colsRef.current[k] = el
                    }}
                    defaultSize={100 / cols}
                    className="transition-all duration-100 ease-linear"
                  >
                    <div
                      className={cn(
                        "flex size-full items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground bg-muted",
                        {
                          "border-blue-500 bg-blue-100":
                            expandedPanel?.row === i && expandedPanel.col === k,
                        }
                      )}
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
