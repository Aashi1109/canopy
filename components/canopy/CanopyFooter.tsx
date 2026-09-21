import { ProductFooter, SmartToolsLogoMark } from "@/components/ui/index.tsx";

/**
 * Suite and company navigation only — no tool is named here.
 *
 * The footer renders inside client trees (`components/UniversalWorkbench.tsx`,
 * `app/paperwork/components/App.tsx`), so it cannot await the DB-backed
 * `getTools`. A "Popular tools" column therefore has to arrive as data, and
 * `FEATURED_TOOL_IDS` (`lib/tool-framework/categories.ts`) is where that data
 * lands. It is deliberately empty today, so the column simply does not render
 * — the same treatment the devtools catalogue page gives its featured section.
 */
const footerColumns = [
  {
    title: "Company",
    links: [
      { href: "/", label: "Home" },
      { href: "/blog", label: "Blog" },
      { href: "/contact", label: "Contact" },
      { href: "/privacy", label: "Privacy" },
      { href: "/auth", label: "Sign in" },
    ],
  },
  {
    title: "Tool suites",
    links: [
      { href: "/paperwork", label: "Paperwork" },
      { href: "/devtools", label: "DevTools" },
      { href: "/media", label: "Media" },
    ],
  },
] as const;

export function CanopyFooter() {
  return (
    <ProductFooter
      brand="SmartTools"
      brandMark={<SmartToolsLogoMark aria-hidden="true" mode="dark" />}
      columns={footerColumns}
      copyright={`© ${new Date().getFullYear()} SmartTools. All rights reserved.`}
      description="Practical browser tools for documents, developer workflows, media, and everyday tasks."
    />
  );
}
