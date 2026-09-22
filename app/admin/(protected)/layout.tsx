import { requirePagePermission } from "../../../lib/admin/access";
import config from "@/lib/config/config.ts";
import { AdminShell } from "./components/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePagePermission("admin", "enter");

  return (
    <AdminShell user={session.user} publicSiteUrl={config.appUrl}>
      {children}
    </AdminShell>
  );
}
