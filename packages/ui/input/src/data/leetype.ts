import type { Challenge } from "@input/types/leetype"

export const CHALLENGES: Array<Challenge> = [
  // ── Data Structures ────────────────────────────────────────────────────
  {
    id: "ds-linked-list",
    title: "Linked List",
    description:
      "Implement a singly linked list with push, pop, and traversal operations.",
    difficulty: "easy",
    mode: "data-structure",
    tags: ["linked-list", "pointers", "nodes"],
    levelRequired: 1,
    codePaths: {
      typescript: "/code-samples/ds/linked-list.ts",
      rust: "/code-samples/ds/linked-list.rs",
      cpp: "/code-samples/ds/linked-list.cpp",
      c: "/code-samples/ds/linked-list.c",
    },
  },
  {
    id: "ds-stack",
    title: "Stack",
    description:
      "Implement a stack (LIFO) using an array backing store with push and pop.",
    difficulty: "easy",
    mode: "data-structure",
    tags: ["stack", "lifo", "array"],
    levelRequired: 1,
    codePaths: {
      typescript: "/code-samples/ds/stack.ts",
      rust: "/code-samples/ds/stack.rs",
      cpp: "/code-samples/ds/stack.cpp",
      c: "/code-samples/ds/stack.c",
    },
  },
  {
    id: "ds-queue",
    title: "Queue",
    description:
      "Implement a queue (FIFO) with enqueue, dequeue, and peek operations.",
    difficulty: "easy",
    mode: "data-structure",
    tags: ["queue", "fifo", "circular-buffer"],
    levelRequired: 1,
    codePaths: {
      typescript: "/code-samples/ds/queue.ts",
      rust: "/code-samples/ds/queue.rs",
      cpp: "/code-samples/ds/queue.cpp",
      c: "/code-samples/ds/queue.c",
    },
  },
  {
    id: "ds-binary-tree",
    title: "Binary Search Tree",
    description: "Implement a BST with insert, search, and in-order traversal.",
    difficulty: "medium",
    mode: "data-structure",
    tags: ["bst", "trees", "recursion"],
    levelRequired: 1,
    codePaths: {
      typescript: "/code-samples/ds/binary-tree.ts",
      rust: "/code-samples/ds/binary-tree.rs",
      cpp: "/code-samples/ds/binary-tree.cpp",
      c: "/code-samples/ds/binary-tree.c",
    },
  },
  {
    id: "ds-hash-map",
    title: "Hash Map",
    description:
      "Implement a hash map with separate chaining for collision resolution.",
    difficulty: "medium",
    mode: "data-structure",
    tags: ["hash-map", "hashing", "chaining"],
    levelRequired: 1,
    codePaths: {
      typescript: "/code-samples/ds/hash-map.ts",
      rust: "/code-samples/ds/hash-map.rs",
      cpp: "/code-samples/ds/hash-map.cpp",
      c: "/code-samples/ds/hash-map.c",
    },
  },
  {
    id: "ds-min-heap",
    title: "Min Heap",
    description:
      "Implement a min-heap with heapify-up and heapify-down operations.",
    difficulty: "hard",
    mode: "data-structure",
    tags: ["heap", "priority-queue", "tree"],
    levelRequired: 1,
    codePaths: {
      typescript: "/code-samples/ds/min-heap.ts",
      rust: "/code-samples/ds/min-heap.rs",
      cpp: "/code-samples/ds/min-heap.cpp",
      c: "/code-samples/ds/min-heap.c",
    },
  },

  // ── Algorithms ─────────────────────────────────────────────────────────
  {
    id: "algo-two-sum",
    title: "Two Sum",
    description:
      "Given an array of integers and a target, return indices of the two numbers that add up to target.",
    difficulty: "easy",
    mode: "algorithm",
    tags: ["array", "hash-map", "O(n)"],
    levelRequired: 3,
    codePaths: {
      typescript: "/code-samples/algo/two-sum.ts",
      rust: "/code-samples/algo/two-sum.rs",
      cpp: "/code-samples/algo/two-sum.cpp",
      c: "/code-samples/algo/two-sum.c",
    },
  },
  {
    id: "algo-binary-search",
    title: "Binary Search",
    description:
      "Search a sorted array in O(log N) time by halving the search space each step.",
    difficulty: "easy",
    mode: "algorithm",
    tags: ["binary-search", "divide-and-conquer", "O(log n)"],
    levelRequired: 3,
    codePaths: {
      typescript: "/code-samples/algo/binary-search.ts",
      rust: "/code-samples/algo/binary-search.rs",
      cpp: "/code-samples/algo/binary-search.cpp",
      c: "/code-samples/algo/binary-search.c",
    },
  },
  {
    id: "algo-merge-sort",
    title: "Merge Sort",
    description:
      "Sort an array in O(N log N) using the divide-and-merge strategy.",
    difficulty: "medium",
    mode: "algorithm",
    tags: ["sorting", "divide-and-conquer", "O(n log n)"],
    levelRequired: 3,
    codePaths: {
      typescript: "/code-samples/algo/merge-sort.ts",
      rust: "/code-samples/algo/merge-sort.rs",
      cpp: "/code-samples/algo/merge-sort.cpp",
      c: "/code-samples/algo/merge-sort.c",
    },
  },
]

export const DS_CHALLENGES = CHALLENGES.filter(
  (c) => c.mode === "data-structure"
)
export const ALGO_CHALLENGES = CHALLENGES.filter((c) => c.mode === "algorithm")
