type QpdfModule = {
  FS: {
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
    writeFile(path: string, data: Uint8Array): void;
  };
  callMain(arguments_: string[]): number;
};

export type PreservePdfOptions = {
  jobId: string;
  removeMetadata: boolean;
};

export class QpdfAdapterError extends Error {
  readonly code: "qpdf-failed" | "qpdf-unavailable";

  constructor(code: "qpdf-failed" | "qpdf-unavailable", message: string) {
    super(message);
    this.code = code;
  }
}

let modulePromise: Promise<QpdfModule> | null = null;

export async function preservePdfWithQpdf(input: ArrayBuffer, options: PreservePdfOptions) {
  assertQpdfEnvironment();
  const qpdf = await getQpdfModule();
  const safeJobId = options.jobId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  if (!safeJobId) {
    throw new QpdfAdapterError("qpdf-failed", "The qpdf job identifier is invalid.");
  }
  const inputPath = `/input-${safeJobId}.pdf`;
  const outputPath = `/output-${safeJobId}.pdf`;

  try {
    qpdf.FS.writeFile(inputPath, new Uint8Array(input));
    const status = await Promise.resolve(
      qpdf.callMain(buildQpdfArguments(inputPath, outputPath, options.removeMetadata)),
    );
    if (status !== 0) {
      throw new QpdfAdapterError(
        "qpdf-failed",
        "qpdf could not rewrite this document. The original file was not changed.",
      );
    }
    const output = new Uint8Array(qpdf.FS.readFile(outputPath));
    const copy = new Uint8Array(output.byteLength);
    copy.set(output);
    return copy.buffer;
  } catch (error) {
    if (error instanceof QpdfAdapterError) throw error;
    throw new QpdfAdapterError(
      "qpdf-failed",
      "qpdf could not rewrite this document. The original file was not changed.",
    );
  } finally {
    unlinkIfPresent(qpdf, inputPath);
    unlinkIfPresent(qpdf, outputPath);
  }
}

export function buildQpdfArguments(inputPath: string, outputPath: string, removeMetadata: boolean) {
  return [
    inputPath,
    "--object-streams=generate",
    "--stream-data=compress",
    "--recompress-flate",
    "--compression-level=9",
    ...(removeMetadata ? ["--remove-info", "--remove-metadata"] : []),
    outputPath,
  ];
}

function assertQpdfEnvironment() {
  if (
    globalThis.crossOriginIsolated !== true ||
    typeof globalThis.SharedArrayBuffer === "undefined"
  ) {
    throw new QpdfAdapterError(
      "qpdf-unavailable",
      "Preserve Document compression requires a cross-origin-isolated browser. No fallback was applied.",
    );
  }
}

async function getQpdfModule() {
  try {
    modulePromise ??= createQpdfModule();
    return await modulePromise;
  } catch {
    modulePromise = null;
    throw new QpdfAdapterError(
      "qpdf-unavailable",
      "Preserve Document compression is unavailable in this browser. No fallback was applied.",
    );
  }
}

async function createQpdfModule() {
  const { default: createQpdf } = await import("qpdf-wasm");
  return createQpdf({
    locateFile: (file) => `/media/vendor/qpdf/${file}`,
    noInitialRun: true,
    print: () => undefined,
    printErr: () => undefined,
  });
}

function unlinkIfPresent(qpdf: QpdfModule, path: string) {
  try {
    qpdf.FS.unlink(path);
  } catch {
    // The virtual file is absent after an initialization or qpdf failure.
  }
}
