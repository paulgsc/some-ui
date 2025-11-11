import { CodeSnippet } from "@slideshow/components/recap/code-snippet"
import { StatusCard } from "@slideshow/components/recap/status-card"
import type { Meta, StoryObj } from "@storybook/react-vite"

import type { SlideData, Status } from "."
import { createCodeSlide, createStatusCardSlide, Slideshow } from "."

export const statusCards: Status[] = [
  {
    id: "auth",
    icon: "✅",
    title: "Authentication System",
    description:
      "JWT implementation with refresh tokens, password hashing, and role-based access control.",
    tags: [
      { text: "Node.js", variant: "tech" },
      { text: "JWT", variant: "tech" },
      { text: "SHIPPED", variant: "status" },
    ],
    status: "completed",
  },
  {
    id: "database",
    icon: "✅",
    title: "Database Schema",
    description:
      "Designed and implemented normalized database with migrations, indexes, and performance optimizations.",
    tags: [
      { text: "PostgreSQL", variant: "tech" },
      { text: "Prisma", variant: "tech" },
      { text: "DEPLOYED", variant: "status" },
    ],
    status: "completed",
  },
  {
    id: "chat",
    icon: "⚡",
    title: "Real-time Chat Feature",
    description:
      "Building WebSocket connections, message persistence, and typing indicators. About 60% complete.",
    tags: [
      { text: "Socket.io", variant: "tech" },
      { text: "React", variant: "tech" },
      { text: "IN PROGRESS", variant: "status" },
    ],
    status: "current",
  },
  {
    id: "typing",
    icon: "🎯",
    title: "Complete Chat Typing Indicators",
    description:
      "Implement real-time typing status with debounced events and clean UI feedback.",
    tags: [{ text: "High Priority", variant: "default" }],
    status: "planned",
  },
  {
    id: "persistence",
    icon: "🔧",
    title: "Message Persistence Layer",
    description:
      "Connect chat to database, implement message history, and optimize for performance.",
    tags: [{ text: "Core Feature", variant: "default" }],
    status: "planned",
  },
]

export const codeSnippets = [
  "const",
  "function",
  "{}",
  "=>",
  "async",
  "await",
  "import",
  "export",
  "[]",
  "()",
  "return",
  "if",
  "else",
  "for",
  "map",
  "filter",
  "reduce",
  "===",
  "!==",
  "&&",
  "||",
  "true",
  "false",
  "null",
  "undefined",
]

const createDefaultSlides = (statusCards: Status[]): SlideData[] => [
  // Welcome slide
  createCodeSlide(
    "welcome",
    "Welcome Back, Developers",
    "streaming-session --initialize",
    "Initializing coding session... Loading project context and brewing coffee ☕",
    `# Starting development environment
$ git status
$ npm run dev
$ code --new-session "Today's Mission"

# Ready to ship some code 🚀`,
    "bash"
  ),

  // Victories slide
  createStatusCardSlide(
    "victories",
    "🎯 Recent Victories",
    "project-recap --completed",
    statusCards,
    "completed"
  ),

  // Current work slide
  {
    id: "current",
    title: "Currently Cooking",
    terminalTitle: "project-status --current",
    content: (
      <>
        <h2 className="mb-8 text-4xl font-semibold text-white">
          🔥 Currently Cooking
        </h2>
        <div className="mb-8 grid grid-cols-1 gap-8">
          {statusCards
            .filter((card) => card.status === "current")
            .map((card) => (
              <StatusCard key={card.id} card={card} />
            ))}
        </div>
        <CodeSnippet language="javascript">
          {`// Last session's progress
const socket = io();

socket.on('message', (data) => {
  // Handle incoming messages
  setMessages(prev => [...prev, data]);
});

// TODO: Add typing indicators ⚠️
// TODO: Message persistence 📝`}
        </CodeSnippet>
      </>
    ),
  },

  // Mission slide
  {
    id: "mission",
    title: "Today's Mission",
    terminalTitle: "today-mission --execute",
    content: (
      <>
        <h2 className="mb-8 text-4xl font-semibold text-white">
          🚀 Today's Mission
        </h2>
        <div className="mb-8 grid grid-cols-1 gap-8 md:grid-cols-2">
          {statusCards
            .filter((card) => card.status === "planned")
            .map((card) => (
              <StatusCard key={card.id} card={card} />
            ))}
        </div>
        <p className="text-lg font-medium text-green-400">
          <strong>Stretch Goal:</strong> Start working on file sharing in chat
          if we're making good progress! 📎
        </p>
      </>
    ),
  },

  // Final slide
  {
    id: "code",
    title: "Let's Build Something Awesome",
    terminalTitle: "session-start --live-coding",
    content: (
      <>
        <h1 className="mb-8 bg-gradient-to-r from-teal-400 to-blue-500 bg-clip-text text-5xl font-bold text-transparent">
          Let's Build Something Awesome
        </h1>
        <p className="mb-10 text-xl text-gray-400">
          Time to turn coffee into code. Ready when you are! ☕ → 💻
        </p>
        <CodeSnippet language="motivational">
          {`// The magic happens now
while (motivated && caffeinated) {
    writeCode();
    solveProblems();
    shipFeatures();
}

// Let's make it happen! 🚀`}
        </CodeSnippet>
        <p className="text-lg text-blue-400">
          Drop any questions in chat - let's code together!
        </p>
      </>
    ),
  },
]

const meta: Meta<typeof Slideshow> = {
  title: "UI/Slideshow/Components/Recap/Slideshow",
  component: Slideshow,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    sessionNumber: {
      control: "number",
      description: "Session number displayed in the top right corner",
    },
    floatingElements: {
      control: "select",
      options: ["codeSnippets", "mathematics", "design", "minimal", "binary"],
      description: "Preset for floating background elements",
    },
  },
}

export default meta
type Story = StoryObj<typeof Slideshow>

export const Default: Story = {
  args: {
    slides: createDefaultSlides(statusCards),
    statusCards,
    sessionNumber: 47,
    floatingElements: "codeSnippets",
  },
}

export const MathematicsTheme: Story = {
  args: {
    slides: [
      createCodeSlide(
        "math-intro",
        "Advanced Mathematics",
        "calc --symbolic-computation",
        "Exploring mathematical concepts with floating symbols",
        `// Mathematical computations
const integrate = (f, a, b) => {
  const dx = 0.001;
  let sum = 0;
  for (let x = a; x < b; x += dx) {
    sum += f(x) * dx;
  }
  return sum;
};

// Calculate π using Monte Carlo method
const estimatePi = (samples) => {
  let insideCircle = 0;
  for (let i = 0; i < samples; i++) {
    const x = Math.random() * 2 - 1;
    const y = Math.random() * 2 - 1;
    if (x * x + y * y <= 1) insideCircle++;
  }
  return (insideCircle / samples) * 4;
};`,
        "javascript"
      ),
      {
        id: "formulas",
        title: "Mathematical Formulas",
        terminalTitle: "equations --display",
        content: (
          <div className="text-center">
            <h1 className="mb-8 text-5xl font-bold text-white">
              📐 Mathematical Beauty
            </h1>
            <div className="space-y-6 text-2xl text-gray-300">
              <p>E = mc²</p>
              <p>∫₋∞^∞ e^(-x²) dx = √π</p>
              <p>e^(iπ) + 1 = 0</p>
              <p>∑(n=1 to ∞) 1/n² = π²/6</p>
            </div>
          </div>
        ),
      },
    ],
    statusCards: [],
    sessionNumber: 42,
    floatingElements: "mathematics",
  },
}

export const DesignStudio: Story = {
  args: {
    slides: [
      {
        id: "design-welcome",
        title: "Design Studio",
        terminalTitle: "creative-mode --activate",
        content: (
          <>
            <h1 className="mb-8 bg-gradient-to-r from-pink-400 to-purple-500 bg-clip-text text-5xl font-bold text-transparent">
              Welcome to Design Studio
            </h1>
            <p className="mb-8 text-xl text-gray-400">
              Where creativity meets code ✨
            </p>
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
              <div className="rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 p-6 text-center">
                <div className="text-3xl mb-2">🎨</div>
                <div className="text-sm">Color Theory</div>
              </div>
              <div className="rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 p-6 text-center">
                <div className="text-3xl mb-2">✨</div>
                <div className="text-sm">UI Magic</div>
              </div>
              <div className="rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 p-6 text-center">
                <div className="text-3xl mb-2">🚀</div>
                <div className="text-sm">Animations</div>
              </div>
              <div className="rounded-lg bg-gradient-to-br from-green-500 to-teal-500 p-6 text-center">
                <div className="text-3xl mb-2">💎</div>
                <div className="text-sm">Polish</div>
              </div>
            </div>
          </>
        ),
      },
    ],
    statusCards: [],
    sessionNumber: 88,
    floatingElements: "design",
  },
}

export const MinimalPresentation: Story = {
  args: {
    slides: [
      {
        id: "minimal",
        title: "Clean & Simple",
        terminalTitle: "minimal --presentation",
        content: (
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="mb-8 text-6xl font-thin text-white">Simplicity</h1>
            <p className="text-xl text-gray-500 leading-relaxed">
              Sometimes the most powerful presentations are the ones that say
              the most with the least.
            </p>
            <div className="mt-12 w-32 h-px bg-gradient-to-r from-transparent via-gray-400 to-transparent mx-auto"></div>
          </div>
        ),
      },
    ],
    statusCards: [],
    sessionNumber: 1,
    floatingElements: "minimal",
  },
}

export const TechDemo: Story = {
  args: {
    slides: [
      createCodeSlide(
        "binary-intro",
        "Binary Operations",
        "system --binary-mode",
        "Welcome to the machine language",
        `// Binary operations in JavaScript
const binaryAdd = (a, b) => {
  while (b !== 0) {
    const carry = a & b;
    a = a ^ b;
    b = carry << 1;
  }
  return a;
};

// Convert to binary representation
const toBinary = (num) => {
  return num.toString(2).padStart(8, '0');
};

console.log(toBinary(42)); // 00101010
console.log(toBinary(13)); // 00001101`,
        "javascript"
      ),
      {
        id: "matrix",
        title: "System Status",
        terminalTitle: "matrix --connection-established",
        content: (
          <div className="font-mono">
            <h2 className="mb-8 text-4xl font-semibold text-green-400">
              [SYSTEM ONLINE]
            </h2>
            <div className="space-y-4 text-green-300">
              <div className="flex justify-between">
                <span>CPU Usage:</span>
                <span className="text-green-400">42%</span>
              </div>
              <div className="flex justify-between">
                <span>Memory:</span>
                <span className="text-green-400">1337MB / 8192MB</span>
              </div>
              <div className="flex justify-between">
                <span>Network:</span>
                <span className="text-green-400">CONNECTED</span>
              </div>
              <div className="flex justify-between">
                <span>Security:</span>
                <span className="text-green-400">ENCRYPTED</span>
              </div>
            </div>
            <div className="mt-8 text-xs text-green-600">
              Awaiting instructions...
            </div>
          </div>
        ),
      },
    ],
    statusCards: [],
    sessionNumber: 404,
    floatingElements: "binary",
  },
}

export const CustomFloatingElements: Story = {
  args: {
    slides: [
      {
        id: "custom-theme",
        title: "Custom Theme",
        terminalTitle: "theme --custom-elements",
        content: (
          <div className="text-center">
            <h1 className="mb-8 text-5xl font-bold text-white">
              🌟 Custom Floating Elements
            </h1>
            <p className="text-xl text-gray-400">
              This demo uses custom floating elements with framework names
            </p>
            <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="p-4 bg-blue-500/20 rounded">React</div>
              <div className="p-4 bg-green-500/20 rounded">Vue</div>
              <div className="p-4 bg-red-500/20 rounded">Angular</div>
              <div className="p-4 bg-orange-500/20 rounded">Svelte</div>
            </div>
          </div>
        ),
      },
    ],
    statusCards: [],
    sessionNumber: 2024,
    floatingElements: {
      content: [
        "React",
        "Vue",
        "Angular",
        "Svelte",
        "Next.js",
        "Nuxt",
        "SvelteKit",
        "Astro",
      ],
      className:
        "absolute font-bold text-sm text-blue-400/20 animate-float pointer-events-none",
      spawnInterval: 1500,
      maxElements: 12,
      baseDuration: 12,
      durationRange: 8,
    },
  },
}

export const EmptySlideshow: Story = {
  args: {
    slides: [
      {
        id: "empty",
        title: "No Content",
        terminalTitle: "empty --state",
        content: (
          <div className="text-center">
            <h1 className="mb-8 text-4xl font-bold text-gray-500">
              📋 No Content Available
            </h1>
            <p className="text-lg text-gray-600">
              This slideshow has no status cards to display.
            </p>
          </div>
        ),
      },
    ],
    statusCards: [],
    sessionNumber: 0,
    floatingElements: "minimal",
  },
}
