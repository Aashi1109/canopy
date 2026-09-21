import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: {
    default: "Online Developer Tools | SmartTools",
    template: "%s | SmartTools",
  },
  description: "Fast, private browser tools for formatting, inspecting, and converting data.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f8fafc",
};

export default function DevtoolsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
