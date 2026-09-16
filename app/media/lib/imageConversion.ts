import type { ToolSpec } from "@/lib/tool-framework/spec";
import jpgPng from "@/tools/jpg-to-png/definition";
import jpgWebp from "@/tools/jpg-to-webp/definition";
import pngJpg from "@/tools/png-to-jpg/definition";
import pngWebp from "@/tools/png-to-webp/definition";
import webpJpg from "@/tools/webp-to-jpg/definition";
import webpPng from "@/tools/webp-to-png/definition";
import heicJpg from "@/tools/heic-to-jpg/definition";
import heicPng from "@/tools/heic-to-png/definition";

const CONVERSIONS: readonly ToolSpec[] = [
  jpgPng,
  jpgWebp,
  pngJpg,
  pngWebp,
  webpJpg,
  webpPng,
  heicJpg,
  heicPng,
];
export const IMAGE_OUTPUT_KEY = "imageOutputFormat";

export function resolveImageConversion(
  original: ToolSpec,
  values: Readonly<Record<string, unknown>>,
) {
  const registered = CONVERSIONS.find((entry) => entry.toolId === original.toolId);
  const key = original.toolId.split(".")[1];
  const [source, initialTarget] = key.split("-to-");
  const choices = registered
    ? CONVERSIONS.filter((entry) => entry.toolId.startsWith(`media.${source}-to-`))
    : [];
  const selected = choices.find(
    (entry) => entry.toolId === `media.${source}-to-${values[IMAGE_OUTPUT_KEY]}`,
  );
  const spec = selected ?? original;
  const target = selected ? selected.toolId.split("-to-")[1] : initialTarget;
  const settingKey = (field: string) =>
    target === initialTarget ? field : `conversion.${target}.${field}`;
  const settings = registered
    ? Object.fromEntries(
        Object.entries(spec.settings.fields).map(([field, definition]) => [
          field,
          values[settingKey(field)] ?? definition.default,
        ]),
      )
    : values;
  return { spec, key: spec.toolId.split(".")[1], source, target, choices, settings, settingKey };
}
