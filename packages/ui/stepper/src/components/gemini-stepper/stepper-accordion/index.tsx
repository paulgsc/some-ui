import type { ComponentPropsWithoutRef, ElementRef, ReactNode } from "react"
import { forwardRef } from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import {
  CircleCheck,
  ListTodo,
  MessageSquare,
  Milestone,
  WifiHigh,
} from "lucide-react"
import { cn } from "some-ui-utils"

const Accordion = AccordionPrimitive.Root

type AccordionItemProps = {
  icon?: string
}

const Icons: Record<string, ReactNode> = {
  todo: <ListTodo className="size-6" />,
  message: <MessageSquare className="size-6" />,
  milestone: <Milestone className="size-6" />,
  done: <CircleCheck className="size-6 fill-sky-500/40" />,
  progress: <WifiHigh className="size-6 animate-ping" />,
}

const AccordionItem = forwardRef<
  ElementRef<typeof AccordionPrimitive.Item>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Item> & AccordionItemProps
>(({ className, icon, children, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn(
      "relative z-0 size-full overflow-clip",
      "after:absolute",
      "after:start-6 after:top-12 after:h-full after:w-0.5",
      "after:max-h-[calc(100%-2rem)]",
      "after:bg-slate-500/60",
      "data-[state=closed]:after:hidden",
      className
    )}
    {...props}
  >
    <span className={cn("absolute start-3 top-4 z-50 bg-inherit")}>
      {icon && Icons[icon]}
    </span>

    {children}
  </AccordionPrimitive.Item>
))
AccordionItem.displayName = "AccordionItem"

const AccordionTrigger = forwardRef<
  ElementRef<typeof AccordionPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180",
        "ps-12 capitalize",
        className
      )}
      {...props}
    >
      {children}
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
))
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName

const AccordionContent = forwardRef<
  ElementRef<typeof AccordionPrimitive.Content>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className={cn(
      "data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down",
      "ms-12 overflow-hidden px-1.5 py-2.5 text-left text-sm transition-all",
      "text-balance tracking-tight",
      "size-full pb-2.5",
      className
    )}
    {...props}
  ></AccordionPrimitive.Content>
))

AccordionContent.displayName = AccordionPrimitive.Content.displayName

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
