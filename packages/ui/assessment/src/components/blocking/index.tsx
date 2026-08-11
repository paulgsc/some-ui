import type { FC, JSX } from "react"
import { useEffect, useRef, useState } from "react"
import { CheckCircle, Code, FileText, Zap } from "lucide-react"

export type CategoryKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H"

type Answer = {
  text?: string
  showedCode?: boolean
  didResearch?: boolean
}

export type Category = {
  id: CategoryKey
  name: string
  color: string
  minRequired: number // Used for selection logic
}

export type Question = {
  id: string
  text: string
  category: CategoryKey
  criteria: Array<string>
}

// --- Data ---

export const CATEGORIES: Record<CategoryKey, Category> = {
  A: {
    id: "A",
    name: "Memory Layout & Representation",
    color: "from-purple-500 to-pink-500",
    minRequired: 1,
  },
  B: {
    id: "B",
    name: "Type System & Safety Invariants",
    color: "from-blue-500 to-cyan-500",
    minRequired: 1,
  },
  C: {
    id: "C",
    name: "Performance & Optimization",
    color: "from-green-500 to-emerald-500",
    minRequired: 1,
  },
  D: {
    id: "D",
    name: "Ownership, Lifetimes & Drop",
    color: "from-yellow-500 to-orange-500",
    minRequired: 1,
  },
  E: {
    id: "E",
    name: "API Design & Ergonomics",
    color: "from-red-500 to-rose-500",
    minRequired: 0,
  },
  F: {
    id: "F",
    name: "Unsafe & Correctness",
    color: "from-indigo-500 to-purple-500",
    minRequired: 1,
  },
  G: {
    id: "G",
    name: "Trait Implementations",
    color: "from-teal-500 to-green-500",
    minRequired: 0,
  },
  H: {
    id: "H",
    name: "Tradeoffs & Design Decisions",
    color: "from-orange-500 to-red-500",
    minRequired: 1,
  },
}

export const ALL_QUESTIONS: Record<string, Question> = {
  // A: Memory Layout
  A1: {
    id: "A1",
    category: "A",
    text: "How does SmallVec achieve inline storage without dynamic dispatch?",
    criteria: [
      "Explain the union-like enum representation",
      "Describe how size is encoded alongside the discriminant",
      "Explain why this is zero-cost compared to a hand-written enum",
    ],
  },
  A2: {
    id: "A2",
    category: "A",
    text: "What is the memory layout difference between inline and heap storage states?",
    criteria: [
      "Diagram or describe the bit-level layout",
      "Explain alignment requirements",
      "Quantify memory overhead",
    ],
  },
  A3: {
    id: "A3",
    category: "A",
    text: "Why is the inline array size a const generic parameter N?",
    criteria: [
      "Compile-time vs runtime sizing",
      "Effect on monomorphization",
      "Vec compatibility",
    ],
  },
  A4: {
    id: "A4",
    category: "A",
    text: "How does SmallVec determine when to spill to heap?",
    criteria: [
      "Identify threshold logic",
      "Inline data handling during spill",
      "Shrink-back logic",
    ],
  },
  A5: {
    id: "A5",
    category: "A",
    text: "What representation enables SmallVec to be the same size as Vec for N=0?",
    criteria: [
      "Niche optimization",
      "Compare footprint to Vec<T>",
      "Identify unavoidable overhead",
    ],
  },
  A6: {
    id: "A6",
    category: "A",
    text: "How does capacity tracking differ between inline and heap modes?",
    criteria: [
      "Storage location per variant",
      "Effect on reserve()",
      "Edge cases",
    ],
  },

  // B: Type System
  B1: {
    id: "B1",
    category: "B",
    text: "What invariants must hold for SmallVec to be memory-safe?",
    criteria: [
      "Length/Capacity/Discriminant consistency",
      "Violation consequences",
      "Types vs Unsafe enforcement",
    ],
  },
  B2: {
    id: "B2",
    category: "B",
    text: "Why can't SmallVec<T, N> be Copy even when T is Copy?",
    criteria: [
      "Heap allocation ownership",
      "Double-free risk",
      "Alternatives like ArrayVec",
    ],
  },
  B3: {
    id: "B3",
    category: "B",
    text: "How does SmallVec handle uninitialized memory?",
    criteria: [
      "MaybeUninit usage",
      "Initialization order",
      "Partial initialization safety",
    ],
  },
  B4: {
    id: "B4",
    category: "B",
    text: "What Rust language features enable SmallVec's zero-cost abstraction?",
    criteria: [
      "Const generics/Enums",
      "LLVM match optimization",
      "Non-zero-cost areas",
    ],
  },
  B5: {
    id: "B5",
    category: "B",
    text: "How does SmallVec maintain Send/Sync bounds?",
    criteria: [
      "Send/Sync conditions",
      "Interaction with T",
      "Raw pointer/Union handling",
    ],
  },
  B6: {
    id: "B6",
    category: "B",
    text: "What prevents aliasing violations in SmallVec's implementation?",
    criteria: [
      "Reference rules per variant",
      "Mutable access control",
      "Raw pointer safety justification",
    ],
  },
  B7: {
    id: "B7",
    category: "B",
    text: "How does SmallVec handle ZSTs (zero-sized types)?",
    criteria: [
      "Inline storage utility for ZST",
      "Special-case logic",
      "Allocation interaction",
    ],
  },

  // C: Performance
  C1: {
    id: "C1",
    category: "C",
    text: "What are the cache locality benefits of inline storage?",
    criteria: [
      "Cache line usage for N",
      "Access pattern impact",
      "Scenarios where advantage is lost",
    ],
  },
  C2: {
    id: "C2",
    category: "C",
    text: "What is the allocation profile of SmallVec vs Vec for different workloads?",
    criteria: [
      "Allocation frequency",
      "Heap fragmentation",
      "Worse-performing workloads",
    ],
  },
  C3: {
    id: "C3",
    category: "C",
    text: "How does SmallVec's growth strategy differ from Vec's?",
    criteria: [
      "Reallocation policy",
      "Exponential growth matching",
      "Transition handling",
    ],
  },
  C4: {
    id: "C4",
    category: "C",
    text: "What are the branching costs of inline vs heap dispatch?",
    criteria: [
      "Discriminant check locations",
      "Branch predictability",
      "LLVM branch elimination",
    ],
  },
  C5: {
    id: "C5",
    category: "C",
    text: "When does SmallVec's overhead exceed its benefits?",
    criteria: [
      "Break-even points for N",
      "Spill waste",
      "Monomorphization code bloat",
    ],
  },
  C6: {
    id: "C6",
    category: "C",
    text: "How do copies and moves differ between inline and heap states?",
    criteria: [
      "Clone data handling",
      "Move semantics",
      "Performance characteristics",
    ],
  },
  C7: {
    id: "C7",
    category: "C",
    text: "What compiler optimizations are critical for SmallVec performance?",
    criteria: [
      "Inlining/DCE importance",
      "Optimization-less degradation",
      "Debug vs Release differences",
    ],
  },

  // D: Ownership
  D1: {
    id: "D1",
    category: "D",
    text: "What happens during SmallVec's Drop implementation?",
    criteria: [
      "Drop order per variant",
      "Iteration direction",
      "Panic handling during drop",
    ],
  },
  D2: {
    id: "D2",
    category: "D",
    text: "How does SmallVec handle partial drops after panic?",
    criteria: [
      "Manual tracking mechanisms",
      "State after panic",
      "Vec comparison",
    ],
  },
  D3: {
    id: "D3",
    category: "D",
    text: "Why can't SmallVec implement DerefMove (if it existed)?",
    criteria: [
      "Ownership transfer issues",
      "Inner data movement breakage",
      "Pin relationship",
    ],
  },
  D4: {
    id: "D4",
    category: "D",
    text: "How do lifetimes constrain SmallVec's borrowing API?",
    criteria: [
      "Iterator lifetime relationships",
      "Split_at borrowing rules",
      "Elision impact",
    ],
  },
  D5: {
    id: "D5",
    category: "D",
    text: "What prevents use-after-free when transitioning inline->heap?",
    criteria: [
      "Old data invalidation",
      "Existing reference compile errors",
      "Unsafe violation potential",
    ],
  },
  D6: {
    id: "D6",
    category: "D",
    text: "How does SmallVec handle ownership in drain and splice operations?",
    criteria: [
      "Drained element ownership",
      "Gap-filling strategy",
      "Panic safety",
    ],
  },

  // E: API Design
  E1: {
    id: "E1",
    category: "E",
    text: "Why does SmallVec not implement Deref<Target=[T]>?",
    criteria: [
      "Crate philosophy differences",
      "API misuse implications",
      "as_slice vs Coercion",
    ],
  },
  E2: {
    id: "E2",
    category: "E",
    text: "How does SmallVec's API balance Vec compatibility with specialized needs?",
    criteria: [
      "Missing Vec methods",
      "SmallVec extensions",
      "Signature differences",
    ],
  },
  E3: {
    id: "E3",
    category: "E",
    text: "What are the footguns in SmallVec's API?",
    criteria: [
      "Non-obvious behaviors",
      "Common mistakes",
      "Missing guardrails",
    ],
  },
  E4: {
    id: "E4",
    category: "E",
    text: "How does SmallVec support generic code that works with any collection?",
    criteria: [
      "Abstraction traits",
      "Comparison to Vec/Slice",
      "Const generic friction",
    ],
  },
  E5: {
    id: "E5",
    category: "E",
    text: "Why might SmallVec's insert and remove be slower than expected?",
    criteria: [
      "Shifting overhead",
      "Heap variant issues",
      "Alternative high-perf APIs",
    ],
  },

  // F: Unsafe
  F1: {
    id: "F1",
    category: "F",
    text: "Where does SmallVec use unsafe code and why is each instance necessary?",
    criteria: [
      "Unsafe block enumeration",
      "Safe abstraction enabled",
      "Safe code limitations",
    ],
  },
  F2: {
    id: "F2",
    category: "F",
    text: "How does SmallVec's unsafe code maintain union safety?",
    criteria: [
      "Discriminant consistency",
      "Inactive variant protection",
      "Manual Drop requirements",
    ],
  },
  F3: {
    id: "F3",
    category: "F",
    text: "What aliasing rules must unsafe code in SmallVec respect?",
    criteria: [
      "Raw pointer provenance",
      "Reference transmutation",
      "Stacked Borrows compliance",
    ],
  },
  F4: {
    id: "F4",
    category: "F",
    text: "How does SmallVec ensure uninitialized memory is never read?",
    criteria: [
      "Length tracking/Init order",
      "ptr::write vs assignment",
      "assume_init unsoundness",
    ],
  },
  F5: {
    id: "F5",
    category: "F",
    text: "What Miri or sanitizer violations might naive implementations trigger?",
    criteria: [
      "UB patterns to avoid",
      "SmallVec avoidance strategy",
      "Unsafe testing strategy",
    ],
  },
  F6: {
    id: "F6",
    category: "F",
    text: "How does SmallVec handle alignment requirements in unsafe code?",
    criteria: [
      "Inline vs Heap alignment",
      "repr attributes/padding",
      "Platform concerns",
    ],
  },
  F7: {
    id: "F7",
    category: "F",
    text: "What are the soundness holes or historical bugs in SmallVec?",
    criteria: ["Known CVEs/Issues", "Invariant violations", "Fix descriptions"],
  },

  // G: Traits
  G1: {
    id: "G1",
    category: "G",
    text: "How does SmallVec implement Iterator via IntoIter?",
    criteria: ["IntoIter internal state", "Variant handling", "Drop timing"],
  },
  G2: {
    id: "G2",
    category: "G",
    text: "Why does SmallVec implement FromIterator differently than Vec?",
    criteria: [
      "Allocation strategy",
      "TrustedLen specialization",
      "Divergence from Vec",
    ],
  },
  G3: {
    id: "G3",
    category: "G",
    text: "How does SmallVec's Index and IndexMut work across variants?",
    criteria: ["Bounds checking", "Panic behavior", "Zero-cost verification"],
  },
  G4: {
    id: "G4",
    category: "G",
    text: "What makes SmallVec's Clone implementation non-trivial?",
    criteria: [
      "Variant cloning logic",
      "Heap allocation during clone",
      "Deep vs Shallow",
    ],
  },
  G5: {
    id: "G5",
    category: "G",
    text: "How does SmallVec implement PartialEq and what are the gotchas?",
    criteria: [
      "Cross-boundary logic",
      "Capacity interaction",
      "T: PartialEq bounds",
    ],
  },
  G6: {
    id: "G6",
    category: "G",
    text: "Why might SmallVec not implement certain standard traits?",
    criteria: [
      "Missing traits (BorrowMut, etc)",
      "Design reasons",
      "Intentional gaps",
    ],
  },

  // H: Tradeoffs
  H1: {
    id: "H1",
    category: "H",
    text: "What are the alternative small-vector designs and how do they differ?",
    criteria: [
      "SmallVec vs ArrayVec/TinyVec",
      "Representation tradeoffs",
      "Design goals",
    ],
  },
  H2: {
    id: "H2",
    category: "H",
    text: "Why use an enum representation instead of pointer tagging?",
    criteria: [
      "Pointer tagging benefits",
      "Portability concerns",
      "Space/Time tradeoffs",
    ],
  },
  H3: {
    id: "H3",
    category: "H",
    text: "What does SmallVec sacrifice compared to Vec?",
    criteria: [
      "Missing optimizations",
      "Sacrifice necessity",
      "Recovery paths",
    ],
  },
  H4: {
    id: "H4",
    category: "H",
    text: "When should you choose SmallVec over Vec or array?",
    criteria: [
      "Access patterns/Allocation needs",
      "Profiling strategy",
      "Incorrect use-cases",
    ],
  },
  H5: {
    id: "H5",
    category: "H",
    text: "How does const generic N constrain API evolution?",
    criteria: [
      "Breaking vs Non-breaking N",
      "Generic compatibility",
      "Future feature limitations",
    ],
  },
  H6: {
    id: "H6",
    category: "H",
    text: "What would a SmallVec with runtime-configurable inline size look like?",
    criteria: [
      "Representation changes",
      "Performance implications",
      "Design rejection reasons",
    ],
  },
  H7: {
    id: "H7",
    category: "H",
    text: "How do panic safety guarantees differ between SmallVec and Vec?",
    criteria: [
      "Weak guarantee locations",
      "Implementation complexity",
      "Real-world impact",
    ],
  },
  H8: {
    id: "H8",
    category: "H",
    text: "What compile-time vs runtime tradeoffs exist in SmallVec?",
    criteria: [
      "Monomorphization decisions",
      "Code bloat",
      "Runtime cost acceptance",
    ],
  },
  H9: {
    id: "H9",
    category: "H",
    text: "How would you extend SmallVec for your specific use case?",
    criteria: [
      "Specific optimizations",
      "Implementation challenges",
      "Upstream justification",
    ],
  },
  H10: {
    id: "H10",
    category: "H",
    text: "What future Rust language features would simplify SmallVec?",
    criteria: [
      "Language proposals",
      "API/Impl improvements",
      "Breaking potential",
    ],
  },
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const shuffle = <T,>(arr: Array<T>): Array<T> =>
  [...arr].sort(() => Math.random() - 0.5)

const formatTime = (s: number): string => {
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

// ============================================================================
// ASSESSMENT LOGIC HOOK
// ============================================================================

type UseAssessmentLogicProps = {
  totalMins: number
  perQuestionMins: number
  qPerCategory: number
  isConcentrated: boolean
}

const useAssessmentLogic = ({
  totalMins,
  perQuestionMins,
  qPerCategory,
  isConcentrated,
}: UseAssessmentLogicProps): {
  stage: "setup" | "assessment" | "complete"
  setStage: (stage: "setup" | "assessment" | "complete") => void
  questions: Array<Question>
  currentIdx: number
  answers: Record<string, Answer>
  totalSecsLeft: number
  stepSecsLeft: number
  startAssessment: () => void
  handleUpdateAnswer: (data: Partial<Answer>) => void
  nextQuestion: () => void
} => {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [stage, setStage] = useState<"setup" | "assessment" | "complete">(
    "setup"
  )
  const [questions, setQuestions] = useState<Array<Question>>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [totalSecsLeft, setTotalSecsLeft] = useState(0)
  const [stepSecsLeft, setStepSecsLeft] = useState(0)

  const generateAssessmentPool = (): void => {
    const pool: Array<Question> = []
    const groupedQuestions: Record<string, Array<Question>> = {}

    Object.values(ALL_QUESTIONS).forEach((q) => {
      groupedQuestions[q.category] ??= []
      groupedQuestions[q.category]!.push(q)
    })

    const requiredCats = Object.values(CATEGORIES).filter(
      (c) => c.minRequired > 0
    )
    requiredCats.forEach((cat) => {
      const available = shuffle([...(groupedQuestions[cat.id] ?? [])])
      pool.push(...available.slice(0, qPerCategory))
    })

    if (isConcentrated) {
      setQuestions(pool.sort((a, b) => a.category.localeCompare(b.category)))
    } else {
      setQuestions(shuffle(pool))
    }
  }

  useEffect(() => {
    if (stage === "assessment") {
      timerRef.current = setInterval(() => {
        setTotalSecsLeft((prev) => {
          if (prev <= 1) {
            setStage("complete")
            return 0
          }
          return prev - 1
        })
        setStepSecsLeft((prev) => (prev > 0 ? prev - 1 : 0))
      }, 1000)
    }
    return (): void => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [stage])

  const startAssessment = (): void => {
    generateAssessmentPool()
    setTotalSecsLeft(totalMins * 60)
    setStepSecsLeft(perQuestionMins * 60)
    setAnswers({})
    setCurrentIdx(0)
    setStage("assessment")
  }

  const handleUpdateAnswer = (data: Partial<Answer>): void => {
    const qId = questions[currentIdx]?.id
    if (!qId) return
    setAnswers((prev) => ({
      ...prev,
      [qId]: { ...prev[qId], ...data },
    }))
  }

  const nextQuestion = (): void => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx((prev) => prev + 1)
      setStepSecsLeft(perQuestionMins * 60)
    } else {
      setStage("complete")
    }
  }

  return {
    stage,
    setStage,
    questions,
    currentIdx,
    answers,
    totalSecsLeft,
    stepSecsLeft,
    startAssessment,
    handleUpdateAnswer,
    nextQuestion,
  }
}

// ============================================================================
// SETUP STAGE COMPONENT
// ============================================================================

type SetupStageProps = {
  qPerCategory: number
  setQPerCategory: (n: number) => void
  perQuestionMins: number
  setPerQuestionMins: (n: number) => void
  isConcentrated: boolean
  setIsConcentrated: (b: boolean) => void
  onStart: () => void
}

const SetupStage: FC<SetupStageProps> = ({
  qPerCategory,
  setQPerCategory,
  perQuestionMins,
  setPerQuestionMins,
  isConcentrated,
  setIsConcentrated,
  onStart,
}) => (
  <div className="absolute inset-0 bg-background text-foreground flex items-center justify-center overflow-hidden">
    <div className="w-full max-w-2xl bg-card text-card-foreground p-6 rounded-3xl border border-border shadow-2xl mx-4">
      <h1 className="text-3xl font-bold mb-8 bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
        Assessment Configuration
      </h1>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label
              htmlFor="questions-per-category"
              className="text-sm text-muted-foreground"
            >
              Questions per Category
            </label>
            <input
              id="questions-per-category"
              type="number"
              value={qPerCategory}
              onChange={(e): void => setQPerCategory(Number(e.target.value))}
              className="w-full bg-muted p-3 rounded-xl border border-border"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="minutes-per-question"
              className="text-sm text-muted-foreground"
            >
              Minutes per Question
            </label>
            <input
              id="minutes-per-question"
              type="number"
              value={perQuestionMins}
              onChange={(e): void => setPerQuestionMins(Number(e.target.value))}
              className="w-full bg-muted p-3 rounded-xl border border-border"
            />
          </div>
        </div>

        <button
          onClick={(): void => setIsConcentrated(!isConcentrated)}
          className={`w-full p-4 rounded-xl border-2 transition-all ${
            isConcentrated
              ? "border-purple-500 bg-purple-500/10"
              : "border-border bg-muted"
          }`}
        >
          Mode: {isConcentrated ? "🎯 Topic Concentration" : "🎲 Full Shuffle"}
        </button>

        <button
          onClick={onStart}
          className="w-full py-6 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-2xl font-black text-2xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
        >
          START ASSESSMENT
        </button>
      </div>
    </div>
  </div>
)

// ============================================================================
// ASSESSMENT STAGE COMPONENT
// ============================================================================

type AssessmentStageProps = {
  questions: Array<Question>
  currentIdx: number
  answers: Record<string, Answer>
  totalSecsLeft: number
  stepSecsLeft: number
  onUpdateAnswer: (data: Partial<Answer>) => void
  onNext: () => void
}

const AssessmentStage: FC<AssessmentStageProps> = ({
  questions,
  currentIdx,
  answers,
  totalSecsLeft,
  stepSecsLeft,
  onUpdateAnswer,
  onNext,
}) => {
  const currentQ = questions[currentIdx]
  const currentAnswer = currentQ ? (answers[currentQ.id] ?? {}) : {}

  if (!currentQ) return null

  return (
    <div className="size-full bg-background text-foreground flex flex-col overflow-hidden">
      <div className="flex flex-col flex-1 min-h-0 max-w-5xl mx-auto w-full px-6 py-4 gap-4">
        {/* Timer Header */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card p-4 rounded-2xl border border-red-500/30">
            <span className="text-xs text-muted-foreground uppercase font-bold tracking-widest">
              Global Time Remaining
            </span>
            <div className="text-3xl font-mono text-red-400">
              {formatTime(totalSecsLeft)}
            </div>
          </div>
          <div className="bg-card p-4 rounded-2xl border border-cyan-500/30">
            <span className="text-xs text-muted-foreground uppercase font-bold tracking-widest">
              Question Time Remaining
            </span>
            <div className="text-3xl font-mono text-cyan-400">
              {formatTime(stepSecsLeft)}
            </div>
          </div>
        </div>

        {/* Question Card */}
        <div
          className={`min-h-0 overflow-hidden p-1 rounded-3xl flex-grow bg-gradient-to-br ${
            CATEGORIES[currentQ.category].color
          }`}
        >
          <div className="bg-card rounded-[22px] p-6 flex flex-col size-full min-h-0 overflow-hidden">
            <div className="flex justify-between items-start mb-4">
              <span className="px-4 py-1 bg-muted rounded-full text-sm font-bold border border-border">
                {currentQ.id} | {CATEGORIES[currentQ.category].name}
              </span>
              <span className="text-muted-foreground font-mono text-sm">
                Question {currentIdx + 1} of {questions.length}
              </span>
            </div>

            <h2 className="text-2xl font-bold mb-4 leading-tight shrink-0">
              {currentQ.text}
            </h2>

            {/* Criteria */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 flex-none max-h-40 overflow-auto">
              {currentQ.criteria.map((c, i) => (
                <div
                  key={i}
                  className="flex gap-3 text-foreground bg-muted/50 p-3 rounded-lg border border-border/50"
                >
                  <CheckCircle
                    className="text-emerald-500 shrink-0"
                    size={18}
                  />
                  <span className="text-sm">{c}</span>
                </div>
              ))}
            </div>

            {/* Input Area */}
            <textarea
              className="w-full flex-1 min-h-0 bg-muted border-2 border-border rounded-2xl p-4 text-lg resize-none focus:border-purple-500 outline-none transition-all"
              placeholder="Structure your technical response..."
              value={currentAnswer.text ?? ""}
              onChange={(e): void => onUpdateAnswer({ text: e.target.value })}
            />

            {/* Evidence Bar */}
            <div className="flex gap-4 mt-4 shrink-0">
              <button
                onClick={(): void =>
                  onUpdateAnswer({ showedCode: !currentAnswer.showedCode })
                }
                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
                  currentAnswer.showedCode
                    ? "bg-cyan-500/20 border-cyan-500"
                    : "bg-muted border-border text-muted-foreground"
                }`}
              >
                <Code size={20} /> Live Code
              </button>
              <button
                onClick={(): void =>
                  onUpdateAnswer({ didResearch: !currentAnswer.didResearch })
                }
                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
                  currentAnswer.didResearch
                    ? "bg-pink-500/20 border-pink-500"
                    : "bg-muted border-border text-muted-foreground"
                }`}
              >
                <FileText size={20} /> Research
              </button>
            </div>
          </div>
        </div>

        {/* Next Button */}
        <button
          onClick={onNext}
          className="shrink-0 w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-bold text-xl shadow-xl transition-all flex items-center justify-center gap-3"
        >
          {currentIdx === questions.length - 1
            ? "FINISH ASSESSMENT"
            : "NEXT QUESTION"}
          <Zap size={24} />
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// COMPLETE STAGE COMPONENT
// ============================================================================

type CompleteStageProps = {
  onRestart: () => void
}

const CompleteStage: FC<CompleteStageProps> = ({ onRestart }) => (
  <div className="absolute inset-0 bg-background flex items-center justify-center text-foreground overflow-hidden">
    <div className="text-center">
      <h1 className="text-4xl font-bold mb-4">Assessment Complete</h1>
      <button onClick={onRestart} className="text-cyan-400 hover:underline">
        Start New Session
      </button>
    </div>
  </div>
)

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const TechnicalBlockAssessment: FC = (): JSX.Element => {
  const [totalMins] = useState(60)
  const [perQuestionMins, setPerQuestionMins] = useState(5)
  const [qPerCategory, setQPerCategory] = useState(2)
  const [isConcentrated, setIsConcentrated] = useState(true)

  const {
    stage,
    setStage,
    questions,
    currentIdx,
    answers,
    totalSecsLeft,
    stepSecsLeft,
    startAssessment,
    handleUpdateAnswer,
    nextQuestion,
  } = useAssessmentLogic({
    totalMins,
    perQuestionMins,
    qPerCategory,
    isConcentrated,
  })

  if (stage === "setup") {
    return (
      <SetupStage
        qPerCategory={qPerCategory}
        setQPerCategory={setQPerCategory}
        perQuestionMins={perQuestionMins}
        setPerQuestionMins={setPerQuestionMins}
        isConcentrated={isConcentrated}
        setIsConcentrated={setIsConcentrated}
        onStart={startAssessment}
      />
    )
  }

  if (stage === "assessment") {
    return (
      <div className="absolute inset-0">
        <AssessmentStage
          questions={questions}
          currentIdx={currentIdx}
          answers={answers}
          totalSecsLeft={totalSecsLeft}
          stepSecsLeft={stepSecsLeft}
          onUpdateAnswer={handleUpdateAnswer}
          onNext={nextQuestion}
        />
      </div>
    )
  }

  return <CompleteStage onRestart={(): void => setStage("setup")} />
}
