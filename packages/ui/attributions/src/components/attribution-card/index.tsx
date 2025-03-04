import type { ReactNode } from "react"
import type { Attribution } from "@attributions/types/attribution"
import {
  Book,
  Code,
  Database,
  FileText,
  Globe,
  ImageIcon,
  Music,
  Video,
} from "lucide-react"
import { Badge, Card, CardContent } from "some-ui-shared"
import { cn } from "some-ui-utils"

type AttributionCardProps = {
  className?: string
  attribution: Attribution
}

export const AttributionCard = ({
  attribution,
  className,
}: AttributionCardProps): React.JSX.Element => {
  const {
    sourceType,
    title,
    author,
    url,
    license,
    thankYouMessage,
    thumbnail,
  } = attribution

  const getSourceIcon = (): ReactNode => {
    switch (sourceType.toLowerCase()) {
      case "book":
        return <Book className="size-5" />
      case "website":
        return <Globe className="size-5" />
      case "data":
      case "satellite data":
        return <Database className="size-5" />
      case "document":
        return <FileText className="size-5" />
      case "image":
        return <ImageIcon className="size-5" />
      case "music":
        return <Music className="size-5" />
      case "video":
        return <Video className="size-5" />
      case "code":
        return <Code className="size-5" />
      default:
        return <FileText className="size-5" />
    }
  }

  // Get color based on source type
  const getSourceColor = (): string => {
    switch (sourceType.toLowerCase()) {
      case "book":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20"
      case "website":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20"
      case "data":
      case "satellite data":
        return "bg-green-500/10 text-green-500 border-green-500/20"
      case "document":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20"
      case "image":
        return "bg-pink-500/10 text-pink-500 border-pink-500/20"
      case "music":
        return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20"
      case "video":
        return "bg-red-500/10 text-red-500 border-red-500/20"
      case "code":
        return "bg-cyan-500/10 text-cyan-500 border-cyan-500/20"
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20"
    }
  }

  return (
    <Card
      className={cn(
        "overflow-hidden border-none bg-inherit",
        "backdrop-blur-sm transition-all duration-300",
        className
      )}
    >
      <CardContent className="p-0">
        <div className="flex flex-col gap-4 md:flex-row">
          {/* Thumbnail section */}
          <div className="relative flex h-48 w-full items-center justify-center bg-inherit md:h-auto md:w-1/3">
            {thumbnail ? (
              <img
                src={thumbnail || "/placeholder.svg"}
                alt={title}
                className="object-cover"
              />
            ) : (
              <div className="p-4 text-center text-lg font-medium">{title}</div>
            )}
          </div>

          {/* Content section */}
          <div className="w-full space-y-4 p-6 md:w-2/3">
            <div className="flex items-start justify-between">
              <Badge
                className={cn(
                  "flex items-center gap-1 px-3 py-1",
                  getSourceColor()
                )}
              >
                {getSourceIcon()}
                {sourceType}
              </Badge>
              <Badge
                variant="outline"
                className="border-gray-700 text-gray-400"
              >
                {license}
              </Badge>
            </div>

            <div>
              <h3 className="mb-1 text-xl font-bold text-white">{title}</h3>
              <p className="text-gray-400">by {author}</p>
            </div>

            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-blue-400 transition-colors hover:text-blue-300"
              >
                <Globe className="size-3" />
                {url}
              </a>
            )}

            <div className="border-t border-gray-800 pt-2">
              <p className="italic text-gray-300">{thankYouMessage}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
