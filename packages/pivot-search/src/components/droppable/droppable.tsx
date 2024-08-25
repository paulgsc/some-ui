import type { UniqueIdentifier} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core"
import classNames from "classnames"

import { droppable } from "./droppable-svg"
import styles from "./Droppable.module.css"

type Props = {
  children: React.ReactNode
  dragging: boolean
  id: UniqueIdentifier
}

export const Droppable = ({ children, id, dragging }: Props) => {
  const { isOver, setNodeRef } = useDroppable({
    id,
  })

  return (
    <div
      ref={setNodeRef}
      className={classNames(
        styles.Droppable,
        isOver && styles.over,
        dragging && styles.dragging,
        children && styles.dropped
      )}
      aria-label="Droppable region"
    >
      {children}
      {droppable}
    </div>
  )
}
