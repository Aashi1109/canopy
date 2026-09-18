/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ResolvedTool } from "@/lib/tool-catalog/index.ts";
import { Caption, H2, List, Muted, P, Text, Button, CatalogCard, StatusBadge } from "@/components/ui/index.tsx";
import {
  CheckCircle2,
  ClipboardCheck,
  Compass,
  DollarSign,
  FileText,
  Layers,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";

const TOOL_ICONS: Record<string, LucideIcon> = {
  "invoice-generator": FileText,
  "receipt-generator": FileText,
  "expense-report": ClipboardCheck,
  "mileage-log": Compass,
  "quarterly-tax-estimator": DollarSign,
  "w9-request": Layers,
  "1099-nec-tracker": Sparkles,
};

export default function RelatedTools({
  currentComponentKey,
  onTrackClick,
  tools: managedTools,
}: {
  currentComponentKey: string;
  onTrackClick: (itemName: string) => void;
  tools: readonly ResolvedTool[];
}) {
  const tools = managedTools.flatMap((tool) =>
    tool.slug && tool.componentKey !== currentComponentKey
      ? [
          {
            id: tool.id,
            title: tool.name,
            description: tool.description,
            path: `/paperwork/${tool.slug}`,
            Icon: TOOL_ICONS[tool.componentKey] ?? FileText,
          },
        ]
      : [],
  );

  const valueAero = [
    "Securely save and auto-fill business metadata",
    "Remove 'Generated with SmartTools Paperwork' PDF footnotes",
    "Track paid, late, and pending statuses effortlessly",
    "Consolidate annual reports into safe CSV spreadsheets",
    "E-mail generated invoices to clients with tracking triggers",
  ];

  return (
    <div className="mx-auto my-16 max-w-6xl space-y-12 px-4" id="toolkit-sections">
      <section
        className="relative overflow-hidden rounded-3xl bg-foreground p-8 text-background shadow-lg md:p-10"
        id="monetization-banner"
      >
        <Text
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-background/10"
        />
        <Text
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 left-1/3 size-96 rounded-full bg-background/5"
        />

        <div className="relative z-10 max-w-2xl space-y-4">
          <StatusBadge className="gap-1.5" variant="info">
            <Zap aria-hidden="true" className="size-3" />
            Excellent upgrade options
          </StatusBadge>
          <H2>Streamline Your Business with SmartTools Paperwork Pro</H2>
          <P className="text-background/70">
            Draft free invoices as long as you want. When your independent freelance practice or contractor operations
            expand, unlock advanced time-saving features:
          </P>

          <List className="grid gap-3 pt-2 text-background/80 md:grid-cols-2">
            {valueAero.map((item) => (
              <li className="flex items-start gap-2" key={item}>
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-background/60" />
                <Text>{item}</Text>
              </li>
            ))}
          </List>

          <div className="flex flex-wrap items-center gap-4 pt-4">
            <Button onClick={() => onTrackClick("upgrade_pro_clicked")} type="button" variant="secondary">
              Learn More &amp; Join Waiting List
            </Button>
            <Caption className="text-background/60">No credit card required • Early Bird Access</Caption>
          </div>
        </div>
      </section>

      <section className="space-y-6" id="related-tools-block">
        <div className="mx-auto max-w-xl space-y-2 text-center">
          <H2 className="text-foreground">Comprehensive Paperwork Toolkit</H2>
          <Muted className="text-muted-foreground">
            Simplify administrative workflows with professional single-click small business generators.
          </Muted>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const Icon = tool.Icon;
            return (
              <CatalogCard
                action="Launch generator →"
                description={tool.description}
                href={tool.path}
                id={`tool-card-${tool.id}`}
                icon={<Icon aria-hidden="true" />}
                key={tool.id}
                onClick={() => onTrackClick(`related_tool_${tool.id}_clicked`)}
                status={<StatusBadge variant="success">Available</StatusBadge>}
                title={tool.title}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
