import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("shared UI exposes the exact design-system foundation tokens", async () => {
  const css = await source("packages/ui/src/theme.css");

  for (const token of [
    "--background: #f6f7f9",
    "--foreground: #1a1a1a",
    "--card: #ffffff",
    "--primary: #0066ff",
    "--accent: #e8f0ff",
    "--success: #12a150",
    "--surface-ink: #111214",
    "--on-ink-muted: #a7adb5",
    "--border: #eaecef",
    "--input: #d6d9de",
    "--shadow-sm: 0 1px 2px #0000000d",
    "--shadow-lg: 0 2px 4px #00000008, 0 12px 32px #0000000f",
  ]) {
    assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("shared controls retain design-system dimensions and states", async () => {
  const [button, checkbox, input, radio, select, switchSource, tabs] = await Promise.all([
    source("packages/ui/src/components/button.tsx"),
    source("packages/ui/src/components/checkbox.tsx"),
    source("packages/ui/src/components/input.tsx"),
    source("packages/ui/src/components/radio-group.tsx"),
    source("packages/ui/src/components/select.tsx"),
    source("packages/ui/src/components/switch.tsx"),
    source("packages/ui/src/components/tabs.tsx"),
  ]);
  assert.match(button, /hover:bg-\[#0052CC\].*active:bg-\[#003D99\]/);
  assert.match(checkbox, /size-5.*rounded-\[4px\]/);
  for (const expected of [
    /xs: "h-8 px-2\.5 text-\[11px\]"/,
    /sm: "h-9 px-3 text-\[13px\]"/,
    /default: "h-11 px-4 text-sm"/,
    /md: "h-12 px-\[18px\] text-\[15px\]"/,
    /lg: "h-13 px-5\.5 text-base"/,
  ]) {
    assert.match(input, expected);
  }
  for (const expected of [
    /xs: "h-8 px-2\.5 text-\[11px\]"/,
    /sm: "h-9 px-3 text-\[13px\]"/,
    /default: "h-11 px-4 text-sm"/,
    /md: "h-12 px-\[18px\] text-\[15px\]"/,
    /lg: "h-13 px-5\.5 text-base"/,
  ]) {
    assert.match(select, expected);
  }
  assert.match(select, /function findOptionLabel\b/);
  assert.match(select, /\{findOptionLabel\(children, selectedValue\)\}/);
  for (const expected of [
    /xs: "size-3\.5 border/,
    /sm: "size-4 border/,
    /default: "size-5 border-2/,
    /md: "size-\[22px\] border-2/,
    /lg: "size-6 border-2/,
  ]) {
    assert.match(radio, expected);
  }
  assert.match(radio, /before:absolute before:content-\[''\]/);
  assert.match(radio, /default: "size-5 border-2 before:inset-\[-12px\]"/);
  assert.match(switchSource, /h-\[26px\].*w-11/);
  assert.match(tabs, /segmented: "rounded-lg bg-muted p-1"/);
});

test("the admin design-system page demonstrates every design-backed form-control size", async () => {
  const page = await source("app/admin/(protected)/design-system/page.tsx");

  for (const size of ["xs", "sm", "default", "md", "lg"]) {
    assert.match(page, new RegExp(`\\["${size}",`));
  }
  assert.match(page, /<Input[\s\S]*?size=\{size\}/);
  assert.match(page, /<SelectTrigger[^>]+size=\{size\}/s);
  assert.match(page, /<RadioGroupItem[\s\S]*?size=\{size\}/);
  assert.match(page, /Switch defaultChecked id="switch-default"/);
});

test("reusable tool patterns cover the design-system component set", async () => {
  const patterns = await source("packages/ui/src/components/patterns.tsx");

  for (const component of [
    "IconTile",
    "MetricCard",
    "SidebarNavItem",
    "ToolPageIntro",
    "FileUploadZone",
    "FileQueueItem",
    "ProcessingStatus",
    "DownloadResult",
    "ToolOptionsPanel",
    "HowItWorks",
    "CompactAction",
    "InlineGuidance",
    "RightPanelProcessing",
    "RightPanelResult",
    "UniversalProductHeader",
    "InlineProductHeader",
    "ProductFooter",
  ]) {
    assert.match(patterns, new RegExp(`function ${component}\\b`));
  }
});

test("every reusable design.pen component has a named code implementation", async () => {
  const [manifest, compatibilityComponents, index] = await Promise.all([
    source("packages/ui/src/design-system-manifest.ts"),
    source("packages/ui/src/components/design-system-components.tsx"),
    source("packages/ui/src/index.tsx"),
  ]);
  const designIds = [...manifest.matchAll(/designId: "([^"]+)"/g)].map((match) => match[1]);

  assert.equal(designIds.length, 60);
  assert.equal(new Set(designIds).size, 60);

  for (const designId of [
    "wm1rh",
    "o5XSq",
    "v7W41",
    "buMbq",
    "vqrFa",
    "vfXW1",
    "KhiTv",
    "TjqJu",
    "p8sMCK",
    "LYbwR",
    "n0hbD",
    "U33OrB",
    "XX92d",
    "ANemK",
    "RqQtP",
    "vD5uC",
    "KYa0C",
    "M0akV",
    "T4Nkey",
    "rUGqU",
    "vRUj9",
    "nqd2l",
    "NcoS9",
    "LV8j8",
    "F1Cpx",
    "wsb4b",
    "zfYOu",
    "FDvYe",
    "Hvwjy",
    "J0wTF9",
    "VSDn7",
    "zbKIJ",
    "dV2U8",
    "rAWA1",
    "Z22Y1n",
    "dvTGe",
    "p6bKLP",
    "hZUnl",
    "vTel8",
    "WNQ3F",
    "s7j05",
    "DHoar",
    "b55XX",
    "xWzlR",
    "x9bDiO",
    "g9TdB",
    "NnxxQ",
    "vMbTZ",
    "A3D8lv",
    "kfEw4",
    "wFMb0",
    "QQ11z",
    "eAeak",
    "ODEcI",
    "e8vqr",
    "ngC1X",
    "Mncoc",
    "hGI6k",
    "bWOKG",
    "FM7qR",
  ]) {
    assert.ok(designIds.includes(designId), `missing design component ${designId}`);
  }

  for (const component of [
    "SegmentedControl",
    "Tag",
    "Toast",
    "WorkbenchShell",
    "JsonFormatterWorkbench",
    "DataConversionWorkbench",
    "UtilityWorkbench",
    "ToolPageSystemControls",
  ]) {
    assert.match(compatibilityComponents, new RegExp(`function ${component}\\b`));
  }
  assert.match(index, /function AuthField\b/);
  assert.match(index, /function ToolCard\b/);
});

test("tool routes share the design-system page shell", async () => {
  // Both `[slug]` routes now render through `components/ToolPage.tsx`, whose
  // workbench frame owns the shell — so that is where the shell is asserted.
  const [index, workbench] = await Promise.all([
    source("packages/ui/src/index.tsx"),
    source("components/UniversalWorkbench.tsx"),
  ]);

  assert.match(index, /function ToolPageShell\b/);
  assert.match(index, /<ProductHeader/);
  assert.match(index, /<ToolPageIntro/);
  assert.match(index, /systemControls/);
  assert.match(workbench, /<ToolPageShell/);
  assert.doesNotMatch(workbench, /function ToolBreadcrumb\b/);
});
