import { requirePagePermission } from "@/lib/admin/access";
import { getUserAuthorization } from "@/lib/admin/index.ts";
import { hasPermission } from "@/lib/authorization/index.ts";
import { DownloaderLimitsForm } from "./components/DownloaderLimitsForm";

export default async function DownloaderLimitsPage() {
  const session = await requirePagePermission("downloaders", "view");
  const authorization = await getUserAuthorization(session.user.id);

  return <DownloaderLimitsForm canEdit={hasPermission(authorization.access, "downloaders", "edit")} />;
}
