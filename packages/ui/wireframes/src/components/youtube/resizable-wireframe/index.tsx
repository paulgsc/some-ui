import { forwardRef } from "react"
import type { ComponentPropsWithoutRef, ElementRef, ReactNode } from "react"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "some-ui-shared"
import { cn } from "some-ui-utils"

type RootProps = {
  children: ReactNode
  direction?: "vertical" | "horizontal"
} & ComponentPropsWithoutRef<typeof ResizablePanelGroup>

type PanelProps = {
  children: ReactNode
} & ComponentPropsWithoutRef<typeof ResizablePanel>

const Root = forwardRef<ElementRef<typeof ResizablePanelGroup>, RootProps>(
  ({ children, className, direction = "vertical", ...props }, ref) => (
    <ResizablePanelGroup
      className={cn("absolute inset-0", className)}
      ref={ref}
      direction={direction}
      {...props}
    >
      {children}
    </ResizablePanelGroup>
  )
)
Root.displayName = "ResizableLayout.Root"

const PanelA = forwardRef<ElementRef<typeof ResizablePanel>, PanelProps>(
  ({ children, className, defaultSize = 25, ...props }, ref) => (
    <ResizablePanel
      ref={ref}
      defaultSize={defaultSize}
      className={cn("size-full", className)}
      {...props}
    >
      {children}
    </ResizablePanel>
  )
)
PanelA.displayName = "ResizableLayout.PanelA"

const PanelB = forwardRef<ElementRef<typeof ResizablePanel>, PanelProps>(
  ({ children, className, defaultSize = 75, minSize = 75, ...props }, ref) => (
    <>
      <ResizableHandle withHandle />
      <ResizablePanel
        ref={ref}
        defaultSize={defaultSize}
        minSize={minSize}
        className={cn("size-full", className)}
        {...props}
      >
        {children}
      </ResizablePanel>
    </>
  )
)
PanelB.displayName = "ResizableLayout.PanelB"

export const ResizableLayout = {
  Root,
  PanelA,
  PanelB,
}
