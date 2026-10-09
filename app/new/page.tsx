import type { Metadata } from "next";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Globe2, MousePointer2, ShieldCheck } from "lucide-react";
import { Button, H2, H3, ProductFooter, ProductHeader, SmartToolsLogoMark } from "@/components/ui";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/components/accordion";
import { getPublicToolListings } from "@/lib/tool-framework/catalog";
import { LandingExperience } from "./components/LandingExperience";
import { ToolCollection } from "./components/ToolCollection";
import styles from "./new.module.css";

export const metadata: Metadata = {
  title: "Less busywork. More possibility. | SmartTools",
  description:
    "A little help for the work you do every day. Discover focused developer, media, and document tools, right in your browser.",
  robots: { index: false, follow: true },
};

const questions = [
  {
    question: "Do I need an account to get started?",
    answer:
      "No. Open a tool and get straight to work. An account is optional for features such as keeping your saved tools across devices.",
  },
  {
    question: "What happens to my files and data?",
    answer:
      "Many tools process your data directly in your browser. Tools that need a server or an external service explain that on the tool page. Check the privacy information beside each tool before working with sensitive data.",
  },
  {
    question: "Can I use SmartTools on my phone?",
    answer:
      "Yes. You can discover and use tools in a modern mobile browser. For detailed document editing or working with large files, a laptop gives you more room.",
  },
  {
    question: "How do I find the right tool?",
    answer:
      "Search the collection by task, such as JSON, invoice, or image. You can also choose Developer, Media, or Paperwork to browse a focused collection.",
  },
];

export default async function NewLandingPage() {
  const catalog = await getPublicToolListings("en").then(
    (tools) => ({ tools, unavailable: false }),
    () => ({ tools: [], unavailable: true }),
  );

  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <ProductHeader
        compact
        minimal
        href="/new"
        name="SmartTools"
        subtitle=""
        className={styles.header}
        actions={
          <>
            <nav className={styles.navigation} aria-label="Landing page">
              <a href="#tools">The tools</a>
              <a href="#why-smarttools">Why SmartTools</a>
              <a href="#questions">Good to know</a>
            </nav>
            <Button asChild className={styles.headerCta}>
              <a href="#tools">
                Find a tool <ArrowUpRight aria-hidden="true" />
              </a>
            </Button>
          </>
        }
      />

      <LandingExperience>
        <div className={styles.utilityStrip}>
          <span>
            <Check aria-hidden="true" /> No account needed to start
          </span>
          <span>
            <Globe2 aria-hidden="true" /> Works in your browser
          </span>
          <a href="#tools">
            Less setup. More doing. <ArrowDown aria-hidden="true" />
          </a>
        </div>

        <ToolCollection tools={catalog.tools} unavailable={catalog.unavailable} />

        <section id="why-smarttools" aria-labelledby="why-title" className={styles.whySection}>
          <div className={styles.whyIntro}>
            <span className={styles.eyebrow}>BUILT AROUND YOUR DAY</span>
            <H2 id="why-title">
              Your time has
              <br />
              better places to be.
            </H2>
            <p>
              The small jobs shouldn’t become the whole job. Get what you need, make it yours, and get back to the work
              that matters.
            </p>
            <Button asChild variant="outline" className={styles.outlineCta}>
              <a href="#tools">
                Make room for good work <ArrowUpRight aria-hidden="true" />
              </a>
            </Button>
          </div>
          <div className={styles.principles}>
            <article>
              <span className={styles.principleNumber}>01</span>
              <div>
                <H3>Open. Do. Done.</H3>
                <p>
                  No installation. No onboarding tour. Just focused tools that get you from a task to a useful result.
                </p>
              </div>
              <MousePointer2 aria-hidden="true" />
            </article>
            <article>
              <span className={styles.principleNumber}>02</span>
              <div>
                <H3>Your work, handled thoughtfully.</H3>
                <p>
                  Many tools run locally in your browser. Each tool explains how your data is processed, so you can make
                  an informed choice.
                </p>
              </div>
              <ShieldCheck aria-hidden="true" />
            </article>
            <article>
              <span className={styles.principleNumber}>03</span>
              <div>
                <H3>Made to move with you.</H3>
                <p>
                  From a line of code to a finished document. Switch between developer, media, and paperwork tools in
                  one familiar place.
                </p>
              </div>
              <ArrowUpRight aria-hidden="true" />
            </article>
          </div>
        </section>

        <section className={styles.questions} id="questions" aria-labelledby="questions-title">
          <div>
            <span className={styles.eyebrow}>GOOD TO KNOW</span>
            <H2 id="questions-title">
              A little clarity.
              <br />
              Then you’re off.
            </H2>
          </div>
          <Accordion type="single" collapsible className={styles.accordion}>
            {questions.map(({ question, answer }, index) => (
              <AccordionItem key={question} value={`question-${index}`}>
                <AccordionTrigger>{question}</AccordionTrigger>
                <AccordionContent>{answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className={styles.finalCta} aria-labelledby="final-title">
          <span className={styles.eyebrow}>ONE SMALL TASK. ONE LESS THING.</span>
          <div>
            <H2 id="final-title">
              Go make
              <br />
              <span>something happen.</span>
            </H2>
            <Button asChild className={styles.finalButton}>
              <a href="#tools" aria-label="Explore the tool collection">
                <ArrowRight aria-hidden="true" />
              </a>
            </Button>
          </div>
          <p>Your next shortcut is right here.</p>
        </section>
      </LandingExperience>

      <ProductFooter
        className={styles.footer}
        brand="SmartTools"
        brandMark={<SmartToolsLogoMark aria-hidden="true" />}
        description="A little help. A lot of possibility."
        copyright={`© ${new Date().getFullYear()} SmartTools`}
        columns={[
          {
            title: "The collections",
            links: [
              { href: "/devtools", label: "Developer" },
              { href: "/media", label: "Media" },
              { href: "/paperwork", label: "Paperwork" },
            ],
          },
          {
            title: "Around here",
            links: [
              { href: "/blog", label: "The journal" },
              { href: "/contact", label: "Say hello" },
              { href: "/privacy", label: "Privacy" },
            ],
          },
        ]}
      />
    </div>
  );
}
