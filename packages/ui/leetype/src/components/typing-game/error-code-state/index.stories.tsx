import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { ErrorCodeState } from "."

const meta: Meta<typeof ErrorCodeState> = {
  title: "UI/Input/Components/Typing/ErrorCodeState",
  component: ErrorCodeState,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    error: {
      control: "object",
      description: "Error object with message",
    },
    path: {
      control: "text",
      description: "File path that failed to load",
    },
    onRetry: {
      action: "retry clicked",
      description: "Callback when retry button is clicked",
    },
  },
}

export default meta
type Story = StoryObj<typeof ErrorCodeState>

/* ---------- Basic Error Stories ---------- */

export const FileNotFound: Story = {
  args: {
    error: new Error("Failed to fetch: 404 Not Found"),
    path: "/code-samples/fibonacci.ts",
    onRetry: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "Standard 404 file not found error",
      },
    },
  },
}

export const NetworkError: Story = {
  args: {
    error: new Error("Network request failed: Unable to connect to server"),
    path: "/code-samples/factorial.rs",
    onRetry: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "Network connectivity error",
      },
    },
  },
}

export const PermissionDenied: Story = {
  args: {
    error: new Error("Permission denied: 403 Forbidden"),
    path: "/private/code-samples/secret-algorithm.ts",
    onRetry: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "Permission/access denied error",
      },
    },
  },
}

export const TimeoutError: Story = {
  args: {
    error: new Error("Request timeout: Server did not respond in time"),
    path: "/code-samples/large-file.cpp",
    onRetry: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "Request timeout error",
      },
    },
  },
}

export const FormattingError: Story = {
  args: {
    error: new Error("Prettier formatting failed: Unexpected token at line 42"),
    path: "/code-samples/malformed.ts",
    onRetry: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "Code formatting/parsing error",
      },
    },
  },
}

export const InvalidPath: Story = {
  args: {
    error: new Error("Invalid file path: Path contains illegal characters"),
    path: "/code-samples/<invalid>?path*.ts",
    onRetry: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "Invalid file path format",
      },
    },
  },
}

/* ---------- Long Error Messages ---------- */

export const LongErrorMessage: Story = {
  args: {
    error: new Error(
      "Failed to load code sample: The requested file could not be found in the file system. This error typically occurs when the file path is incorrect, the file has been moved or deleted, or there are permission issues preventing access. Please verify the file path and ensure the file exists in the expected location."
    ),
    path: "/very/long/path/to/some/deeply/nested/directory/structure/code-samples/fibonacci.ts",
    onRetry: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "Long error message with detailed information",
      },
    },
  },
}

export const StackTrace: Story = {
  args: {
    error: new Error(
      `TypeError: Cannot read property 'code' of undefined
    at useFormattedCode (/hooks/use-formatted-code.ts:45:12)
    at Leetype (/components/leetype/index.tsx:23:8)
    at renderWithHooks (/node_modules/react/cjs/react.development.js:1234)
    at mountIndeterminateComponent (/node_modules/react/cjs/react.development.js:5678)`
    ),
    path: "/code-samples/quicksort.cpp",
    onRetry: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "Error with full stack trace",
      },
    },
  },
}

/* ---------- Without Retry Button ---------- */

export const NoRetryButton: Story = {
  args: {
    error: new Error("Critical error: Unable to recover automatically"),
    path: "/code-samples/fibonacci.ts",
    onRetry: undefined,
  },
  parameters: {
    docs: {
      description: {
        story: "Error state without retry option",
      },
    },
  },
}

export const ReadOnlyError: Story = {
  args: {
    error: new Error("File system is read-only"),
    path: "/readonly/code-samples/algorithm.ts",
    onRetry: undefined,
  },
  parameters: {
    docs: {
      description: {
        story: "Read-only file system error without retry",
      },
    },
  },
}

/* ---------- Different Path Formats ---------- */

export const RelativePath: Story = {
  args: {
    error: new Error("Failed to fetch: 404 Not Found"),
    path: "./samples/fibonacci.ts",
    onRetry: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "Error with relative file path",
      },
    },
  },
}

export const AbsolutePath: Story = {
  args: {
    error: new Error("Failed to fetch: 404 Not Found"),
    path: "/usr/local/share/code-samples/algorithm.ts",
    onRetry: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "Error with absolute file path",
      },
    },
  },
}

export const URLPath: Story = {
  args: {
    error: new Error("CORS policy: Access blocked by CORS policy"),
    path: "https://example.com/code-samples/fibonacci.ts",
    onRetry: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "Error with full URL path",
      },
    },
  },
}

/* ---------- Different Container Sizes ---------- */

export const InCard: Story = {
  args: {
    error: new Error("Failed to fetch: 404 Not Found"),
    path: "/code-samples/fibonacci.ts",
    onRetry: () => {},
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl mx-auto">
        <div className="p-6 bg-card border-border rounded-lg">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story: "Error state inside a card container",
      },
    },
  },
}

export const FullWidth: Story = {
  args: {
    error: new Error("Network request failed"),
    path: "/code-samples/binary-search.c",
    onRetry: () => {},
  },
  decorators: [
    (Story) => (
      <div className="w-full">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story: "Error state in full-width container",
      },
    },
  },
}

export const Compact: Story = {
  args: {
    error: new Error("File not found"),
    path: "/samples/code.ts",
    onRetry: () => {},
  },
  decorators: [
    (Story) => (
      <div className="max-w-md mx-auto">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story: "Error state in compact container",
      },
    },
  },
}

/* ---------- Responsive Views ---------- */

export const MobileView: Story = {
  args: {
    error: new Error("Failed to fetch: 404 Not Found"),
    path: "/code-samples/fibonacci.ts",
    onRetry: () => {},
  },
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
    docs: {
      description: {
        story: "Error state on mobile devices",
      },
    },
  },
}

export const TabletView: Story = {
  args: {
    error: new Error("Network request failed"),
    path: "/code-samples/quicksort.cpp",
    onRetry: () => {},
  },
  parameters: {
    viewport: {
      defaultViewport: "tablet",
    },
    docs: {
      description: {
        story: "Error state on tablet devices",
      },
    },
  },
}

/* ---------- Interactive Stories ---------- */

export const InteractiveRetry: Story = {
  args: {
    error: new Error("Failed to fetch: 404 Not Found"),
    path: "/code-samples/fibonacci.ts",
  },
  render: (args) => {
    const [retryCount, setRetryCount] = useState(0)

    return (
      <div className="space-y-4">
        <div className="text-center text-sm text-muted-foreground">
          Retry count: {retryCount}
        </div>
        <ErrorCodeState
          {...args}
          onRetry={() => {
            setRetryCount((prev) => prev + 1)
          }}
        />
      </div>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Interactive retry with counter",
      },
    },
  },
}

/* ---------- Accessibility Testing ---------- */

export const ScreenReaderFriendly: Story = {
  args: {
    error: new Error("Failed to fetch: 404 Not Found"),
    path: "/code-samples/fibonacci.ts",
    onRetry: () => {},
  },
  parameters: {
    docs: {
      description: {
        story:
          "Error state with proper ARIA labels and semantic HTML for screen readers",
      },
    },
  },
}

export const KeyboardNavigation: Story = {
  args: {
    error: new Error("Network error occurred"),
    path: "/code-samples/algorithm.ts",
    onRetry: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "Test keyboard navigation and focus management",
      },
    },
  },
}
