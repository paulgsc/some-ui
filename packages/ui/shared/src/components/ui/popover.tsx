import type { ComponentProps } from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "../../lib/utils"

const Popover = ({
  ...props
}: ComponentProps<typeof PopoverPrimitive.Root>): React.JSX.Element => {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

const PopoverTrigger = ({
  ...props
}: ComponentProps<typeof PopoverPrimitive.Trigger>): React.JSX.Element => {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

const PopoverContent = ({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>): React.JSX.Element => {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-popover-content-transform-origin) outline-hidden z-50 w-72 rounded-md border p-4 shadow-md",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

const PopoverAnchor = ({
  ...props
}: ComponentProps<typeof PopoverPrimitive.Anchor>): React.JSX.Element => {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

/**
 * Heading/description slots for popover content, sized against
 * {@link PopoverContent}'s `w-72` rather than a dialog's width.
 *
 * Radix's Popover — unlike its Dialog — ships no Title or Description
 * primitive and wires no `aria-labelledby` / `aria-describedby` of its own,
 * and neither does upstream shadcn/ui. What these buy is the semantics:
 * a real `<h2>` and `<p>` so the content is a labelled region to a screen
 * reader. Pass `aria-labelledby` on `PopoverContent` with the title's `id` when
 * the popover needs to announce its own name.
 */
const PopoverHeader = ({
  className,
  ...props
}: ComponentProps<"div">): React.JSX.Element => {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  )
}

const PopoverTitle = ({
  className,
  ...props
}: ComponentProps<"h2">): React.JSX.Element => {
  return (
    <h2
      data-slot="popover-title"
      className={cn("text-sm font-semibold leading-none", className)}
      {...props}
    />
  )
}

const PopoverDescription = ({
  className,
  ...props
}: ComponentProps<"p">): React.JSX.Element => {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
}
