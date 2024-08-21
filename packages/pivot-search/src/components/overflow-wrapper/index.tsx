import styles from "./overflow-wrapper.module.css"

type Props = {
  children: React.ReactNode
}

export const OverflowWrapper = ({ children }: Props) => {
  return <div className={styles.OverflowWrapper}>{children}</div>
}
