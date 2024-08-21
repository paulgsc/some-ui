import { forwardRef } from "react"
import type { DraggableSyntheticListeners } from "@dnd-kit/core"
import type { Transform } from "@dnd-kit/utilities"
import { Handle } from "@pivot-search/components/handle"
import classNames from "classnames"

import styles from "./draggable.module.css"

export enum Axis {
  All,
  Vertical,
  Horizontal,
}

type Props = {
  axis?: Axis
  dragOverlay?: boolean
  dragging?: boolean
  handle?: boolean
  label?: string
  listeners?: DraggableSyntheticListeners
  style?: React.CSSProperties
  buttonStyle?: React.CSSProperties
  transform?: Transform | null
}

export const Draggable = forwardRef<HTMLButtonElement, Props>(
  function Draggable(
    {
      dragOverlay,
      dragging,
      handle,
      label,
      listeners,
      transform,
      style,
      buttonStyle,
      ...props
    },
    ref
  ) {
    return (
      <div
        className={classNames(
          styles.Draggable,
          dragOverlay && styles.dragOverlay,
          dragging && styles.dragging,
          handle && styles.handle
        )}
        style={
          {
            ...style,
            "--translate-x": `${transform?.x ?? 0}px`,
            "--translate-y": `${transform?.y ?? 0}px`,
          } as React.CSSProperties
        }
      >
        <button
          {...props}
          aria-label="Draggable"
          data-cypress="draggable-item"
          {...(handle ? {} : listeners)}
          tabIndex={handle ? -1 : undefined}
          ref={ref}
          style={buttonStyle}
        >
          <p className="text-center text-lg text-white">drag me</p>
          {handle ? <Handle {...listeners} /> : null}
        </button>
        {label ? <label>{label}</label> : null}
      </div>
    )
  }
)
