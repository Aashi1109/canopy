import type { Metadata } from "next";
import { ArrowUpRight, Check, Command, ShieldCheck } from "lucide-react";
import { Button, H2, ProductFooter, ProductHeader, SmartToolsLogoMark } from "@/components/ui";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/components/accordion";
import { getPublicToolListings } from "@/lib/tool-framework/catalog";
import { WorktableHero } from "./components/WorktableHero";
import { ToolIndex } from "./components/ToolIndex";
import styles from "./new2.module.css";

export const metadata: Metadata = {
  title: "Make light work. | SmartTools",
  description:
    "Your everyday shortcut studio. Useful browser tools for code, media, and paperwork, without the busywork.",
  robots: { index: false, follow: true },
};

const questions = [
  {
    question: "Can I get started without an account?",
    answer:
      "Yes. Open a tool and get straight to work. An account is optional for features such as syncing saved tools across devices.",
  },
  {
    question: "Where does my data go?",
    answer:
      "Many tools run directly in your browser. Each tool explains when a server or external service is needed, so you can check before using sensitive data.",
  },
  {
    question: "Are the samples above real tools?",
    answer:
      "They are small interactive examples using sample data. Use the link in each example to open the complete tool or its collection and work with your own content.",
  },
];

export default async function NewTwoPage() {
  const catalog = await getPublicToolListings("en").then(
    (tools) => ({ tools, unavailable: false }),
    () => ({ tools: [], unavailable: true }),
  );
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#new2-main">
        Skip to content
      </a>
      <ProductHeader
        compact
        minimal
        name="SmartTools"
        href="/new2"
        subtitle=""
        className={styles.header}
        actions={
          <>
            <nav aria-label="Landing page" className={styles.navigation}>
              <a href="#tool-index">The collection</a>
              <a href="#our-philosophy">The idea</a>
              <a href="#questions">Good to know</a>
            </nav>
            <Button asChild variant="strong" className={styles.headerButton}>
              <a href="#tool-index">
                Find a tool <ArrowUpRight aria-hidden="true" />
              </a>
            </Button>
          </>
        }
      />
      <main id="new2-main">
        <WorktableHero tools={catalog.tools} unavailable={catalog.unavailable} />
        <ToolIndex tools={catalog.tools} unavailable={catalog.unavailable} />
        <section id="our-philosophy" className={styles.philosophy} aria-labelledby="philosophy-heading">
          <div className={styles.philosophyIntro}>
            <span className={styles.eyebrow}>LESS SOFTWARE. MORE GETTING SOMEWHERE.</span>
            <H2 id="philosophy-heading">
              The best tools
              <br />
              get <em>out of your way.</em>
            </H2>
            <p>
              No new system to learn. No setup to get through. Just the right amount of help, right when you need it.
            </p>
          </div>
          <div className={styles.principles}>
            <article>
              <Command aria-hidden="true" />
              <div>
                <h3>Open it. Use it. Get on with it.</h3>
                <p>Focused tools with a clear job. From a task on your list to a result you can use.</p>
              </div>
              <span>01</span>
            </article>
            <article>
              <ShieldCheck aria-hidden="true" />
              <div>
                <h3>A little care goes a long way.</h3>
                <p>
                  Clear processing details on every tool. Know when your data stays in the browser and when a service is
                  needed.
                </p>
              </div>
              <span>02</span>
            </article>
            <article>
              <Check aria-hidden="true" />
              <div>
                <h3>Made for the work after the work.</h3>
                <p>Copy, download, or export your result. Take what you made and keep moving.</p>
              </div>
              <span>03</span>
            </article>
          </div>
        </section>
        <section className={styles.questions} id="questions" aria-labelledby="questions-heading">
          <div>
            <span className={styles.eyebrow}>BEFORE YOU GET GOING</span>
            <H2 id="questions-heading">
              A few good <br />
              things to know.
            </H2>
          </div>
          <Accordion type="single" collapsible className={styles.accordion}>
            {questions.map((item, i) => (
              <AccordionItem key={item.question} value={`question-${i}`}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent>{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
        <section className={styles.closing} aria-labelledby="closing-heading">
          <div>
            <span className={styles.eyebrow}>A LITTLE HELP FOR WHATEVER’S NEXT</span>
            <H2 id="closing-heading">
              Less on your list.
              <br />
              <em>More room to create.</em>
            </H2>
          </div>
          <div className={styles.closingAction}>
            <Button asChild variant="strong" size="lg" className={styles.closingButton}>
              <a href="#tool-index" aria-label="Find your shortcut">
                <ArrowUpRight aria-hidden="true" />
              </a>
            </Button>
            <p>
              Find your shortcut.
              <br />
              <span>Make room for the good stuff.</span>
            </p>
          </div>
        </section>
      </main>
      <ProductFooter
        className={styles.footer}
        brand="SmartTools"
        brandMark={<SmartToolsLogoMark aria-hidden="true" />}
        description="Small tools for a lighter workday."
        copyright={`© ${new Date().getFullYear()} SmartTools`}
        columns={[
          {
            title: "Explore",
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
