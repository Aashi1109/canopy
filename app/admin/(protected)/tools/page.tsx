import { getToolIcons, isDatabaseConfigured, type ToolIconRow } from "@canopy/database";
import { TextLink, EmptyState, ToolPageHeader } from "@canopy/ui";
import { PackageSearch } from "lucide-react";
import { requirePagePermission } from "../../../../lib/admin/access";
import { getAdminTools } from "../../../../lib/tool-framework/manifest";
import { NewToolDialog } from "./components/NewToolDialog";
import { ToolList } from "./components/ToolList";

export default async function ToolsPage() {
  await requirePagePermission("tools", "view");
  const [tools, icons]: [Awaited<ReturnType<typeof getAdminTools>>, Readonly<Record<string, ToolIconRow>>] =
    await Promise.all([getAdminTools(), isDatabaseConfigured() ? getToolIcons() : Promise.resolve({})]);

  return (
    <div className="flex min-h-0 flex-col lg:h-full">
      <ToolPageHeader
        actions={<NewToolDialog />}
        className="mb-3 shrink-0 gap-2 pb-3 sm:items-center"
        description="Find, group, and publish tools without losing your place."
        title="Tool catalog"
      />
      {tools.length ? (
        <ToolList icons={icons} tools={tools} />
      ) : (
        <EmptyState
          action={
            <TextLink className="text-primary hover:underline" href="/admin/design-system">
              View registration guide
            </TextLink>
          }
          description="Register a tool in the code manifest, then reload this page to make it available here."
          icon={<PackageSearch aria-hidden="true" />}
          title="No tools registered"
        />
      )}
    </div>
  );
}
