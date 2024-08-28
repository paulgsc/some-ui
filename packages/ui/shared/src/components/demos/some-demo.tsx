import { useRef, type FC, type ReactNode } from "react"
import { useMeasureRect } from "@some-ui/utils"

type RectDisplayProps = {
  className?: string
  children?: ReactNode
}

const RectDisplay: FC<RectDisplayProps> = ({ className }) => {
  const ref = useRef<HTMLDivElement>(null)

  const { height, width } = useMeasureRect({ ref })

  return (
    <div ref={ref} className={className}>
      {`Width: ${Math.round(width ?? 0)}px, Height: ${Math.round(height ?? 0)}px`}
    </div>
  )
}

export default RectDisplay
