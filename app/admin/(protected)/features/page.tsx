import { SubmitButton } from "@/app/admin/(protected)/components/SubmitButton";
import { featureManifest, getFeatures } from "@smarttools/control-plane";
import {
  InlineCode,
  Overline,
  P,
  TextLink,
  Card,
  EmptyState,
  Field,
  Input,
  StatusBadge,
  Textarea,
  ToolPageHeader,
} from "@smarttools/ui";
import { Flag, History } from "lucide-react";
import { requirePagePermission } from "../../../../lib/admin/access";
import { toggleFeatureAction, updateFeatureAction } from "../../actions";

export default async function FeaturesPage() {
  await requirePagePermission("features", "view");
  const features = await getFeatures(featureManifest);

  const enabledCount = features.filter((feature) => feature.enabled).length;
  const appCount = new Set(features.map((feature) => feature.app)).size;

  return (
    <>
      <ToolPageHeader
        actions={
          <TextLink
            className="inline-flex h-10 items-center gap-2 rounded-full border border-input bg-card px-4 hover:bg-muted"
            href="/admin/audit"
          >
            <History aria-hidden="true" className="size-4" />
            View history
          </TextLink>
        }
        className="mb-5"
        description="Control releases per app and keep operational context current. New registrations start disabled."
        eyebrow="Release controls"
        title="Feature flags"
      />
      {features.length ? (
        <div className="space-y-5">
          <div className="grid overflow-hidden rounded-lg bg-surface-ink text-on-ink sm:grid-cols-3">
            {[
              ["Total flags", features.length],
              ["Enabled", enabledCount],
              ["Active apps", appCount],
            ].map(([label, value], index) => (
              <div
                className={`px-5 py-4 ${index ? "border-t border-white/10 sm:border-t-0 sm:border-l" : ""}`}
                key={label}
              >
                <Overline className="block text-on-ink-muted">{label}</Overline>
                <P className={`mt-1 ${label === "Enabled" ? "text-success" : ""}`}>{value}</P>
              </div>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {features.map((feature) => (
              <Card className="overflow-hidden p-0" key={`${feature.app}:${feature.key}`}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/60 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <InlineCode className="break-all text-foreground">{feature.key}</InlineCode>
                      <StatusBadge variant={feature.enabled ? "success" : "neutral"}>
                        {feature.enabled ? "Enabled" : "Disabled"}
                      </StatusBadge>
                    </div>
                    <Overline className="block mt-1 text-muted-foreground">{feature.app}</Overline>
                  </div>
                  <form action={toggleFeatureAction}>
                    <input name="app" type="hidden" value={feature.app} />
                    <input name="key" type="hidden" value={feature.key} />
                    <input name="enabled" type="hidden" value={String(!feature.enabled)} />
                    <SubmitButton
                      size="sm"
                      type="submit"
                      variant={feature.enabled ? "secondary" : "default"}
                    >
                      {feature.enabled ? "Disable" : "Enable"}
                    </SubmitButton>
                  </form>
                </div>
                <form action={updateFeatureAction} className="grid gap-4 p-5">
                  <input name="app" type="hidden" value={feature.app} />
                  <input name="key" type="hidden" value={feature.key} />
                  <Field
                    htmlFor={`${feature.app}-${feature.key}-name`}
                    label="Display name"
                    required
                  >
                    <Input defaultValue={feature.name} name="name" required />
                  </Field>
                  <Field
                    htmlFor={`${feature.app}-${feature.key}-description`}
                    label="Description"
                    required
                  >
                    <Textarea defaultValue={feature.description} name="description" required />
                  </Field>
                  <SubmitButton className="justify-self-end" size="sm" type="submit">
                    Save changes
                  </SubmitButton>
                </form>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          description="Register a feature key in code to manage its app-specific override and rollout state here."
          icon={<Flag aria-hidden="true" />}
          title="No feature flags yet"
        />
      )}
    </>
  );
}
