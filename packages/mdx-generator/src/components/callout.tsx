import type { FC, ReactNode } from "react"

import { Alert, AlertDescription, AlertTitle } from "./ui/alert"

type CalloutProps = {
  icon?: string
  title?: string
  children?: ReactNode
}

const Callout: FC<CalloutProps> = ({ title, children, icon, ...props }) => {
  return (
    <Alert {...props}>
      {icon && <span className="mr-4 text-2xl">{icon}</span>}
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}

export default Callout
