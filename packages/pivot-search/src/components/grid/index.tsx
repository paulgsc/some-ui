import styles from "./Grid.module.css"

export type Props = {
  size: number
  step?: number
  onSizeChange(size: number): void
}

export const Grid = ({ size }: Props) => {
  return (
    <div
      className={styles.Grid}
      style={
        {
          "--grid-size": `${size}px`,
        } as React.CSSProperties
      }
    />
  )
}
