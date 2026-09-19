import { AdminPageHeader } from "@/app/admin/(protected)/components/AdminPageHeader";
import { ContentState } from "@/components/ui/index.tsx";
import { PackageSearch } from "lucide-react";
import { requirePagePermission } from "../../../../lib/admin/access";
import { getAdminTools } from "../../../../lib/tool-framework/manifest";
import { NewToolDialog } from "./components/NewToolDialog";
import { ToolList } from "./components/ToolList";

export default async function ToolsPage() {
  await requirePagePermission("tools", "view");
  const tools = await getAdminTools();

  return (
    <div className="flex min-h-0 flex-col lg:h-full">
      <AdminPageHeader
        actions={<NewToolDialog />}
        className="shrink-0 gap-2 sm:items-center"
        description="Find, group, and publish tools without losing your place."
        title="Tool catalog"
      />
      {tools.length ? (
        <ToolList tools={tools} />
      ) : (
        <ContentState
          description="Tools are added by your development team. Ask them to register and deploy a tool, then reload this page."
          icon={<PackageSearch aria-hidden="true" />}
          title="No tools registered"
        />
      )}
    </div>
  );
}
