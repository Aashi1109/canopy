"use server";

import {
  archiveDocumentTemplate,
  assignUserRoles,
  createAdvancedDocumentTemplate,
  createCustomRole,
  createInvoiceTemplate,
  deleteCustomRole,
  duplicateDocumentTemplate,
  importDocumentTemplate,
  publishDocumentTemplate,
  reorderManagedTools,
  setDefaultDocumentTemplate,
  setFeatureEnabled,
  setManagedToolArchived,
  setManagedToolEnabled,
  setUserStatus,
  updateAndPublishDocumentTemplate,
  updateCustomRole,
  updateFeature,
  updateDocumentTemplate,
  updateManagedTool,
  type DocumentTemplateContent,
} from "../../lib/admin/adminMutations";
import { featureManifest } from "@smarttools/control-plane";
import {
  getDefaultTemplateConfigByFamily,
  type LayoutFamily,
  type TemplateCategory,
  type TemplateDocumentType,
  type TemplatePageFormat,
} from "@smarttools/invoice-templates";
import type { ToolApp } from "@smarttools/tool-catalog";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActorUserId } from "../../lib/admin/access";
import { errorMessage } from "../../utils/errorMessage.ts";

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function json<T>(formData: FormData, key: string, label: string, maxLength: number): T {
  const value = text(formData, key);
  if (value.length > maxLength) throw new Error(`${label} is too large.`);
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

export async function updateToolAction(formData: FormData) {
  const actor = await getActorUserId();
  const slug = text(formData, "slug");
  await updateManagedTool(actor, text(formData, "toolId"), {
    ...(formData.has("slug") ? { slug: slug || null } : {}),
    name: text(formData, "name"),
    description: text(formData, "description"),
  });
  revalidatePath("/admin/tools");
}

export async function reorderToolsAction(app: ToolApp, toolIds: string[]) {
  await reorderManagedTools(await getActorUserId(), app, toolIds);
  revalidatePath("/admin/tools");
}

export async function toggleToolAction(formData: FormData) {
  await setManagedToolEnabled(await getActorUserId(), text(formData, "toolId"), text(formData, "enabled") === "true");
  revalidatePath("/admin/tools");
  revalidatePath(`/admin/tools/${encodeURIComponent(text(formData, "toolId"))}`);
}

export async function archiveToolAction(formData: FormData) {
  await setManagedToolArchived(await getActorUserId(), text(formData, "toolId"), text(formData, "archived") === "true");
  revalidatePath("/admin/tools");
}

export async function updateFeatureAction(formData: FormData) {
  await updateFeature(
    await getActorUserId(),
    text(formData, "app") as "paperwork" | "devtools",
    text(formData, "key"),
    { name: text(formData, "name"), description: text(formData, "description") },
    featureManifest,
  );
  revalidatePath("/admin/features");
}

export async function toggleFeatureAction(formData: FormData) {
  await setFeatureEnabled(
    await getActorUserId(),
    text(formData, "app") as "paperwork" | "devtools",
    text(formData, "key"),
    text(formData, "enabled") === "true",
    featureManifest,
  );
  revalidatePath("/admin/features");
}

export async function assignRolesAction(formData: FormData) {
  await assignUserRoles(await getActorUserId(), text(formData, "userId"), formData.getAll("roles").map(String));
  revalidatePath("/admin/users");
}

export async function setUserStatusAction(formData: FormData) {
  await setUserStatus(
    await getActorUserId(),
    text(formData, "userId"),
    text(formData, "status") as "active" | "suspended",
  );
  revalidatePath("/admin/users");
}

export async function createRoleAction(formData: FormData) {
  const role = await createCustomRole(await getActorUserId(), {
    name: text(formData, "name"),
    description: text(formData, "description"),
  });
  redirect(`/admin/roles/${role.id}`);
}

export async function updateRoleAction(formData: FormData) {
  const actorUserId = await getActorUserId();
  const access: Record<string, Record<string, boolean>> = {};
  for (const [key] of formData) {
    if (!key.startsWith("permission:")) continue;
    const [, resource, action] = key.split(":");
    (access[resource] ??= {})[action] = true;
  }
  try {
    const role = await updateCustomRole(actorUserId, text(formData, "roleId"), {
      name: text(formData, "name"),
      description: text(formData, "description"),
      access,
    });
    revalidatePath("/admin/roles");
    revalidatePath(`/admin/roles/${role.id}`);
    return {
      error: null,
      role: {
        id: role.id,
        name: role.name,
        description: role.description,
        access: role.access,
        isSystem: role.isSystem,
      },
    };
  } catch (error) {
    return {
      error: errorMessage(error, "Unable to save the role. Please try again."),
    };
  }
}

export async function deleteRoleAction(formData: FormData) {
  const actorUserId = await getActorUserId();
  try {
    await deleteCustomRole(actorUserId, text(formData, "roleId"));
  } catch (error) {
    return {
      error: errorMessage(error, "Unable to delete the role. Please try again."),
    };
  }
  redirect("/admin/roles");
}

export async function createTemplateAction(formData: FormData) {
  const layoutFamily = text(formData, "layoutFamily") as LayoutFamily;
  const template = await createInvoiceTemplate(await getActorUserId(), {
    name: text(formData, "name"),
    slug: text(formData, "slug"),
    description: text(formData, "description"),
    category: text(formData, "category") as TemplateCategory,
    layoutFamily,
    config: getDefaultTemplateConfigByFamily(layoutFamily),
  });
  redirect(`/admin/templates/${template.id}`);
}

export async function createAdvancedTemplateAction(formData: FormData) {
  const [documentType, pageFormat] = text(formData, "starter").split(":");
  const template = await createAdvancedDocumentTemplate(await getActorUserId(), {
    name: text(formData, "name"),
    slug: text(formData, "slug"),
    description: text(formData, "description"),
    category: text(formData, "category") as TemplateCategory,
    documentType: documentType as TemplateDocumentType,
    pageFormat: pageFormat as TemplatePageFormat,
  });
  redirect(`/admin/templates/${template.id}/advanced`);
}

export async function duplicateTemplateAction(formData: FormData) {
  const template = await duplicateDocumentTemplate(await getActorUserId(), text(formData, "templateId"), {
    name: text(formData, "name"),
    slug: text(formData, "slug"),
  });
  redirect(
    template.layoutFamily === "advanced"
      ? `/admin/templates/${template.id}/advanced`
      : `/admin/templates/${template.id}`,
  );
}

export async function importTemplateAction(formData: FormData) {
  const template = await importDocumentTemplate(
    await getActorUserId(),
    json(formData, "template", "Template JSON", 5_000_000),
  );
  redirect(
    template.layoutFamily === "advanced"
      ? `/admin/templates/${template.id}/advanced`
      : `/admin/templates/${template.id}`,
  );
}

export async function updateTemplateMetadataAction(formData: FormData) {
  const templateId = text(formData, "templateId");
  await updateDocumentTemplate(await getActorUserId(), templateId, {
    name: text(formData, "name"),
    description: text(formData, "description"),
    category: text(formData, "category") as TemplateCategory,
  });
  revalidatePath("/admin/templates");
  revalidatePath(`/admin/templates/${templateId}/manage`);
}

export async function updateTemplateAction(formData: FormData) {
  const templateId = text(formData, "templateId");
  await updateDocumentTemplate(
    await getActorUserId(),
    templateId,
    json<Partial<DocumentTemplateContent>>(formData, "template", "Template changes", 5_000_000),
  );
  revalidatePath("/admin/templates");
  revalidatePath(`/admin/templates/${templateId}`);
  revalidatePath(`/admin/templates/${templateId}/advanced`);
}

export async function updateAndPublishTemplateAction(formData: FormData) {
  const templateId = text(formData, "templateId");
  await updateAndPublishDocumentTemplate(
    await getActorUserId(),
    templateId,
    json<Partial<DocumentTemplateContent>>(formData, "template", "Template changes", 5_000_000),
  );
  revalidatePath("/admin/templates");
  revalidatePath(`/admin/templates/${templateId}`);
  revalidatePath(`/admin/templates/${templateId}/advanced`);
  redirect("/admin/templates");
}

async function templateStateAction(formData: FormData, operation: (actor: string, id: string) => Promise<unknown>) {
  await operation(await getActorUserId(), text(formData, "templateId"));
  revalidatePath("/admin/templates");
}

export async function publishTemplateAction(formData: FormData) {
  return templateStateAction(formData, publishDocumentTemplate);
}

export async function archiveTemplateAction(formData: FormData) {
  return templateStateAction(formData, archiveDocumentTemplate);
}

export async function defaultTemplateAction(formData: FormData) {
  return templateStateAction(formData, setDefaultDocumentTemplate);
}
