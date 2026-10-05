import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { createTranslator, type AbstractIntlMessages } from "use-intl/core";
import { isLocale, locales, type Locale } from "../i18n/config.ts";
import type { ToolSpec } from "./spec.ts";

export type ToolMessages = Record<string, string>;
export type ToolTranslations = Partial<
  Record<
    Locale,
    {
      status: "draft" | "published";
      messages: ToolMessages;
    }
  >
>;
export type TranslationIssue = { key: string; message: string };

const MAX_MESSAGE_LENGTH = 20_000;
const MAX_MESSAGES = 2_000;
const unsafeSegment = /(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|$)/;
const segment = (value: string) => encodeURIComponent(value).replaceAll(".", "%2E");

/** Bootstrap copy is plain text; runtime messages explicitly use native ICU. */
export function escapeToolText(text: string): string {
  return text.replaceAll("'", "''").replaceAll("{", "'{'").replaceAll("}", "'}'").replaceAll("<", "'<'");
}

export function formatToolMessage(
  locale: string,
  message: string,
  values?: Record<string, string | number | Date>,
): string {
  return createTranslator({
    locale,
    messages: { message },
    onError: (error) => {
      throw error;
    },
  })("message", values);
}

/** Only explicitly display-owned fields are visited. Examples and processing values remain exact. */
function mapToolText(spec: ToolSpec, text: (key: string, source: string) => string): ToolSpec {
  const optional = (key: string, value: string | undefined) => (value === undefined ? undefined : text(key, value));
  const input =
    spec.input.kind === "none"
      ? spec.input
      : {
          ...spec.input,
          label: text("input.label", spec.input.label),
          ...(spec.input.kind === "text"
            ? {
                placeholder: spec.input.language
                  ? spec.input.placeholder
                  : optional("input.placeholder", spec.input.placeholder),
                secondary: spec.input.secondary
                  ? {
                      ...spec.input.secondary,
                      label: text("input.secondary.label", spec.input.secondary.label),
                      placeholder: spec.input.secondary.language
                        ? spec.input.secondary.placeholder
                        : optional("input.secondary.placeholder", spec.input.secondary.placeholder),
                    }
                  : undefined,
              }
            : {}),
          ...(spec.input.kind === "files"
            ? { dropzoneDescription: optional("input.dropzoneDescription", spec.input.dropzoneDescription) }
            : {}),
          ...(spec.input.kind === "fields"
            ? {
                fields: spec.input.fields.map((field) => ({
                  ...field,
                  label: text(`input.fields.${field.channel}.label`, field.label),
                  placeholder: field.language
                    ? field.placeholder
                    : optional(`input.fields.${field.channel}.placeholder`, field.placeholder),
                })),
              }
            : {}),
        };
  return {
    ...spec,
    name: text("name", spec.name),
    description: text("description", spec.description),
    input,
    keywords: spec.keywords.map((keyword, index) => text(`keywords.${index}`, keyword)),
    settings: {
      fields: Object.fromEntries(
        Object.entries(spec.settings.fields).map(([id, field]) => {
          const key = `settings.${segment(id)}`;
          return [
            id,
            {
              ...field,
              label: text(`${key}.label`, field.label),
              help: optional(`${key}.help`, field.help),
              ...("placeholder" in field ? { placeholder: optional(`${key}.placeholder`, field.placeholder) } : {}),
              ...("suffix" in field ? { suffix: optional(`${key}.suffix`, field.suffix) } : {}),
              ...(field.kind === "rows"
                ? {
                    keyLabel: text(`${key}.keyLabel`, field.keyLabel),
                    valueLabel: text(`${key}.valueLabel`, field.valueLabel),
                  }
                : {}),
              ...("choices" in field
                ? {
                    choices: field.choices.map((choice) => ({
                      ...choice,
                      label: text(`${key}.choices.${segment(choice.value)}.label`, choice.label),
                      ...("detail" in choice
                        ? { detail: optional(`${key}.choices.${segment(choice.value)}.detail`, choice.detail) }
                        : {}),
                    })),
                  }
                : {}),
            },
          ];
        }),
      ),
    },
    trigger:
      spec.trigger.mode === "manual"
        ? { ...spec.trigger, actionLabel: text("trigger.actionLabel", spec.trigger.actionLabel) }
        : spec.trigger,
    labels: {
      ...spec.labels,
      empty: text("labels.empty", spec.labels.empty),
      ready: text("labels.ready", spec.labels.ready),
      running: text("labels.running", spec.labels.running),
      result: text("labels.result", spec.labels.result ?? "Result"),
    },
    optionsPanel: spec.optionsPanel
      ? {
          ...spec.optionsPanel,
          title: optional("optionsPanel.title", spec.optionsPanel.title),
          note: optional("optionsPanel.note", spec.optionsPanel.note),
        }
      : undefined,
    resultView: spec.resultView
      ? { ...spec.resultView, previewLabel: optional("resultView.previewLabel", spec.resultView.previewLabel) }
      : undefined,
    content: {
      ...spec.content,
      seoTitle: optional("seoTitle", spec.content.seoTitle),
      howToUse: spec.content.howToUse.map((value, index) => text(`content.howToUse.${index}`, value)),
      limitations: spec.content.limitations?.map((value, index) => text(`content.limitations.${index}`, value)),
      faq: spec.content.faq?.map((entry, index) => ({
        q: text(`content.faq.${index}.q`, entry.q),
        a: text(`content.faq.${index}.a`, entry.a),
      })),
      examples: spec.content.examples?.map((example, index) => ({
        ...example,
        label: text(`content.examples.${index}.label`, example.label),
      })),
    },
  };
}

export function extractToolMessages(
  spec: ToolSpec,
  metadata?: { seoTitle?: string; seoDescription?: string },
): ToolMessages {
  const messages: ToolMessages = {};
  mapToolText(spec, (key, value) => {
    messages[key] = escapeToolText(value);
    return value;
  });
  messages.seoTitle = escapeToolText(metadata?.seoTitle ?? spec.content.seoTitle ?? spec.name);
  messages.seoDescription = escapeToolText(metadata?.seoDescription ?? spec.description);
  for (const [key, value] of Object.entries(spec.messages ?? {})) messages[`runtime.${key}`] = value;
  return messages;
}

export function applyToolMessages(spec: ToolSpec, messages: ToolMessages, locale: string): ToolSpec {
  return mapToolText(spec, (key, value) =>
    Object.hasOwn(messages, key) ? formatToolMessage(locale, messages[key]!) : value,
  );
}

function messageArguments(
  elements: MessageFormatElement[],
  locale: string,
  publish: boolean,
  args = new Map<string, string>(),
): Map<string, string> {
  for (const element of elements) {
    if (element.type === TYPE.tag) throw new Error("HTML and rich-text tags are not supported in tool messages.");
    if (element.type === TYPE.literal || element.type === TYPE.pound) continue;
    const kind =
      element.type === TYPE.argument
        ? "any"
        : element.type === TYPE.plural || element.type === TYPE.number
          ? "number"
          : element.type === TYPE.date || element.type === TYPE.time
            ? "date"
            : "string";
    const previous = args.get(element.value);
    if (previous && previous !== "any" && kind !== "any" && previous !== kind)
      throw new Error(`Conflicting types for {${element.value}}.`);
    args.set(element.value, previous && kind === "any" ? previous : kind);
    if (element.type === TYPE.plural || element.type === TYPE.select) {
      if (element.type === TYPE.plural && publish) {
        const required = new Intl.PluralRules(locale, { type: element.pluralType }).resolvedOptions().pluralCategories;
        for (const category of required) {
          if (!element.options[category]) throw new Error(`Add the '${category}' plural form for ${locale}.`);
        }
      }
      for (const option of Object.values(element.options)) messageArguments(option.value, locale, publish, args);
    }
  }
  return args;
}

function messageBranches(elements: MessageFormatElement[]): string[] {
  return [
    ...new Set(
      elements.flatMap((element) => {
        if (element.type !== TYPE.select && element.type !== TYPE.plural) return [];
        const choices = Object.keys(element.options);
        const contract =
          element.type === TYPE.select
            ? `select:${element.value}:${choices.sort().join(",")}`
            : `plural:${element.value}:${element.pluralType}:${element.offset}:${choices
                .filter((key) => key.startsWith("="))
                .sort()
                .join(",")}`;
        return [contract, ...Object.values(element.options).flatMap((option) => messageBranches(option.value))];
      }),
    ),
  ].sort();
}

export function validateToolTranslation(
  locale: string,
  messages: unknown,
  englishMessages: ToolMessages,
  { publish }: { publish: boolean },
): TranslationIssue[] {
  const issues: TranslationIssue[] = [];
  if (!isLocale(locale)) return [{ key: "locale", message: "Choose a supported language." }];
  if (!messages || typeof messages !== "object" || Array.isArray(messages))
    return [{ key: "messages", message: "Messages must be an object." }];
  const entries = Object.entries(messages);
  if (entries.length > MAX_MESSAGES || JSON.stringify(messages).length > 500_000)
    return [{ key: "messages", message: "Translation content is too large." }];
  const keys = entries.map(([key]) => key).sort();
  const conflictingKeys = new Set(keys.filter((key, index) => keys[index + 1]?.startsWith(`${key}.`)));
  for (const [key, value] of entries) {
    if (
      unsafeSegment.test(key) ||
      key.split(".").some((part) => !part) ||
      !Object.hasOwn(englishMessages, key) ||
      conflictingKeys.has(key)
    ) {
      issues.push({ key, message: "Unknown message key." });
      continue;
    }
    if (typeof value !== "string" || value.length > MAX_MESSAGE_LENGTH) {
      issues.push({ key, message: "Enter text of at most 20,000 characters." });
      continue;
    }
    if (!value.trim()) continue; // Empty draft fields are missing; publication checks below.
    try {
      const sourceTree = parse(englishMessages[key]!);
      const targetTree = parse(value);
      const source = messageArguments(sourceTree, "en", false);
      const target = messageArguments(targetTree, locale, publish);
      if (source.size !== target.size || [...source].some(([name, kind]) => target.get(name) !== kind)) {
        throw new Error(
          `Keep the same placeholders as English: ${[...source.keys()].map((name) => `{${name}}`).join(", ") || "none"}.`,
        );
      }
      if (JSON.stringify(messageBranches(sourceTree)) !== JSON.stringify(messageBranches(targetTree))) {
        throw new Error("Keep the English select choices, explicit number choices and plural offsets.");
      }
    } catch (error) {
      issues.push({ key, message: error instanceof Error ? error.message : "Invalid ICU message." });
    }
  }
  if (publish)
    for (const key of Object.keys(englishMessages)) {
      if (
        !Object.hasOwn(messages, key) ||
        typeof (messages as ToolMessages)[key] !== "string" ||
        !(messages as ToolMessages)[key]!.trim()
      ) {
        issues.push({ key, message: "Translate this field before publishing." });
      }
    }
  return issues;
}

/** Validate stored JSON again at the public boundary; never return draft/all-locale payloads. */
export function resolveToolTranslation(
  translations: unknown,
  locale: string,
  required: ToolMessages,
): { messages: ToolMessages; availableLocales: Locale[] } | null {
  if (!isLocale(locale) || !translations || typeof translations !== "object" || Array.isArray(translations))
    return null;
  const records = translations as ToolTranslations;
  const english = records.en;
  if (
    english?.status !== "published" ||
    validateToolTranslation("en", english.messages, required, { publish: true }).length
  )
    return null;
  const availableLocales = locales.filter((candidate) => {
    const translation = records[candidate];
    return (
      translation?.status === "published" &&
      !validateToolTranslation(candidate, translation.messages, english.messages, { publish: true }).length
    );
  });
  if (!availableLocales.includes(locale)) return null;
  return { messages: { ...records[locale]!.messages }, availableLocales };
}

export function toolMessageTree(messages: ToolMessages): AbstractIntlMessages {
  const tree: Record<string, unknown> = { runtime: {} };
  for (const [key, value] of Object.entries(messages)) {
    if (unsafeSegment.test(key)) continue;
    const parts = key.split(".");
    let node = tree;
    for (const part of parts.slice(0, -1)) {
      const next = Object.hasOwn(node, part) ? node[part] : undefined;
      if (next === undefined) node[part] = {};
      else if (typeof next !== "object" || next === null) throw new Error(`Conflicting message key: ${key}`);
      node = node[part] as Record<string, unknown>;
    }
    node[parts.at(-1)!] = value;
  }
  return tree as AbstractIntlMessages;
}
