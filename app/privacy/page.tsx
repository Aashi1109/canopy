import { Display, H2, Muted, Overline } from "@canopy/ui";
import type { Metadata } from "next";
import { AnalyticsPreferences } from "@/components/analytics/Analytics";
import PublicInfoChrome from "@/components/canopy/PublicInfoChrome";

export const metadata: Metadata = {
  title: "Privacy Policy | SmartTools",
  description: "How SmartTools handles documents, account information, cookies, and your data controls.",
};

const sections = [
  {
    title: "Information we collect",
    body: "The content you process with public SmartTools is handled in your browser unless a tool clearly says otherwise. If you create an account, we store your name and email to provide account features and sync supported history.",
  },
  {
    title: "What we don’t do",
    body: "We don’t sell your data, run third-party ad trackers, or ask for more information than we need to operate SmartTools.",
  },
  {
    title: "Cookies",
    body: "We use a small number of essential cookies for sessions, security, and preferences. With your permission, we also use optional analytics cookies. We do not use advertising cookies.",
  },
  {
    title: "Your rights",
    body: "You can export or delete your account and its associated data at any time from your profile settings.",
  },
] as const;

export default function PrivacyPage() {
  return (
    <PublicInfoChrome>
      <article className="mx-auto w-full max-w-[760px] px-6 py-16 lg:py-[72px]">
        <header>
          <Overline className="block text-primary">Legal · Updated September 2026</Overline>
          <Display className="mt-2">Privacy Policy</Display>
          <Muted className="mt-3 text-muted-foreground">
            A plain-language summary of how SmartTools handles your information across Paperwork, DevTools, Media, and
            account features.
          </Muted>
        </header>
        <div className="mt-8 flex flex-col gap-8">
          <AnalyticsPreferences />
          {sections.map((section) => (
            <section className="flex flex-col gap-2" key={section.title}>
              <H2>{section.title}</H2>
              <Muted className="text-muted-foreground">{section.body}</Muted>
            </section>
          ))}
        </div>
      </article>
    </PublicInfoChrome>
  );
}
