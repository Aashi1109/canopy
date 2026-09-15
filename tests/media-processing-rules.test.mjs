import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

import { TOOL_CATEGORIES } from "../lib/tool-framework/categories.ts";
import {
  QpdfAdapterError,
  buildQpdfArguments,
  preservePdfWithQpdf,
} from "../lib/tool-framework/media/qpdf.ts";
import {
  PdfPreflightError,
  assertStructuralPdfInspection,
  clipEndOperators,
  clipStartOperators,
  getPdfContentBox,
  hasTransparentPixels,
  inspectPdfBeforeStructuralRewrite,
  processStructuralPages,
} from "../lib/tool-framework/media/pdfRules.ts";

import {
  calculateResizeDimensions,
  fitRect,
  getExifOrientationTransform,
  normalizeCropRect,
  readExifOrientation,
  rotatedDimensions,
} from "../lib/tool-framework/media/geometry.ts";
import {
  MEDIA_LIMITS,
  createOutputFilename,
  createPageArchiveFilename,
  createPageOutputFilename,
  detectMediaKind,
  hasPdfDigitalSignature,
  parsePageRange,
  sanitizeBaseName,
  sanitizeFileName,
  validateDecodedImageDimensions,
  validateImageSelection,
  validateMediaSignature,
  validatePdfSelection,
} from "../lib/tool-framework/media/validation.ts";
import {
  INSPECT_THUMBNAIL_WIDTH,
  beginWorkerJob,
  cancelWorkerJob,
  createToolInspectionCloseRequest,
  createToolInspectRequest,
  createToolJobState,
  createToolRunFile,
  createToolThumbnailRequest,
  createToolWorkerRequest,
  isToolWorkerMessage,
  isToolWorkerResponse,
  reduceWorkerJobState,
} from "../lib/tool-framework/workerProtocol.ts";

const EXPECTED_TOOLS_BY_CATEGORY = {
  "PDF Conversion": ["image-to-pdf", "pdf-to-jpg", "pdf-to-png"],
  "PDF Organization": [
    "merge-pdf",
    "split-pdf",
    "extract-pdf-pages",
    "reorder-pdf-pages",
    "rotate-pdf-pages",
    "delete-pdf-pages",
    "crop-pdf",
    "resize-pdf-pages",
  ],
  "PDF Optimization": [
    "compress-pdf",
    "watermark-pdf",
    "add-page-numbers",
  ],
  "Image Conversion": [
    "jpg-to-png",
    "png-to-jpg",
    "jpg-to-webp",
    "png-to-webp",
    "webp-to-jpg",
    "webp-to-png",
    "heic-to-jpg",
    "heic-to-png",
  ],
  "Image Editing": [
    "compress-image",
    "resize-image",
    "crop-image",
    "rotate-image",
    "flip-image",
    "combine-images",
    "remove-image-metadata",
    "social-media-image-resizer",
  ],
};

const requireFromMedia = createRequire(
  new URL("../package.json", import.meta.url),
);

const TOOLS_URL = new URL("../tools/", import.meta.url);

/**
 * The source of truth for what Media ships is the set of `tools/*\/definition.ts`
 * files, loaded exactly the way `tests/tool-registry.test.mjs` loads them: read
 * the folder names off disk, import each definition, keep the ones whose spec
 * declares `app: "media"`. There is deliberately no second catalogue to compare
 * against — the duplicate that used to live in `app/media/_lib/tools.ts` was
 * deleted rather than ported.
 */
const mediaTools = (
  await Promise.all(
    (await readdir(TOOLS_URL, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .map(async (folder) => {
        const spec = (await import(new URL(`${folder}/definition.ts`, TOOLS_URL)))
          .default;
        return { folder, spec };
      }),
  )
).filter(({ spec }) => spec.app === "media");

const mediaToolByFolder = new Map(
  mediaTools.map((tool) => [tool.folder, tool.spec]),
);

async function toolSource(folder, file) {
  return readFile(new URL(`${folder}/${file}`, TOOLS_URL), "utf8");
}

test("the Media runtime defines exactly the public tool routes, one per folder", () => {
  const expected = Object.values(EXPECTED_TOOLS_BY_CATEGORY).flat();

  assert.deepEqual([...mediaToolByFolder.keys()].sort(), [...expected].sort());
  assert.equal(mediaTools.length, expected.length);

  for (const [label, folders] of Object.entries(EXPECTED_TOOLS_BY_CATEGORY)) {
    assert.deepEqual(
      mediaTools
        .filter(({ spec }) => TOOL_CATEGORIES[spec.category].label === label)
        .map(({ folder }) => folder)
        .sort(),
      [...folders].sort(),
      label,
    );
  }

  for (const { folder, spec } of mediaTools) {
    assert.equal(spec.toolId, `media.${folder}`, folder);
    assert.equal(TOOL_CATEGORIES[spec.category].app, "media", folder);
    assert.match(spec.name, /\S/, folder);
    assert.match(spec.description, /\S/, folder);
    assert.equal(spec.input.kind, "files", folder);
    assert.match(spec.input.accept, /^(application|image)\//, folder);
    assert.ok(
      spec.input.engine === "image" || spec.input.engine === "pdf",
      folder,
    );
    assert.equal(typeof (spec.input.multiple ?? false), "boolean", folder);
  }
  assert.equal(mediaToolByFolder.get("not-a-tool"), undefined);
});

test("every Media catalog entry resolves to exactly one runtime implementation", async () => {
  // The folder walk above is the catalogue. There is no bundled list left to
  // compare it against, and reintroducing one is what this suite exists to
  // prevent — so uniqueness is asserted on the folders themselves.
  const catalogKeys = mediaTools.map(({ spec }) => spec.toolId.split(".")[1]);

  assert.deepEqual([...catalogKeys].sort(), [...mediaToolByFolder.keys()].sort());
  assert.equal(new Set(catalogKeys).size, catalogKeys.length);

  // One run module per folder, and it is the worker variant: every media tool
  // decodes bytes off the main thread.
  const runFiles = await Promise.all(
    mediaTools.map(async ({ folder }) => {
      const entries = await readdir(new URL(`${folder}/`, TOOLS_URL));
      return [folder, entries.filter((name) => /^run\.[a-z.]*ts$/.test(name))];
    }),
  );
  for (const [folder, files] of runFiles) {
    assert.deepEqual(files, ["run.worker.ts"], folder);
  }

  // The image/pdf engine split is total and disjoint, which is what the old
  // IMAGE_WORKER_OPERATIONS / PDF_WORKER_OPERATIONS partition guaranteed.
  const byEngine = { image: [], pdf: [] };
  for (const { folder, spec } of mediaTools) byEngine[spec.input.engine].push(folder);
  assert.deepEqual(
    byEngine.image.filter((folder) => byEngine.pdf.includes(folder)),
    [],
  );
  assert.equal(
    byEngine.image.length + byEngine.pdf.length,
    mediaTools.length,
  );
});

test("crop rejects HEIC at the public input boundary", () => {
  const crop = mediaToolByFolder.get("crop-image");

  assert.ok(crop);
  assert.doesNotMatch(crop.input.accept, /image\/hei[cf]/);
  assert.match(crop.input.accept, /image\/jpeg/);
  assert.match(crop.input.accept, /image\/png/);
  assert.match(crop.input.accept, /image\/webp/);
  assert.equal(crop.input.multiple ?? false, false);
});

test("the tool worker uses the classic runtime emitted by the production build", async () => {
  const source = await readFile(
    new URL("../lib/tool-framework/useToolRun.ts", import.meta.url),
    "utf8",
  );

  assert.ok((source.match(/new Worker\(/g) ?? []).length > 0);
  assert.doesNotMatch(source, /type:\s*["']module["']/);
});

test("worker teardown invalidates async continuations before releasing resources", async () => {
  const source = await readFile(
    new URL("../lib/tool-framework/useToolRun.ts", import.meta.url),
    "utf8",
  );
  const dispatch = source.indexOf("const dispatch = useCallback(");
  const terminate = source.indexOf("terminate();", dispatch);
  const spawn = source.indexOf("new Worker(", dispatch);
  const guard = source.indexOf("if (workerRef.current !== worker) return;", dispatch);

  assert.ok(dispatch >= 0);
  // The previous worker is killed before a new one can post into the same state.
  assert.ok(terminate > dispatch && terminate < spawn);
  // A message from a worker that is no longer current never reaches the reducer.
  assert.ok(guard > spawn);
  assert.ok(source.indexOf("reduceWorkerJobState(", guard) > guard);
  // Unmount asks a persistent inspection to close, with forced teardown as a
  // watchdog; ordinary run workers still terminate immediately.
  assert.match(source, /postMessage\(createToolInspectionCloseRequest\(jobId\)\)/);
  assert.match(source, /setTimeout\(\(\) => currentWorker\.terminate\(\)/);
  assert.match(source, /cleanupJob\(jobId\);/);
  assert.match(source, /workerRef\.current\?\.terminate\(\);/);
});

/**
 * The numeric encoder tables moved into the tool that owns them, as private
 * module constants in `tools/<key>/run.worker.ts` — a tool's quality curve is
 * nobody else's business. They are asserted from source rather than imported so
 * that nothing has to be exported purely for a test.
 */
test("preset mappings preserve the product defaults and engine values", async () => {
  const compressImage = await toolSource("compress-image", "run.worker.ts");
  assert.match(
    compressImage,
    /preset === "best"\s*\?\s*0\.9\s*:\s*preset === "smallest"\s*\?\s*0\.6\s*:\s*0\.8/,
  );
  assert.match(
    compressImage,
    /PNG_COMPRESSION_PRESETS = \{\s*fast: \{ effort: 3 \},\s*balanced: \{ effort: 6 \},\s*maximum: \{ effort: 9 \},\s*\}/,
  );
  assert.doesNotMatch(
    compressImage,
    /PNG_COMPRESSION_PRESETS = \{[^}]*\{[^}]*quality/,
  );

  const imageToPdf = await toolSource("image-to-pdf", "run.worker.ts");
  assert.match(
    imageToPdf,
    /original: \{ quality: 1, reencode: false \},\s*balanced: \{ quality: 0\.82, reencode: true \},\s*small: \{ quality: 0\.65, reencode: true \},/,
  );

  const compressPdf = await toolSource("compress-pdf", "run.worker.ts");
  assert.match(
    compressPdf,
    /high: \{ dpi: 150, quality: 0\.85 \},\s*balanced: \{ dpi: 120, quality: 0\.75 \},\s*smallest: \{ dpi: 96, quality: 0\.6 \},/,
  );

  // The choices and defaults each tool publishes are the definition's job.
  assert.deepEqual(
    mediaToolByFolder
      .get("compress-image")
      .settings.fields.preset.choices.map(({ value }) => value),
    ["best", "balanced", "smallest", "fast", "maximum"],
  );
  assert.equal(
    mediaToolByFolder.get("compress-image").settings.fields.preset.default,
    "balanced",
  );
  assert.deepEqual(
    mediaToolByFolder
      .get("image-to-pdf")
      .settings.fields.quality.choices.map(({ value }) => value),
    ["original", "balanced", "small"],
  );
  assert.deepEqual(
    mediaToolByFolder
      .get("compress-pdf")
      .settings.fields.strongPreset.choices.map(({ value }) => value),
    ["high", "balanced", "smallest"],
  );
  assert.equal(
    mediaToolByFolder.get("compress-pdf").settings.fields.strongPreset.default,
    "balanced",
  );
});

test("social image presets map every published target to exact dimensions", async () => {
  const EXPECTED = {
    "instagram-square": ["Instagram square", 1080, 1080],
    "instagram-portrait": ["Instagram portrait", 1080, 1350],
    "story-reel": ["Story / Reel", 1080, 1920],
    "youtube-thumbnail": ["YouTube thumbnail", 1280, 720],
    "x-landscape": ["X landscape", 1600, 900],
    "linkedin-landscape": ["LinkedIn landscape", 1200, 627],
    "facebook-landscape": ["Facebook landscape", 1200, 630],
  };

  // What the picker offers, and the size each option promises the user.
  const { choices, default: fallback } = mediaToolByFolder.get(
    "social-media-image-resizer",
  ).settings.fields.preset;
  assert.deepEqual(
    Object.fromEntries(
      choices.map(({ value, label }) => [value, label]),
    ),
    Object.fromEntries(
      Object.entries(EXPECTED).map(([value, [label, width, height]]) => [
        value,
        `${label} · ${width} × ${height}`,
      ]),
    ),
  );
  assert.equal(fallback, "instagram-square");

  // What the encoder actually resizes to, which must agree with the promise.
  const source = await toolSource("social-media-image-resizer", "run.worker.ts");
  for (const [value, [label, width, height]] of Object.entries(EXPECTED)) {
    assert.match(
      source,
      new RegExp(
        `"${value}": \\{\\s*label: "${label.replaceAll("/", "\\/")}",\\s*width: ${width},\\s*height: ${height},?\\s*\\}`,
      ),
      value,
    );
  }
  assert.equal(
    (source.match(/^\s{2}"[a-z-]+": \{/gm) ?? []).length,
    Object.keys(EXPECTED).length,
  );
});

test("media signatures are detected from bytes rather than extensions", () => {
  const fixtures = {
    pdf: new TextEncoder().encode("%PDF-1.7\n"),
    jpeg: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
    png: Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]),
    webp: riff("VP8 ", Uint8Array.of(0)),
    heic: ftyp("heic", ["mif1", "heic"]),
  };

  for (const [kind, bytes] of Object.entries(fixtures)) {
    assert.equal(detectMediaKind(bytes), kind);
  }
  assert.equal(detectMediaKind(new TextEncoder().encode("photo.jpg")), null);
});

test("signature validation rejects MIME mismatches and unsupported animation", () => {
  assert.deepEqual(
    validateMediaSignature(
      Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
      "image/png",
    ),
    {
      ok: false,
      code: "mime-mismatch",
      message: "The file contents do not match its reported type.",
    },
  );
  assert.equal(
    validateMediaSignature(
      Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
      "image/jpeg",
      ["png"],
    ).code,
    "unsupported-type",
  );
  assert.equal(
    validateMediaSignature(riff("VP8X", Uint8Array.of(0x02)), "image/webp")
      .code,
    "animated-image",
  );
  assert.equal(
    validateMediaSignature(ftyp("hevc", ["msf1"]), "image/heic").code,
    "image-sequence",
  );
  assert.deepEqual(
    validateMediaSignature(ftyp("heic", ["mif1"]), ""),
    { ok: true, kind: "heic", mime: "image/heic" },
  );
  assert.equal(
    validateMediaSignature(Uint8Array.of(1, 2, 3), "image/jpeg").code,
    "invalid-signature",
  );
});

test("image limits enforce per-file, batch, total, and decoded-pixel ceilings", () => {
  assert.deepEqual(
    validateImageSelection(
      Array.from({ length: MEDIA_LIMITS.images.maxFiles }, () => ({ size: 1 })),
    ),
    { ok: true },
  );
  assert.equal(
    validateImageSelection([{ size: MEDIA_LIMITS.images.maxFileBytes + 1 }])
      .code,
    "file-too-large",
  );
  assert.equal(
    validateImageSelection(
      Array.from({ length: MEDIA_LIMITS.images.maxFiles + 1 }, () => ({ size: 1 })),
    ).code,
    "too-many-files",
  );
  assert.equal(
    validateImageSelection([
      { size: 200 * 1024 * 1024 },
      { size: 51 * 1024 * 1024 },
    ]).code,
    "file-too-large",
  );
  assert.equal(
    validateImageSelection(
      Array.from({ length: 11 }, () => ({ size: 24 * 1024 * 1024 })),
    ).code,
    "total-too-large",
  );
  assert.deepEqual(validateDecodedImageDimensions(10_000, 10_000), { ok: true });
  assert.equal(validateDecodedImageDimensions(10_001, 10_000).code, "too-many-pixels");
  assert.equal(validateDecodedImageDimensions(0, 10).code, "invalid-dimensions");
});

test("PDF limits distinguish merge, structural, and raster jobs", () => {
  assert.deepEqual(
    validatePdfSelection([{ size: MEDIA_LIMITS.pdfs.maxFileBytes }], {
      pageCount: MEDIA_LIMITS.pdfs.maxStructuralPages,
    }),
    { ok: true },
  );
  assert.equal(
    validatePdfSelection([{ size: MEDIA_LIMITS.pdfs.maxFileBytes + 1 }]).code,
    "file-too-large",
  );
  assert.equal(
    validatePdfSelection(
      Array.from({ length: MEDIA_LIMITS.pdfs.maxMergeFiles + 1 }, () => ({
        size: 1,
      })),
      { merge: true },
    ).code,
    "too-many-files",
  );
  assert.equal(
    validatePdfSelection(
      Array.from({ length: 20 }, () => ({ size: 13 * 1024 * 1024 })),
      { merge: true },
    ).code,
    "total-too-large",
  );
  assert.equal(
    validatePdfSelection([{ size: 1 }], { pageCount: 501 }).code,
    "too-many-pages",
  );
  assert.equal(
    validatePdfSelection([{ size: 1 }], { pageCount: 201, raster: true }).code,
    "too-many-pages",
  );
});

test("digitally signed PDFs are detected before a rewriting operation", () => {
  assert.equal(
    hasPdfDigitalSignature(
      new TextEncoder().encode("%PDF-1.7\n/Type /Sig /ByteRange [0 10 20 30]"),
    ),
    true,
  );
  assert.equal(
    hasPdfDigitalSignature(new TextEncoder().encode("%PDF-1.7\n/Pages 2 0 R")),
    false,
  );
});

test("qpdf preserve arguments toggle metadata removal without changing compression", () => {
  const base = [
    "/input.pdf",
    "--object-streams=generate",
    "--stream-data=compress",
    "--recompress-flate",
    "--compression-level=9",
  ];
  assert.deepEqual(buildQpdfArguments("/input.pdf", "/output.pdf", false), [
    ...base,
    "/output.pdf",
  ]);
  assert.deepEqual(buildQpdfArguments("/input.pdf", "/output.pdf", true), [
    ...base,
    "--remove-info",
    "--remove-metadata",
    "/output.pdf",
  ]);
});

test("qpdf preserve fails closed outside a cross-origin-isolated browser", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "crossOriginIsolated");
  Object.defineProperty(globalThis, "crossOriginIsolated", {
    configurable: true,
    value: false,
  });
  try {
    await assert.rejects(
      preservePdfWithQpdf(new ArrayBuffer(0), {
        jobId: "unit-test",
        removeMetadata: true,
      }),
      (error) =>
        error instanceof QpdfAdapterError &&
        error.code === "qpdf-unavailable" &&
        /cross-origin-isolated browser/.test(error.message),
    );
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, "crossOriginIsolated", previous);
    } else {
      delete globalThis.crossOriginIsolated;
    }
  }

  const failure = new QpdfAdapterError("qpdf-failed", "qpdf failed safely");
  assert.equal(failure.code, "qpdf-failed");
  assert.equal(failure.message, "qpdf failed safely");
});

test("image-to-PDF detects PNG alpha that must be flattened onto the selected background", () => {
  assert.equal(
    hasTransparentPixels(Uint8ClampedArray.from([20, 30, 40, 255, 50, 60, 70, 255])),
    false,
  );
  assert.equal(
    hasTransparentPixels(Uint8ClampedArray.from([20, 30, 40, 255, 50, 60, 70, 64])),
    true,
  );
});

test("PDF fill and cover clip exactly to the inner page box", () => {
  const pdfLib = requireFromMedia("pdf-lib");
  const box = getPdfContentBox(612, 792, 18);
  assert.deepEqual(box, { x: 18, y: 18, width: 576, height: 756 });
  assert.deepEqual(clipStartOperators(box, pdfLib).map(String), [
    "q",
    "18 18 576 756 re",
    "W",
    "n",
  ]);
  assert.deepEqual(clipEndOperators(pdfLib).map(String), ["Q"]);
});

test("Preserve Document preflight rejects encrypted and oversized structural PDFs", async () => {
  assert.throws(
    () => assertStructuralPdfInspection({ isEncrypted: true, pageCount: 1 }),
    (error) =>
      error instanceof PdfPreflightError && error.code === "encrypted-pdf",
  );
  assert.throws(
    () => assertStructuralPdfInspection({ isEncrypted: false, pageCount: 501 }),
    (error) =>
      error instanceof PdfPreflightError && error.code === "too-many-pages",
  );

  const { PDFDocument } = requireFromMedia("pdf-lib");
  const source = await PDFDocument.create();
  source.addPage([200, 300]);
  const bytes = await source.save();
  const data = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  assert.deepEqual(await inspectPdfBeforeStructuralRewrite(data), { pageCount: 1 });
  await assert.rejects(
    inspectPdfBeforeStructuralRewrite(new TextEncoder().encode("%PDF-broken").buffer),
    (error) =>
      error instanceof PdfPreflightError && error.code === "malformed-pdf",
  );
});

test("structural page processing reports start and completion for every page", async () => {
  const updates = [];
  const visited = [];
  await processStructuralPages(
    [3, 0],
    (page) => page + 1,
    "Resizing PDF page",
    (current, completed, total, stage) => {
      updates.push({ current, completed, total, stage });
    },
    async (page) => {
      visited.push(page);
    },
  );

  assert.deepEqual(visited, [3, 0]);
  assert.deepEqual(updates, [
    { current: 4, completed: 0, total: 2, stage: "Resizing PDF page" },
    { current: 4, completed: 1, total: 2, stage: "Page complete" },
    { current: 1, completed: 1, total: 2, stage: "Resizing PDF page" },
    { current: 1, completed: 2, total: 2, stage: "Page complete" },
  ]);
});

test("output names remove paths, controls, reserved names, and unsafe punctuation", () => {
  assert.equal(sanitizeBaseName("../CON"), "download");
  assert.equal(sanitizeBaseName("  report:*?\u0000  "), "report");
  assert.equal(sanitizeBaseName("Résumé 2026"), "Résumé 2026");
  assert.equal(sanitizeBaseName("..."), "download");
  assert.equal(sanitizeFileName("../quarterly:report.PDF"), "quarterly-report.PDF");
  assert.equal(createOutputFilename("../../invoice.final.JPG", "png"), "invoice.final.png");
  assert.equal(
    createOutputFilename("CON.pdf", ".pdf", "compressed"),
    "download-compressed.pdf",
  );
  assert.equal(
    createPageOutputFilename("report.pdf", 3, 120, "jpg"),
    "report-page-003.jpg",
  );
  assert.equal(createPageArchiveFilename("report.pdf"), "report-pages.zip");
});

test("page ranges expand in display order and reject ambiguous selections", () => {
  assert.deepEqual(parsePageRange("1-3, 5, 8", 8), {
    ok: true,
    pages: [1, 2, 3, 5, 8],
  });
  assert.deepEqual(parsePageRange("all", 3), { ok: true, pages: [1, 2, 3] });

  for (const [input, code] of [
    ["", "empty-range"],
    ["0", "page-out-of-range"],
    ["9", "page-out-of-range"],
    ["3-1", "reversed-range"],
    ["1,,2", "invalid-range"],
    ["1-3,3", "duplicate-page"],
    ["one", "invalid-range"],
  ]) {
    assert.equal(parsePageRange(input, 8).code, code, input);
  }
});

test("resize and fit geometry covers aspect lock, no-upscale, contain, cover, and stretch", () => {
  assert.deepEqual(
    calculateResizeDimensions(
      { width: 400, height: 200 },
      { width: 100, lockAspectRatio: true, noUpscale: true },
    ),
    { width: 100, height: 50 },
  );
  assert.deepEqual(
    calculateResizeDimensions(
      { width: 400, height: 200 },
      { percentage: 50, lockAspectRatio: true, noUpscale: true },
    ),
    { width: 200, height: 100 },
  );
  assert.deepEqual(
    calculateResizeDimensions(
      { width: 400, height: 200 },
      { width: 800, lockAspectRatio: true, noUpscale: true },
    ),
    { width: 400, height: 200 },
  );
  assert.deepEqual(
    calculateResizeDimensions(
      { width: 400, height: 200 },
      { width: 100, height: 100, lockAspectRatio: false, noUpscale: false },
    ),
    { width: 100, height: 100 },
  );
  assert.deepEqual(fitRect({ width: 400, height: 200 }, { width: 100, height: 100 }, "contain"), {
    x: 0,
    y: 25,
    width: 100,
    height: 50,
    scaleX: 0.25,
    scaleY: 0.25,
  });
  assert.deepEqual(fitRect({ width: 400, height: 200 }, { width: 100, height: 100 }, "cover"), {
    x: -50,
    y: 0,
    width: 200,
    height: 100,
    scaleX: 0.5,
    scaleY: 0.5,
  });
  assert.deepEqual(fitRect({ width: 400, height: 200 }, { width: 100, height: 100 }, "stretch"), {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    scaleX: 0.25,
    scaleY: 0.5,
  });
});

test("geometry handles no-op, height-only, upscale, and invalid requests", () => {
  assert.deepEqual(
    calculateResizeDimensions(
      { width: 400, height: 200 },
      { lockAspectRatio: true, noUpscale: true },
    ),
    { width: 400, height: 200 },
  );
  assert.deepEqual(
    calculateResizeDimensions(
      { width: 400, height: 200 },
      { height: 50, lockAspectRatio: true, noUpscale: false },
    ),
    { width: 100, height: 50 },
  );
  assert.deepEqual(
    calculateResizeDimensions(
      { width: 400, height: 200 },
      { percentage: 200, lockAspectRatio: true, noUpscale: false },
    ),
    { width: 800, height: 400 },
  );
  assert.deepEqual(
    calculateResizeDimensions(
      { width: 400, height: 200 },
      { lockAspectRatio: false, noUpscale: false },
    ),
    { width: 400, height: 200 },
  );
  assert.throws(
    () =>
      calculateResizeDimensions(
        { width: 400, height: 200 },
        { percentage: 0, lockAspectRatio: true, noUpscale: true },
      ),
    /positive dimensions/,
  );
  assert.throws(
    () => fitRect({ width: 1, height: 1 }, { width: 1, height: 1 }, "tile"),
    /Unknown fit mode/,
  );
  assert.throws(() => rotatedDimensions(10, 20, 45), /Rotation must be/);
});

test("crop, rotation, and EXIF orientation helpers keep pixels in bounds", () => {
  assert.deepEqual(
    normalizeCropRect(
      { x: -10, y: 10, width: 150, height: 100 },
      { width: 100, height: 80 },
    ),
    { x: 0, y: 10, width: 100, height: 70 },
  );
  assert.throws(
    () =>
      normalizeCropRect(
        { x: 0, y: 0, width: 0, height: 10 },
        { width: 100, height: 80 },
      ),
    /positive dimensions/,
  );
  assert.deepEqual(rotatedDimensions(400, 200, 90), { width: 200, height: 400 });
  assert.deepEqual(rotatedDimensions(400, 200, 180), { width: 400, height: 200 });
  assert.deepEqual(rotatedDimensions(400, 200, 270), { width: 200, height: 400 });

  assert.deepEqual(getExifOrientationTransform(6, 400, 200), {
    matrix: [0, 1, -1, 0, 200, 0],
    width: 200,
    height: 400,
  });
  assert.deepEqual(getExifOrientationTransform(2, 400, 200), {
    matrix: [-1, 0, 0, 1, 400, 0],
    width: 400,
    height: 200,
  });
  assert.equal(readExifOrientation(jpegWithExifOrientation(8)), 8);
  assert.equal(readExifOrientation(Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)), 1);
  assert.equal(readExifOrientation(Uint8Array.of()), 1);
  assert.deepEqual(getExifOrientationTransform(99, 400, 200), {
    matrix: [1, 0, 0, 1, 0, 0],
    width: 400,
    height: 200,
  });
  assert.deepEqual(
    normalizeCropRect(
      { x: 10, y: 20, width: 30, height: 40 },
      { width: 100, height: 100 },
    ),
    { x: 10, y: 20, width: 30, height: 40 },
  );
  assert.throws(
    () =>
      normalizeCropRect(
        { x: Number.NaN, y: 0, width: 10, height: 10 },
        { width: 100, height: 100 },
      ),
    /Coordinates must be finite/,
  );
});

test("worker runs keep the original File with sanitized metadata", () => {
  const source = new File([Uint8Array.of(1, 2, 3)], "../private/photo?.jpg", {
    type: "IMAGE/JPEG",
  });
  const input = createToolRunFile("file-1", source);
  const message = createToolWorkerRequest({
    jobId: " job-1 ",
    key: " jpg-to-png ",
    files: [input],
    settings: {},
  });

  assert.equal(message.files[0].source, source);
  assert.equal(message.files[0].name, "photo.jpg");
  assert.equal(message.files[0].mime, "image/jpeg");
  assert.equal(message.files[0].size, 3);
  assert.deepEqual(
    { type: message.type, jobId: message.jobId, key: message.key },
    { type: "run", jobId: "job-1", key: "jpg-to-png" },
  );
  assert.equal(isToolWorkerMessage(message), true);
});

test("worker protocol rejects malformed File-backed runs", () => {
  const source = new File([Uint8Array.of(1)], "photo.jpg", { type: "image/jpeg" });
  const file = createToolRunFile("file-1", source);

  assert.throws(() => createToolRunFile(" ", source), /ID/);
  assert.throws(
    () => createToolRunFile("file", new Blob([Uint8Array.of(1)])),
    /File/,
  );
  assert.throws(
    () => createToolRunFile("file", new File(["x"], "bad.txt", { type: "not a mime" })),
    /MIME/,
  );
  assert.throws(
    () =>
      createToolWorkerRequest({
        jobId: " ",
        key: "jpg-to-png",
        files: [file],
        settings: {},
      }),
    /job ID/,
  );
  assert.throws(
    () =>
      createToolWorkerRequest({
        jobId: "job",
        key: "  ",
        files: [file],
        settings: {},
      }),
    /tool key/,
  );
  assert.throws(() => beginWorkerJob(createToolJobState(), " "), /job ID/);

  // Untrusted structured-clone payloads are shape-checked in both directions.
  assert.equal(isToolWorkerMessage({ type: "run", jobId: "job" }), false);
  assert.equal(isToolWorkerMessage({ type: "cancel", jobId: "" }), false);
  assert.equal(isToolWorkerMessage({ type: "cancel", jobId: "job" }), true);
  assert.equal(isToolWorkerResponse({ type: "canceled", jobId: "job" }), true);
  assert.equal(isToolWorkerResponse({ type: "success", jobId: "job" }), false);
  assert.equal(
    isToolWorkerResponse({
      type: "success",
      jobId: "job",
      result: { render: "files" },
    }),
    true,
  );

});

test("page inspection requests keep one document and a positive thumbnail width", () => {
  const file = createToolRunFile(
    "pdf-1",
    new File([new ArrayBuffer(8)], "document.pdf", { type: "application/pdf" }),
  );
  assert.deepEqual(
    createToolInspectRequest({ jobId: " inspect-1 ", key: "crop-pdf", file }),
    {
      type: "inspect",
      jobId: "inspect-1",
      key: "crop-pdf",
      files: [file],
      thumbnailWidth: INSPECT_THUMBNAIL_WIDTH,
    },
  );
  assert.equal(
    createToolInspectRequest({
      jobId: "inspect-1",
      key: "crop-pdf",
      file,
      thumbnailWidth: 160,
    }).thumbnailWidth,
    160,
  );
  assert.throws(
    () => createToolInspectRequest({ jobId: "", key: "crop-pdf", file }),
    /job ID/,
  );
  assert.throws(
    () =>
      createToolInspectRequest({
        jobId: "inspect",
        key: "crop-pdf",
        file,
        thumbnailWidth: 0,
      }),
    /positive integer/,
  );

  // Exactly one document per inspection — page geometry belongs to one file.
  assert.equal(
    isToolWorkerMessage({
      type: "inspect",
      jobId: "j",
      key: "crop-pdf",
      files: [file, file],
      thumbnailWidth: 180,
    }),
    false,
  );

  assert.deepEqual(
    createToolThumbnailRequest({
      jobId: " inspect-1 ",
      pageNumbers: [3, 1, 3, 2],
    }),
    {
      type: "inspect-thumbnails",
      jobId: "inspect-1",
      pageNumbers: [3, 1, 2],
    },
  );
  assert.deepEqual(createToolInspectionCloseRequest(" inspect-1 "), {
    type: "inspect-close",
    jobId: "inspect-1",
  });
  assert.throws(
    () => createToolThumbnailRequest({ jobId: "inspect-1", pageNumbers: [0] }),
    /positive integers/,
  );
  assert.throws(
    () =>
      createToolThumbnailRequest({
        jobId: "inspect-1",
        pageNumbers: Array.from({ length: 25 }, (_, index) => index + 1),
      }),
    /24/,
  );
  assert.equal(
    isToolWorkerMessage({
      type: "inspect-thumbnails",
      jobId: "inspect-1",
      pageNumbers: [1, 2],
    }),
    true,
  );
  assert.equal(
    isToolWorkerMessage({
      type: "inspect-thumbnails",
      jobId: "inspect-1",
      pageNumbers: [1, 1],
    }),
    false,
  );
});

test("PDF inspection can target generated output and rejects unknown sources", () => {
  const file = createToolRunFile(
    "generated-pdf",
    new File(["%PDF-1.7"], "images.pdf", { type: "application/pdf" }),
  );
  const request = createToolInspectRequest({
    jobId: "output-preview",
    key: "image-to-pdf",
    file,
    source: "output",
  });
  assert.equal(request.source, "output");
  assert.equal(request.key, "image-to-pdf");
  assert.equal(isToolWorkerMessage(request), true);
  assert.equal(isToolWorkerMessage({ ...request, source: undefined }), true);
  for (const source of ["other", null, false, 1]) {
    assert.equal(isToolWorkerMessage({ ...request, source }), false);
  }
});

test("display preview requests validate pixel width and accept lossless PNG responses", () => {
  const input = { jobId: "preview", pageNumbers: [1], renderWidth: 2048 };
  assert.equal(createToolThumbnailRequest(input).renderWidth, 2048);
  assert.equal(isToolWorkerMessage({ type: "inspect-thumbnails", ...input }), true);
  for (const renderWidth of [0, -1, 1.5, Infinity, 4097]) {
    assert.throws(() => createToolThumbnailRequest({ ...input, renderWidth }), /Preview width/);
    assert.equal(isToolWorkerMessage({ type: "inspect-thumbnails", ...input, renderWidth }), false);
  }
  assert.equal(isToolWorkerResponse({ type: "thumbnails", jobId: "preview", previews: [{
    pageNumber: 1, pageWidth: 612, pageHeight: 792, width: 2048, height: 2650,
    renderWidth: 2048, mime: "image/png", buffer: new ArrayBuffer(1),
  }] }), true);
});

test("large PDF previews evict raster bytes by pixel budget while preserving all page geometry", () => {
  let state = reduceWorkerJobState(beginWorkerJob(createToolJobState(), "preview"), {
    type: "inspected", jobId: "preview", pageCount: 6,
    previews: Array.from({ length: 6 }, (_, index) => ({ pageNumber: index + 1, pageWidth: 200, pageHeight: 400 })),
  });
  for (let pageNumber = 1; pageNumber <= 6; pageNumber++) {
    state = reduceWorkerJobState(state, {
      type: "thumbnails", jobId: "preview", previews: [{
        pageNumber, pageWidth: 200, pageHeight: 400, width: 2000, height: 4000,
        renderWidth: 2000, mime: "image/png", buffer: new ArrayBuffer(1),
      }],
    });
  }
  assert.equal(state.previews.length, 6);
  assert.deepEqual(state.previews.filter((page) => page.buffer).map((page) => page.pageNumber), [3, 4, 5, 6]);
  assert.equal("renderWidth" in state.previews[0], false, "Evicted pages must be eligible to render again.");
});

test("worker job state ignores stale responses and cannot complete after cancellation", () => {
  const idle = createToolJobState();
  const started = beginWorkerJob(idle, "job-1");
  assert.deepEqual(idle, createToolJobState(), "beginWorkerJob must not mutate");
  assert.deepEqual(
    { status: started.status, jobId: started.jobId },
    { status: "running", jobId: "job-1" },
  );

  // A response addressed to another job never advances the running job.
  const stale = reduceWorkerJobState(started, {
    type: "progress",
    jobId: "other-job",
    completed: 9,
    total: 9,
    stage: "encode",
  });
  assert.equal(stale, started);
  assert.equal(stale.progress, null);

  const progressed = reduceWorkerJobState(started, {
    type: "progress",
    jobId: "job-1",
    completed: 1,
    total: 4,
    stage: "decode",
  });
  assert.deepEqual(progressed.progress, {
    completed: 1,
    total: 4,
    stage: "decode",
  });
  assert.equal(started.progress, null, "reduce must not mutate its input");

  const canceled = cancelWorkerJob(progressed);
  assert.deepEqual(canceled.message, { type: "cancel", jobId: "job-1" });
  assert.equal(canceled.state.status, "canceled");
  assert.equal(canceled.state.progress, null);
  assert.equal(progressed.status, "running", "cancel must not mutate its input");

  // Terminal states are frozen: a late success for the same job changes nothing.
  assert.equal(
    reduceWorkerJobState(canceled.state, {
      type: "success",
      jobId: "job-1",
      result: { render: "files", files: [] },
    }),
    canceled.state,
  );
  // Only a running job can be cancelled.
  assert.equal(cancelWorkerJob(createToolJobState()), null);
  assert.equal(cancelWorkerJob(canceled.state), null);
  // And an idle state ignores every response.
  assert.equal(
    reduceWorkerJobState(idle, {
      type: "progress",
      jobId: "job-1",
      completed: 1,
      total: 2,
      stage: "decode",
    }),
    idle,
  );
});

test("thumbnail failures surface after inspection while completed conversions stay frozen", () => {
  const started = beginWorkerJob(createToolJobState(), "preview-job");
  const inspected = reduceWorkerJobState(started, {
    type: "inspected", jobId: "preview-job", pageCount: 1,
    previews: [{ pageNumber: 1, pageWidth: 612, pageHeight: 792 }],
  });
  const failure = {
    type: "failure", jobId: "preview-job", code: "render-failed",
    message: "The page could not be rendered.", recovery: "Retry the preview.",
  };
  const failed = reduceWorkerJobState(inspected, failure);
  assert.equal(failed.status, "failed");
  assert.equal(failed.error.message, failure.message);
  assert.equal(failed.error.recovery, failure.recovery);
  assert.equal(reduceWorkerJobState(inspected, { ...failure, jobId: "old-job" }), inspected);
  assert.equal(reduceWorkerJobState(failed, {
    type: "thumbnails", jobId: "preview-job", previews: [],
  }), failed);
  const converted = reduceWorkerJobState(started, {
    type: "success", jobId: "preview-job", result: { render: "files", files: [] },
  });
  assert.equal(reduceWorkerJobState(converted, failure), converted);
});

test("worker failures, cancellations, and successes produce frozen terminal state", () => {
  const failed = reduceWorkerJobState(
    beginWorkerJob(createToolJobState(), "job-2"),
    {
      type: "failure",
      jobId: "job-2",
      code: "memory-limit",
      message: "This file needs more memory than the browser can provide.",
      recovery: "Try a smaller file.",
    },
  );
  assert.equal(failed.status, "failed");
  assert.equal(failed.progress, null);
  assert.deepEqual(failed.error, {
    code: "memory-limit",
    message: "This file needs more memory than the browser can provide.",
    recovery: "Try a smaller file.",
  });
  assert.equal(
    reduceWorkerJobState(failed, {
      type: "success",
      jobId: "job-2",
      result: { render: "text", text: "too late" },
    }),
    failed,
  );

  const result = {
    render: "files",
    files: [
      {
        storage: "blob",
        blob: new Blob([Uint8Array.of(1, 2)], { type: "application/pdf" }),
        createdAt: 1,
        id: "artifact-1",
        jobId: "job-3",
        mime: "application/pdf",
        name: "merged.pdf",
        size: 2,
      },
    ],
  };
  const complete = reduceWorkerJobState(
    beginWorkerJob(createToolJobState(), "job-3"),
    { type: "success", jobId: "job-3", result },
  );
  assert.equal(complete.status, "completed");
  assert.equal(complete.progress, null);
  assert.deepEqual(complete.result, result);

  const inspected = reduceWorkerJobState(
    beginWorkerJob(createToolJobState(), "job-4"),
    {
      type: "inspected",
      jobId: "job-4",
      pageCount: 2,
      previews: [
        { pageNumber: 1, pageWidth: 612, pageHeight: 792 },
        { pageNumber: 2, pageWidth: 612, pageHeight: 792 },
      ],
    },
  );
  assert.equal(inspected.status, "completed");
  assert.equal(inspected.pageCount, 2);
  assert.equal(inspected.previews.length, 2);

  const thumbnail = {
    pageNumber: 2,
    pageWidth: 612,
    pageHeight: 792,
    width: 139,
    height: 180,
    buffer: new ArrayBuffer(8),
    mime: "image/jpeg",
  };
  const withThumbnail = reduceWorkerJobState(inspected, {
    type: "thumbnails",
    jobId: "job-4",
    previews: [thumbnail],
  });
  assert.equal(withThumbnail.status, "completed");
  assert.equal(withThumbnail.previews.length, 2);
  assert.equal(withThumbnail.previews[0].pageNumber, 1);
  assert.equal(withThumbnail.previews[1].buffer, thumbnail.buffer);
  assert.equal(
    isToolWorkerResponse({
      type: "thumbnails",
      jobId: "job-4",
      previews: [{ pageNumber: 2, pageWidth: 612, pageHeight: 792 }],
    }),
    false,
  );

  let cached = reduceWorkerJobState(
    beginWorkerJob(createToolJobState(), "job-4"),
    {
      type: "inspected",
      jobId: "job-4",
      pageCount: 25,
      previews: Array.from({ length: 25 }, (_, index) => ({
        pageNumber: index + 1,
        pageWidth: 612,
        pageHeight: 792,
      })),
    },
  );
  for (let pageNumber = 1; pageNumber <= 25; pageNumber += 1) {
    cached = reduceWorkerJobState(cached, {
      type: "thumbnails",
      jobId: "job-4",
      previews: [{
        pageNumber,
        pageWidth: 612,
        pageHeight: 792,
        width: 139,
        height: 180,
        buffer: new ArrayBuffer(1),
        mime: "image/jpeg",
      }],
    });
  }
  assert.equal(
    cached.previews.filter((preview) => "buffer" in preview).length,
    24,
  );
  assert.equal("buffer" in cached.previews[0], false);

  const stopped = reduceWorkerJobState(
    beginWorkerJob(createToolJobState(), "job-5"),
    { type: "canceled", jobId: "job-5" },
  );
  assert.equal(stopped.status, "canceled");
  assert.equal(
    reduceWorkerJobState(stopped, {
      type: "success",
      jobId: "job-5",
      result: { render: "text", text: "too late" },
    }),
    stopped,
  );
});

function riff(chunkType, payload) {
  const bytes = new Uint8Array(20 + payload.length + (payload.length % 2));
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  bytes.set(new TextEncoder().encode(chunkType), 12);
  new DataView(bytes.buffer).setUint32(16, payload.length, true);
  bytes.set(payload, 20);
  return bytes;
}

function ftyp(majorBrand, compatibleBrands = []) {
  const bytes = new Uint8Array(16 + compatibleBrands.length * 4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.length);
  bytes.set(new TextEncoder().encode("ftyp"), 4);
  bytes.set(new TextEncoder().encode(majorBrand), 8);
  bytes.set(new TextEncoder().encode("0000"), 12);
  compatibleBrands.forEach((brand, index) => {
    bytes.set(new TextEncoder().encode(brand), 16 + index * 4);
  });
  return bytes;
}

function jpegWithExifOrientation(orientation) {
  const bytes = new Uint8Array(40);
  bytes.set([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x22], 0);
  bytes.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 6);
  bytes.set([0x49, 0x49], 12);
  const view = new DataView(bytes.buffer);
  view.setUint16(14, 42, true);
  view.setUint32(16, 8, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 0x0112, true);
  view.setUint16(24, 3, true);
  view.setUint32(26, 1, true);
  view.setUint16(30, orientation, true);
  view.setUint32(34, 0, true);
  bytes.set([0xff, 0xd9], 38);
  return bytes;
}
