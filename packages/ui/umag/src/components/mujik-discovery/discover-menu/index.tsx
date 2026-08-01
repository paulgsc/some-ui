import type { FC, SVGProps } from "react"
import { useState } from "react"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@some-ui/shared"
import { CelebrationOverlay } from "@umag/components/mujik-discovery/celebration-mode"
import { Clock, FolderHeart, Heart, Trophy, Zap } from "lucide-react"
import { cn } from "some-ui-utils"

type DiscoveryMode =
  | "new-find"
  | "rediscovery"
  | "struck-chord"
  | "current-best"

type DiscoveryModeConfig = {
  mode: DiscoveryMode
  label: string
  icon: FC<SVGProps<SVGSVGElement>>
  color: string
  bgColor: string
  message: string
  description: string
  particles: number
  sparkles: number
}

const discoveryModes: Array<DiscoveryModeConfig> = [
  {
    mode: "new-find",
    label: "New Discovery",
    icon: Zap,
    color: "text-cyan-400",
    bgColor: "bg-cyan-400/20",
    message: "Fresh Discovery Added!",
    description: "A brand new musical gem",
    particles: 15,
    sparkles: 10,
  },
  {
    mode: "rediscovery",
    label: "Rediscovery",
    icon: Clock,
    color: "text-amber-400",
    bgColor: "bg-amber-400/20",
    message: "Welcome Back, Old Friend!",
    description: "Reunited with a forgotten favorite",
    particles: 12,
    sparkles: 8,
  },
  {
    mode: "struck-chord",
    label: "Struck a Chord",
    icon: Heart,
    color: "text-rose-400",
    bgColor: "bg-rose-400/20",
    message: "This One Hits Different!",
    description: "Deeply resonated with your soul",
    particles: 18,
    sparkles: 12,
  },
  {
    mode: "current-best",
    label: "Current Best",
    icon: Trophy,
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/20",
    message: "New Champion Crowned!",
    description: "Your current absolute favorite",
    particles: 20,
    sparkles: 15,
  },
]

export const DropdownMenuDemo = (): React.JSX.Element => {
  const [selectedMode, setSelectedMode] = useState<DiscoveryModeConfig | null>(
    null
  )

  const handleModeSelect = (mode: DiscoveryModeConfig): void => {
    setSelectedMode(mode)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost">
            <FolderHeart />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-full max-w-sm" align="center">
          <DropdownMenuGroup className="flex flex-1 items-center justify-around">
            {discoveryModes.map((item) => {
              const Icon = item.icon
              return (
                <DropdownMenuItem key={item.mode}>
                  <Button
                    variant="link"
                    className="flex cursor-pointer flex-col items-center gap-1 px-2 py-1.5"
                    onClick={() => handleModeSelect(item)}
                    title={item.description}
                  >
                    <Icon className={cn(item.color, "size-5")} />
                  </Button>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
        </DropdownMenuContent>
      </DropdownMenu>

      {selectedMode && (
        <CelebrationOverlay
          mode={selectedMode}
          selectedMode={selectedMode.mode}
          songTitle="strawberry moon"
          artist="iu"
        />
      )}
    </>
  )
}
