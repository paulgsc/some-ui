import React, { useEffect, useRef, useState } from "react"

// Advanced Tree-based Content Structure
interface ContentNode {
  id: string
  title: string
  content: string
  level: number
  parent?: string
  children?: string[]
  tags: string[]
}

// Utility for building hierarchical content
const createHierarchicalContent = (): ContentNode[] => [
  {
    id: "react-fundamentals",
    title: "React Fundamentals",
    content: "Introduction to React core concepts",
    level: 0,
    children: ["hooks", "components"],
    tags: ["frontend", "javascript"],
  },
  {
    id: "hooks",
    title: "React Hooks",
    content: "Deep dive into useState, useEffect",
    level: 1,
    parent: "react-fundamentals",
    children: ["use-state", "use-effect"],
    tags: ["hooks", "state-management"],
  },
  {
    id: "components",
    title: "React Components",
    content: "Class vs Functional Components",
    level: 1,
    parent: "react-fundamentals",
    tags: ["components", "design"],
  },
  {
    id: "use-state",
    title: "useState Hook",
    content: "Managing local component state",
    level: 2,
    parent: "hooks",
    tags: ["hooks", "state"],
  },
  {
    id: "use-effect",
    title: "useEffect Hook",
    content: "Side effects and lifecycle management",
    level: 2,
    parent: "hooks",
    tags: ["hooks", "lifecycle"],
  },
]

const HierarchicalContentLayout: React.FC = () => {
  const [content, setContent] = useState<ContentNode[]>(
    createHierarchicalContent()
  )
  const [selectedNode, setSelectedNode] = useState<ContentNode | null>(null)
  const [sidebarContent, setSidebarContent] = useState<ContentNode[]>([])

  const gridRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)

  // Tree Traversal Logic for Hierarchical Relationships
  const findRelatedNodes = (node: ContentNode): ContentNode[] => {
    const related: ContentNode[] = []

    // Find siblings
    const siblings = content.filter(
      (n) => n.parent === node.parent && n.id !== node.id
    )

    // Find children
    const children = content.filter((n) => n.parent === node.id)

    // Find parent
    const parent = node.parent
      ? content.find((n) => n.id === node.parent)
      : null

    return [...(parent ? [parent] : []), node, ...siblings, ...children]
  }

  const handleNodeSelect = (node: ContentNode) => {
    setSelectedNode(node)

    // Compute sidebar content based on hierarchical relationships
    const relatedNodes = findRelatedNodes(node)
    setSidebarContent(relatedNodes)
  }

  // Transition Styles
  const gridItemStyle = (node: ContentNode) => ({
    transform: selectedNode?.id === node.id ? "scale(1.05)" : "scale(1)",
    opacity: selectedNode && selectedNode.id !== node.id ? 0.6 : 1,
    transition: "all 0.3s ease",
    cursor: "pointer",
  })

  const sidebarItemStyle = (node: ContentNode, index: number) => ({
    transform: `translateY(${index * 20}px)`,
    opacity: 1,
    transition: "all 0.3s ease",
    marginLeft: `${node.level * 15}px`,
  })

  return (
    <div className="flex w-full h-screen">
      {/* Grid View */}
      <div ref={gridRef} className="w-2/3 p-4 grid grid-cols-3 gap-4">
        {content
          .filter((node) => node.level <= 1) // Only top-level nodes in grid
          .map((node) => (
            <div
              key={node.id}
              style={gridItemStyle(node)}
              onClick={() => handleNodeSelect(node)}
              className="border p-4 rounded-lg"
            >
              <h3 className="font-bold">{node.title}</h3>
              <p className="text-sm">{node.content}</p>
            </div>
          ))}
      </div>

      {/* Sidebar View */}
      <div ref={sidebarRef} className="w-1/3 p-4 bg-gray-100 overflow-hidden">
        <h2 className="text-xl font-bold mb-4">
          {selectedNode ? "Related Content" : "Select an Item"}
        </h2>

        {sidebarContent.map((node, index) => (
          <div
            key={node.id}
            style={sidebarItemStyle(node, index)}
            className="mb-2 p-2 bg-white rounded"
          >
            <h4 className="font-semibold">{node.title}</h4>
            <p className="text-xs">{node.content}</p>
            <div className="text-xs text-gray-500">{node.tags.join(", ")}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default HierarchicalContentLayout
