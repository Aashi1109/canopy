import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { Button, ProductFooter, ProductHeader, SmartToolsLogoMark } from "@/components/ui";
import { getPublicTools } from "@/lib/tool-framework/catalog";
import { MotionGallery } from "./components/MotionGallery";
import { Collection } from "./components/Collection";
import styles from "./new3.module.css";

export const metadata: Metadata = {
  title: "Small tools. Beautiful possibilities. | SmartTools",
  description:
    "A considered collection of tools for code, images, and everyday paperwork. Find your next small shortcut.",
  robots: { index: false, follow: true },
};

export default async function NewThreePage() {
  const catalog = await getPublicTools("en").then(
    (tools) => ({ tools, unavailable: false }),
    () => ({ tools: [], unavailable: true }),
  );

  return (
    <div className={styles.page}>
      <a href="#new3-main" className={styles.skipLink}>
        Skip to content
      </a>
      <ProductHeader
        compact
        minimal
        name="SmartTools"
        href="/new3"
        subtitle=""
        className={styles.header}
        actions={
          <>
            <nav className={styles.navigation} aria-label="Explore SmartTools">
              <a href="#collection">The collection</a>
              <a href="#less-but-better">Our approach</a>
            </nav>
            <Button asChild variant="ghost" size="md" className={styles.headerAction}>
              <a href="#collection">
                Find your tool <ArrowUpRight aria-hidden="true" />
              </a>
            </Button>
          </>
        }
      />
      <main id="new3-main">
        <MotionGallery tools={catalog.tools} />
        <div className={styles.between}>
          <p>
            For the work between <em>the work.</em>
          </p>
          <span>Open a tool. Find your flow. Carry on.</span>
        </div>
        <Collection tools={catalog.tools} unavailable={catalog.unavailable} />
        <section id="less-but-better" className={styles.approach} aria-labelledby="approach-heading">
          <div className={styles.approachLabel}>
            <span>02</span> A LIGHTER WAY TO WORK
          </div>
          <div className={styles.approachBody}>
            <h2 id="approach-heading">
              A little less friction.
              <br />
              <em>A little more flow.</em>
            </h2>
            <div className={styles.principles}>
              <div>
                <span>01 /</span>
                <h3>Just open and begin.</h3>
                <p>No installation. No account needed to start. Your next task is a click away.</p>
              </div>
              <div>
                <span>02 /</span>
                <h3>Your work, in your hands.</h3>
                <p>Many tools work in your browser. Each tool tells you when a server or external service is needed.</p>
              </div>
              <div>
                <span>03 /</span>
                <h3>Made for the small things.</h3>
                <p>The quick format. The last-minute resize. The invoice you meant to send. All in one place.</p>
              </div>
            </div>
          </div>
        </section>
        <section className={styles.closing} aria-labelledby="closing-heading">
          <span className={styles.eyebrow}>ONE SMALL THING, SORTED.</span>
          <h2 id="closing-heading">
            What will you
            <br />
            <em>make of today?</em>
          </h2>
          <Button asChild size="lg" className={styles.closingAction}>
            <a href="#collection">
              Find a little possibility <ArrowUpRight aria-hidden="true" />
            </a>
          </Button>
          <span className={styles.closingGlyph} aria-hidden="true">
            ↗
          </span>
        </section>
      </main>
      <ProductFooter
        className={styles.footer}
        brand="SmartTools"
        brandMark={<SmartToolsLogoMark aria-hidden="true" />}
        description="Small tools. Beautiful possibilities."
        copyright={`© ${new Date().getFullYear()} SmartTools`}
        columns={[
          {
            title: "The collection",
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
              { href: "/contact", label: "Contact" },
              { href: "/privacy", label: "Privacy" },
            ],
          },
        ]}
      />
    </div>
  );
}
