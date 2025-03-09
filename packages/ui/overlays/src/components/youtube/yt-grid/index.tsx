import { useCallback, useEffect, useRef, useState } from "react"
import { YTGridThumbnail } from "@overlays/components/youtube/yt-grid-thumbnail"
import { useRandomPanelExpansion } from "@overlays/hooks"
import type { ImperativePanelHandle } from "some-ui-shared"
import { ResizablePanel, ResizablePanelGroup } from "some-ui-shared"
import { LensShutter } from "some-ui-slideshow"
import { cn } from "some-ui-utils"

export const YtGrid = (): React.JSX.Element => {
  const rows = 3
  const cols = 4
  const [showLens, setShowLens] = useState<boolean>(false)
  const callback = useCallback(() => {
    setShowLens(false)
  }, [])
  const onSuccess = useCallback(() => {
    setShowLens(true)
  }, [setShowLens])
  const { pauseAnimation, resumeAnimation, expandedPanel, updatePanelSize } =
    useRandomPanelExpansion({ rows, cols, replay: true, onSuccess, callback })
  const rowsRef = useRef<Array<ImperativePanelHandle>>(Array(rows).fill(null))
  const colsRef = useRef<Array<ImperativePanelHandle>>(Array(cols).fill(null))

  const updateAllPanels = useCallback(() => {
    updatePanelSize({ refs: rowsRef.current, dimension: "row" })
    updatePanelSize({ refs: colsRef.current, dimension: "col" })
  }, [updatePanelSize])

  useEffect(() => {
    updateAllPanels()
  }, [updateAllPanels])

  return (
    <div className="absolute inset-0">
      <ResizablePanelGroup
        direction="vertical"
        autoSaveId="conditional"
        className="size-full rounded-lg border"
        onMouseEnter={pauseAnimation}
        onMouseLeave={resumeAnimation}
      >
        {Array.from({ length: rows }, (_, i) => (
          <ResizablePanel
            id={`yt_grid_row_${i}`}
            ref={(el) => {
              if (el) {
                rowsRef.current[i] = el
                updateAllPanels()
              }
            }}
            key={i}
            order={i}
            defaultSize={100 / rows}
          >
            <ResizablePanelGroup
              direction="horizontal"
              autoSaveId="conditional"
              className="h-full"
            >
              {Array.from({ length: cols }, (_, k) => {
                return (
                  <ResizablePanel
                    id={`yt_grid_${i}_${k}`}
                    key={k}
                    order={k}
                    ref={(el) => {
                      if (el) {
                        colsRef.current[k] = el
                        updateAllPanels()
                      }
                    }}
                    defaultSize={100 / cols}
                    className="transition-all duration-100 ease-linear"
                  >
                    <div
                      className={cn(
                        "bg-muted flex size-full items-center justify-center rounded-xl"
                      )}
                    >
                      <div
                        className={cn(
                          "relative flex  items-center justify-center rounded-full bg-blue-500",
                          "aspect-square h-[min(100%,100vw)] w-[min(100%,100vh)]"
                        )}
                      >
                        {showLens &&
                        expandedPanel?.row === i &&
                        expandedPanel.col === k ? (
                          <LensShutter />
                        ) : (
                          <YTGridThumbnail />
                        )}
                      </div>
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
