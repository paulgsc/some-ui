import type { ComponentPropsWithoutRef, ComponentRef } from "react"
import { forwardRef } from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "../../lib/utils"

/**
 * Clipping lives on the image and the fallback, not on the root.
 *
 * The root used to carry `overflow-hidden`, which is the obvious place for it
 * right up until something has to escape the circle — {@link AvatarBadge} sits
 * at the bottom-right corner of the bounding box, outside the inscribed circle,
 * and an `overflow-hidden` ancestor cuts it in half. Moving the clip down to
 * the two children that actually need it keeps the round crop and frees the
 * root to position a badge.
 */
const Avatar = forwardRef<
  ComponentRef<typeof AvatarPrimitive.Root>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    data-slot="avatar"
    className={cn("relative flex size-10 shrink-0 rounded-full", className)}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = forwardRef<
  ComponentRef<typeof AvatarPrimitive.Image>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    data-slot="avatar-image"
    className={cn(
      "aspect-square size-full rounded-full object-cover",
      className
    )}
    {...props}
  />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = forwardRef<
  ComponentRef<typeof AvatarPrimitive.Fallback>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    data-slot="avatar-fallback"
    className={cn(
      "flex size-full items-center justify-center overflow-hidden rounded-full bg-muted",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

/**
 * A presence/status dot pinned to the bottom-right of an {@link Avatar}.
 *
 * Purely presentational: it carries no colour of its own, so the caller says
 * what the state is (`className="bg-emerald-500"`) and, if the state is not
 * already stated in adjacent text, labels it for assistive tech.
 */
const AvatarBadge = forwardRef<
  HTMLSpanElement,
  ComponentPropsWithoutRef<"span">
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    data-slot="avatar-badge"
    className={cn(
      "ring-background absolute bottom-0 right-0 z-10 inline-flex size-3 shrink-0 items-center justify-center rounded-full ring-2",
      className
    )}
    {...props}
  />
))
AvatarBadge.displayName = "AvatarBadge"

/**
 * The "+3" chip that closes out a row of overlapping avatars.
 *
 * Sizes itself from `--avatar-size` — the same variable {@link WithAvatar} and
 * `AvatarGroup` set — so the chip tracks the avatars it sits beside instead of
 * being pinned to one hardcoded diameter. Falls back to the `Avatar` default
 * (40px) when nothing set it.
 */
const AvatarGroupCount = forwardRef<
  HTMLSpanElement,
  ComponentPropsWithoutRef<"span">
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    data-slot="avatar-group-count"
    className={cn(
      "border-background bg-muted text-muted-foreground relative flex shrink-0 items-center justify-center rounded-full border-2 text-xs tabular-nums",
      "size-[calc(var(--avatar-size,40)*1px)]",
      className
    )}
    {...props}
  />
))
AvatarGroupCount.displayName = "AvatarGroupCount"

export { Avatar, AvatarImage, AvatarFallback, AvatarBadge, AvatarGroupCount }
