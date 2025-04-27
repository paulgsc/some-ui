import type { RefObject } from "react"
import { useEffect, useRef, useState } from "react"
import { NflPlayerCard } from "@nfl/components/player-card"
import { Button, Dialog, DialogContent, DialogTrigger } from "some-ui-shared"
import { useMeasureRect } from "some-ui-utils"

type Dimension = {
  cW?: number
  cH?: number
  bW?: number
  bH?: number
}

export const PlayerCardDialog = () => {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const buttonRect = useMeasureRect({
    ref: buttonRef as RefObject<HTMLElement>,
  })
  const contentRef = useRef<HTMLDivElement>(null)
  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dimensions, setDimensions] = useState<Dimension>({
    cW: 0,
    cH: 0,
    bW: 0,
    bH: 0,
  })

  useEffect(() => {
    if (isOpen) {
      // Short timeout to ensure the dialog is fully rendered
      contentTimerRef.current = setTimeout(() => {
        const domRect = contentRef.current?.getBoundingClientRect()
        if (domRect) {
          setDimensions((prev) => ({
            ...prev,
            cW: domRect.width,
            cH: domRect.height,
          }))
        }
      }, 50)

      return () => {
        if (contentTimerRef.current) clearTimeout(contentTimerRef.current)
      }
    }
  }, [isOpen])

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger className="size-full" asChild>
        <Button ref={buttonRef} variant="link" className="cursor-pointer p-1.5">
          <NflPlayerCard
            height={buttonRect.height}
            width={buttonRect.width}
            open={isOpen}
            className=""
          />
        </Button>
      </DialogTrigger>
      <DialogContent
        ref={contentRef}
        className="size-full max-h-[85vh] w-full max-w-xl bg-none p-0"
      >
        <NflPlayerCard
          height={dimensions.cH}
          width={dimensions.cW}
          className="size-full"
        />
      </DialogContent>
    </Dialog>
  )
}
