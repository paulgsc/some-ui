import type { HTMLAttributes } from "react"
import { forwardRef } from "react"
import { SvgIcons } from "some-ui-shared"
import { cn } from "some-ui-utils"

const Step = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow",
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
      className={cn("", className)}
      viewBox="0 0 200 60"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      {...props}
    >
      <path d="M 10,10 H 160 L 190,30 L 160,50 H 10 Q 5,30 10,10" />
    </svg>
  )
)

StepStart.displayName = "StepStart"

const StepMiddle = forwardRef<SVGSVGElement, HTMLAttributes<SVGSVGElement>>(
  ({ className, ...props }, ref) => (
    <svg
      ref={ref}
      className={cn("", className)}
      viewBox="0 0 200 60"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      {...props}
    >
      <path d="M 10,10 H 160 L 190,30 L 160,50 H 10 L 40,30 L 10,10" />
    </svg>
  )
)

StepMiddle.displayName = "StepMiddle"

const StepEnd = forwardRef<SVGSVGElement, HTMLAttributes<SVGSVGElement>>(
  ({ className, ...props }, ref) => (
    <svg
      ref={ref}
      className={cn("", className)}
      viewBox="0 0 200 60"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      {...props}
    >
      <path d="M 10,10 H 160 Q 190,30 160,50 H 10 L 40,30 L 10,10" />
    </svg>
  )
)

StepEnd.displayName = "StepEnd"

const CardTitle = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
)
CardTitle.displayName = "CardTitle"

const CardDescription = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
)
CardContent.displayName = "CardContent"

const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center p-6 pt-0", className)}
      {...props}
    />
  )
)
CardFooter.displayName = "CardFooter"

export { CardFooter, CardTitle, CardDescription, CardContent }
