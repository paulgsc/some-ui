import type { ComponentProps, FC } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "../../lib/utils"

const Dialog = ({
  ...props
}: ComponentProps<typeof DialogPrimitive.Root>): React.JSX.Element => {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

const DialogTrigger = ({
  ...props
}: ComponentProps<typeof DialogPrimitive.Trigger>): React.JSX.Element => {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

const DialogPortal = ({
  ...props
}: ComponentProps<typeof DialogPrimitive.Portal>): React.JSX.Element => {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

const DialogClose = ({
  ...props
}: ComponentProps<typeof DialogPrimitive.Close>): React.JSX.Element => {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

const DialogOverlay = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>): React.JSX.Element => {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        // z-40, strictly below DialogContent's z-50. The overlay is a
        // full-viewport, pointer-events-bearing scrim: if it ever paints at or
        // above the content's layer it swallows every click aimed at the dialog
        // while the keyboard path keeps working, which reads as "the buttons in
        // this modal are dead" rather than as a stacking bug. Keep this pair
        // ordered - see tests/dialog-overlay in apps/www.
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-40 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  showOverlay?: boolean
  /**
   * Portal target. Defaults to `document.body`; pass an element scoped to a
   * themed subtree (e.g. an activity that forces its own app-theme class on
   * its root) so the dialog inherits that theme instead of whatever is
   * ambient at the document root.
   */
  container?: HTMLElement | null
}

const DialogContent: FC<DialogContentProps> = ({
  className,
  children,
  showCloseButton = true,
  showOverlay = false,
  container,
  ...props
}) => {
  return (
    <DialogPortal data-slot="dialog-portal" container={container}>
      {showOverlay && <DialogOverlay />}
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95",
          "data-[state=open]:zoom-in-95 fixed left-[50%] top-[50%] z-50 grid w-full",
          "max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className={cn(
              "ring-offset-background focus:ring-ring data-[state=open]:bg-accent",
              "data-[state=open]:text-muted-foreground rounded-xs focus:outline-hidden",
              "absolute right-4 top-4 opacity-70 transition-opacity hover:opacity-100",
              "focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none",
              "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
              "z-50 cursor-pointer"
            )}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

const DialogHeader = ({
  className,
  ...props
}: ComponentProps<"div">): React.JSX.Element => {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

const DialogFooter = ({
  className,
  ...props
}: ComponentProps<"div">): React.JSX.Element => {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

const DialogTitle = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>): React.JSX.Element => {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold leading-none", className)}
      {...props}
    />
  )
}

const DialogDescription = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>): React.JSX.Element => {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
