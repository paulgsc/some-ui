import type { JSX } from "react"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  useToast,
} from "some-ui-shared"

/**
 * Mounts the toast primitives from some-ui-shared, which ship un-composed
 * (no consumer in the repo actually renders ToastProvider/ToastViewport
 * anywhere yet, so `toast()` calls silently do nothing without this).
 */
export const Toaster = (): JSX.Element => {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, ...props }) => (
        <Toast key={id} {...props}>
          <div className="grid gap-1">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          {action}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  )
}
