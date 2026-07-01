import { useState, type ReactNode } from "react"
import { Check, Globe, Mic, User } from "lucide-react"
import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "some-ui-shared"
import type { TTSProvider, VoiceConfig } from "some-ui-utils"
import { cn } from "some-ui-utils"

type VoiceSelectorTriggerProps = {
  children: ReactNode
  voices: Array<VoiceConfig>
  selectedVoice: VoiceConfig | null
  onVoiceSelect: (voice: VoiceConfig) => void
  className?: string
}

const getProviderIcon = (provider: TTSProvider): string => {
  switch (provider) {
    case "elevenlabs":
      return "🎙️"
    case "openai":
      return "🤖"
    case "google":
      return "🔍"
    case "azure":
      return "☁️"
    default:
      return "🎵"
  }
}

const getProviderColor = (provider: TTSProvider): string => {
  switch (provider) {
    case "elevenlabs":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
    case "openai":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
    case "google":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
    case "azure":
      return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200"
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
  }
}

const getGenderIcon = (gender?: string): React.JSX.Element => {
  switch (gender) {
    case "male":
      return <User className="size-3" />
    case "female":
      return <User className="size-3" />
    case "neutral":
      return <Mic className="size-3" />
    default:
      return <Mic className="size-3" />
  }
}

export const VoiceSelectorTrigger = ({
  children,
  voices,
  selectedVoice,
  onVoiceSelect,
  className,
}: VoiceSelectorTriggerProps): React.JSX.Element => {
  const [open, setOpen] = useState(false)

  // Group voices by provider
  const voicesByProvider = voices.reduce(
    (acc, voice) => {
      if (!acc[voice.provider]) {
        acc[voice.provider] = []
      }
      acc[voice.provider].push(voice)
      return acc
    },
    {} as Record<TTSProvider, Array<VoiceConfig>>
  )

  const handleVoiceSelect = (voice: VoiceConfig): void => {
    onVoiceSelect(voice)
    setOpen(false)
  }

  return (
    <div className={cn("inline-block", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="size-fit">
            {children}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full max-w-sm" align="start">
          <Command>
            <CommandInput placeholder="Search voices..." />
            <CommandList>
              <CommandEmpty>No voices found.</CommandEmpty>
              {Object.entries(voicesByProvider).map(
                ([provider, providerVoices]) => (
                  <CommandGroup
                    key={provider}
                    heading={
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {getProviderIcon(provider as TTSProvider)}
                        </span>
                        <span className="font-medium capitalize">
                          {provider}
                        </span>
                      </div>
                    }
                  >
                    {providerVoices.map((voice) => (
                      <CommandItem
                        key={voice.id}
                        value={`${voice.name} ${voice.provider} ${voice.language} ${voice.gender}`}
                        onSelect={() => handleVoiceSelect(voice)}
                        className="flex cursor-pointer items-center justify-between p-3"
                      >
                        <div className="flex flex-1 items-center gap-3">
                          <div className="flex items-center gap-2">
                            {getGenderIcon(voice.gender)}
                            <span className="font-medium">{voice.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-xs",
                                getProviderColor(voice.provider)
                              )}
                            >
                              {voice.provider}
                            </Badge>
                            {voice.language && (
                              <Badge
                                variant="outline"
                                className="flex items-center gap-1 text-xs"
                              >
                                <Globe className="size-2" />
                                {voice.language}
                              </Badge>
                            )}
                            {voice.gender && (
                              <Badge
                                variant="outline"
                                className="text-xs capitalize"
                              >
                                {voice.gender}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {selectedVoice?.id === voice.id && (
                          <Check className="text-primary size-4" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
