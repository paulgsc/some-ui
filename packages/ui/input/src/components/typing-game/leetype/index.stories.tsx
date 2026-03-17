import type { Language } from "@input/types/leetype"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { Leetype } from "."

const meta: Meta<typeof Leetype> = {
  title: "UI/Input/Components/Typing/Leetype",
  component: Leetype,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    codePaths: {
      description: "Map of language to code file paths",
    },
  },
}

export default meta
type Story = StoryObj<typeof Leetype>

/* ---------- Default Code Paths ---------- */
const defaultCodePaths: Record<Language, string> = {
  typescript: "/code-samples/two-sum.ts",
  rust: "/code-samples/binary-code.rs",
  cpp: "/code-samples/quicksort.cpp",
  c: "/code-samples/reverse.c",
}

/* ---------- Basic Stories ---------- */

export const Default: Story = {
  args: {
    codePaths: defaultCodePaths,
  },
}

export const TypescriptOnly: Story = {
  args: {
    codePaths: {
      typescript: "/code-samples/fibonacci.ts",
      rust: "/code-samples/factorial.rs",
      cpp: "/code-samples/quicksort.cpp",
      c: "/code-samples/binary-search.c",
    },
  },
  parameters: {
    docs: {
      description: {
        story: "Default view with TypeScript as the initial language",
      },
    },
  },
}

export const RustSample: Story = {
  args: {
    codePaths: defaultCodePaths,
  },
  play: async () => {
    // Simulate language change to Rust
    // Note: You'd need to implement interaction testing if needed
  },
  parameters: {
    docs: {
      description: {
        story: "Typing game with Rust code sample",
      },
    },
  },
}

export const CppSample: Story = {
  args: {
    codePaths: defaultCodePaths,
  },
  parameters: {
    docs: {
      description: {
        story: "Typing game with C++ code sample",
      },
    },
  },
}

export const CSample: Story = {
  args: {
    codePaths: defaultCodePaths,
  },
  parameters: {
    docs: {
      description: {
        story: "Typing game with C code sample",
      },
    },
  },
}

/* ---------- Loading States ---------- */

export const LoadingState: Story = {
  args: {
    codePaths: {
      typescript: "/code-samples/slow-loading.ts",
      rust: "/code-samples/factorial.rs",
      cpp: "/code-samples/quicksort.cpp",
      c: "/code-samples/binary-search.c",
    },
  },
  parameters: {
    docs: {
      description: {
        story: "Shows loading state while fetching code from file system",
      },
    },
  },
}

export const LoadingWithRetry: Story = {
  args: {
    codePaths: {
      typescript: "/code-samples/retry-loading.ts",
      rust: "/code-samples/factorial.rs",
      cpp: "/code-samples/quicksort.cpp",
      c: "/code-samples/binary-search.c",
    },
  },
  parameters: {
    docs: {
      description: {
        story: "Loading state with retry attempts shown",
      },
    },
  },
}

/* ---------- Error States ---------- */

export const ErrorState: Story = {
  args: {
    codePaths: {
      typescript: "/code-samples/nonexistent-file.ts",
      rust: "/code-samples/factorial.rs",
      cpp: "/code-samples/quicksort.cpp",
      c: "/code-samples/binary-search.c",
    },
  },
  parameters: {
    docs: {
      description: {
        story: "Error state when code file cannot be loaded",
      },
    },
  },
}

export const InvalidPathError: Story = {
  args: {
    codePaths: {
      typescript: "/invalid/path/to/code.ts",
      rust: "/code-samples/factorial.rs",
      cpp: "/code-samples/quicksort.cpp",
      c: "/code-samples/binary-search.c",
    },
  },
  parameters: {
    docs: {
      description: {
        story: "Shows error when file path is invalid",
      },
    },
  },
}

export const FormattingError: Story = {
  args: {
    codePaths: {
      typescript: "/code-samples/malformed-syntax.ts",
      rust: "/code-samples/factorial.rs",
      cpp: "/code-samples/quicksort.cpp",
      c: "/code-samples/binary-search.c",
    },
  },
  parameters: {
    docs: {
      description: {
        story: "Error state when code formatting fails",
      },
    },
  },
}

/* ---------- Different Code Samples ---------- */

export const AlgorithmSamples: Story = {
  args: {
    codePaths: {
      typescript: "/code-samples/merge-sort.ts",
      rust: "/code-samples/binary-tree.rs",
      cpp: "/code-samples/dijkstra.cpp",
      c: "/code-samples/linked-list.c",
    },
  },
  parameters: {
    docs: {
      description: {
        story: "Various algorithm implementations across languages",
      },
    },
  },
}

export const DataStructures: Story = {
  args: {
    codePaths: {
      typescript: "/code-samples/hash-map.ts",
      rust: "/code-samples/vector-ops.rs",
      cpp: "/code-samples/binary-tree.cpp",
      c: "/code-samples/stack.c",
    },
  },
  parameters: {
    docs: {
      description: {
        story: "Data structure implementations",
      },
    },
  },
}

export const ShortSnippets: Story = {
  args: {
    codePaths: {
      typescript: "/code-samples/hello-world.ts",
      rust: "/code-samples/fibonacci-simple.rs",
      cpp: "/code-samples/factorial-simple.cpp",
      c: "/code-samples/hello.c",
    },
  },
  parameters: {
    docs: {
      description: {
        story: "Short code snippets for quick practice",
      },
    },
  },
}

export const ComplexAlgorithms: Story = {
  args: {
    codePaths: {
      typescript: "/code-samples/dynamic-programming.ts",
      rust: "/code-samples/graph-traversal.rs",
      cpp: "/code-samples/kmp-algorithm.cpp",
      c: "/code-samples/heap-sort.c",
    },
  },
  parameters: {
    docs: {
      description: {
        story: "Complex algorithms for advanced practice",
      },
    },
  },
}

/* ---------- Game State Scenarios ---------- */

export const ReadyToStart: Story = {
  args: {
    codePaths: defaultCodePaths,
  },
  parameters: {
    docs: {
      description: {
        story: "Initial idle state, ready to start typing",
      },
    },
  },
}

export const CustomDuration: Story = {
  args: {
    codePaths: defaultCodePaths,
  },
  parameters: {
    docs: {
      description: {
        story: "Game with custom duration settings (would need to set via UI)",
      },
    },
  },
}

/* ---------- Edge Cases ---------- */

export const EmptyCodePath: Story = {
  args: {
    codePaths: {
      typescript: "",
      rust: "/code-samples/factorial.rs",
      cpp: "/code-samples/quicksort.cpp",
      c: "/code-samples/binary-search.c",
    },
  },
  parameters: {
    docs: {
      description: {
        story: "Handles empty code path gracefully",
      },
    },
  },
}

export const MixedAvailability: Story = {
  args: {
    codePaths: {
      typescript: "/code-samples/fibonacci.ts",
      rust: "/code-samples/missing-file.rs",
      cpp: "/code-samples/quicksort.cpp",
      c: "/code-samples/missing-file.c",
    },
  },
  parameters: {
    docs: {
      description: {
        story: "Some languages load successfully, others fail",
      },
    },
  },
}

export const LargeCodeSample: Story = {
  args: {
    codePaths: {
      typescript: "/code-samples/large-implementation.ts",
      rust: "/code-samples/factorial.rs",
      cpp: "/code-samples/quicksort.cpp",
      c: "/code-samples/binary-search.c",
    },
  },
  parameters: {
    docs: {
      description: {
        story: "Tests with a very large code file",
      },
    },
  },
}

export const SpecialCharacters: Story = {
  args: {
    codePaths: {
      typescript: "/code-samples/unicode-comments.ts",
      rust: "/code-samples/special-chars.rs",
      cpp: "/code-samples/quicksort.cpp",
      c: "/code-samples/binary-search.c",
    },
  },
  parameters: {
    docs: {
      description: {
        story: "Code with special characters and unicode",
      },
    },
  },
}

/* ---------- Accessibility & Responsiveness ---------- */

export const MobileView: Story = {
  args: {
    codePaths: defaultCodePaths,
  },
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
    docs: {
      description: {
        story: "Mobile responsive layout",
      },
    },
  },
}

export const TabletView: Story = {
  args: {
    codePaths: defaultCodePaths,
  },
  parameters: {
    viewport: {
      defaultViewport: "tablet",
    },
    docs: {
      description: {
        story: "Tablet responsive layout",
      },
    },
  },
}

export const DesktopView: Story = {
  args: {
    codePaths: defaultCodePaths,
  },
  parameters: {
    viewport: {
      defaultViewport: "desktop",
    },
    docs: {
      description: {
        story: "Desktop full-width layout",
      },
    },
  },
}
