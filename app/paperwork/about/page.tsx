import { H2, Muted } from "@/components/ui/index.tsx";
import type { Metadata } from "next";
import InformationPage from "@/app/paperwork/components/InformationPage";

export const metadata: Metadata = {
  title: "About Paperwork",
  description: "Learn how SmartTools Paperwork helps small businesses create dependable documents quickly.",
};

export default function AboutPage() {
  return (
    <InformationPage
      description="Fast, focused document tools for freelancers, contractors, and small businesses."
      eyebrow="About"
      title="Paperwork without accounting-suite overhead"
    >
      <section className="space-y-2">
        <H2>Built for one job at a time</H2>
        <Muted className="text-muted-foreground">
          Paperwork provides focused generators for invoices, receipts, expense reports, mileage logs, tax estimates,
          W-9 requests, and 1099 tracking. Each tool keeps its primary action and output visible without requiring a
          complex accounting setup.
        </Muted>
      </section>
      <section className="space-y-2">
        <H2>What we optimize for</H2>
        <Muted className="text-muted-foreground">
          Clear validation, accurate previews, dependable exports, accessible controls, and plain explanations of where
          your data is stored.
        </Muted>
      </section>
    </InformationPage>
  );
}
