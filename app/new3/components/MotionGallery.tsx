"use client";

import { useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowDown, ArrowUpRight, Check, MoveHorizontal } from "lucide-react";
import { Button, CodeBlock } from "@/components/ui";
import { Input } from "@/components/ui/components/input";
import { SyntaxHighlight } from "@/components/content/SyntaxHighlight";
import type { PublicTool } from "@/lib/tool-framework/catalog";
import styles from "../new3.module.css";

type GalleryTool = Pick<PublicTool, "toolId" | "name" | "href" | "app">;
type GalleryKind = "code" | "image" | "paper";
const SELECTIONS = [
  {
    id: "code",
    number: "01",
    label: "A little clarity",
    collection: "Developer",
    href: "/devtools/json-formatter",
    app: "devtools",
    title: "Make sense of your code.",
  },
  {
    id: "image",
    number: "02",
    label: "A fresh perspective",
    collection: "Media",
    href: "/media/crop-image",
    app: "media",
    title: "Find a better frame.",
  },
  {
    id: "paper",
    number: "03",
    label: "The finishing touch",
    collection: "Paperwork",
    href: "/paperwork/invoice-generator",
    app: "paperwork",
    title: "Make it official.",
  },
] as const;
const SAMPLE = { project: "Something good", status: "ready", possibilities: ["create", "make", "begin"] };
const EASE = [0.22, 1, 0.36, 1] as const;

function Landscape({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 700 500"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Blue mountains and a pale sun reflected in a still lake"
    >
      <rect width="700" height="500" fill="var(--accent)" />
      <circle cx="498" cy="133" r="50" fill="var(--card)" />
      <path
        d="M0 280 122 91 214 226 321 133 449 267 549 176 700 301V500H0Z"
        fill="color-mix(in srgb, var(--primary) 24%, var(--card))"
      />
      <path
        d="m0 333 132-170 100 155 159-92 121 119 90-64 98 54V500H0Z"
        fill="color-mix(in srgb, var(--primary) 52%, var(--card))"
      />
      <path d="m0 370 100-61 127 78 129-43 131 40 101-68 112 53V500H0Z" fill="var(--primary)" />
      <path d="M0 401q169-11 350 4t350-3v98H0Z" fill="color-mix(in srgb, var(--primary) 18%, var(--card))" />
      <path d="m0 425 210 15 174-7 191 7 125-13v73H0Z" fill="color-mix(in srgb, var(--primary) 34%, var(--card))" />
      <path d="M0 458q192-12 358 4t342-2" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <path d="m0 491 85-51 54 17 61 43H0Z" fill="color-mix(in srgb, var(--primary) 64%, var(--surface-ink))" />
    </svg>
  );
}

export function MotionGallery({ tools }: { tools: readonly GalleryTool[] }) {
  const [active, setActive] = useState<GalleryKind>("image");
  const [formatted, setFormatted] = useState(true);
  const [crop, setCrop] = useState(50);
  const [paperBlue, setPaperBlue] = useState(true);
  const reduced = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const headingY = useTransform(scrollYProgress, [0, 1], [0, 65]);
  const transition = { duration: reduced ? 0 : 0.6, ease: EASE };

  return (
    <section ref={heroRef} className={styles.hero} aria-labelledby="new3-heading">
      <motion.div
        className={styles.heroHeading}
        style={{ y: reduced ? 0 : headingY }}
        initial={reduced ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
      >
        <div>
          <p className={styles.heroEyebrow}>EVERYDAY UTILITY. A LITTLE EXTRAORDINARY.</p>
          <h1 id="new3-heading">
            SmartTools<span>.</span>
          </h1>
        </div>
        <div className={styles.heroIntroduction}>
          <p>
            Small tools.
            <br />
            <em>Beautiful possibilities.</em>
          </p>
          <a href="#collection">
            Explore the collection <ArrowDown aria-hidden="true" />
          </a>
        </div>
      </motion.div>
      <LayoutGroup id="new3-gallery">
        <motion.div
          className={styles.gallery}
          initial={reduced ? false : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...transition, delay: reduced ? 0 : 0.15 }}
        >
          {SELECTIONS.map((item) => {
            const selected = item.id === active;
            const tool = tools.find((candidate) => candidate.href === item.href);
            return (
              <motion.article
                layout={!reduced}
                transition={transition}
                key={item.id}
                className={styles.galleryPanel}
                data-active={selected}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") setActive(item.id);
                }}
                onFocusCapture={() => setActive(item.id)}
              >
                <Button
                  variant="ghost"
                  className={styles.gallerySelector}
                  aria-pressed={selected}
                  aria-controls={`preview-${item.id}`}
                  onClick={() => setActive(item.id)}
                >
                  <span className={styles.galleryNumber}>{item.number}</span>
                  <span>{item.label}</span>
                  <ArrowUpRight aria-hidden="true" />
                </Button>
                <motion.div layout="position" className={styles.preview} id={`preview-${item.id}`}>
                  {item.id === "code" && (
                    <motion.div
                      className={styles.codeArtifact}
                      animate={{ rotate: selected ? 0 : -5, y: selected ? 0 : 8 }}
                      transition={transition}
                    >
                      <div className={styles.artifactTop}>
                        <span className={styles.fileDot} /> possibility.json <span>JSON</span>
                      </div>
                      <CodeBlock className={styles.codeBlock} data-language="json">
                        <SyntaxHighlight
                          code={JSON.stringify(SAMPLE, null, formatted ? 2 : undefined)}
                          language="json"
                        />
                      </CodeBlock>
                      <div className={styles.codeStatus}>
                        <Check aria-hidden="true" /> Valid JSON <span>Sample data</span>
                      </div>
                    </motion.div>
                  )}
                  {item.id === "image" && (
                    <motion.div
                      className={styles.imageArtifact}
                      animate={{ rotate: selected ? 0 : 3, scale: selected ? 1 : 0.95 }}
                      transition={transition}
                    >
                      <Landscape className={styles.landscape} />
                      <div className={styles.cropShade} style={{ left: `${12 + crop * 0.23}%` }}>
                        <span />
                        <span />
                        <span />
                        <span />
                        <div className={styles.cropGrid} />
                      </div>
                      <span className={styles.imageLabel}>A DIFFERENT POINT OF VIEW</span>
                    </motion.div>
                  )}
                  {item.id === "paper" && (
                    <motion.div
                      className={styles.paperArtifact}
                      data-blue={paperBlue}
                      animate={{ rotate: selected ? 0 : 7, y: selected ? 0 : 12 }}
                      transition={transition}
                    >
                      <div className={styles.invoiceMark}>s.</div>
                      <div className={styles.invoiceHeading}>
                        <span>Invoice</span>
                        <small>NO. 001</small>
                      </div>
                      <div className={styles.invoiceParty}>
                        <span>Studio North</span>
                        <small>Design worth making.</small>
                      </div>
                      <div className={styles.invoiceRow}>
                        <span>Brand identity</span>
                        <span>$1,200.00</span>
                      </div>
                      <div className={styles.invoiceRow}>
                        <span>Art direction</span>
                        <span>$800.00</span>
                      </div>
                      <div className={styles.invoiceTotal}>
                        <span>Total due</span>
                        <strong>$2,000.00</strong>
                      </div>
                      <div className={styles.invoiceNote}>Thank you for making good things with us.</div>
                    </motion.div>
                  )}
                </motion.div>
                <div className={styles.galleryBottom}>
                  <span className={styles.previewCategory}>{item.collection}</span>
                  <h2>{item.title}</h2>
                  <AnimatePresence initial={false}>
                    {selected && (
                      <motion.div
                        className={styles.previewActions}
                        initial={reduced ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reduced ? 0 : 0.18 }}
                      >
                        {item.id === "code" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={styles.sampleAction}
                            onClick={() => setFormatted((value) => !value)}
                          >
                            {formatted ? "Minify sample" : "Format sample"} <MoveHorizontal aria-hidden="true" />
                          </Button>
                        )}
                        {item.id === "image" && (
                          <label className={styles.cropControl}>
                            <span>Slide to reframe</span>
                            <Input
                              type="range"
                              min={0}
                              max={100}
                              value={crop}
                              aria-label="Reframe the sample image"
                              onChange={(event) => setCrop(Number(event.target.value))}
                              className={styles.cropRange}
                            />
                          </label>
                        )}
                        {item.id === "paper" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={styles.sampleAction}
                            onClick={() => setPaperBlue((value) => !value)}
                          >
                            {paperBlue ? "Try ink on paper" : "Add a little blue"}{" "}
                            <span className={styles.themeSwatch} data-blue={!paperBlue} />
                          </Button>
                        )}
                        <a href={tool?.href ?? `/${item.app}`} className={styles.openPreview}>
                          {tool ? "Open tool" : `Explore ${item.collection.toLowerCase()}`}{" "}
                          <ArrowUpRight aria-hidden="true" />
                        </a>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {selected && (
                  <motion.div layoutId="selection-line" className={styles.selectionLine} transition={transition} />
                )}
              </motion.article>
            );
          })}
        </motion.div>
      </LayoutGroup>
      <div className={styles.galleryCaption}>
        <span>Three ways to make a little progress.</span>
        <span>
          Explore a preview. Make it your own. <ArrowUpRight aria-hidden="true" />
        </span>
      </div>
    </section>
  );
}
