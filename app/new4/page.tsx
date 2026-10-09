import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { Button, ProductFooter, ProductHeader, SmartToolsLogoMark } from "@/components/ui";
import { getPublicTools } from "@/lib/tool-framework/catalog";
import { KineticLanding } from "./components/KineticLanding";
import styles from "./new4.module.css";

export const metadata: Metadata = {
  title: "Small tools. Big possibilities. | SmartTools",
  description:
    "A little clarity for code, a fresh perspective for media, and a finishing touch for paperwork. Find your everyday tool.",
  robots: { index: false, follow: true },
};

export default async function NewFourPage() {
  const catalog = await getPublicTools("en").then(
    (tools) => ({ tools, unavailable: false }),
    () => ({ tools: [], unavailable: true }),
  );

  return (
    <div className={styles.page}>
      <a href="#new4-main" className={styles.skipLink}>
        Skip to content
      </a>
      <ProductHeader
        compact
        minimal
        name="SmartTools"
        href="/new4"
        subtitle=""
        className={styles.header}
        actions={
          <>
            <nav aria-label="Page navigation" className={styles.navigation}>
              <a href="#new4-story">A few possibilities</a>
              <a href="#new4-index">The tools</a>
            </nav>
            <Button asChild variant="strong" className={styles.headerAction}>
              <a href="#new4-index">
                Find your tool <ArrowUpRight aria-hidden="true" />
              </a>
            </Button>
          </>
        }
      />
      <main id="new4-main">
        <KineticLanding tools={catalog.tools} unavailable={catalog.unavailable} />
        <section className={styles.closing} aria-labelledby="new4-closing-heading">
          <span className={styles.eyebrow}>YOUR NEXT GOOD IDEA IS WAITING</span>
          <h2 id="new4-closing-heading">
            Less in the way.
            <br />
            <span>More on the way.</span>
          </h2>
          <Button asChild size="lg" className={styles.closingAction}>
            <a href="#new4-index">
              Make your next move <ArrowUpRight aria-hidden="true" />
            </a>
          </Button>
          <div className={styles.closingNotes}>
            <p>Open a tool. Finish a task. Keep going.</p>
            <p>Many tools work in your browser. Each tool explains when a server or external service is needed.</p>
          </div>
        </section>
      </main>
      <ProductFooter
        className={styles.footer}
        brand="SmartTools"
        brandMark={<SmartToolsLogoMark aria-hidden="true" />}
        description="Small tools. Big possibilities."
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
            title: "A little more",
            links: [
              { href: "/blog", label: "Journal" },
              { href: "/contact", label: "Get in touch" },
              { href: "/privacy", label: "Privacy" },
            ],
          },
        ]}
      />
    </div>
  );
}
