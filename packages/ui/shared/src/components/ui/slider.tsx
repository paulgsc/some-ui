import type { ComponentPropsWithoutRef, ComponentRef } from "react"
import { forwardRef, useMemo } from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "../../lib/utils"

/**
 * Radix's `Slider.Root` takes an array for `value` / `defaultValue` — a range
 * slider is simply two or more values — but it does not render the thumbs; the
 * wrapper does. This one rendered exactly one, hardcoded, so passing a range
 * produced a track with a correct highlighted `Range` and only one draggable
 * end. Derive the count from the values instead, as upstream shadcn/ui does.
 *
 * Upstream falls back to `[min, max]` (two thumbs) when neither prop is an
 * array; this falls back to one. Every call site in this repo passes a
 * single-element array, and a two-thumb default would silently grow a second
 * handle on any slider that did not.
 */
const Slider = forwardRef<
  ComponentRef<typeof SliderPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, value, defaultValue, ...props }, ref) => {
  const thumbCount = useMemo(() => {
    if (Array.isArray(value)) return value.length
    if (Array.isArray(defaultValue)) return defaultValue.length
    return 1
  }, [value, defaultValue])

  return (
    <SliderPrimitive.Root
      ref={ref}
      data-slot="slider"
      value={value}
      defaultValue={defaultValue}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="bg-secondary relative h-2 w-full grow overflow-hidden rounded-full"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="bg-primary absolute h-full"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbCount }, (_, index) => (
        <SliderPrimitive.Thumb
          // Thumbs are positional and interchangeable — the index *is* the
          // identity, and there is no stable id to key on instead.
          key={index}
          data-slot="slider-thumb"
          className="border-primary bg-background ring-offset-background focus-visible:ring-ring block size-5 rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  )
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
