import { useEffect, useState } from "react"
import {
  AlertCircle,
  CheckCircle,
  Circle,
  Clock,
  Code,
  FileText,
  Target,
  Zap,
} from "lucide-react"

const CATEGORIES = {
  A: {
    name: "Problem Decomposition",
    color: "from-purple-500 to-pink-500",
    minRequired: 0,
  },
  B: {
    name: "System Boundaries",
    color: "from-blue-500 to-cyan-500",
    minRequired: 0,
  },
  C: {
    name: "Data Flow & State",
    color: "from-green-500 to-emerald-500",
    minRequired: 0,
  },
  D: {
    name: "Concurrency & Lifecycle",
    color: "from-yellow-500 to-orange-500",
    minRequired: 0,
  },
  E: {
    name: "Error Handling",
    color: "from-red-500 to-rose-500",
    minRequired: 0,
  },
  F: {
    name: "Performance",
    color: "from-indigo-500 to-purple-500",
    minRequired: 0,
  },
  G: { name: "Testing", color: "from-teal-500 to-green-500", minRequired: 0 },
  H: {
    name: "Alternatives & Tradeoffs",
    color: "from-orange-500 to-red-500",
    minRequired: 1,
  },
}

const ALL_QUESTIONS = {
  A1: {
    text: "What is the single decision I need to make?",
    category: "A",
    criteria: [
      "State decision as binary choice or enumerated options",
      "NOT be compound (How do I X AND Y)",
      "Be specific enough to be implemented",
    ],
  },
  A2: {
    text: "What are the inputs to this decision?",
    category: "A",
    criteria: [
      "Enumerate 3+ concrete constraints or requirements",
      "Specify whether each input is hard requirement vs. optimization goal",
      "Distinguish technical from business/project inputs",
    ],
  },
  A3: {
    text: "What are the outputs of this decision?",
    category: "A",
    criteria: [
      "Describe what changes in the codebase",
      "Identify what new interfaces/contracts emerge",
      "Specify what downstream decisions unlock or constrain",
    ],
  },
  A4: {
    text: "What simpler problem is this an instance of?",
    category: "A",
    criteria: [
      "Identify general pattern (e.g., service composition, ownership transfer)",
      "Reference known solutions to that pattern",
      "Explain why standard solution doesn't directly apply",
    ],
  },
  A5: {
    text: "What are the sub-problems that must be solved first?",
    category: "A",
    criteria: [
      "List 2+ blocking sub-problems",
      "Explain dependency ordering between sub-problems",
      "Identify which sub-problems you understand vs. don't",
    ],
  },
  A6: {
    text: "Which parts of this problem are well-understood vs. novel?",
    category: "A",
    criteria: [
      "Separate known patterns from unknown territory",
      "Identify what you can lean on (libraries, patterns, prior art)",
      "Pinpoint where you're in unexplored design space",
    ],
  },
  A7: {
    text: "What would a minimal working solution look like?",
    category: "A",
    criteria: [
      "Describe simplest possible implementation",
      "Explain what features/properties it sacrifices",
      "State why you can't just ship the minimal version",
    ],
  },
  A8: {
    text: "What aspect of this problem am I most uncertain about?",
    category: "A",
    criteria: [
      "Identify single biggest unknown",
      "Distinguish between known-unknowns and unknown-unknowns",
      "Explain what information would resolve uncertainty",
    ],
  },
  B1: {
    text: "What are the architectural layers in play?",
    category: "B",
    criteria: [
      "Name 2+ layers involved (e.g., domain, transport, infrastructure)",
      "Explain dependency direction between layers",
      "Identify which layer the decision primarily affects",
    ],
  },
  B2: {
    text: "What invariants must this subsystem maintain?",
    category: "B",
    criteria: [
      "List 2+ properties that must always be true",
      "Explain consequences if invariant violated",
      "Specify how invariants are currently enforced (types, runtime checks, etc.)",
    ],
  },
  B3: {
    text: "What are the trust boundaries in this system?",
    category: "B",
    criteria: [
      "Identify what components trust each other vs. validate",
      "Explain where data is sanitized/validated",
      "Note where assumptions are made about caller behavior",
    ],
  },
  B4: {
    text: "What does each component own vs. borrow?",
    category: "B",
    criteria: [
      "Map out ownership relationships for key data structures",
      "Explain lifetime constraints",
      "Identify where ownership transfer happens",
    ],
  },
  B5: {
    text: "What is the single responsibility of each component?",
    category: "B",
    criteria: [
      "State primary purpose in one sentence per component",
      "Identify responsibilities that feel ambiguous or overlapping",
      "Explain where current design violates SRP",
    ],
  },
  B6: {
    text: "Where should cross-cutting concerns live?",
    category: "B",
    criteria: [
      "List cross-cutting concerns (logging, metrics, auth, etc.)",
      "Explain current strategy (middleware, wrapper, injection)",
      "Identify tensions with primary architectural patterns",
    ],
  },
  B7: {
    text: "What are the seams for testing/mocking?",
    category: "B",
    criteria: [
      "Identify where test doubles can be injected",
      "Explain what makes current design testable or not",
      "Note where dependencies are concrete vs. abstracted",
    ],
  },
  C1: {
    text: "What state needs to be shared?",
    category: "C",
    criteria: [
      "Enumerate specific data structures that multiple components access",
      "Explain why each piece of state must be shared",
      "Identify state that's currently shared but shouldn't be",
    ],
  },
  C2: {
    text: "Who mutates this state?",
    category: "C",
    criteria: [
      "List all writers for shared state",
      "Explain synchronization/coordination mechanism",
      "Identify race conditions or ambiguous ownership",
    ],
  },
  C3: {
    text: "What is the lifetime of this state?",
    category: "C",
    criteria: [
      "Specify when state is created and destroyed",
      "Explain what controls lifetime (scoped, reference-counted, manual)",
      "Identify potential leaks or premature drops",
    ],
  },
  C4: {
    text: "How does data flow between components?",
    category: "C",
    criteria: [
      "Diagram or describe primary data paths",
      "Specify mechanism (function args, channels, shared memory, events)",
      "Identify where flow is synchronous vs. asynchronous",
    ],
  },
  C5: {
    text: "What are the data dependencies?",
    category: "C",
    criteria: [
      "List what data component X needs from component Y",
      "Explain whether dependencies are compile-time or runtime",
      "Identify circular dependencies or tight coupling",
    ],
  },
  C6: {
    text: "What transformations happen to data in flight?",
    category: "C",
    criteria: [
      "Describe how data shape changes across boundaries",
      "Explain validation, serialization, or enrichment steps",
      "Identify where data is duplicated or cached",
    ],
  },
  C7: {
    text: "Where is the source of truth?",
    category: "C",
    criteria: [
      "Identify authoritative storage for each logical entity",
      "Explain what derived/cached state exists",
      "Note inconsistency risks and resolution strategies",
    ],
  },
  C8: {
    text: "What events or messages does this generate?",
    category: "C",
    criteria: [
      "List outbound notifications or events",
      "Explain whether events are ordered, reliable, or best-effort",
      "Identify event consumers and their guarantees",
    ],
  },
  D1: {
    text: "What tasks/threads/actors are involved?",
    category: "D",
    criteria: [
      "Enumerate concurrent execution contexts",
      "Explain what each task is responsible for",
      "Identify task spawning and termination points",
    ],
  },
  D2: {
    text: "How do these concurrent units communicate?",
    category: "D",
    criteria: [
      "Specify mechanisms (channels, shared state, message passing)",
      "Explain synchronization points",
      "Identify potential deadlocks or livelocks",
    ],
  },
  D3: {
    text: "What is the initialization order?",
    category: "D",
    criteria: [
      "Describe startup sequence for subsystems",
      "Explain dependencies that constrain ordering",
      "Identify initialization failure scenarios",
    ],
  },
  D4: {
    text: "What is the shutdown sequence?",
    category: "D",
    criteria: [
      "Describe graceful shutdown steps",
      "Explain how in-flight work is drained or canceled",
      "Identify resources that must be cleaned up",
    ],
  },
  D5: {
    text: "What happens under cancellation?",
    category: "D",
    criteria: [
      "Explain cancellation propagation mechanism",
      "Identify what state is left behind after cancel",
      "Note whether cancellation is graceful or abort",
    ],
  },
  D6: {
    text: "What ordering guarantees exist?",
    category: "D",
    criteria: [
      "Specify what events/operations are ordered relative to what",
      "Explain whether ordering is guaranteed by types or convention",
      "Identify where ordering violations could occur",
    ],
  },
  D7: {
    text: "What are the concurrency hazards?",
    category: "D",
    criteria: [
      "List specific race conditions or data races",
      "Explain potential for deadlock or starvation",
      "Note what safety mechanisms prevent these (types, locks, atomics)",
    ],
  },
  E1: {
    text: "What can go wrong?",
    category: "E",
    criteria: [
      "Enumerate 3+ failure modes",
      "Distinguish between expected errors and unexpected panics",
      "Explain likelihood and impact of each",
    ],
  },
  E2: {
    text: "How are errors propagated?",
    category: "E",
    criteria: [
      "Specify error types and Result/Option usage",
      "Explain whether errors cross boundaries (and how)",
      "Identify where errors are handled vs. logged vs. ignored",
    ],
  },
  E3: {
    text: "What observability exists?",
    category: "E",
    criteria: [
      "List current logging, metrics, or tracing",
      "Explain what information is captured at decision points",
      "Identify observability gaps for debugging this block",
    ],
  },
  E4: {
    text: "How would I debug this in production?",
    category: "E",
    criteria: [
      "Describe what information would be available",
      "Explain how you'd correlate events across components",
      "Identify what logs/metrics would reveal root cause",
    ],
  },
  E5: {
    text: "What are the recovery mechanisms?",
    category: "E",
    criteria: [
      "Explain how system recovers from errors",
      "Specify whether recovery is automatic, manual, or requires restart",
      "Identify unrecoverable failure modes",
    ],
  },
  E6: {
    text: "What are the monitoring/alerting requirements?",
    category: "E",
    criteria: [
      "Specify what metrics indicate health",
      "Explain what thresholds warrant alerts",
      "Identify SLIs/SLOs if applicable",
    ],
  },
  F1: {
    text: "What are the resource costs?",
    category: "F",
    criteria: [
      "Quantify memory, CPU, network, or I/O costs",
      "Explain whether costs are per-request, per-connection, or fixed",
      "Identify dominant resource consumption",
    ],
  },
  F2: {
    text: "What are the scalability bottlenecks?",
    category: "F",
    criteria: [
      "Identify what limits throughput or capacity",
      "Explain whether bottleneck is CPU, memory, I/O, or coordination",
      "Note what changes under increased load",
    ],
  },
  F3: {
    text: "What are the latency requirements?",
    category: "F",
    criteria: [
      "Specify latency budgets for critical paths",
      "Explain whether latency is p50, p99, or worst-case concern",
      "Identify operations that dominate latency",
    ],
  },
  F4: {
    text: "What gets allocated and when?",
    category: "F",
    criteria: [
      "List heap allocations in hot paths",
      "Explain whether allocations can be amortized or pooled",
      "Identify allocation patterns that could fragment or leak",
    ],
  },
  F5: {
    text: "What are the caching strategies?",
    category: "F",
    criteria: [
      "Explain what is cached and for how long",
      "Specify cache invalidation or TTL policies",
      "Identify cache coherency concerns",
    ],
  },
  F6: {
    text: "What are the batching opportunities?",
    category: "F",
    criteria: [
      "Identify operations that could be batched",
      "Explain tradeoffs between latency and throughput",
      "Note whether batching complicates other concerns (error handling, ordering)",
    ],
  },
  F7: {
    text: "Where are the performance cliffs?",
    category: "F",
    criteria: [
      "Identify conditions where performance degrades non-linearly",
      "Explain pathological cases (e.g., n² behavior, lock contention)",
      "Note whether cliffs are avoidable or inherent",
    ],
  },
  G1: {
    text: "How would I unit test this?",
    category: "G",
    criteria: [
      "Describe what can be tested in isolation",
      "Explain test doubles needed (mocks, fakes, stubs)",
      "Identify parts that resist unit testing",
    ],
  },
  G2: {
    text: "What integration tests are needed?",
    category: "G",
    criteria: [
      "Specify what component interactions to test",
      "Explain test environment setup requirements",
      "Identify non-determinism or flakiness risks",
    ],
  },
  G3: {
    text: "What properties should hold?",
    category: "G",
    criteria: [
      "List invariants that should be tested",
      "Explain whether properties can be property-tested or need examples",
      "Identify properties that are hard to verify",
    ],
  },
  G4: {
    text: "What are the test fixtures/scaffolding?",
    category: "G",
    criteria: [
      "Describe test data or mock services needed",
      "Explain whether fixtures are simple or complex",
      "Identify fixture maintenance burden",
    ],
  },
  G5: {
    text: "How do I reproduce failure scenarios?",
    category: "G",
    criteria: [
      "Explain how to inject errors or edge cases",
      "Specify whether failure modes are reliably reproducible",
      "Identify chaos/fuzz testing opportunities",
    ],
  },
  G6: {
    text: "What can't be tested?",
    category: "G",
    criteria: [
      "Identify untestable aspects (timing, external dependencies)",
      "Explain mitigation strategies (manual testing, monitoring)",
      "Note technical debt from poor testability",
    ],
  },
  H1: {
    text: "What are the alternative designs?",
    category: "H",
    criteria: [
      "Enumerate 2+ substantially different approaches",
      "Explain how each alternative differs structurally",
      "Note which alternatives you've already ruled out",
    ],
  },
  H2: {
    text: "What does each alternative optimize for?",
    category: "H",
    criteria: [
      "Specify what each design prioritizes (simplicity, performance, flexibility)",
      "Explain what each sacrifices",
      "Identify which goals are most important",
    ],
  },
  H3: {
    text: "What are the concrete tradeoffs?",
    category: "H",
    criteria: [
      "List 3+ specific tensions (e.g., coupling vs. overhead)",
      "Explain why you can't have both",
      "Quantify tradeoffs where possible",
    ],
  },
  H4: {
    text: "What prior art exists?",
    category: "H",
    criteria: [
      "Reference 1+ similar systems or patterns",
      "Explain how their context differs from yours",
      "Note what you can borrow vs. must adapt",
    ],
  },
  H5: {
    text: "What would I do with unlimited resources/time?",
    category: "H",
    criteria: [
      "Describe idealized solution",
      "Explain constraints preventing that approach",
      "Identify what you're settling for and why",
    ],
  },
  H6: {
    text: "What future requirements might invalidate this?",
    category: "H",
    criteria: [
      "List 2+ scenarios where design wouldn't scale or adapt",
      "Explain how likely these scenarios are",
      "Note what refactoring would be needed",
    ],
  },
  H7: {
    text: "What would you tell yourself 6 months from now?",
    category: "H",
    criteria: [
      "Document key design rationale",
      "Explain non-obvious decisions",
      "Warn about potential pitfalls or misunderstandings",
    ],
  },
}

const shuffleArray = (array) => {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

const selectRandomQuestions = () => {
  // Always include category H and select 2 more random categories (total 3)
  const allCategories = ["A", "B", "C", "D", "E", "F", "G"]
  const shuffledCategories = shuffleArray(allCategories)
  const selectedCategories = ["H", ...shuffledCategories.slice(0, 2)]

  // Get questions by category
  const questionsByCategory = {}
  Object.entries(ALL_QUESTIONS).forEach(([id, question]) => {
    if (!questionsByCategory[question.category]) {
      questionsByCategory[question.category] = []
    }
    questionsByCategory[question.category].push({ id, ...question })
  })

  // Select random questions from each selected category
  // Need 8 total questions, with at least 1 from H
  const selectedQuestions = []

  // First, guarantee 1 from H
  const hQuestions = shuffleArray(questionsByCategory["H"])
  selectedQuestions.push(hQuestions[0])

  // Then distribute remaining 7 questions across the 3 categories
  const questionsPerCategory = Math.floor(7 / 3) // 2 questions per category
  const remainder = 7 % 3 // 1 extra question

  selectedCategories.forEach((cat, idx) => {
    const categoryQuestions = shuffleArray(questionsByCategory[cat])
    const count = questionsPerCategory + (idx < remainder ? 1 : 0)
    const startIdx = cat === "H" ? 1 : 0 // Skip first H question since we already added it

    for (
      let i = startIdx;
      i < startIdx + count && i < categoryQuestions.length;
      i++
    ) {
      if (selectedQuestions.length < 8) {
        selectedQuestions.push(categoryQuestions[i])
      }
    }
  })

  // Shuffle the final order
  return shuffleArray(selectedQuestions)
}

export const TechnicalBlockAssessment = () => {
  const [stage, setStage] = useState("setup")
  const [totalTime, setTotalTime] = useState(60)
  const [stepTime, setStepTime] = useState(5)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [stepTimeRemaining, setStepTimeRemaining] = useState(0)
  const [score, setScore] = useState(0)

  // Generate questions on mount
  useEffect(() => {
    setQuestions(selectRandomQuestions())
  }, [])

  useEffect(() => {
    if (stage === "assessment" && timeRemaining > 0) {
      const timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            setStage("complete")
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [stage, timeRemaining])

  useEffect(() => {
    if (stage === "assessment" && stepTimeRemaining > 0) {
      const timer = setInterval(() => {
        setStepTimeRemaining((prev) => {
          if (prev <= 1) return 0
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [stage, stepTimeRemaining])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const startAssessment = () => {
    setTimeRemaining(totalTime * 60)
    setStepTimeRemaining(stepTime * 60)
    setStage("assessment")
  }

  const handleAnswer = (data) => {
    setAnswers((prev) => ({
      ...prev,
      [questions[currentQuestion].id]: data,
    }))
  }

  const nextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion((prev) => prev + 1)
      setStepTimeRemaining(stepTime * 60)
    } else {
      setStage("complete")
      calculateScore()
    }
  }

  const calculateScore = () => {
    let totalScore = 0
    let count = 0
    Object.values(answers).forEach((answer) => {
      if (answer.score !== undefined) {
        totalScore += answer.score
        count++
      }
    })
    setScore(count > 0 ? totalScore / count : 0)
  }

  if (stage === "setup") {
    const categoryCounts = {}
    questions.forEach((q) => {
      categoryCounts[q.category] = (categoryCounts[q.category] || 0) + 1
    })

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-3 mb-4">
              <Target className="w-12 h-12 text-cyan-400" />
              <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                Technical Block Assessment
              </h1>
            </div>
            <p className="text-gray-300 text-lg">
              Configure your livestream assessment
            </p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-8 border border-purple-500/30 shadow-2xl">
            <div className="space-y-8">
              <div className="bg-slate-900/50 rounded-xl p-6 border border-cyan-500/30">
                <h3 className="text-cyan-400 font-semibold mb-4 text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Randomly Selected Questions ({questions.length} total)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(categoryCounts).map(([cat, count]) => (
                    <div
                      key={cat}
                      className={`bg-gradient-to-r ${CATEGORIES[cat].color} p-3 rounded-lg`}
                    >
                      <div className="text-white font-bold">Category {cat}</div>
                      <div className="text-white/90 text-sm">
                        {count} questions
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setQuestions(selectRandomQuestions())
                    setAnswers({})
                    setCurrentQuestion(0)
                  }}
                  className="mt-4 w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition-colors"
                >
                  🎲 Reshuffle Questions
                </button>
              </div>

              <div>
                <label className="block text-cyan-400 font-semibold mb-3 text-lg">
                  Total Assessment Time (minutes)
                </label>
                <input
                  type="number"
                  value={totalTime}
                  onChange={(e) => setTotalTime(parseInt(e.target.value))}
                  className="w-full bg-slate-700 text-white px-6 py-4 rounded-xl border-2 border-purple-500/50 focus:border-cyan-400 focus:outline-none text-2xl font-bold"
                  min="1"
                  max="180"
                />
              </div>

              <div>
                <label className="block text-pink-400 font-semibold mb-3 text-lg">
                  Time Per Question (minutes)
                </label>
                <input
                  type="number"
                  value={stepTime}
                  onChange={(e) => setStepTime(parseInt(e.target.value))}
                  className="w-full bg-slate-700 text-white px-6 py-4 rounded-xl border-2 border-purple-500/50 focus:border-pink-400 focus:outline-none text-2xl font-bold"
                  min="1"
                  max="30"
                />
              </div>

              <button
                onClick={startAssessment}
                className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 text-white py-6 rounded-xl font-bold text-2xl hover:shadow-2xl hover:scale-105 transition-all flex items-center justify-center gap-3"
              >
                <Zap className="w-8 h-8" />
                Start Assessment
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (stage === "assessment") {
    const currentQ = questions[currentQuestion]
    const progress = ((currentQuestion + 1) / questions.length) * 100

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
        <div className="max-w-5xl mx-auto">
          {/* Header with timers */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-2">
                <Clock className="w-8 h-8 text-white" />
                <span className="text-white font-semibold text-lg">
                  Total Time
                </span>
              </div>
              <div className="text-5xl font-bold text-white">
                {formatTime(timeRemaining)}
              </div>
            </div>
            <div className="bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-2">
                <AlertCircle className="w-8 h-8 text-white" />
                <span className="text-white font-semibold text-lg">
                  Question Time
                </span>
              </div>
              <div className="text-5xl font-bold text-white">
                {formatTime(stepTimeRemaining)}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex justify-between text-gray-300 mb-2">
              <span className="font-semibold">
                Question {currentQuestion + 1} of {questions.length}
              </span>
              <span className="font-semibold">
                {Math.round(progress)}% Complete
              </span>
            </div>
            <div className="h-4 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-purple-400 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Question card */}
          <div
            className={`bg-gradient-to-r ${CATEGORIES[currentQ.category].color} p-1 rounded-2xl shadow-2xl mb-8`}
          >
            <div className="bg-slate-900 rounded-xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <span className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-lg font-bold text-white">
                  {currentQ.id}
                </span>
                <span className="text-gray-400">
                  Category {currentQ.category}:{" "}
                  {CATEGORIES[currentQ.category].name}
                </span>
              </div>

              <h2 className="text-3xl font-bold text-white mb-6">
                {currentQ.text}
              </h2>

              <div className="bg-slate-800/50 rounded-xl p-6 mb-6">
                <h3 className="text-cyan-400 font-semibold mb-3 flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Satisfactory Answer Must Include:
                </h3>
                <ul className="space-y-2">
                  {currentQ.criteria.map((criterion, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-gray-300"
                    >
                      <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                      <span>{criterion}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Answer input */}
              <div>
                <label className="block text-white font-semibold mb-3">
                  Your Answer:
                </label>
                <textarea
                  value={answers[currentQ.id]?.text || ""}
                  onChange={(e) =>
                    handleAnswer({
                      ...answers[currentQ.id],
                      text: e.target.value,
                    })
                  }
                  className="w-full bg-slate-800 text-white px-6 py-4 rounded-xl border-2 border-purple-500/50 focus:border-cyan-400 focus:outline-none min-h-[200px] text-lg"
                  placeholder="Type your answer here..."
                />
              </div>

              {/* Evidence checkboxes */}
              <div className="grid grid-cols-2 gap-4 mt-6">
                <label className="flex items-center gap-3 bg-slate-800 p-4 rounded-xl cursor-pointer hover:bg-slate-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={answers[currentQ.id]?.showedCode || false}
                    onChange={(e) =>
                      handleAnswer({
                        ...answers[currentQ.id],
                        showedCode: e.target.checked,
                      })
                    }
                    className="w-6 h-6"
                  />
                  <Code className="w-6 h-6 text-cyan-400" />
                  <span className="text-white font-semibold">
                    Showed Live Code
                  </span>
                </label>
                <label className="flex items-center gap-3 bg-slate-800 p-4 rounded-xl cursor-pointer hover:bg-slate-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={answers[currentQ.id]?.didResearch || false}
                    onChange={(e) =>
                      handleAnswer({
                        ...answers[currentQ.id],
                        didResearch: e.target.checked,
                      })
                    }
                    className="w-6 h-6"
                  />
                  <FileText className="w-6 h-6 text-pink-400" />
                  <span className="text-white font-semibold">Did Research</span>
                </label>
              </div>

              {/* Score selection */}
              <div className="mt-6">
                <label className="block text-white font-semibold mb-3">
                  Self-Assessment Score:
                </label>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    {
                      score: 0,
                      label: "Unsatisfactory",
                      desc: "Question skipped or not addressed",
                    },
                    { score: 1, label: "Weak", desc: "Vague or generic" },
                    {
                      score: 2,
                      label: "Satisfactory",
                      desc: "Reasonably specific",
                    },
                    {
                      score: 3,
                      label: "Excellent",
                      desc: "Concrete and backed by evidence",
                    },
                  ].map(({ score, label, desc }) => (
                    <button
                      key={score}
                      onClick={() =>
                        handleAnswer({ ...answers[currentQ.id], score })
                      }
                      className={`p-4 rounded-xl font-bold transition-all ${
                        answers[currentQ.id]?.score === score
                          ? "bg-gradient-to-r from-cyan-500 to-purple-500 text-white scale-105 shadow-xl"
                          : "bg-slate-800 text-gray-400 hover:bg-slate-700"
                      }`}
                      title={desc}
                    >
                      <div className="text-2xl mb-1">{score}</div>
                      <div className="text-sm">{label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={nextQuestion}
            className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white py-6 rounded-xl font-bold text-2xl hover:shadow-2xl hover:scale-105 transition-all flex items-center justify-center gap-3"
          >
            {currentQuestion < questions.length - 1
              ? "Next Question"
              : "Complete Assessment"}
            <Zap className="w-8 h-8" />
          </button>
        </div>
      </div>
    )
  }

  const categoriesAnswered = new Set(
    Object.keys(answers)
      .map((qId) => ALL_QUESTIONS[qId]?.category)
      .filter(Boolean)
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8 flex items-center justify-center">
      <div className="max-w-3xl mx-auto text-center">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-12 border border-purple-500/30 shadow-2xl">
          <CheckCircle className="w-24 h-24 text-green-400 mx-auto mb-6" />
          <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-4">
            Assessment Complete!
          </h1>
          <div className="text-6xl font-bold text-white mb-4">
            Score: {score.toFixed(1)}/3.0
          </div>
          <div
            className={`text-lg mb-8 ${score >= 2.0 ? "text-green-400" : "text-yellow-400"}`}
          >
            {score >= 2.0
              ? "✅ Passes minimum requirements"
              : "⚠️ Below minimum threshold (2.0)"}
          </div>
          <div className="grid grid-cols-3 gap-6 mb-8">
            <div className="bg-slate-900 rounded-xl p-6">
              <div className="text-cyan-400 text-lg mb-2">
                Questions Answered
              </div>
              <div className="text-4xl font-bold text-white">
                {Object.keys(answers).length}
              </div>
              <div
                className={`text-sm mt-2 ${Object.keys(answers).length >= 8 ? "text-green-400" : "text-yellow-400"}`}
              >
                {Object.keys(answers).length >= 8 ? "✅ Min: 8" : `⚠️ Min: 8`}
              </div>
            </div>
            <div className="bg-slate-900 rounded-xl p-6">
              <div className="text-pink-400 text-lg mb-2">
                Categories Covered
              </div>
              <div className="text-4xl font-bold text-white">
                {categoriesAnswered.size}
              </div>
              <div
                className={`text-sm mt-2 ${categoriesAnswered.size >= 3 ? "text-green-400" : "text-yellow-400"}`}
              >
                {categoriesAnswered.size >= 3 ? "✅ Min: 3" : `⚠️ Min: 3`}
              </div>
            </div>
            <div className="bg-slate-900 rounded-xl p-6">
              <div className="text-orange-400 text-lg mb-2">Category H</div>
              <div className="text-4xl font-bold text-white">
                {categoriesAnswered.has("H") ? "✓" : "✗"}
              </div>
              <div
                className={`text-sm mt-2 ${categoriesAnswered.has("H") ? "text-green-400" : "text-red-400"}`}
              >
                {categoriesAnswered.has("H") ? "✅ Required" : "❌ Required"}
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-xl p-6 mb-8">
            <h3 className="text-white font-semibold mb-4">
              Question Breakdown
            </h3>
            <div className="space-y-2">
              {questions.map((q) => {
                const answer = answers[q.id]
                const hasAnswer = answer?.score !== undefined
                return (
                  <div
                    key={q.id}
                    className="flex items-center justify-between bg-slate-800 p-3 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-1 bg-gradient-to-r ${CATEGORIES[q.category].color} rounded font-bold text-white text-sm`}
                      >
                        {q.id}
                      </span>
                      <span className="text-gray-300 text-sm">
                        {q.text.substring(0, 50)}...
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {answer?.showedCode && (
                        <Code className="w-4 h-4 text-cyan-400" />
                      )}
                      {answer?.didResearch && (
                        <FileText className="w-4 h-4 text-pink-400" />
                      )}
                      <span
                        className={`font-bold ${hasAnswer ? "text-white" : "text-gray-500"}`}
                      >
                        {hasAnswer ? `${answer.score}/3` : "N/A"}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <button
            onClick={() => {
              setStage("setup")
              setCurrentQuestion(0)
              setAnswers({})
              setQuestions(selectRandomQuestions())
            }}
            className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white px-8 py-4 rounded-xl font-bold text-xl hover:shadow-2xl hover:scale-105 transition-all"
          >
            Start New Assessment
          </button>
        </div>
      </div>
    </div>
  )
}
