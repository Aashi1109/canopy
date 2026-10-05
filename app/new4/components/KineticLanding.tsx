"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Search } from "lucide-react";
import { CodeBlock, ToolCard } from "@/components/ui";
import { Card } from "@/components/ui/components/card";
import { SyntaxHighlight } from "@/components/content/SyntaxHighlight";
import { Button } from "@/components/ui/components/button";
import { Input } from "@/components/ui/components/input";
import { ToolIcon } from "@/components/ToolIcon";
import { searchTools } from "@/lib/tool-catalog/index";
import type { PublicTool } from "@/lib/tool-framework/catalog";
import styles from "../new4.module.css";

type LandingTool = Pick<PublicTool, "toolId" | "name" | "description" | "href" | "app" | "keywords" | "icon">;
type Collection = "all" | LandingTool["app"];
const CHAPTERS = [
  {
    app: "devtools",
    label: "Developer",
    verb: "Untangle.",
    lead: "A little clarity.",
    description: "Format the data. Find the difference. Make the complicated a little more readable.",
    example: "JSON, with room to breathe.",
    examplePath: "/devtools/json-formatter",
    exampleAction: "Open JSON Formatter",
    path: "/devtools",
  },
  {
    app: "media",
    label: "Media",
    verb: "Reframe.",
    lead: "A fresh perspective.",
    description: "The right dimensions. The lighter file. Everything you need to make your media fit.",
    example: "A new point of view.",
    examplePath: "/media/crop-image",
    exampleAction: "Open Image Cropper",
    path: "/media",
  },
  {
    app: "paperwork",
    label: "Paperwork",
    verb: "Deliver.",
    lead: "A finishing touch.",
    description: "Turn a job well done into a document ready to send. Take care of the details and get back to work.",
    example: "The details, taken care of.",
    examplePath: "/paperwork/invoice-generator",
    exampleAction: "Open Invoice Generator",
    path: "/paperwork",
  },
] as const;
const CATEGORIES = [
  { key: "all", label: "Everything" },
  ...CHAPTERS.map(({ app, label }) => ({ key: app, label })),
] as const;
const CATEGORY_NAMES = { devtools: "Developer", media: "Media", paperwork: "Paperwork" };
const EASE = [0.22, 1, 0.36, 1] as const;

function TypePoster() {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const smoothX = useSpring(x, { stiffness: 100, damping: 22 });
  const smoothY = useSpring(y, { stiffness: 100, damping: 22 });
  const rotate = useTransform(smoothX, [-30, 30], [-5, 5]);
  const [emphasis, setEmphasis] = useState(false);

  function followPointer(event: PointerEvent<HTMLElement>) {
    if (reduced || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    x.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 42);
    y.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 24);
  }

  return (
    <section
      className={styles.hero}
      aria-labelledby="new4-hero-heading"
      onPointerMove={followPointer}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      <div className={styles.heroOverline}>
        <span>SMALL TOOLS. BIG POSSIBILITIES.</span>
        <span>CODE / MEDIA / PAPERWORK</span>
      </div>
      <h1 id="new4-hero-heading" className={styles.wordmark} aria-label="SmartTools. Small tools. Big possibilities.">
        {"SmartTools".split("").map((letter, index) => (
          <motion.span
            key={index}
            aria-hidden="true"
            initial={reduced ? false : { y: "105%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.9, delay: index * 0.035, ease: EASE }}
            whileHover={reduced ? undefined : { y: -14, color: "var(--primary)" }}
          >
            {letter}
          </motion.span>
        ))}
        <span className={styles.wordmarkPeriod} aria-hidden="true">
          .
        </span>
      </h1>
      <div className={styles.heroBottom}>
        <div className={styles.promise}>
          <span>A little less</span>
          <Button
            variant="ghost"
            className={styles.busywork}
            aria-pressed={emphasis}
            aria-label={emphasis ? "Restore busywork" : "Clear the busywork"}
            onClick={() => setEmphasis((value) => !value)}
          >
            <span className={styles.wordWindow}>
              <motion.span
                animate={{ y: emphasis ? "-50%" : "0%" }}
                transition={{ duration: reduced ? 0 : 0.65, ease: EASE }}
              >
                <span>busywork.</span>
                <span>in your way.</span>
              </motion.span>
            </span>
            <span className={styles.strike} data-active={emphasis} />
          </Button>
          <span className={styles.clickHint}>
            {emphasis ? "That’s more like it." : "Give it a click."} <ArrowUpRight aria-hidden="true" />
          </span>
        </div>
        <motion.a
          href="#new4-index"
          className={styles.roundArrow}
          aria-label="Explore all tools"
          style={reduced ? undefined : { x: smoothX, y: smoothY, rotate }}
        >
          <ArrowUpRight aria-hidden="true" />
        </motion.a>
        <div className={styles.heroAside}>
          <p>Useful tools for the little tasks between you and your next big thing.</p>
          <Button asChild size="lg" className={styles.heroCta}>
            <a href="#new4-index">
              Find your tool <ArrowUpRight aria-hidden="true" />
            </a>
          </Button>
          <span>No account needed to start.</span>
        </div>
      </div>
      <div className={styles.heroFoot}>
        <a href="#new4-story">
          A few possibilities <ArrowDown aria-hidden="true" />
        </a>
        <span>LESS FRICTION. MORE FLOW.</span>
      </div>
    </section>
  );
}

function ScrollChapters({ tools }: { tools: readonly LandingTool[] }) {
  const storyRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [shortViewport, setShortViewport] = useState(false);
  const staticScene = reduced || shortViewport;
  const [chapter, setChapter] = useState(0);
  const { scrollYProgress } = useScroll({ target: storyRef, offset: ["start start", "end end"] });
  const lineScale = useTransform(scrollYProgress, [0, 1], [0.03, 1]);
  useEffect(() => {
    const screen = window.matchMedia("(max-width: 760px), (max-height: 600px)");
    const sync = () => setShortViewport(screen.matches);
    sync();
    screen.addEventListener("change", sync);
    return () => screen.removeEventListener("change", sync);
  }, []);
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (!staticScene) setChapter(Math.min(2, Math.floor(value * 3)));
  });
  const current = CHAPTERS[chapter];
  const featured = tools.filter((tool) => tool.app === current.app && tool.href !== current.examplePath).slice(0, 2);
  const exampleAvailable = tools.some((tool) => tool.href === current.examplePath);

  function selectChapter(index: number) {
    setChapter(index);
    if (!staticScene && storyRef.current) {
      const top = storyRef.current.getBoundingClientRect().top + window.scrollY;
      const distance = Math.max(0, storyRef.current.offsetHeight - window.innerHeight);
      window.scrollTo({ top: top + distance * ((index + 0.35) / 3), behavior: "instant" });
    }
  }

  return (
    <section
      id="new4-story"
      ref={storyRef}
      className={styles.story}
      data-reduced={Boolean(staticScene)}
      aria-label="Three ways to get on with your day"
    >
      <div className={styles.storySticky}>
        <div className={styles.storyTop}>
          <div className={styles.storyHeading}>
            <span className={styles.eyebrow}>THE POSSIBILITIES</span>
            <p>A small tool. A good next step.</p>
          </div>
          <div className={styles.chapterButtons} role="group" aria-label="Choose a collection to explore">
            {CHAPTERS.map((item, index) => (
              <Button
                key={item.app}
                variant="ghost"
                onClick={() => selectChapter(index)}
                aria-pressed={chapter === index}
                className={styles.chapterButton}
              >
                <span>0{index + 1}</span> {item.label}
              </Button>
            ))}
          </div>
        </div>
        <div className={styles.progressTrack} aria-hidden="true">
          <motion.div style={{ scaleX: staticScene ? (chapter + 1) / 3 : lineScale }} />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={chapter}
            className={styles.scene}
            initial={{ opacity: 0, y: reduced ? 0 : 35 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -25 }}
            transition={{ duration: reduced ? 0 : 0.35, ease: EASE }}
          >
            <div className={styles.sceneCopy}>
              <div className={styles.sceneLead}>
                <span>0{chapter + 1} / 03</span>
                <p>{current.lead}</p>
              </div>
              <h2 className={styles.sceneTitle}>{current.verb}</h2>
              <p className={styles.sceneDescription}>{current.description}</p>
              <Button asChild size="lg" className={styles.sceneAction}>
                <a href={current.path}>
                  Explore {current.label} <ArrowUpRight aria-hidden="true" />
                </a>
              </Button>
              <div className={styles.featuredLinks}>
                <span>ALSO IN THE COLLECTION</span>
                {featured.map((tool) => (
                  <a key={tool.toolId} href={tool.href}>
                    {tool.name}
                    <ArrowUpRight aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
            <div className={styles.preview}>
              <div className={styles.previewTop}>
                <span>{current.example}</span>
                <span>SAMPLE</span>
              </div>
              <div className={styles.previewCanvas}>
                {current.app === "devtools" ? (
                  <Card className={styles.codeSample}>
                    <div className={styles.sampleHeading}>
                      <span>project.json</span>
                      <span>Formatted</span>
                    </div>
                    <CodeBlock className={styles.sampleCode} data-language="json">
                      <SyntaxHighlight
                        language="json"
                        code={
                          '{\n  "name": "A good idea",\n  "status": "ready",\n  "next": [\n    "make it happen"\n  ]\n}'
                        }
                      />
                    </CodeBlock>
                    <div className={styles.sampleFoot}>
                      <Check aria-hidden="true" /> Clear structure. Easy to read.
                    </div>
                  </Card>
                ) : current.app === "media" ? (
                  <div className={styles.mediaSample}>
                    <svg
                      viewBox="0 0 460 300"
                      role="img"
                      aria-label="Sample blue architectural image with a square crop framing its arch"
                    >
                      <rect width="460" height="300" fill="var(--accent)" />
                      <path d="M75 300V128a130 130 0 0 1 260 0v172Z" fill="var(--primary)" />
                      <path d="M145 300V139a60 60 0 0 1 120 0v161Z" fill="var(--paper)" />
                      <path d="m145 300 120-92v92Z" fill="var(--rule)" />
                      <path d="m335 115 125 80v105H335Z" fill="var(--ink)" opacity=".1" />
                      <path d="M0 0h460v300H0Zm91 24v252h252V24Z" fill="var(--ink)" fillRule="evenodd" opacity=".28" />
                      <path
                        d="M91 56V24h32m188 0h32v32m0 188v32h-32m-188 0H91v-32"
                        fill="none"
                        stroke="var(--primary-foreground)"
                        strokeWidth="3"
                      />
                      <path
                        d="M175 24v252m84-252v252M91 108h252M91 192h252"
                        stroke="var(--primary-foreground)"
                        strokeOpacity=".3"
                      />
                    </svg>
                    <div className={styles.mediaCaption}>
                      <span>Find your focus.</span>
                      <span>1 : 1</span>
                    </div>
                  </div>
                ) : (
                  <Card className={styles.invoiceSample}>
                    <div className={styles.invoiceHeading}>
                      <span>Studio North</span>
                      <strong>Invoice</strong>
                    </div>
                    <div className={styles.invoiceMeta}>
                      <span>
                        FOR
                        <br />
                        <strong>Acme Studio</strong>
                      </span>
                      <span>
                        NO.
                        <br />
                        <strong>INV–0042</strong>
                      </span>
                    </div>
                    <div className={styles.invoiceLine}>
                      <span>Brand design</span>
                      <span>$1,200.00</span>
                    </div>
                    <div className={styles.invoiceLine}>
                      <span>Creative direction</span>
                      <span>$300.00</span>
                    </div>
                    <div className={styles.invoiceTotal}>
                      <span>Total due · USD</span>
                      <strong>$1,500.00</strong>
                    </div>
                    <p>Thank you for making good things with us.</p>
                  </Card>
                )}
              </div>
              <a href={exampleAvailable ? current.examplePath : current.path} className={styles.previewLink}>
                {exampleAvailable ? current.exampleAction : `Explore ${current.label}`}{" "}
                <ArrowUpRight aria-hidden="true" />
              </a>
            </div>
          </motion.div>
        </AnimatePresence>
        <div className={styles.storyFoot}>
          <span>{staticScene ? "CHOOSE A COLLECTION ABOVE" : "SCROLL TO EXPLORE / OR CHOOSE A COLLECTION ABOVE"}</span>
          <a href="#new4-index">
            Straight to the tools <ArrowDown aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

function ToolDirectory({ tools, unavailable }: { tools: readonly LandingTool[]; unavailable: boolean }) {
  const [category, setCategory] = useState<Collection>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(6);
  const listRef = useRef<HTMLDivElement>(null);
  const newResult = useRef<number | null>(null);
  const searchable = useMemo(() => tools.map((tool) => ({ ...tool, category: CATEGORY_NAMES[tool.app] })), [tools]);
  const results = useMemo(
    () => searchTools(searchable, query).filter((tool) => category === "all" || tool.app === category),
    [searchable, query, category],
  );
  useEffect(() => {
    if (newResult.current !== null) {
      listRef.current?.children[newResult.current]?.querySelector("a")?.focus();
      newResult.current = null;
    }
  }, [limit]);

  function reset() {
    setCategory("all");
    setQuery("");
    setLimit(6);
  }

  return (
    <section id="new4-index" className={styles.directory} aria-labelledby="new4-directory-heading">
      <div className={styles.directoryHeading}>
        <div>
          <span className={styles.eyebrow}>THE EVERYDAY COLLECTION</span>
          <h2 id="new4-directory-heading">
            Find your
            <br />
            <em>next move.</em>
          </h2>
        </div>
        <div className={styles.search}>
          <label htmlFor="new4-search">What needs doing?</label>
          <Input
            id="new4-search"
            type="search"
            size="lg"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(6);
            }}
            placeholder="Try JSON, image, invoice…"
            leadingIcon={<Search />}
            className={styles.searchInput}
          />
        </div>
      </div>
      <div className={styles.directoryBar}>
        <div className={styles.filters} role="group" aria-label="Filter tools by collection">
          {CATEGORIES.map((item) => (
            <Button
              key={item.key}
              variant="ghost"
              aria-pressed={category === item.key}
              className={styles.filter}
              onClick={() => {
                setCategory(item.key);
                setLimit(6);
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <span role="status" className={styles.resultsCount}>
          {unavailable ? "Collection unavailable" : `${results.length} ${results.length === 1 ? "tool" : "tools"}`}
        </span>
      </div>
      {unavailable || tools.length === 0 ? (
        <div className={styles.empty}>
          <h3>{unavailable ? "The collection couldn’t load." : "Your next task starts here."}</h3>
          <p>
            {unavailable
              ? "Try loading it again, or explore a collection directly."
              : "Choose a collection to see what’s available."}
          </p>
          <div>
            {unavailable && (
              <Button variant="outline" onClick={() => window.location.reload()}>
                Try again
              </Button>
            )}
            {CHAPTERS.map((item) => (
              <Button key={item.app} asChild variant="ghost">
                <a href={item.path}>
                  {item.label}
                  <ArrowUpRight aria-hidden="true" />
                </a>
              </Button>
            ))}
          </div>
        </div>
      ) : results.length === 0 ? (
        <div className={styles.empty}>
          <h3>No match just yet.</h3>
          <p>Try a broader search or explore all the tools.</p>
          <Button variant="outline" onClick={reset}>
            Clear filters
          </Button>
        </div>
      ) : (
        <>
          <div ref={listRef} className={styles.toolList}>
            {results.slice(0, limit).map((tool, index) => (
              <div className={styles.toolRow} key={tool.toolId}>
                <span className={styles.toolNumber} aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <ToolCard
                  href={tool.href}
                  title={tool.name}
                  description={tool.description}
                  icon={<ToolIcon icon={tool.icon} />}
                  action={
                    <>
                      <span>
                        Open tool<span className="sr-only">: {tool.name}</span>
                      </span>
                      <ArrowUpRight aria-hidden="true" />
                    </>
                  }
                  className={styles.tool}
                />
              </div>
            ))}
          </div>
          <div className={styles.directoryFoot}>
            <p>
              Showing {Math.min(limit, results.length)} of {results.length}. Pick a tool and get straight to it.
            </p>
            {results.length > limit ? (
              <Button
                variant="outline"
                size="lg"
                className={styles.moreButton}
                onClick={() => {
                  newResult.current = limit;
                  setLimit((value) => value + 6);
                }}
              >
                A few more tools <ArrowDown aria-hidden="true" />
              </Button>
            ) : (
              (query || category !== "all") && (
                <Button variant="outline" size="lg" onClick={reset}>
                  Explore everything <ArrowRight aria-hidden="true" />
                </Button>
              )
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function KineticLanding({ tools, unavailable }: { tools: readonly LandingTool[]; unavailable: boolean }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.35, ease: EASE }}>
      <TypePoster />
      <ScrollChapters tools={tools} />
      <ToolDirectory tools={tools} unavailable={unavailable} />
    </MotionConfig>
  );
}
