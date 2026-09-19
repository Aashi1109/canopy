/** Public agent metadata only. Execution policies and prompts remain on the server. */
export const BLOG_AGENTS = [
  {
    id: "planner",
    name: "Planner",
    command: "/plan",
    description: "Plan the topic, structure and outline.",
    aliases: ["planner", "outline", "brief"],
    requiresDocument: false,
  },
  {
    id: "writer",
    name: "Writer",
    command: "/write",
    description: "Preview a complete draft before applying.",
    aliases: ["writer", "draft"],
    requiresDocument: true,
  },
  {
    id: "auditor",
    name: "Auditor",
    command: "/audit",
    description: "Find issues and suggest improvements.",
    aliases: ["auditor", "review"],
    requiresDocument: true,
  },
  {
    id: "optimizer",
    name: "Optimizer",
    command: "/optimize",
    description: "Suggest keywords and preview SEO edits.",
    aliases: ["optimizer", "seo"],
    requiresDocument: true,
  },
] as const;
export type BlogAgentId = (typeof BLOG_AGENTS)[number]["id"];
export function getBlogAgent(id: string | undefined) {
  return BLOG_AGENTS.find((agent) => agent.id === id);
}
