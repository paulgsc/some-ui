import { useCallback, useEffect, useState } from "react"
import type { Event, NpmCommands } from "@mdx/types"
import type { DropdownMenuTriggerProps } from "@radix-ui/react-dropdown-menu"
import { CheckIcon, ClipboardIcon } from "lucide-react"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  type ButtonProps,
} from "some-ui-shared"
import { cn } from "some-ui-utils"

type CopyButtonProps = {
  value: string
  src?: string
  event?: Event["name"]
} & ButtonProps

// eslint-disable-next-line @typescript-eslint/require-await
export async function copyToClipboardWithMeta(value: string): Promise<void> {
  void navigator.clipboard.writeText(value)
}

const CopyButton = ({
  value,
  className,
  variant = "ghost",
  ...props
}: CopyButtonProps): JSX.Element => {
  const [hasCopied, setHasCopied] = useState(false)

  useEffect(() => {
    setTimeout(() => {
      setHasCopied(false)
    }, 2000)
  }, [hasCopied])

  return (
    <Button
      size="icon"
      variant={variant}
      className={cn(
        "relative z-10 size-6 text-zinc-50 hover:bg-zinc-700 hover:text-zinc-50 [&_svg]:size-3",
        className
      )}
      onClick={() => {
        void copyToClipboardWithMeta(value)
        setHasCopied(true)
      }}
      {...props}
    >
      <span className="sr-only">Copy</span>
      {hasCopied ? <CheckIcon /> : <ClipboardIcon />}
    </Button>
  )
}

type CopyWithClassNamesProps = {
  value: string
  classNames: string
  className?: string
} & DropdownMenuTriggerProps

export const CopyWithClassNames = ({
  value,
  classNames,
  className,
}: CopyWithClassNamesProps): JSX.Element => {
  const [hasCopied, setHasCopied] = useState(false)

  useEffect(() => {
    setTimeout(() => {
      setHasCopied(false)
    }, 2000)
  }, [hasCopied])

  const copyToClipboard = useCallback((value: string) => {
    void copyToClipboardWithMeta(value)
    setHasCopied(true)
  }, [])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            "relative z-10 size-6 text-zinc-50 hover:bg-zinc-700 hover:text-zinc-50",
            className
          )}
        >
          {hasCopied ? (
            <CheckIcon className="size-3" />
          ) : (
            <ClipboardIcon className="size-3" />
          )}
          <span className="sr-only">Copy</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            copyToClipboard(value)
          }}
        >
          Component
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            copyToClipboard(classNames)
          }}
        >
          Classname
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type CopyNpmCommandButtonProps = {
  commands: Required<NpmCommands>
} & DropdownMenuTriggerProps

export const CopyNpmCommandButton = ({
  commands,
  className,
}: CopyNpmCommandButtonProps): JSX.Element => {
  const [hasCopied, setHasCopied] = useState(false)

  useEffect(() => {
    setTimeout(() => {
      setHasCopied(false)
    }, 2000)
  }, [hasCopied])

  const copyCommand = useCallback((value: string) => {
    void copyToClipboardWithMeta(value)
    setHasCopied(true)
  }, [])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            "relative z-10 size-6 text-zinc-50 hover:bg-zinc-700 hover:text-zinc-50",
            className
          )}
        >
          {hasCopied ? (
            <CheckIcon className="size-3" />
          ) : (
            <ClipboardIcon className="size-3" />
          )}
          <span className="sr-only">Copy</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            copyCommand(commands.__pnpmCommand__)
          }}
        >
          pnpm
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default CopyButton
