import type { CSSProperties, ReactNode } from "react"

import styles from "./grid-container.module.css"

export type Props = {
  children: ReactNode
  columns: number
}

export const GridContainer = ({ children, columns }: Props) => {
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
