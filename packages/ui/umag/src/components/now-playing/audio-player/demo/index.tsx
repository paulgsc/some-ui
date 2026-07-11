import type { JSX } from "react"
import { useCallback, useState } from "react"
import { isError } from "@umag/utils/error"
import type { UseAudioStorageOptions, UseAudioTTSOptions } from "some-ui-utils"
import { useAudioFromStorage } from "some-ui-utils"

type StorageOptions = {
  ttsOptions: UseAudioTTSOptions
  fetchOptions: UseAudioStorageOptions
}

// Example component demonstrating the refactored hook
export const AudioStorageExample = (): JSX.Element => {
  const [inputText, setInputText] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Array<string>>([])

  // Configure the audio storage service
  const audioStorageConfig: StorageOptions = {
    ttsOptions: {
      volume: 0.8,
      playbackRate: 1.0,
      autoPlay: true,
      service: {
        provider: "openai",
      },
    },
    fetchOptions: {
      service: {
        provider: "openai",
        // Your storage endpoint - expecting structure like /audio/:id
        storageEndpoint: "http://nixos.local:3000/get_audio",
        retryConfig: {
          maxRetries: 3,
          delay: 1000,
        },
      },
      staleTime: 10 * 60 * 1000, // 10 minutes
      cacheTime: 20 * 60 * 1000, // 20 minutes
      onError: (error) => {
        // eslint-disable-next-line no-console
        console.error("Audio storage error:", error)
        // You could show a toast notification here
      },
    },
  }

  // Initialize the hook
  const {
    speak,
    stop,
    pause,
    resume,
    setVolume,
    setPlaybackRate,
    updateOptions,
    speaking,
    paused,
    loading,
    supported,
    currentTime,
    duration,
    voices,
    selectedVoice,
    setSelectedVoice,
    error,
    refetch,
    searchAudio,
    currentAudioId,
  } = useAudioFromStorage(audioStorageConfig)

  // Handle text-to-speech
  const handleSpeak = useCallback(async () => {
    if (!inputText.trim()) return

    try {
      await speak(inputText)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to speak:", error)
    }
  }, [inputText, speak])

  // Handle audio search
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return

    try {
      const { results } = await searchAudio()
      setSearchResults(results.map((result) => result.text ?? result.id))
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Search failed:", error)
    }
  }, [searchQuery, searchAudio])

  // Handle voice selection
  const handleVoiceChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ): void => {
    const voiceId = event.target.value
    const voice = voices.find((v) => (v.id || v.name) === voiceId)
    if (voice) {
      setSelectedVoice(voice)
    }
  }

  // Handle volume change
  const handleVolumeChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const volume = parseFloat(event.target.value)
    setVolume(volume)
    // Also update the hook's options if you want to persist this
    updateOptions({ volume })
  }

  // Handle playback rate change
  const handlePlaybackRateChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ): void => {
    const rate = parseFloat(event.target.value)
    setPlaybackRate(rate)
    updateOptions({ playbackRate: rate })
  }

  if (!supported) {
    return (
      <div className="rounded-lg bg-red-50 p-6">
        <h2 className="mb-2 text-xl font-bold text-red-800">
          Audio Not Supported
        </h2>
        <p className="text-red-600">
          Your browser doesn&apos;t support audio playback.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="rounded-lg bg-white p-6 shadow-md">
        <h1 className="mb-4 text-2xl font-bold text-gray-900">
          Audio Storage Example
        </h1>

        {/* Voice Selection */}
        <div className="mb-4">
          <label
            htmlFor="voice-select"
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            Select Voice:
          </label>
          <select
            id="voice-select"
            value={selectedVoice?.id || selectedVoice?.name || ""}
            onChange={handleVoiceChange}
            className="w-full rounded-md border border-gray-300 p-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
          >
            {voices.map((voice) => (
              <option
                key={voice.id || voice.name}
                value={voice.id || voice.name}
              >
                {voice.name} ({voice.provider})
              </option>
            ))}
          </select>
        </div>

        {/* Text Input */}
        <div className="mb-4">
          <label
            htmlFor="text-input"
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            Text to Speak:
          </label>
          <textarea
            id="text-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Enter text to convert to speech..."
            rows={3}
            className="w-full rounded-md border border-gray-300 p-3 focus:border-transparent focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Audio Controls */}
        <div className="mb-6 flex flex-wrap gap-3">
          <button
            onClick={handleSpeak}
            disabled={!inputText.trim() || loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {loading ? "Loading..." : "Speak"}
          </button>

          <button
            onClick={speaking ? pause : resume}
            disabled={!speaking && !paused}
            className="rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {paused ? "Resume" : "Pause"}
          </button>

          <button
            onClick={stop}
            disabled={!speaking && !paused}
            className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            Stop
          </button>

          <button
            onClick={() => refetch()}
            className="rounded-md bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
          >
            Refetch Audio
          </button>
        </div>

        {/* Audio Settings */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="volume-slider"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Volume: {Math.round((currentTime / (duration || 1)) * 100)}%
            </label>
            <input
              id="volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.1"
              defaultValue="0.8"
              onChange={handleVolumeChange}
              className="w-full"
            />
          </div>

          <div>
            <label
              htmlFor="rate-select"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Playback Rate:
            </label>
            <select
              id="rate-select"
              defaultValue="1.0"
              onChange={handlePlaybackRateChange}
              className="w-full rounded-md border border-gray-300 p-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1.0">1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2.0">2.0x</option>
            </select>
          </div>
        </div>

        {/* Status Information */}
        <div className="mb-6 rounded-lg bg-gray-50 p-4">
          <h3 className="mb-2 text-lg font-semibold text-gray-900">Status</h3>
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <span className="font-medium">State:</span>
              <span
                className={`ml-2 rounded-full px-2 py-1 text-xs ${
                  speaking
                    ? "bg-green-100 text-green-800"
                    : paused
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-gray-100 text-gray-800"
                }`}
              >
                {speaking ? "Speaking" : paused ? "Paused" : "Stopped"}
              </span>
            </div>
            <div>
              <span className="font-medium">Loading:</span>
              <span className="ml-2">{loading ? "Yes" : "No"}</span>
            </div>
            <div>
              <span className="font-medium">Duration:</span>
              <span className="ml-2">
                {duration ? `${Math.round(duration)}s` : "N/A"}
              </span>
            </div>
            <div>
              <span className="font-medium">Current ID:</span>
              <span className="ml-2 font-mono text-xs">
                {currentAudioId || "None"}
              </span>
            </div>
          </div>

          {isError(error) && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-800">Error:</p>
              <p className="text-sm text-red-600">{error.message}</p>
            </div>
          )}
        </div>

        {/* Search Functionality */}
        <div className="border-t pt-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            Search Existing Audio
          </h3>

          <div className="mb-4 flex gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for existing audio files..."
              className="flex-1 rounded-md border border-gray-300 p-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSearch}
              disabled={!searchQuery.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              Search
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="rounded-lg bg-gray-50 p-4">
              <h4 className="mb-2 font-medium text-gray-900">
                Search Results:
              </h4>
              <ul className="space-y-1">
                {searchResults.map((result, index) => (
                  <li
                    key={`result-idx-${index}`}
                    className="font-mono text-sm text-gray-600"
                  >
                    {result}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* API Usage Example */}
      <div className="rounded-lg bg-gray-100 p-6">
        <h2 className="mb-4 text-xl font-bold text-gray-900">
          Expected API Structure
        </h2>
        <div className="space-y-3 font-mono text-sm">
          <div>
            <strong>Fetch Audio:</strong>
            <code className="ml-2 rounded bg-white px-2 py-1">
              GET /audio/:id?q=searchtext&voice=openai-nova
            </code>
          </div>
          <div>
            <strong>Search Audio:</strong>
            <code className="ml-2 rounded bg-white px-2 py-1">
              GET /audio/search?q=searchquery
            </code>
          </div>
          <div>
            <strong>Response:</strong>
            <code className="ml-2 rounded bg-white px-2 py-1">
              ArrayBuffer (audio/mp3, audio/wav, etc.)
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}
