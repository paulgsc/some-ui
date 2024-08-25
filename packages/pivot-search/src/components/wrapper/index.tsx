import classNames from "classnames"

import styles from "./wrapper.module.css"

type Props = {
  children: React.ReactNode
  center?: boolean
  style?: React.CSSProperties
}

export const Wrapper = ({ children, center, style }: Props) => {
  return (
    <div
      className={classNames(styles.Wrapper, center && styles.center)}
      style={style}
    >
      {children}
    </div>
  )
}
