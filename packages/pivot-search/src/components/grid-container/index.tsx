import type { CSSProperties, ReactNode } from "react"

import styles from "./grid-container.module.css"

export interface Props {
  children: ReactNode
  columns: number
}

export function GridContainer({ children, columns }: Props) {
  return (
    <ul
      className={styles.GridContainer}
      style={
        {
          "--col-count": columns,
        } as CSSProperties
      }
    >
      {children}
    </ul>
  )
}
