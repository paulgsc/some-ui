import { useState } from "react"
import confetti from "canvas-confetti"
import { AnimatePresence, motion } from "framer-motion"

import { Input } from "@/components/ui/input"

const tabs = [
  { id: "all", label: "All Posts" },
  { id: "web", label: "Web Design" },
  { id: "dev", label: "Development" },
  { id: "db", label: "Databases" },
  { id: "seo", label: "Search Engines" },
  { id: "marketing", label: "Marketing" },
]

export default function AnimatedNav() {
  const [activeTab, setActiveTab] = useState("all")

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.3 },
      colors: ["#818CF8", "#C7D2FE", "#E0E7FF"],
    })
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-4">
      <div className="flex items-center justify-between rounded-full bg-white/50 px-4 py-2 shadow-lg backdrop-blur-sm">
        <nav className="flex flex-1 items-center space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                handleTabChange(tab.id)
              }}
              className={`relative px-3 py-1.5 text-sm font-medium transition-colors
                                                                                                                                      ${activeTab === tab.id ? "text-indigo-600" : "text-gray-600 hover:text-indigo-600"}`}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="bubble"
                  className="absolute inset-0 z-10"
                  transition={{
                    type: "spring",
                    bounce: 0.5,
                    duration: 0.6,
                    delay: 0.2,
                  }}
                >
                  <motion.div
                    className="absolute inset-0 rounded-full bg-indigo-100"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{
                      scale: 1,
                      opacity: 1,
                      filter: "url(#goo)",
                    }}
                    exit={{ scale: 0.8, opacity: 0 }}
                  />
                  <motion.div
                    className="absolute bottom-0 left-1/2 size-1 rounded-full bg-indigo-600"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      type: "spring",
                      bounce: 0.5,
                      delay: 0.4,
                    }}
                  />
                </motion.div>
              )}
              <span className="relative z-20">{tab.label}</span>
            </button>
          ))}
        </nav>

              {/* SVG filter for the gooey effect */}
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
    </div>
  )
}
