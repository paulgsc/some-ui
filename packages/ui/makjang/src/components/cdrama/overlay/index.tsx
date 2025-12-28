import { useEffect, useState } from "react"

import { CoupleRating } from "@/components/couple-rating"
import { DramaHeader } from "@/components/drama-header"
import { EmojiTimeline } from "@/components/emoji-timeline"
import { EmotionalGraph } from "@/components/emotional-graph"
import { MetricsPanel } from "@/components/metrics-panel"
import { OSTPanel } from "@/components/ost-panel"

// Mock data for demonstration
const mockData = {
  drama_id: "hidden-love-2023",
  episode_number: 12,
  thumbnail_url: "/romantic-cdrama-couple.jpg",
  timestamp: new Date().toISOString(),
  overall_rating: 8.7,
  likelihood_to_finish: 0.95,
  rewatch_value: 0.82,
  emotional_roller_coaster: [
    { minute: 0, emotion: "neutral", intensity: 0.3, notes: "Opening scene" },
    { minute: 5, emotion: "joy", intensity: 0.6, notes: "Cute interaction" },
    { minute: 12, emotion: "surprise", intensity: 0.8, notes: "Plot twist!" },
    {
      minute: 18,
      emotion: "sadness",
      intensity: 0.7,
      notes: "Emotional moment",
    },
    { minute: 25, emotion: "joy", intensity: 0.9, notes: "Confession scene" },
    { minute: 32, emotion: "fear", intensity: 0.5, notes: "Tension building" },
    { minute: 38, emotion: "joy", intensity: 0.95, notes: "Happy ending" },
  ],
  emoji_reactions: [
    { minute: 5, emoji: "😊", context: "So sweet!" },
    { minute: 12, emoji: "😱", context: "Did not see that coming" },
    { minute: 18, emoji: "😭", context: "Crying" },
    { minute: 25, emoji: "❤️", context: "Finally!" },
    { minute: 38, emoji: "🥰", context: "Perfect" },
  ],
  scene_tags: ["romance", "confession", "plot twist", "emotional"],
  cp_rating: {
    couple_name: "Sang Zhi × Duan Jiaxu",
    rating: 9.2,
    hype_vs_actual: 0.8,
  },
  ml_fl_ranking: {
    ml_rank: 3,
    fl_rank: 5,
    fav_actors: ["Zhao Lusi", "Chen Zheyuan"],
  },
  ost_rating: {
    score: 8.5,
    ranking: 7,
    favorite_track: "Secret Love",
  },
}

export default function CDramaOverlay() {
  const [currentMinute, setCurrentMinute] = useState(0)
  const [isVisible, setIsVisible] = useState(true)

  // Simulate time progression
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMinute((prev) => (prev + 1) % 45)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-purple-950 p-6 font-sans">
      <div className="mx-auto max-w-[1800px] space-y-6">
        {/* Header */}
        <DramaHeader
          dramaId={mockData.drama_id}
          episodeNumber={mockData.episode_number}
          thumbnailUrl={mockData.thumbnail_url}
          currentMinute={currentMinute}
        />

        {/* Main Grid */}
        <div className="grid grid-cols-12 gap-6">
          {/* Left Column - Emotional Graph */}
          <div className="col-span-7">
            <EmotionalGraph
              data={mockData.emotional_roller_coaster}
              currentMinute={currentMinute}
            />
          </div>

          {/* Right Column - Metrics */}
          <div className="col-span-5 space-y-6">
            <MetricsPanel
              overallRating={mockData.overall_rating}
              likelihoodToFinish={mockData.likelihood_to_finish}
              rewatchValue={mockData.rewatch_value}
            />

            <CoupleRating
              coupleName={mockData.cp_rating.couple_name}
              rating={mockData.cp_rating.rating}
              hypeVsActual={mockData.cp_rating.hype_vs_actual}
              mlRank={mockData.ml_fl_ranking.ml_rank}
              flRank={mockData.ml_fl_ranking.fl_rank}
            />
          </div>

          {/* Bottom Row */}
          <div className="col-span-8">
            <EmojiTimeline
              reactions={mockData.emoji_reactions}
              currentMinute={currentMinute}
            />
          </div>

          <div className="col-span-4">
            <OSTPanel
              score={mockData.ost_rating.score}
              ranking={mockData.ost_rating.ranking}
              favoriteTrack={mockData.ost_rating.favorite_track}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
