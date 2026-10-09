"use client";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTranslations } from "next-intl";
import type { DocumentTemplate } from "@/lib/invoice-templates/index.ts";
import {
  Caption,
  Button,
  EmptyState,
  Input,
  SectionCard,
  SectionHeading,
  Select,
  StatusBadge,
} from "@/components/ui/index.tsx";
import { Check, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

interface TemplateSelectorProps {
  documentLabel?: string;
  selectedTemplateId: string;
  templates: readonly DocumentTemplate[];
  onSelect: (template: DocumentTemplate) => void;
}

export default function TemplateSelector({
  documentLabel,
  selectedTemplateId,
  templates,
  onSelect,
}: TemplateSelectorProps) {
  const t = useTranslations("Tool.runtime");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const label = documentLabel ?? t(`shared.templates.documentTypes.${templates[0]?.documentType ?? "document"}`);

  const categories = useMemo(() => {
    const list = new Set<string>();
    templates.forEach((template) => list.add(template.category));
    return ["all", ...Array.from(list)];
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      const matchSearch =
        template.name.toLowerCase().includes(search.toLowerCase()) ||
        template.description.toLowerCase().includes(search.toLowerCase());
      const matchCategory = activeCategory === "all" || template.category === activeCategory;
      return matchSearch && matchCategory;
    });
  }, [templates, search, activeCategory]);

  return (
    <SectionCard className="print:hidden" id="template-selector-container">
      <SectionHeading
        action={
          <StatusBadge variant="info">{t("shared.templates.styleCount", { count: templates.length })}</StatusBadge>
        }
        description={t("shared.templates.dynamicStructureScalesImmediatelyBasedOnLayout")}
        title={t("shared.templates.selectTemplate", { document: label })}
      />

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={t("shared.templates.searchTemplates", { document: label })}
            className="pl-9"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("shared.templates.searchLayoutNamesOrAttributes")}
            type="text"
            value={search}
          />
        </div>

        <div className="md:hidden">
          <Select
            aria-label={t("shared.templates.filterTemplates", { document: label })}
            onChange={(event) => setActiveCategory(event.target.value)}
            value={activeCategory}
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {t("shared.templates.categoryLabel", {
                  category: category === "all" ? t("shared.templates.allDesigns") : category.toUpperCase(),
                })}
              </option>
            ))}
          </Select>
        </div>

        <div className="hidden flex-wrap items-center gap-1.5 md:flex">
          {categories.map((category) => {
            const isActive = activeCategory === category;
            return (
              <Button
                aria-pressed={isActive}
                key={category}
                onClick={() => setActiveCategory(category)}
                size="sm"
                type="button"
                variant={isActive ? "default" : "secondary"}
              >
                {category === "all" ? t("shared.templates.allDesigns") : category.toUpperCase()}
              </Button>
            );
          })}
        </div>
      </div>

      {filteredTemplates.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3" id="template-options-grid">
          {filteredTemplates.map((template) => {
            const isSelected = template.id === selectedTemplateId;

            return (
              <Button
                aria-pressed={isSelected}
                className={`group h-auto min-h-40 w-full select-none flex-col items-stretch justify-between gap-3 whitespace-normal rounded-lg p-4 text-left ${
                  isSelected
                    ? "border-primary bg-accent ring-1 ring-primary"
                    : "border-border bg-card hover:border-primary/50 hover:bg-accent/40 hover:text-accent-foreground"
                }`}
                key={template.id}
                onClick={() => onSelect(template)}
                type="button"
                variant="outline"
              >
                <span className="space-y-2">
                  <span className="flex items-center justify-between gap-2">
                    <StatusBadge variant="info">{template.category}</StatusBadge>
                    {template.isDefault && (
                      <StatusBadge className="gap-1" variant="warning">
                        <Sparkles aria-hidden="true" className="size-3" />
                        {t("shared.templates.default")}
                      </StatusBadge>
                    )}
                  </span>
                  <span className="block text-foreground group-hover:text-accent-foreground">{template.name}</span>
                  <Caption className="line-clamp-2 block text-muted-foreground group-hover:text-accent-foreground">
                    {template.description}
                  </Caption>
                </span>

                <Caption className="flex items-center justify-between gap-2 border-t border-border pt-3 text-muted-foreground group-hover:text-accent-foreground">
                  <span>{t("shared.templates.layoutLabel", { layout: template.layoutFamily })}</span>
                  {isSelected ? (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Check aria-hidden="true" className="size-4" />
                      {t("shared.templates.active")}
                    </span>
                  ) : (
                    <span className="text-foreground group-hover:text-accent-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      {t("shared.templates.useStyle")}
                    </span>
                  )}
                </Caption>
              </Button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          description={t("shared.templates.tryAnotherSearchOrCategory")}
          title={t("shared.templates.noMatchingPublishedInvoiceThemes")}
        />
      )}
    </SectionCard>
  );
}
