import config from "@/lib/config/config.ts";
import { Display, Muted, Overline, Strong, Text, TextLink } from "@/components/ui/index.tsx";
import type { Metadata } from "next";
import { Clock3, LifeBuoy, Mail } from "lucide-react";
import PublicInfoChrome from "@/components/canopy/PublicInfoChrome";
import ContactForm from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact SmartTools",
  description: "Send questions, product feedback, or bug reports to SmartTools support.",
};

const methods = [
  { description: undefined, href: undefined, icon: Mail, title: "Email us" },
  { description: "Browse guides & FAQs", href: "/#tools", icon: LifeBuoy, title: "Help center" },
  { description: "Within 1 business day", href: undefined, icon: Clock3, title: "Response time" },
] as const;

export default function ContactPage() {
  const supportEmail = config.email.supportEmail?.trim();

  return (
    <PublicInfoChrome>
      <div className="mx-auto grid w-full max-w-[1440px] gap-12 px-6 py-16 lg:grid-cols-[440px_minmax(0,1fr)] lg:gap-[72px] lg:px-[150px] lg:py-20">
        <section className="flex flex-col gap-6">
          <header>
            <Overline className="block text-primary">Contact</Overline>
            <Display className="mt-2">We’d love to hear from you.</Display>
            <Muted className="mt-3 text-muted-foreground">
              Questions, feedback, or a bug to report? Send a note and we’ll reply within one business day.
            </Muted>
          </header>

          <div className="flex flex-col gap-3.5">
            {methods.map(({ description, href, icon: Icon, title }) => {
              const detail = title === "Email us" ? (supportEmail ?? "Support email not configured") : description;
              const content = (
                <>
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-primary group-hover:text-accent-foreground">
                    <Icon aria-hidden="true" className="size-[22px]" />
                  </span>
                  <span>
                    <Strong className="block">{title}</Strong>
                    <Text className="mt-0.5 block text-muted-foreground group-hover:text-accent-foreground">
                      {detail}
                    </Text>
                  </span>
                </>
              );

              const destination = title === "Email us" && supportEmail ? `mailto:${supportEmail}` : href;
              return destination ? (
                <TextLink
                  className="group no-underline text-foreground flex items-center gap-3.5 rounded-lg bg-muted p-4 outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  href={destination}
                  key={title}
                >
                  {content}
                </TextLink>
              ) : (
                <div className="flex items-center gap-3.5 rounded-lg bg-muted p-4" key={title}>
                  {content}
                </div>
              );
            })}
          </div>
        </section>

        <ContactForm supportEmail={supportEmail} />
      </div>
    </PublicInfoChrome>
  );
}
