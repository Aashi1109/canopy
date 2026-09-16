export type FeatureApp = "paperwork" | "devtools";

export interface FeatureManifestEntry {
  key: string;
  app: FeatureApp;
  defaultName: string;
  defaultDescription: string;
}

export interface FeatureOverride {
  key: string;
  app: FeatureApp;
  name: string;
  description: string;
  enabled: boolean;
}

export type ResolvedFeature = FeatureManifestEntry &
  Pick<FeatureOverride, "name" | "description" | "enabled">;

export function mergeFeatureOverrides(
  manifest: readonly FeatureManifestEntry[],
  overrides: readonly FeatureOverride[] = [],
): ResolvedFeature[] {
  const stored = new Map(
    overrides.map((override) => [`${override.app}:${override.key}`, override]),
  );

  return manifest.map((entry) => {
    const override = stored.get(`${entry.app}:${entry.key}`);
    return {
      ...entry,
      name: override?.name || entry.defaultName,
      description: override?.description || entry.defaultDescription,
      enabled: override?.enabled === true,
    };
  });
}

export function isFeatureEnabled(
  features: readonly ResolvedFeature[],
  app: FeatureApp,
  key: string,
): boolean {
  return features.some((feature) => feature.app === app && feature.key === key && feature.enabled);
}
