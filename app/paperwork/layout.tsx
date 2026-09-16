import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SmartTools Paperwork - Free Online Invoice & Receipt Generator Toolkit",
  description:
    "Generate professional invoices, receipts, expense reports, mileage logs, tax estimates, and W-9 contractor forms online for free.",
};

export default function PaperworkLayout({ children }: { children: React.ReactNode }) {
  return <div className="paperwork-shell min-h-screen">{children}</div>;
}
