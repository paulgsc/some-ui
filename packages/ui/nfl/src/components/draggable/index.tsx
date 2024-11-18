import type { Dispatch, HTMLAttributes, ReactNode, SetStateAction } from "react"
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { cn } from "some-ui-utils"

export type DraggableContainerProps = {
  children?: ReactNode
} & HTMLAttributes<HTMLDivElement>

export type DraggableItemProps = {
  id: string
  initialPosition?: { x: number; y: number }
  children?: ReactNode
} & HTMLAttributes<HTMLDivElement>

type DraggableContextProps = {
  positions: Record<string, { x: number; y: number }>
  setPositions: Dispatch<
    SetStateAction<Record<string, { x: number; y: number }>>
  >
  handleDragStart: (e: React.DragEvent<HTMLDivElement>, id: string) => void
  handleDragEnd: (e: React.DragEvent<HTMLDivElement>) => void
  isDragging: boolean
}

const DraggableContext = createContext<DraggableContextProps | null>(null)

const useDraggable = () => {
  const context = useContext(DraggableContext)

  if (!context) {
    throw new Error("very sad!")
  }

  return context
}

const DraggableContainer = forwardRef<HTMLDivElement, DraggableContainerProps>(
  ({ className, children, ...props }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const [positions, setPositions] = useState<
      Record<string, { x: number; y: number }>
    >({})
    const [isDragging, setIsDragging] = useState(false)

    const handleDragStart = useCallback(
      (e: React.DragEvent<HTMLDivElement>, id: string) => {
        setIsDragging(true)
        e.dataTransfer.setData("text/plain", id)
      },
      []
    )

    const handleDragEnd = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(true)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)

      const playerId = e.dataTransfer.getData("text/plain")

      if (!containerRef.current || !playerId) return

      const fieldRect = containerRef.current.getBoundingClientRect()
      const x = ((e.clientX - fieldRect.left) / fieldRect.width) * 100
      const y = ((e.clientY - fieldRect.top) / fieldRect.height) * 100

      setPositions((prev) => ({
        ...prev,
        [playerId]: { x, y },
      }))
    }, [])

    const handleDragLeave = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        setIsDragging(false)
      },
      []
    )

    return (
      <DraggableContext.Provider
        value={{
          positions,
          setPositions,
          handleDragStart,
          handleDragEnd,
          isDragging,
        }}
      >
        <div
          ref={containerRef}
          className={cn(
            "relative min-h-[200px] w-full rounded-lg border-2",
            isDragging && "border-dashed",
            className
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          {...props}
        >
          {children}
        </div>
      </DraggableContext.Provider>
    )
  }
)
DraggableContainer.displayName = "DraggableContainer"

const DraggableItem = forwardRef<HTMLDivElement, DraggableItemProps>(
  ({ className, id, initialPosition, children, ...props }, ref) => {
    const {
      positions,
      handleDragStart,
      handleDragEnd,
      isDragging,
      setPositions,
    } = useDraggable()

    useEffect(() => {
      if (initialPosition) {
        setPositions((prev) => ({
          ...prev,
          [id]: initialPosition,
        }))
      }
    }, [id, initialPosition, setPositions])

    const defaultPosition = { x: 50, y: 50 }
    const position = positions[id] ?? defaultPosition

    return (
      <div
        ref={ref}
        draggable
        className={cn(
          "absolute cursor-move",
          isDragging && "opacity-50",
          className
        )}
        style={{
          left: `${position.x}%`,
          top: `${position.y}%`,
          transform: "translate(-50%, -50%)",
        }}
        onDragStart={(e) => {
          handleDragStart(e, id)
        }}
        onDragEnd={handleDragEnd}
        {...props}
      >
        {children}
      </div>
    )
  }
)
DraggableItem.displayName = "DraggableItem"

export { DraggableContainer, DraggableItem }
