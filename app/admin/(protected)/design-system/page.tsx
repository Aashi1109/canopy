"use client";
import {
  H1,
  H2,
  H3,
  H4,
  H5,
  H6,
  Display,
  P,
  Text,
  Lead,
  Large,
  Small,
  Muted,
  Caption,
  Overline,
  Metric,
  Strong,
  Blockquote,
  List,
  OrderedList,
  InlineCode,
  CodeBlock,
  TextLink,
} from "@/components/ui/components/typography.tsx";

import { OrderableList } from "@/components/ui/components/OrderableList.tsx";
import {
  AccountNavigation,
  Alert,
  AlertBanner,
  AlertDescription,
  AlertTitle,
  AppContainer,
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
  Badge,
  BrandLockup,
  Button,
  ToolActionButton,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CatalogCard,
  ChapterScrubber,
  Checkbox,
  CompactAction,
  DownloadResult,
  FileQueueItem,
  FileUploadZone,
  CheckboxControl,
  DangerZone,
  DESIGN_SYSTEM_COMPONENTS,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyState,
  EmptyTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldRoot,
  FieldSeparator,
  FieldSet,
  FieldTitle,
  HowItWorks,
  IconTile,
  InlineGuidance,
  InlineTextEditor,
  Input,
  Label,
  MetricCard,
  MediaPreview,
  MediaOutputCard,
  PageHero,
  PdfViewer,
  ProcessingStatus,
  ProductHeader,
  RightPanelResult,
  SidebarNavItem,
  RadioGroup,
  RadioGroupItem,
  SectionCard,
  SectionHeading,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Separator,
  StatusBadge,
  Switch,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  SegmentedControl,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
  Toaster,
  ToolNav,
  ToolOptionsPanel,
  ToolPageIntro,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  ToolPageHeader,
} from "@/components/ui/index.tsx";
import {
  AlertTriangle,
  Bell,
  Check,
  Copy,
  FilePlus2,
  FileText,
  GripVertical,
  Info,
  MoreHorizontal,
  Plus,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { Chapter, PdfOutlineItem } from "@/components/ui/index.tsx";

const sections = [
  ["#foundations", "Foundations"],
  ["#actions", "Actions"],
  ["#forms", "Forms"],
  ["#navigation", "Navigation"],
  ["#feedback", "Feedback"],
  ["#data", "Data"],
  ["#coverage", "Coverage"],
  ["#compositions", "Compositions"],
] as const;

const swatches = [
  { className: "bg-primary", label: "Accent", value: "#0066FF" },
  { className: "bg-accent", label: "Accent soft", value: "#E8F0FF" },
  { className: "bg-foreground", label: "Ink", value: "#1A1A1A" },
  { className: "bg-muted", label: "Muted", value: "#F6F7F9" },
  { className: "bg-success", label: "Success", value: "#12A150" },
  { className: "bg-warning", label: "Warning", value: "#B45309" },
  { className: "bg-destructive", label: "Danger", value: "#DC2626" },
] as const;

const initialDocuments = [
  { id: "receipt", label: "Receipt summary" },
  { id: "invoice", label: "Invoice details" },
  { id: "notes", label: "Internal notes" },
];

const controlSizes = [
  ["xs", "Extra small"],
  ["sm", "Small"],
  ["default", "Default"],
  ["md", "Medium"],
  ["lg", "Large"],
] as const;

const workflowChapters: Chapter[] = [
  {
    id: "upload",
    title: "Add source files",
    description: "Choose the files you want to process on this device.",
    meta: "Step 01",
  },
  {
    id: "review",
    title: "Review the queue",
    description: "Confirm file order, names, sizes, and compatibility.",
    meta: "Step 02",
  },
  {
    id: "settings",
    title: "Adjust settings",
    description: "Choose only the options needed for this output.",
    meta: "Step 03",
  },
  {
    id: "validate",
    title: "Validate inputs",
    description: "Resolve any unsupported files or missing requirements.",
    meta: "Step 04",
  },
  {
    id: "process",
    title: "Process locally",
    description: "Keep the task open while the browser prepares the result.",
    meta: "Step 05",
  },
  {
    id: "inspect",
    title: "Inspect the result",
    description: "Check the generated file details before saving it.",
    meta: "Step 06",
  },
  {
    id: "download",
    title: "Download output",
    description: "Save the finished file to your device.",
    meta: "Step 07",
  },
];

const handbookOutline: PdfOutlineItem[] = [
  { expanded: true, id: "welcome", page: 1, title: "Welcome" },
  { expanded: true, id: "getting-started", page: 2, title: "Getting started" },
  { depth: 1, id: "installation", page: 3, title: "Installation" },
  { depth: 1, id: "workspace-tour", page: 5, title: "Workspace tour" },
  { expanded: true, id: "core-workflows", page: 8, title: "Core workflows" },
  { depth: 1, id: "review", page: 9, title: "Review & approve" },
  { depth: 1, id: "sharing", page: 12, title: "Share documents" },
  { expanded: true, id: "automation", page: 16, title: "Automation" },
  { depth: 1, id: "rules", page: 17, title: "Rules & triggers" },
  { expanded: true, id: "appendix", page: 22, title: "Appendix" },
];

function handbookSectionAtPage(page: number) {
  return (
    [...handbookOutline].filter((item) => item.page <= page).sort((left, right) => right.page - left.page)[0] ??
    handbookOutline[0]
  );
}

function Specimen({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <div className={className}>
      <Muted className="mb-3 text-muted-foreground">{label}</Muted>
      {children}
    </div>
  );
}

export default function DesignSystemPage() {
  const [documents, setDocuments] = useState(initialDocuments);
  const [handbookPage, setHandbookPage] = useState(9);
  const [mediaPreviewOpen, setMediaPreviewOpen] = useState(false);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(4);
  const [inlineTitle, setInlineTitle] = useState("Viewer");
  const [inlineDescription, setInlineDescription] = useState("Can view content without making changes.");
  const handbookSection = handbookSectionAtPage(handbookPage);

  return (
    <>
      <ToolPageHeader
        actions={<StatusBadge variant="success">Live components</StatusBadge>}
        description="Every component below is rendered from @/components/ui/index.tsx with the tokens and visual language defined in design.pen."
        eyebrow="Design system"
        title="Component showcase"
      />

      <ToolNav
        ariaLabel="Component showcase sections"
        className="sticky top-0 z-20 -mx-4 border-y border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
        items={sections.map(([href, label]) => ({ href, label }))}
      />

      <div className="mt-12 space-y-16">
        <section className="scroll-mt-24" id="foundations">
          <SectionHeading
            description="The shared palette, typography, radius, spacing, and elevation from design.pen."
            eyebrow="01"
            title="Foundations"
          />
          <SectionCard>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {swatches.map((swatch) => (
                <div className="overflow-hidden rounded-xl border border-border bg-card" key={swatch.label}>
                  <div className={`h-20 ${swatch.className}`} />
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <Caption className="">{swatch.label}</Caption>
                    <InlineCode className="text-muted-foreground">{swatch.value}</InlineCode>
                  </div>
                </div>
              ))}
            </div>
            <Separator />
            <div className="grid gap-8 lg:grid-cols-3">
              <Specimen className="lg:col-span-3" label="Display · Inter · 48px / 700">
                <Display>Receipts, done right.</Display>
              </Specimen>
              <Specimen label="H1 · Inter · 32px / 600">
                <H1>Page heading</H1>
              </Specimen>
              <Specimen label="H2 · Inter · 24px / 600">
                <H2>Section heading</H2>
              </Specimen>
              <Specimen label="H3 · Inter · 20px / 600">
                <H3>Panel heading</H3>
              </Specimen>
              <Specimen label="H4 · Inter · 18px / 600">
                <H4>Subsection heading</H4>
              </Specimen>
              <Specimen label="H5 · Inter · 16px / 600">
                <H5>Nested heading</H5>
              </Specimen>
              <Specimen label="H6 · Inter · 15px / 600">
                <H6>Deeply nested heading</H6>
              </Specimen>
              <Specimen label="P · Geist · 15px">
                <P>Body content wraps naturally without fixed heights.</P>
              </Specimen>
              <Specimen label="Text · Geist · 15px">
                <Text>Inline body text.</Text>
              </Specimen>
              <Specimen label="Lead · Geist · 18px">
                <Lead>Introductory copy that explains the page.</Lead>
              </Specimen>
              <Specimen label="Large · Geist · 18px / 600">
                <Large>Prominent supporting text</Large>
              </Specimen>
              <Specimen label="Small · Funnel Sans · 13px / 500">
                <Small>Small supporting text</Small>
              </Specimen>
              <Specimen label="Muted · Geist · 13px">
                <Muted>Secondary descriptions and helper copy.</Muted>
              </Specimen>
              <Specimen label="Caption · Funnel Sans · 13px">
                <Caption>6 tools · Updated today</Caption>
              </Specimen>
              <Specimen label="Overline · Funnel Sans · 11px / 600">
                <Overline>Documents</Overline>
              </Specimen>
              <Specimen label="Metric · Inter · 32px / 600">
                <Metric>1,024</Metric>
              </Specimen>
              <Specimen label="Strong · inherited size / 600">
                <P>
                  Review the <Strong>final result</Strong> before exporting.
                </P>
              </Specimen>
              <Specimen label="Blockquote">
                <Blockquote>Keep related content together.</Blockquote>
              </Specimen>
              <Specimen label="List">
                <List>
                  <li>Add your input</li>
                  <li>Review the result</li>
                </List>
              </Specimen>
              <Specimen label="OrderedList">
                <OrderedList>
                  <li>Choose a tool</li>
                  <li>Export your result</li>
                </OrderedList>
              </Specimen>
              <Specimen label="InlineCode · Geist Mono · 12px">
                <P>
                  Use <InlineCode>JSON.stringify()</InlineCode> to serialize data.
                </P>
              </Specimen>
              <Specimen label="CodeBlock · Geist Mono · 12px">
                <CodeBlock>{'{\n  "ready": true\n}'}</CodeBlock>
              </Specimen>
              <Specimen label="TextLink · inherited size">
                <TextLink href="#typography-guidelines">Typography guidelines</TextLink>
              </Specimen>
            </div>
            <Muted id="typography-guidelines">
              Use named components without font overrides. H1–H6 follow the document hierarchy; fields and controls own
              their labels. Layout classes stay with the layout.
            </Muted>
            <Separator />
            <Specimen label="App container">
              <div className="rounded-xl bg-muted py-4">
                <AppContainer className="max-w-none">
                  <div className="rounded-lg border border-dashed border-primary/40 bg-card px-4 py-3 text-center text-muted-foreground">
                    <Caption>Responsive content boundary</Caption>
                  </div>
                </AppContainer>
              </div>
            </Specimen>
          </SectionCard>
        </section>

        <section className="scroll-mt-24" id="actions">
          <SectionHeading
            description="Action hierarchy stays clear while every state uses the same focus and spacing rules."
            eyebrow="02"
            title="Actions and badges"
          />
          <SectionCard>
            <Specimen label="Tool actions — shared by every tool">
              <Muted className="text-muted-foreground">
                Use ToolActionButton for paste, upload, copy, and download. Keep artifact labels and feedback specific;
                use iconOnly for compact result toolbars.
              </Muted>
              <div className="flex flex-wrap items-center gap-2">
                <ToolActionButton action="paste" />
                <ToolActionButton action="upload" />
                <ToolActionButton action="copy" />
                <ToolActionButton action="copy" disabled />
                <ToolActionButton action="copy" iconOnly aria-label="Copy result" />
                <ToolActionButton action="download" iconOnly aria-label="Download result" />
                <ToolActionButton action="download">Download PDF</ToolActionButton>
              </div>
            </Specimen>
            <Separator />
            <Specimen label="Button variants">
              <div className="flex flex-wrap items-center gap-3">
                <Button>
                  <Plus />
                  Primary
                </Button>
                <Button variant="strong">Strong</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">
                  <Trash2 />
                  Destructive
                </Button>
                <Button variant="danger-subtle">Danger subtle</Button>
                <Button variant="link">Link action</Button>
                <Button disabled>Disabled</Button>
                <Button loading>Loading</Button>
              </div>
            </Specimen>
            <Separator />
            <div className="grid gap-8 lg:grid-cols-2">
              <Specimen label="Button sizes">
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="xs">Extra small</Button>
                  <Button size="sm">Small</Button>
                  <Button>Default</Button>
                  <Button size="md">Medium</Button>
                  <Button size="lg">Large</Button>
                </div>
              </Specimen>
              <Specimen label="Icon actions">
                <div className="flex flex-wrap items-center gap-3">
                  <Button aria-label="Add item" size="icon-xs" variant="outline">
                    <Plus />
                  </Button>
                  <Button aria-label="Copy value" size="icon-sm" variant="outline">
                    <Copy />
                  </Button>
                  <Button aria-label="Notifications" size="icon" variant="outline">
                    <Bell />
                  </Button>
                  <Button aria-label="Add item" size="icon-md" variant="outline">
                    <Plus />
                  </Button>
                  <Button aria-label="Upload file" size="icon-lg">
                    <Upload />
                  </Button>
                </div>
              </Specimen>
            </div>
            <Separator />
            <div className="grid gap-8 lg:grid-cols-2">
              <Specimen label="Badge variants">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="outline">Outline</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                  <Badge variant="ghost">Ghost</Badge>
                  <Badge variant="link">Link</Badge>
                </div>
              </Specimen>
              <Specimen label="Status badges">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge>Disabled</StatusBadge>
                  <StatusBadge variant="info">In review</StatusBadge>
                  <StatusBadge variant="success">Available</StatusBadge>
                  <StatusBadge variant="warning">Setup required</StatusBadge>
                  <StatusBadge variant="danger">Failed</StatusBadge>
                  <StatusBadge variant="archived">Archived</StatusBadge>
                </div>
              </Specimen>
            </div>
          </SectionCard>
        </section>

        <section className="scroll-mt-24" id="forms">
          <SectionHeading
            description="Native inputs and Radix controls share one accessible field language."
            eyebrow="03"
            title="Form controls"
          />
          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard>
              <SectionHeading
                className="mb-0"
                description="Double-click text or use the edit button. Focus and press Enter to edit with a keyboard."
                title="Inline editing"
              />
              <H2>
                <InlineTextEditor
                  label="Example role name"
                  maxLength={160}
                  onChange={setInlineTitle}
                  required
                  value={inlineTitle}
                />
              </H2>
              <Muted>
                <InlineTextEditor
                  label="Example role description"
                  maxLength={2000}
                  multiline
                  onChange={setInlineDescription}
                  required
                  value={inlineDescription}
                />
              </Muted>
              <Caption>
                Enter finishes editing. Shift+Enter adds a new line in descriptions. Escape cancels. Clicking outside
                keeps your draft.
              </Caption>
              <Specimen label="Disabled">
                <Muted>
                  <InlineTextEditor disabled label="Locked role name" onChange={setInlineTitle} value="Administrator" />
                </Muted>
              </Specimen>
            </SectionCard>
            <SectionCard>
              <SectionHeading
                className="mb-0"
                description="Compatibility field composition used across the product."
                title="Common fields"
              />
              <Field
                description="We will only use this for document updates."
                htmlFor="showcase-email"
                label="Email"
                required
              >
                <Input defaultValue="jane@company.com" id="showcase-email" type="email" />
              </Field>
              <Field error="Enter a valid invoice reference." htmlFor="showcase-reference" label="Invoice reference">
                <Input aria-invalid defaultValue="INV /" id="showcase-reference" />
              </Field>
              <Field
                htmlFor="showcase-width"
                label="Width"
                description="Decorative leading icon and unit suffix remain clear at compact densities."
              >
                <Input id="showcase-width" type="number" defaultValue={523} leadingIcon={<span>↔</span>} suffix="pt" />
              </Field>
              <Field htmlFor="showcase-message" label="Message">
                <Textarea defaultValue="Thanks for your business." id="showcase-message" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field htmlFor="showcase-document-type" label="Document type">
                  <Select defaultValue="receipt">
                    <SelectTrigger id="showcase-document-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receipt">Receipt</SelectItem>
                      <SelectItem value="invoice">Invoice</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field htmlFor="showcase-template" label="Template">
                  <Select defaultValue="classic">
                    <SelectTrigger id="showcase-template">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Simple</SelectLabel>
                        <SelectItem value="classic">Classic</SelectItem>
                        <SelectItem value="compact">Compact</SelectItem>
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Expressive</SelectLabel>
                        <SelectItem value="bold">Bold</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </SectionCard>

            <SectionCard>
              <SectionHeading
                className="mb-0"
                description="Composable shadcn field primitives."
                title="Primitive field group"
              />
              <FieldSet>
                <FieldLegend>Delivery preferences</FieldLegend>
                <FieldGroup>
                  <FieldRoot orientation="horizontal">
                    <Switch defaultChecked id="showcase-auto-save" />
                    <FieldContent>
                      <FieldLabel htmlFor="showcase-auto-save">Auto-save drafts</FieldLabel>
                      <FieldDescription>Keep local changes while you work.</FieldDescription>
                    </FieldContent>
                  </FieldRoot>
                  <FieldSeparator>Or choose manually</FieldSeparator>
                  <FieldRoot orientation="horizontal">
                    <CheckboxControl defaultChecked id="showcase-confirmation" />
                    <FieldContent>
                      <FieldTitle>Email confirmation</FieldTitle>
                      <FieldLabel className="sr-only" htmlFor="showcase-confirmation">
                        Enable email confirmation
                      </FieldLabel>
                      <FieldDescription>Send a copy after each successful export.</FieldDescription>
                    </FieldContent>
                  </FieldRoot>
                  <FieldRoot data-invalid>
                    <FieldLabel htmlFor="showcase-required-code">Reference code</FieldLabel>
                    <Input aria-invalid id="showcase-required-code" placeholder="Required" />
                    <FieldError>This field is required.</FieldError>
                  </FieldRoot>
                </FieldGroup>
              </FieldSet>
            </SectionCard>

            <SectionCard>
              <SectionHeading
                className="mb-0"
                description="Five shared dimensions map directly to the current Pencil controls."
                title="Input and select sizes"
              />
              <div className="grid gap-6 sm:grid-cols-2">
                <Specimen label="Text inputs">
                  <div className="space-y-4">
                    {controlSizes.map(([size, label]) => (
                      <div className="grid gap-2" key={size}>
                        <Label htmlFor={`input-${size}`}>{label}</Label>
                        <Input id={`input-${size}`} placeholder={`${label} input`} size={size} />
                      </div>
                    ))}
                  </div>
                </Specimen>
                <Specimen label="Select inputs">
                  <div className="space-y-4">
                    {controlSizes.map(([size, label]) => (
                      <div className="grid gap-2" key={size}>
                        <Label htmlFor={`select-${size}`}>{label}</Label>
                        <Select defaultValue="selected">
                          <SelectTrigger id={`select-${size}`} size={size}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="selected">{label} select</SelectItem>
                            <SelectItem value="alternate">Alternate option</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </Specimen>
              </div>
            </SectionCard>

            <SectionCard>
              <SectionHeading className="mb-0" title="Selection controls" />
              <Checkbox
                defaultChecked
                description="Process the next file as soon as it is added."
                label="Automatic processing"
              />
              <Checkbox
                description="This option is unavailable for local-only sessions."
                disabled
                label="Share with team"
              />
              <div>
                <Label className="mb-3 block">Export format</Label>
                <RadioGroup defaultValue="pdf">
                  {[
                    ["pdf", "PDF document"],
                    ["png", "PNG images"],
                    ["json", "Structured JSON"],
                  ].map(([value, label]) => (
                    <div className="flex items-center gap-3" key={value}>
                      <RadioGroupItem id={`showcase-${value}`} value={value} />
                      <Label htmlFor={`showcase-${value}`}>{label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <Separator />
              <Specimen label="Radio sizes">
                <RadioGroup className="flex flex-wrap items-center gap-6" defaultValue="default">
                  {controlSizes.map(([size, label]) => (
                    <div className="flex items-center gap-2.5" key={size}>
                      <RadioGroupItem id={`radio-${size}`} size={size} value={size} />
                      <Label htmlFor={`radio-${size}`}>{label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </Specimen>
            </SectionCard>

            <SectionCard>
              <SectionHeading className="mb-0" title="Switch scale and state" />
              <div className="flex flex-wrap items-center gap-8">
                <div className="flex items-center gap-3">
                  <Switch defaultChecked id="switch-small" size="sm" />
                  <Label htmlFor="switch-small">Small</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch defaultChecked id="switch-default" />
                  <Label htmlFor="switch-default">Default</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch id="switch-large" size="lg" />
                  <Label htmlFor="switch-large">Large</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch disabled id="switch-disabled" />
                  <Label htmlFor="switch-disabled">Disabled</Label>
                </div>
              </div>
            </SectionCard>
          </div>
        </section>

        <section className="scroll-mt-24" id="navigation">
          <SectionHeading
            description="Low-profile navigation keeps attention on the working surface."
            eyebrow="04"
            title="Navigation"
          />
          <SectionCard>
            <Specimen label="Tabs">
              <Tabs defaultValue="edit">
                <TabsList>
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                  <TabsTrigger value="items">Line items</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>
                <TabsContent className="rounded-lg bg-muted p-5 text-muted-foreground" value="edit">
                  Edit fields and document settings here.
                </TabsContent>
                <TabsContent className="rounded-lg bg-muted p-5 text-muted-foreground" value="items">
                  Manage line items and totals here.
                </TabsContent>
                <TabsContent className="rounded-lg bg-muted p-5 text-muted-foreground" value="preview">
                  Review the final document here.
                </TabsContent>
              </Tabs>
            </Specimen>
            <Separator />
            <div className="grid gap-8 lg:grid-cols-2">
              <Specimen label="Segmented control">
                <Tabs defaultValue="input">
                  <TabsList variant="segmented">
                    <TabsTrigger value="input">Input</TabsTrigger>
                    <TabsTrigger value="result">Result</TabsTrigger>
                  </TabsList>
                </Tabs>
              </Specimen>
              <Specimen label="Segmented control — field">
                <SegmentedControl
                  size="field"
                  defaultValue="jpg"
                  aria-label="Output format"
                  items={[
                    { value: "jpg", label: "JPG (JPEG)" },
                    { value: "png", label: "PNG", disabled: true },
                    { value: "webp", label: "WebP" },
                  ]}
                />
              </Specimen>
              <Specimen label="Tooltip">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button aria-label="Copy value" size="icon" variant="outline">
                        <Copy />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy value</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Specimen>
            </div>
            <Separator />
            <div className="grid gap-8 lg:grid-cols-[1fr_auto_1fr]">
              <Specimen label="Tool navigation">
                <ToolNav
                  ariaLabel="Example product sections"
                  items={[
                    { current: true, href: "#navigation", label: "Documents" },
                    { href: "#navigation", label: "Templates" },
                    { href: "#navigation", label: "Settings" },
                  ]}
                />
              </Specimen>
              <Separator className="hidden min-h-20 lg:block" orientation="vertical" />
              <Specimen label="Brand lockup">
                <BrandLockup href="/admin/design-system" name="Paperwork" />
              </Specimen>
            </div>
            <Separator />
            <Specimen label="Chapter navigation">
              <div className="grid gap-8 rounded-xl border border-border bg-muted/60 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)] lg:items-center">
                <div className="max-w-md">
                  <P className="">Jump through a long-running workflow</P>
                  <Muted className="mt-2 text-muted-foreground">
                    Hover or tap a tick to preview its chapter. On touch, tap it again to choose. With a keyboard, use
                    the arrow keys, Home, or End to move, then press Enter or Space to choose.
                  </Muted>
                  <P className="mt-4 text-primary">Current · {workflowChapters[selectedChapterIndex].title}</P>
                </div>
                <div className="flex min-h-64 items-center justify-start overflow-visible rounded-xl border border-border bg-card py-8 pr-4 pl-3 sm:justify-center sm:px-4">
                  <ChapterScrubber
                    chapters={workflowChapters}
                    currentIndex={selectedChapterIndex}
                    hoverLengthMultiplier={52 / 14}
                    label="Tool workflow chapters"
                    onSelect={(_, index) => setSelectedChapterIndex(index)}
                    radius={4.5}
                  />
                </div>
              </div>
            </Specimen>
            <Separator />
            <Specimen label="PDF viewer">
              <PdfViewer
                className="rounded-xl border border-border"
                currentPage={handbookPage}
                fileName="employee-handbook.pdf"
                onPageChange={setHandbookPage}
                outline={handbookOutline}
                pageCount={24}
                pagePreviewDetail="A4 → Letter · fit content"
              >
                <article className="flex h-full min-h-[26rem] flex-col gap-3 px-9 py-7" key={handbookSection.id}>
                  <P className="text-primary">
                    {String(handbookPage).padStart(2, "0")} / {handbookSection.title}
                  </P>
                  <H3 className="text-foreground">
                    {handbookSection.id === "review" ? "Review documents with confidence" : handbookSection.title}
                  </H3>
                  <span className="h-0.5 w-15 bg-primary" />
                  <Muted className="max-w-xl text-muted-foreground">
                    Keep decisions moving with focused review queues, clear ownership, and an audit-ready history.
                  </Muted>
                  {[
                    ["Assign reviewers", "Route each document to the right person."],
                    ["Resolve feedback", "Track comments without losing context."],
                    ["Approve and share", "Publish a clean, verified final copy."],
                  ].map(([title, description]) => (
                    <div className="flex items-center gap-2.5" key={title}>
                      <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                      <div>
                        <P className="text-foreground">{title}</P>
                        <Muted className="text-muted-foreground">{description}</Muted>
                      </div>
                    </div>
                  ))}
                </article>
              </PdfViewer>
            </Specimen>
            <Separator />
            <Specimen label="Full-screen media preview">
              <Button variant="secondary" onClick={() => setMediaPreviewOpen(true)}>
                Open full-screen preview
              </Button>
              <div className="max-w-xs">
                <MediaOutputCard
                  name="preview-example.txt"
                  metadata="Text"
                  onPreview={() => setMediaPreviewOpen(true)}
                  onDownload={() => {
                    const link = document.createElement("a");
                    link.href = "data:text/plain;charset=utf-8,Caller-owned%20content";
                    link.download = "preview-example.txt";
                    link.click();
                  }}
                >
                  <span className="p-6 text-sm text-muted-foreground">Caller-owned content</span>
                </MediaOutputCard>
              </div>
              <MediaPreview
                open={mediaPreviewOpen}
                onOpenChange={setMediaPreviewOpen}
                title="Preview example"
                description="Media-agnostic shell · document content passed as children"
                status="Preview only · Your file is unchanged"
              >
                <article className="m-auto w-full max-w-2xl shrink-0 bg-card p-8 text-foreground sm:p-12">
                  <H2>Caller-owned content</H2>
                  <P className="mt-4">
                    This document is passed as children. Images, video, audio, PDF viewers, and other previews use the
                    same full-screen shell.
                  </P>
                  <Muted className="mt-4">
                    The caller provides rendering and any playback, navigation, or zoom controls. Exit preview to return
                    to the component library.
                  </Muted>
                </article>
              </MediaPreview>
            </Specimen>
          </SectionCard>
        </section>

        <section className="scroll-mt-24" id="feedback">
          <SectionHeading
            description="Messages use tone, iconography, and color without relying on color alone."
            eyebrow="05"
            title="Feedback and empty states"
          />
          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard>
              <SectionHeading className="mb-0" title="Alerts" />
              <Alert className="bg-accent">
                <Info />
                <AlertTitle>No account needed</AlertTitle>
                <AlertDescription>Your data stays in your browser unless you choose to save it.</AlertDescription>
              </Alert>
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>Export failed</AlertTitle>
                <AlertDescription>Check the source file and try again.</AlertDescription>
              </Alert>
              <AlertBanner title="Ready to export" variant="success">
                All validation checks passed.
              </AlertBanner>
              <AlertBanner title="Review required" variant="warning">
                One line item is missing a description.
              </AlertBanner>
              <AlertBanner title="Could not save" variant="error">
                Your changes remain available in this browser.
              </AlertBanner>
            </SectionCard>

            <SectionCard>
              <SectionHeading
                action={
                  <Button onClick={() => toast.success("Receipt saved")} size="sm" variant="secondary">
                    <Bell />
                    Show toast
                  </Button>
                }
                className="mb-0"
                description="Use the button to inspect the live toast."
                title="Toast"
              />
              <div className="flex w-fit items-center gap-2.5 rounded-lg bg-surface-ink px-4 py-[13px] text-white shadow-[0_8px_24px_#00000026]">
                <span className="grid size-5 place-items-center rounded-full bg-success text-white">
                  <Check className="size-3" />
                </span>
                <Strong>Receipt saved</Strong>
              </div>
              <AlertBanner
                action={
                  <Button size="sm" variant="outline">
                    Review
                  </Button>
                }
                title="Information"
              >
                This banner also supports a contextual action.
              </AlertBanner>
            </SectionCard>

            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FilePlus2 />
                </EmptyMedia>
                <EmptyTitle>No documents yet</EmptyTitle>
                <EmptyDescription>Create your first receipt or invoice. It takes about a minute.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm">
                  <Plus />
                  New document
                </Button>
              </EmptyContent>
            </Empty>

            <EmptyState
              action={<Button size="sm">Upload file</Button>}
              description="Drop a supported file here or browse your device."
              icon={<Upload />}
              title="Nothing in the queue"
            />
          </div>
        </section>

        <section className="scroll-mt-24" id="data">
          <SectionHeading
            description="Structured surfaces keep dense information readable and actionable."
            eyebrow="06"
            title="Cards, people, tables, and ordering"
          />
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Monthly documents</CardTitle>
                <CardDescription>Usage across all paperwork tools.</CardDescription>
                <CardAction>
                  <Button aria-label="More options" size="icon-sm" variant="ghost">
                    <MoreHorizontal />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <P className="">1,284</P>
                <P className="mt-1 text-success">+12% this month</P>
              </CardContent>
              <CardFooter className="border-t">
                <Button size="sm" variant="secondary">
                  View usage
                </Button>
              </CardFooter>
            </Card>

            <SectionCard>
              <SectionHeading className="mb-0" title="Avatars" />
              <AvatarGroup>
                <Avatar size="lg">
                  <AvatarImage alt="Google account" src="/auth/google-g-logo.png" />
                  <AvatarFallback>JC</AvatarFallback>
                  <AvatarBadge />
                </Avatar>
                <Avatar size="lg">
                  <AvatarFallback>AP</AvatarFallback>
                </Avatar>
                <Avatar size="lg">
                  <AvatarFallback>NK</AvatarFallback>
                </Avatar>
                <AvatarGroupCount>+8</AvatarGroupCount>
              </AvatarGroup>
              <div className="flex items-center gap-4">
                <Avatar size="sm">
                  <AvatarFallback>S</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarFallback>M</AvatarFallback>
                </Avatar>
                <Avatar size="lg">
                  <AvatarFallback>L</AvatarFallback>
                </Avatar>
              </div>
            </SectionCard>

            <SectionCard className="xl:col-span-2">
              <SectionHeading className="mb-0" title="Table" />
              <div className="overflow-hidden rounded-xl border border-border">
                <Table>
                  <TableCaption>Current admin access.</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Documents</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="">Jordan Chen</TableCell>
                      <TableCell>Administrator</TableCell>
                      <TableCell>
                        <StatusBadge variant="success">Active</StatusBadge>
                      </TableCell>
                      <TableCell className="text-right">184</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="">Avery Patel</TableCell>
                      <TableCell>Editor</TableCell>
                      <TableCell>
                        <StatusBadge variant="warning">Invited</StatusBadge>
                      </TableCell>
                      <TableCell className="text-right">72</TableCell>
                    </TableRow>
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3}>Total</TableCell>
                      <TableCell className="text-right">256</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </SectionCard>

            <SectionCard className="xl:col-span-2">
              <SectionHeading
                className="mb-0"
                description="Drag with the handle, or focus it and use the keyboard."
                title="Orderable list"
              />
              <OrderableList
                ariaLabel="Document section order"
                className="grid gap-2"
                getId={(item) => item.id}
                getLabel={(item) => item.label}
                items={documents}
                onReorder={setDocuments}
                renderItem={(item, state) => (
                  <div
                    className={`flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 ${
                      state.isDragging ? "shadow-lg" : ""
                    }`}
                  >
                    <Button
                      {...state.attributes}
                      {...state.listeners}
                      aria-label={`Reorder ${item.label}`}
                      ref={state.setActivatorNodeRef}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <GripVertical />
                    </Button>
                    <FileText className="size-4 text-primary" />
                    <Caption className="">{item.label}</Caption>
                  </div>
                )}
              />
            </SectionCard>
          </div>
        </section>

        <section className="scroll-mt-24" id="coverage">
          <SectionHeading
            description="Every reusable design.pen node is mapped to a public @/components/ui/index.tsx implementation."
            eyebrow="07"
            title={`${DESIGN_SYSTEM_COMPONENTS.length} component implementations`}
          />
          <SectionCard>
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Design component</TableHead>
                    <TableHead>Code implementation</TableHead>
                    <TableHead className="text-right">Design ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {DESIGN_SYSTEM_COMPONENTS.map((component) => (
                    <TableRow key={component.designId}>
                      <TableCell className="">{component.designName}</TableCell>
                      <TableCell>
                        <InlineCode className="text-primary">{component.implementation}</InlineCode>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{component.designId}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </section>

        <section className="scroll-mt-24" id="compositions">
          <SectionHeading
            description="Shared product patterns assembled from the primitives above."
            eyebrow="08"
            title="Product compositions"
          />
          <div className="space-y-6">
            <SectionCard>
              <ToolPageIntro
                badge={<StatusBadge variant="success">Private · local</StatusBadge>}
                category="Media tools"
                description="Upload, remove, and reorder the same source files used on desktop."
                title="Complete one clear task"
              />
              <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
                <div className="space-y-4">
                  <FileUploadZone
                    description="PNG, JPG or WebP · 20 MB · processed on this device"
                    title="Add or upload images"
                  />
                  <FileQueueItem
                    action={<CompactAction icon={<Trash2 />}>Remove</CompactAction>}
                    icon={<FileText />}
                    metadata="2400 × 1600 px · 3.8 MB"
                    name="source-file.png"
                  />
                  <ProcessingStatus
                    action={
                      <Button size="sm" variant="secondary">
                        Cancel
                      </Button>
                    }
                    detail="Working on item 2 of 3 · about 4 seconds left"
                    progress={68}
                    title="Processing · 68%"
                  />
                  <DownloadResult
                    action={<Button>Download file</Button>}
                    metadata="output-file.png · 1.2 MB"
                    title="Your file is ready"
                  />
                  <DownloadResult
                    variant="action"
                    title="Your cropped PDF is ready"
                    metadata="document-cropped.pdf · 4 pages · 1.2 MiB"
                    action={<Button>Download PDF</Button>}
                  />
                </div>
                <ToolOptionsPanel action={<Button className="w-full">Run tool</Button>}>
                  <Field htmlFor="pattern-format" label="Output format">
                    <Select defaultValue="auto">
                      <SelectTrigger id="pattern-format">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto-detect</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <InlineGuidance>Use the example to get started</InlineGuidance>
                </ToolOptionsPanel>
              </div>
              <HowItWorks
                steps={[
                  { title: "Add files", description: "Choose local source files." },
                  { title: "Set options", description: "Adjust only what you need." },
                  { title: "Download", description: "Save the finished result." },
                ]}
              />
            </SectionCard>

            <div className="grid gap-6 lg:grid-cols-3">
              <MetricCard delta="+12% this month" label="Documents created" value="1,284" />
              <div className="rounded-xl bg-muted p-3">
                <SidebarNavItem active href="#compositions" icon={<FileText />}>
                  Documents
                </SidebarNavItem>
              </div>
              <div className="flex items-center gap-3">
                <IconTile>
                  <ReceiptText />
                </IconTile>
                <RightPanelResult
                  action={<Button className="w-full">Download file</Button>}
                  metadata="output-file · ready to save"
                  title="Your file is ready"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border">
              <ProductHeader
                account={{ returnTo: "/admin/design-system", user: { name: "Jordan Chen" } }}
                actions={<AccountNavigation returnTo="/admin/design-system" user={{ name: "Jordan Chen" }} />}
                href="/admin/design-system"
                name="Paperwork"
              />
              <PageHero
                actions={
                  <>
                    <Button>Create receipt</Button>
                    <Button variant="secondary">View sample</Button>
                  </>
                }
                compact
                description="A focused page hero composed from the same type, spacing, and actions."
                eyebrow={
                  <span className="inline-flex items-center gap-2">
                    <Sparkles className="size-4" />
                    Fast and private
                  </span>
                }
                title="Create polished documents in minutes."
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <CatalogCard
                action="Open tool"
                description="Build a clean receipt from any device."
                href="#compositions"
                icon={<ReceiptText />}
                status={<StatusBadge variant="success">Available</StatusBadge>}
                title="Receipt maker"
              />
              <CatalogCard
                action="View details"
                description="Convert source files without uploading them."
                href="#compositions"
                icon={<ShieldCheck />}
                status={<StatusBadge variant="info">Private</StatusBadge>}
                title="Local converter"
              />
              <CatalogCard
                action="Configure"
                description="Keep recurring document settings consistent."
                href="#compositions"
                icon={<Sparkles />}
                status={<StatusBadge variant="warning">Setup</StatusBadge>}
                title="Smart templates"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <SectionCard>
                <SectionHeading
                  className="mb-0"
                  description="The standard elevated content surface."
                  title="Section card"
                />
                <Muted className="text-muted-foreground">
                  Use this for related settings, forms, and supporting information.
                </Muted>
                <Button className="w-fit" size="sm">
                  Save changes
                </Button>
              </SectionCard>
              <DangerZone>
                <SectionHeading
                  className="mb-4"
                  description="Destructive actions stay visually isolated."
                  title="Danger zone"
                />
                <Button variant="destructive">
                  <Trash2 />
                  Delete workspace
                </Button>
              </DangerZone>
            </div>
          </div>
        </section>
      </div>
      <Toaster position="bottom-right" />
    </>
  );
}
