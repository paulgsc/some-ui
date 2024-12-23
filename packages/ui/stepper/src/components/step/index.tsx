import type { HTMLAttributes } from "react"
import { forwardRef } from "react"
import { SvgIcons } from "some-ui-shared"
import { cn } from "some-ui-utils"

const Stepper = forwardRef<HTMLUListElement, HTMLAttributes<HTMLUListElement>>(
  ({ className, ...props }, ref) => (
    <ul
      ref={ref}
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow",
        className
      )}
      {...props}
    />
  )
)

Stepper.displayName = "Stepper"

const Step = forwardRef<HTMLLIElement, HTMLAttributes<HTMLLIElement>>(
  ({ className, ...props }, ref) => (
    <li
      ref={ref}
      className={cn(
        "relative size-full rounded-sm bg-inherit text-center",
        className
      )}
      {...props}
    />
  )
)

Step.displayName = "Step"

type StepIconProps = {
  icon: keyof typeof SvgIcons
} & Omit<HTMLAttributes<SVGElement>, "ref">

const StepIcon = forwardRef<SVGSVGElement, StepIconProps>(
  ({ className, icon, ...props }, ref) => {
    const Icon = SvgIcons[icon]
    return <Icon ref={ref} className={cn("", className)} {...props} />
  }
)

StepIcon.displayName = "StepIcon"

const StepStart = forwardRef<SVGSVGElement, HTMLAttributes<SVGSVGElement>>(
  ({ className, ...props }, ref) => (
    <svg
      ref={ref}
      className={cn("size-full", className)}
      preserveAspectRatio="none"
      viewBox="0 0 200 80"
      fill="currentColor"
      {...props}
    >
      <path d="M0,0 H160 L200,40 L160,80 H0 Z" />
    </svg>
  )
)
StepStart.displayName = "StepStart"

const StepMiddle = forwardRef<SVGSVGElement, HTMLAttributes<SVGSVGElement>>(
  ({ className, ...props }, ref) => (
    <svg
      ref={ref}
      className={cn("size-full", className)}
      preserveAspectRatio="none"
      viewBox="0 0 200 80"
      fill="currentColor"
      {...props}
    >
      <path d="M0,0 H160 L200,40 L160,80 H0 L40,40 Z" />
    </svg>
  )
)
StepMiddle.displayName = "StepMiddle"

const StepEnd = forwardRef<SVGSVGElement, HTMLAttributes<SVGSVGElement>>(
  ({ className, ...props }, ref) => (
    <svg
      ref={ref}
      className={cn("size-full", className)}
      preserveAspectRatio="none"
      viewBox="0 0 200 80"
      fill="currentColor"
      {...props}
    >
      <path d="M0,0 H160 C180,0 200,20 200,40 C200,60 180,80 160,80 H0 L40,40 Z" />
    </svg>
  )
)
StepEnd.displayName = "StepEnd"

const StepTitle = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
)
StepTitle.displayName = "StepTitle"

const StepDescription = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
StepDescription.displayName = "StepDescription"

export {
  Stepper,
  Step,
  StepStart,
  StepMiddle,
  StepEnd,
  StepTitle,
  StepDescription,
}
