import type { JSX } from "react"
import { useSceneLibrary } from "@slideshow/hooks/use-scene-library"
import { Check, Library } from "lucide-react"
import { Badge, Button, Card, ScrollArea } from "some-ui-shared"

type LibraryTemplatePickerProps = {
  onSelectTemplate: (ui: Array<unknown>, templateName: string) => void
}

export const LibraryTemplatePicker = ({
  onSelectTemplate,
}: LibraryTemplatePickerProps): JSX.Element => {
  const { getLibraryItems, loading } = useSceneLibrary()
  const libraryItems = getLibraryItems()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Library className="w-5 h-5 mr-2 animate-pulse" />
        Loading templates...
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h4 className="text-sm font-semibold mb-1">Replace UI from Template</h4>
        <p className="text-xs text-muted-foreground">
          Import UI intent stack from library files. This will replace the
          current UI content while preserving scene name and timing.
        </p>
      </div>

      <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
        <div className="grid grid-cols-2 gap-3">
          {libraryItems.map((item) => {
            const intentCount = item.config.ui.length || 0

            return (
              <Card
                key={item.key}
                className="p-4 hover:bg-accent/50 transition-colors cursor-pointer group"
                onClick={() => {
                  onSelectTemplate(item.config.ui, item.displayName)
                }}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {item.displayName}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">
                        {item.key}.json
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className="text-[10px] h-5 px-1.5 shrink-0"
                    >
                      {intentCount} intents
                    </Badge>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectTemplate(item.config.ui, item.displayName)
                    }}
                  >
                    <Check className="w-3 h-3" />
                    Use Template
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
