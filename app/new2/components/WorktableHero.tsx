"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  motion,
  MotionConfig,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { ArrowDown, ArrowUpRight, Braces, Check, Crop, FileText, Grip, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/components/button";
import { Card } from "@/components/ui/components/card";
import { CodeBlock, Display } from "@/components/ui/components/typography";
import { SyntaxHighlight } from "@/components/content/SyntaxHighlight";
import type { PublicTool } from "@/lib/tool-framework/catalog";
import styles from "./WorktableHero.module.css";

const COLLECTIONS = [
  {
    name: "Developer",
    app: "devtools",
    icon: Braces,
    href: "/devtools/json-formatter",
    tool: "JSON Formatter",
    line: "A clearer kind of code.",
    angle: -9,
  },
  {
    name: "Media",
    app: "media",
    icon: Crop,
    href: "/media/crop-image",
    tool: "Crop Image",
    line: "A fresh perspective.",
    angle: 2,
  },
  {
    name: "Paperwork",
    app: "paperwork",
    icon: FileText,
    href: "/paperwork/receipt-generator",
    tool: "Receipt Generator",
    line: "A very good impression.",
    angle: 9,
  },
] as const;
const SAMPLE = { hello: "possibility", less: "busywork", more: ["make", "build", "create"] };
type HeroTool = Pick<PublicTool, "name" | "href" | "app">;

function Preview({
  index,
  active,
  select,
  done,
  toggle,
  reset,
  compact,
  progress,
  tools,
}: {
  index: number;
  active: boolean;
  select: () => void;
  done: boolean;
  toggle: () => void;
  reset: number;
  compact: boolean;
  progress: MotionValue<number>;
  tools: readonly HeroTool[];
}) {
  const item = COLLECTIONS[index];
  const Icon = item.icon;
  const reduced = useReducedMotion();
  const controls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const spread = useTransform(progress, [0, 0.85], [0, (index - 1) * 90]);
  const lift = useTransform(progress, [0, 0.85], [0, index === 1 ? -45 : 10]);
  const [positionNotice, setPositionNotice] = useState("");
  const tool = tools.find((candidate) => candidate.href === item.href);

  useEffect(() => {
    x.set(0);
    y.set(0);
    setPositionNotice("");
  }, [reset, x, y]);
  useEffect(() => {
    setPositionNotice("");
  }, [done]);
  function move(event: KeyboardEvent<HTMLButtonElement>) {
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-15, 0],
      ArrowRight: [15, 0],
      ArrowUp: [0, -15],
      ArrowDown: [0, 15],
    };
    if (event.key === "Home") {
      event.preventDefault();
      x.set(0);
      y.set(0);
      setPositionNotice(`${item.name} preview reset.`);
      return;
    }
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    select();
    x.set(Math.max(-100, Math.min(100, x.get() + offset[0])));
    y.set(Math.max(-55, Math.min(55, y.get() + offset[1])));
    setPositionNotice(`${item.name} preview moved ${event.key.replace("Arrow", "").toLowerCase()}.`);
  }

  return (
    <motion.div
      className={`${styles.previewPosition} ${styles[`position${index}`]}`}
      style={{ zIndex: active ? 20 : index + 2, x: reduced || compact ? 0 : spread, y: reduced || compact ? 0 : lift }}
    >
      <motion.div
        drag={!compact}
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ left: -100, right: 100, top: -55, bottom: 55 }}
        dragElastic={0.06}
        dragMomentum={false}
        style={{ x, y }}
        onDragStart={select}
        onDragEnd={() => setPositionNotice(`${item.name} preview moved. Use Reset layout to restore all previews.`)}
        onPointerDown={select}
      >
        <motion.div
          initial={{ opacity: 0, y: reduced ? 0 : 50, rotate: reduced || compact ? 0 : item.angle + 8 }}
          animate={{ opacity: 1, y: 0, rotate: compact ? 0 : item.angle, scale: active && !compact ? 1.025 : 1 }}
          transition={{ duration: reduced ? 0 : 0.65, delay: reset === 0 ? index * 0.09 : 0, ease: [0.22, 1, 0.36, 1] }}
          whileHover={reduced || compact ? undefined : { rotate: 0, scale: 1.045 }}
        >
          <Card className={`${styles.previewCard} ${index === 1 ? styles.imageCard : ""}`}>
            <div className={styles.cardHeader}>
              <span>
                <Icon aria-hidden="true" /> {item.name}
              </span>
              {compact ? (
                <span className={styles.sampleLabel}>SAMPLE</span>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={styles.grab}
                  aria-label={`Move ${item.name} preview`}
                  aria-describedby="canvas-keyboard-help"
                  onKeyDown={move}
                  onPointerDown={(event) => {
                    select();
                    controls.start(event);
                  }}
                >
                  <Grip aria-hidden="true" />
                </Button>
              )}
            </div>
            <div className={styles.artifact} role="region" aria-label={`${item.name} sample`}>
              {index === 0 && (
                <>
                  <div className={styles.fileLabel}>
                    <span>hello-world.json</span>
                    <span>{done ? "MINIFIED" : "FORMATTED"}</span>
                  </div>
                  <CodeBlock className={styles.code}>
                    <SyntaxHighlight language="json" code={JSON.stringify(SAMPLE, null, done ? undefined : 2)} />
                  </CodeBlock>
                  <span className={styles.codeStatus}>
                    <span /> Valid JSON. Clear head.
                  </span>
                </>
              )}
              {index === 1 && (
                <>
                  <div className={styles.picture} data-cropped={done}>
                    <svg
                      role="img"
                      aria-label={
                        done
                          ? "Square crop of a blue arch and orange sphere illustration"
                          : "Wide illustration of a blue arch and orange sphere"
                      }
                      viewBox={done ? "120 0 360 360" : "0 0 600 360"}
                    >
                      <rect width="600" height="360" fill="#e9eef6" />
                      <path d="M0 248H600V360H0Z" fill="#dbe3ef" />
                      <ellipse cx="330" cy="295" rx="166" ry="28" fill="#c2cee2" />
                      <path d="M215 282V145a90 90 0 0 1 180 0v137h-50V145a40 40 0 0 0-80 0v137Z" fill="#0066ff" />
                      <path d="M395 282l28-20V125a90 90 0 0 0-115-87 90 90 0 0 1 87 107Z" fill="#0047bb" />
                      <path d="M265 282l24-17V141a40 40 0 0 1 33-39 40 40 0 0 0-57 43Z" fill="#0047bb" />
                      <circle cx="213" cy="263" r="43" fill="#f39857" />
                      <path d="M179 289a43 43 0 0 0 65-53 43 43 0 0 1-65 53Z" fill="#d67d43" />
                      <path d="M431 208h68v74h-68Z" fill="#f8fafc" />
                      <path d="M431 208l23-15h69l-24 15Z" fill="#fff" />
                      <path d="M499 208l24-15v73l-24 16Z" fill="#c7d1df" />
                      {!done && (
                        <rect
                          x="120"
                          y="0"
                          width="360"
                          height="360"
                          fill="none"
                          stroke="#0047bb"
                          strokeWidth="1"
                          strokeDasharray="6 5"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                    </svg>
                  </div>
                  <div className={styles.imageMeta}>
                    <span>{done ? "The perfect square." : "A different point of view."}</span>
                    <span>{done ? "1:1" : "5:3"}</span>
                  </div>
                </>
              )}
              {index === 2 && (
                <div className={styles.receipt}>
                  <div className={styles.receiptBrand}>
                    STUDIO NORTH <span>№ 001</span>
                  </div>
                  <strong>
                    A job
                    <br />
                    well done.
                  </strong>
                  <div className={styles.receiptLine}>
                    <span>Design session</span>
                    <span>$120.00</span>
                  </div>
                  <div className={styles.receiptTotal}>
                    <span>Total paid</span>
                    <span>{done ? "$120.00" : "—"}</span>
                  </div>
                  {done && (
                    <motion.span
                      initial={{ opacity: 0, scale: reduced ? 1 : 1.4, rotate: -12 }}
                      animate={{ opacity: 1, scale: 1, rotate: -12 }}
                      className={styles.stamp}
                    >
                      PAID<small>THANK YOU</small>
                    </motion.span>
                  )}
                  <span className={styles.receiptDisclaimer}>SAMPLE · NO REAL TRANSACTION</span>
                </div>
              )}
            </div>
            <div className={styles.cardActions}>
              <Button variant="ghost" size="sm" onClick={toggle}>
                {index === 0
                  ? done
                    ? "Format sample"
                    : "Minify sample"
                  : index === 1
                    ? done
                      ? "Reset crop"
                      : "Crop sample"
                    : done
                      ? "Reset receipt"
                      : "Finish sample"}
                <span aria-hidden="true">↗</span>
              </Button>
              <a href={tool?.href ?? `/${item.app}`} aria-label={`Open ${tool?.name ?? `${item.name} tools`}`}>
                <ArrowUpRight aria-hidden="true" />
              </a>
            </div>
            <span role="status" className="sr-only">
              {positionNotice ||
                (index === 0
                  ? done
                    ? "JSON minified. The same data is kept."
                    : "JSON formatted with two-space indentation."
                  : index === 1
                    ? done
                      ? "Cropped to a square. The center of the original illustration is retained."
                      : "Original wide illustration."
                    : done
                      ? "Sample receipt marked paid. No payment has been collected."
                      : "Sample receipt. No real transaction.")}
            </span>
          </Card>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function WorktableHero({ tools }: { tools: readonly HeroTool[]; unavailable?: boolean }) {
  const [active, setActive] = useState(1);
  const [done, setDone] = useState([false, false, false]);
  const [reset, setReset] = useState(0);
  const [compact, setCompact] = useState(false);
  const reduced = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end start"] });
  const pointerX = useMotionValue(0),
    pointerY = useMotionValue(0);
  const rotateX = useSpring(pointerY, { stiffness: 85, damping: 25 });
  const rotateY = useSpring(pointerX, { stiffness: 85, damping: 25 });
  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  function tilt(event: PointerEvent<HTMLDivElement>) {
    if (reduced || compact || event.pointerType !== "mouse") return;
    const r = event.currentTarget.getBoundingClientRect();
    pointerX.set(((event.clientX - r.left) / r.width - 0.5) * 4);
    pointerY.set(((event.clientY - r.top) / r.height - 0.5) * -3);
  }

  return (
    <MotionConfig reducedMotion="user">
      <section ref={section} className={styles.hero} aria-labelledby="new2-hero-title">
        <motion.div
          className={styles.intro}
          initial={{ opacity: 0, y: reduced ? 0 : 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className={styles.eyebrow}>
            <span /> EVERYDAY TOOLS. EXTRAORDINARY POSSIBILITIES.
          </p>
          <Display id="new2-hero-title" className={styles.title}>
            Make <em>light</em> work.
          </Display>
          <p className={styles.description}>A little help for whatever’s next. Code, create, and make it yours.</p>
        </motion.div>
        <div
          className={styles.canvas}
          onPointerMove={tilt}
          onPointerLeave={() => {
            pointerX.set(0);
            pointerY.set(0);
          }}
        >
          <span className={styles.canvasWord} aria-hidden="true">
            possibility
          </span>
          <motion.div className={styles.scene} style={reduced || compact ? undefined : { rotateX, rotateY }}>
            {COLLECTIONS.map(
              (item, index) =>
                (!compact || active === index) && (
                  <Preview
                    key={item.app}
                    index={index}
                    active={active === index}
                    select={() => setActive(index)}
                    done={done[index]}
                    toggle={() => setDone((values) => values.map((value, i) => (i === index ? !value : value)))}
                    reset={reset}
                    compact={compact}
                    progress={scrollYProgress}
                    tools={tools}
                  />
                ),
            )}
          </motion.div>
          <span className={styles.canvasCorner} aria-hidden="true">
            YOUR EVERYDAY
            <br />
            TOOLKIT, UNPACKED.
          </span>
        </div>
        <div className={styles.canvasControls}>
          <div className={styles.collectionChoices} role="group" aria-label="Choose a preview">
            {COLLECTIONS.map((item, index) => (
              <Button
                variant="ghost"
                key={item.app}
                aria-pressed={active === index}
                onClick={() => setActive(index)}
                className={styles.choice}
              >
                <span className={styles.choiceDot} />
                {item.name}
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={styles.reset}
            onClick={() => {
              setReset((value) => value + 1);
              setActive(1);
            }}
          >
            <RotateCcw aria-hidden="true" /> Reset layout
          </Button>
        </div>
        <div className={styles.bottom}>
          <p id="canvas-keyboard-help">
            <Grip aria-hidden="true" />
            <span>
              Drag the handles. Try a sample. Find your flow.
              <small>Keyboard: focus a handle, use arrow keys to move, Home to reset.</small>
            </span>
          </p>
          <Button asChild size="lg" className={styles.explore}>
            <a href="#tool-index">
              Explore the collection
              <ArrowDown aria-hidden="true" />
            </a>
          </Button>
          <span className={styles.noSetup}>
            <Check aria-hidden="true" /> No installs. No account to start.
          </span>
        </div>
      </section>
    </MotionConfig>
  );
}
