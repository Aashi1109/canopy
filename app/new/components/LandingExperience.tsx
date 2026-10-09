"use client";

import { useState, type PointerEvent, type ReactNode } from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
} from "motion/react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  Code2,
  FileText,
  Image,
  Layers,
  MousePointer2,
  Pause,
  Play,
  ScanLine,
} from "lucide-react";
import { Button } from "@/components/ui/components/button";
import { Card } from "@/components/ui/components/card";
import { CodeBlock, Display } from "@/components/ui/components/typography";
import { SyntaxHighlight } from "@/components/content/SyntaxHighlight";
import styles from "../new.module.css";

const suites = [
  {
    name: "Developer",
    verb: "Make it click.",
    description: "Format, inspect, and transform your data.",
    href: "/devtools",
    icon: Code2,
  },
  {
    name: "Media",
    verb: "Make it yours.",
    description: "Convert, refine, and rework your files.",
    href: "/media",
    icon: Image,
  },
  {
    name: "Paperwork",
    verb: "Make it official.",
    description: "Create documents. Get back to business.",
    href: "/paperwork",
    icon: FileText,
  },
] as const;

export function LandingExperience({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const still = paused || Boolean(reduceMotion);
  const { scrollYProgress } = useScroll();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(y, { stiffness: 100, damping: 25 });
  const rotateY = useSpring(x, { stiffness: 100, damping: 25 });
  const suite = suites[active];

  function tilt(event: PointerEvent<HTMLDivElement>) {
    if (still || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    x.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 12);
    y.set(((event.clientY - bounds.top) / bounds.height - 0.5) * -10);
  }

  return (
    <MotionConfig reducedMotion={still ? "always" : "user"} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
      <main id="main-content" className={styles.main} data-motion-off={still || undefined}>
        {!still && (
          <motion.div aria-hidden="true" className={styles.scrollProgress} style={{ scaleX: scrollYProgress }} />
        )}
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <div className={styles.heroEyebrow}>
              <span aria-hidden="true" /> A LITTLE HELP FOR YOUR EVERYDAY
            </div>
            <Display id="hero-title" className={styles.heroTitle}>
              Small tasks.
              <br />
              Big{" "}
              <span>
                momentum
                <svg viewBox="0 0 490 22" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M3 15C130 2 323 2 486 12" />
                </svg>
              </span>
              .
            </Display>
            <p className={styles.heroDescription}>
              For the things between you and your next big thing.
              <br className={styles.desktopBreak} /> Simple tools for code, media, and paperwork.
              <br className={styles.desktopBreak} /> All together. Right in your browser.
            </p>
            <div className={styles.heroActions}>
              <Button asChild size="lg" className={styles.primaryCta}>
                <a href="#tools">
                  Find your tool <ArrowUpRight aria-hidden="true" />
                </a>
              </Button>
              <a className={styles.textCta} href="#why-smarttools">
                Meet your new shortcuts <ArrowDown aria-hidden="true" />
              </a>
            </div>
            <div className={styles.heroFootnote}>
              <span className={styles.miniMarks} aria-hidden="true">
                <Code2 />
                <Image />
                <FileText />
              </span>
              <span>Three collections. A lighter to-do list.</span>
            </div>
          </div>

          <div
            className={styles.playground}
            onPointerMove={tilt}
            onPointerLeave={() => {
              x.set(0);
              y.set(0);
            }}
          >
            <div className={styles.playgroundTop}>
              <span>YOUR EVERYDAY TOOLKIT</span>
              <span className={styles.playgroundIndex}>0{active + 1} / 03</span>
            </div>
            <div className={styles.orbitStage}>
              <div className={styles.orbitOuter} aria-hidden="true" />
              <div className={styles.orbitInner} aria-hidden="true" />
              <div className={styles.orbitLine} aria-hidden="true" />
              <div className={styles.orbitCross} aria-hidden="true" />
              <div className={styles.orbitTrack} aria-hidden="true">
                <span />
              </div>

              <motion.div
                className={styles.previewStack}
                style={still ? { rotateX: 0, rotateY: 0 } : { rotateX, rotateY }}
              >
                <div className={styles.backSheet} aria-hidden="true" />
                <div className={styles.middleSheet} aria-hidden="true" />
                <Card className={styles.previewCard}>
                  <div className={styles.previewLabel}>
                    <span className={styles.previewDot} />
                    {suite.name}
                    <ArrowUpRight aria-hidden="true" />
                  </div>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={active}
                      initial={{ opacity: 0, y: still ? 0 : 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: still ? 0 : -8 }}
                      transition={{ duration: still ? 0 : 0.2 }}
                      className={styles.previewContent}
                    >
                      {active === 0 ? (
                        <>
                          <Braces className={styles.featureIcon} aria-hidden="true" />
                          <CodeBlock className={styles.codePreview} data-language="json">
                            <SyntaxHighlight
                              language="json"
                              code={'{\n  "less": "busywork",\n  "more": "possibility"\n}'}
                            />
                          </CodeBlock>
                          <span className={styles.previewStatus}>
                            <Check aria-hidden="true" /> A little more readable.
                          </span>
                        </>
                      ) : active === 1 ? (
                        <>
                          <div className={styles.mediaPreview} aria-hidden="true">
                            <div className={styles.sun} />
                            <div className={styles.mountainBack} />
                            <div className={styles.mountainFront} />
                            <ScanLine />
                          </div>
                          <span className={styles.previewStatus}>
                            <Check aria-hidden="true" /> A fresh perspective.
                          </span>
                        </>
                      ) : (
                        <>
                          <div className={styles.documentPreview}>
                            <FileText aria-hidden="true" />
                            <strong>
                              Your next
                              <br />
                              chapter.
                            </strong>
                            <span />
                            <span />
                            <span />
                          </div>
                          <span className={styles.previewStatus}>
                            <Check aria-hidden="true" /> Down to the last detail.
                          </span>
                        </>
                      )}
                    </motion.div>
                  </AnimatePresence>
                  <span className={styles.sampleLabel}>ILLUSTRATIVE PREVIEW</span>
                </Card>
              </motion.div>

              {suites.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.name}
                    aria-label={`Preview ${item.name} tools`}
                    aria-pressed={active === index}
                    className={`${styles.orbitButton} ${styles[`orbitButton${index}`]}`}
                    variant="outline"
                    onClick={() => setActive(index)}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.name}</span>
                  </Button>
                );
              })}
              <span className={styles.littleSpark} aria-hidden="true">
                <Layers />
              </span>
            </div>
            <div className={styles.playgroundBottom}>
              <div aria-live="polite" aria-atomic="true">
                <strong>{suite.verb}</strong>
                <span>{suite.description}</span>
              </div>
              <Button asChild variant="outline" size="icon-lg" className={styles.suiteLink}>
                <a href={suite.href} aria-label={`Explore ${suite.name} tools`}>
                  <ArrowRight aria-hidden="true" />
                </a>
              </Button>
            </div>
            <div className={styles.playgroundHint}>
              <MousePointer2 aria-hidden="true" />
              <span>Pick a collection. Find your flow.</span>
            </div>
          </div>
        </section>
        <div className={styles.heroBaseline}>
          <span>
            <span aria-hidden="true" className={styles.baselineDot} /> LESS FRICTION. MORE FORWARD.
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={still}
            disabled={Boolean(reduceMotion)}
            onClick={() => {
              setPaused(!paused);
              x.set(0);
              y.set(0);
            }}
            className={styles.motionToggle}
          >
            {still ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {reduceMotion ? "Reduced motion" : paused ? "Enable motion" : "Pause motion"}
          </Button>
        </div>
        {children}
      </main>
    </MotionConfig>
  );
}
