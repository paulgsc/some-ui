import type { JSX } from "react"
import { Badge, Button } from "@some-ui/shared"
import {
  Download,
  FileText,
  Settings,
  Upload,
  Wifi,
  WifiOff,
} from "lucide-react"
import { cn, useObsStatusWebSocket } from "some-ui-utils"

const buttonStyles = {
  base: "gap-2 rounded-md border-none px-3 text-white shadow-md hover:brightness-110 focus:ring-2",
  variants: {
    upload: "bg-blue-500/90 hover:bg-blue-600 focus:ring-blue-400",
    download: "bg-emerald-500/90 hover:bg-emerald-600 focus:ring-emerald-400",
    dsl: "bg-amber-500/90 hover:bg-amber-600 focus:ring-amber-400",
    settings: "bg-purple-500/90 hover:bg-purple-600 focus:ring-purple-400",
  },
}

export const Header = (): JSX.Element => {
  const { isConnected } = useObsStatusWebSocket({
    url: `ws://${window.location.hostname}:3000/ws`,
  })

  return (
    <header className="border-border flex h-14 items-center justify-between border-b bg-gradient-to-r from-slate-50 via-fuchsia-50 to-slate-100 px-4 shadow-md">
      {/* Left section */}
      <div className="flex items-center gap-4">
        <h1 className="bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-500 bg-clip-text text-xl font-extrabold text-transparent drop-shadow-sm">
          OBS Script Manager
        </h1>

        <Badge
          variant={isConnected ? "secondary" : "destructive"}
          className={cn(
            "flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-bold",
            isConnected
              ? "bg-green-500/20 text-green-400 ring-1 ring-green-500/50"
              : "bg-red-500/20 text-red-400 ring-1 ring-red-500/50"
          )}
        >
          {isConnected ? (
            <Wifi className="size-3 text-green-400" />
          ) : (
            <WifiOff className="size-3 text-red-400" />
          )}
          {isConnected ? "Connected" : "Disconnected"}
        </Badge>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className={cn(buttonStyles.base, buttonStyles.variants.upload)}
        >
          <Upload className="size-4" />
          Import
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={cn(buttonStyles.base, buttonStyles.variants.download)}
        >
          <Download className="size-4" />
          Export
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={cn(buttonStyles.base, buttonStyles.variants.dsl)}
        >
          <FileText className="size-4" />
          Generate DSL
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={cn(buttonStyles.base, buttonStyles.variants.settings)}
        >
          <Settings className="size-4" />
        </Button>
      </div>
    </header>
  )
}
